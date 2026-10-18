// Runs a Natter program in a web page: time slices with an instruction budget (the page never freezes), a registry of
// wait handlers (sleep, input, http, turtle-event, ... and whatever other modules add), host callbacks and a thin
// debugger passthrough. Uses only the public exports of the core.

import { compile, VM, ScriptError, loadPyModules } from '@natterjs/core';
import { httpWait } from './http.js';

/**
 * @typedef {'idle'|'running'|'waiting'|'paused'|'done'|'error'|'stopped'} RunState
 *
 * @typedef {Object} WaitContext  what a wait handler gets besides the wait object
 * @property {VM} vm
 * @property {any} task             the waiting task
 * @property {ReturnType<typeof createRunner>} runner
 * @property {(value?: any) => void} resume        continue the task with this value (ignored after stop or a second call)
 * @property {(e: ScriptError) => void} throwError  continue the task by raising this error at the waiting call
 * @property {(fn: () => void) => void} onCancel   called when the run stops before the wait is over
 *
 * @callback WaitHandler
 * @param {any} wait   task.wait (kind and data)
 * @param {WaitContext} ctx
 * @returns {void|false}  false: not mine, ask the handler registered before
 *
 * @typedef {Object} Plugin  a module of the page (turtle, kara, pgzero, forms ...)
 * @property {string} [name]
 * @property {Record<string, any>} [host]             entries for the VM's host object (e.g. { turtle(kind, args, task) {...} })
 * @property {Record<string, WaitHandler>} [waits]    wait handlers by kind
 * @property {(ctx: { vm: VM, task: any, runner: any, source: string }) => void} [start]  before the first slice of a run
 * @property {(state: RunState) => void} [end]         after the run ended (done, error or stopped)
 */

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Yield to the browser and continue soon: MessageChannel is not clamped to 4 ms like nested setTimeout. */
function makeYield() {
  if (typeof MessageChannel === 'undefined') return (fn) => setTimeout(fn, 0);
  const ch = new MessageChannel();
  const queue = [];
  ch.port1.onmessage = () => { const fn = queue.shift(); if (fn) fn(); };
  return (fn) => { queue.push(fn); ch.port2.postMessage(0); };
}

/**
 * @param {{
 *   onOutput?: (text: string, kind: 'out'|'err'|'input'|'info') => void,
 *   onError?: (error: any, ctx: { source: string, vm: VM|null, file: string, files: Record<string, string> }) => void,
 *   onState?: (state: RunState, info?: any) => void,
 *   onInput?: (prompt: string, wait: any) => void,
 *   onFileChange?: (path: string, text: string|null) => void,
 *   sliceMs?: number, timeScale?: number, fetch?: typeof fetch, httpTimeout?: number,
 *   host?: Record<string, any>, globals?: Record<string, any>,
 * }} [options]
 */
export function createRunner(options = {}) {
  const sliceMs = options.sliceMs ?? 10;
  /** @type {Map<string, WaitHandler[]>} */
  const waits = new Map();
  /** @type {Record<string, any>} */
  const hostExtra = {};
  /** @type {Plugin[]} */
  const plugins = [];
  const yieldSoon = makeYield();
  /** @type {Record<string, Function[]>} listeners added with on() */
  const listeners = {};
  const OPTION = { output: 'onOutput', error: 'onError', state: 'onState', input: 'onInput', file: 'onFileChange' };
  const emit = (name, ...args) => {
    options[OPTION[name]]?.(...args);
    for (const fn of listeners[name] ?? []) fn(...args);
  };

  let vm = null, main = null, source = '', state = /** @type {RunState} */ ('idle');
  let runId = 0, scheduled = false, lastTimer = 0, chunk = 5000, finishRun = null;
  /** breakpoints per file ({ 'main.py': [3] }); kept between runs */
  let fileBps = {};
  /** file of the current run's program */
  let mainFile = 'main.py';
  /** project files of the current run (for error reports) */
  let runFiles = {};
  const inputQueue = [];
  /** @type {Map<any, { cancels: (() => void)[] }>} open waits by task */
  const open = new Map();

  const runner = {
    get vm() { return vm; },
    get task() { return main; },
    get state() { return state; },
    get source() { return source; },
    /** file of the running program (run option `file`, default 'main.py') */
    get file() { return mainFile; },
    options,

    /** Listen: 'output' (text, kind), 'error' (error, { source, vm }), 'state' (state, info), 'input' (prompt, wait), 'file' (path, text). Returns a function that removes the listener. */
    on(name, fn) {
      (listeners[name] ??= []).push(fn);
      return () => { listeners[name] = listeners[name].filter((f) => f !== fn); };
    },

    /** Add or replace an entry of the VM's host object (e.g. 'turtle', 'kara', 'pgzero'). Applies from the next run. */
    registerHost(name, impl) { hostExtra[name] = impl; return runner; },

    /** Add a wait handler; later ones are asked first, and may return false to pass the wait on. */
    registerWait(kind, handler) {
      if (!waits.has(kind)) waits.set(kind, []);
      waits.get(kind).unshift(handler);
      return runner;
    },

    /** Add a module: host entries, wait handlers, start/end hooks. */
    use(plugin) {
      plugins.push(plugin);
      for (const [k, v] of Object.entries(plugin.host ?? {})) runner.registerHost(k, v);
      for (const [k, v] of Object.entries(plugin.waits ?? {})) runner.registerWait(k, v);
      return runner;
    },

    /**
     * Start a program (a running one is stopped first). Resolves with the final state.
     * @param {string} src
     * @param {{ files?: Record<string,string>, seed?: number, globals?: Record<string, any>, inputs?: string[], debug?: boolean,
     *   breakpoints?: number[]|Record<string, number[]>|Map<string, Iterable<number>>, file?: string }} [opts]
     *   file: path of the program in the project (default 'main.py'); files: the project (path → text): fills the file
     *   system and serves `import` of own files and packages; breakpoints: lines (any file) or lines per file
     * @returns {Promise<RunState>}
     */
    run(src, opts = {}) {
      if (vm) runner.stop();
      const id = ++runId;
      source = src;
      mainFile = opts.file ?? 'main.py';
      const lineBps = Array.isArray(opts.breakpoints) ? opts.breakpoints : [];
      if (opts.breakpoints && !Array.isArray(opts.breakpoints)) fileBps = toFileBps(opts.breakpoints);
      const files = opts.files ?? {};
      runFiles = files;
      inputQueue.length = 0;
      inputQueue.push(...(opts.inputs ?? []));
      const done = new Promise((res) => { finishRun = res; });
      // the browser build of the core loads the standard modules a program imports only now (a no-op in the full build)
      setState('running'); // from the click on (modules may still be loading)
      const pgzero = /^\s*def\s+(draw|update|on_\w+)\s*\(|\bActor\s*\(|pgzrun/m.test(src);
      const begin = () => {
        const globals = { ...(options.globals ?? {}), ...(opts.globals ?? {}) };
        let prog;
        try {
          prog = compile(src, { known: Object.keys(globals), file: mainFile });
        } catch (e) {
          if (!(e instanceof ScriptError)) throw e;
          vm = null; main = null;
          report(e.toJSON());
          end('error', id);
          return;
        }
        const t0 = now();
        const host = {
          print: (t) => emit('output', t, 'out'),
          printErr: (t) => emit('output', t, 'err'),
          now: () => (now() - t0),
          epoch: () => Date.now() / 1000,
          tzOffset: () => -new Date().getTimezoneOffset() * 60,
          fsChanged: (path, text) => emit('file', path, text),
          ...(options.host ?? {}),
          ...hostExtra,
        };
        // import of own files: the page's readModule first, then the project files (next to the importing file, next to
        // the program, at the top of the project)
        const pageRead = host.readModule;
        const fromFiles = projectModules(() => (vm?.fs ? vm.fs.files : normFiles(files)), () => mainFile);
        host.readModule = (name, ctx) => pageRead?.(name, ctx) ?? fromFiles(name, ctx);
        vm = new VM(prog, { host, globals, files: opts.files ?? {}, seed: opts.seed ?? ((Math.random() * 2 ** 31) | 0) });
        const dbg = opts.debug || lineBps.length || hasBps(fileBps) ? { bps: lineBps, files: { ...fileBps } } : null;
        main = vm.start(null, dbg);
        for (const p of plugins) p.start?.({ vm, task: main, runner, source: src });
        setState('running');
        schedule(id);
      };
      // packs for the imports of the program and of its project files
      const pySources = [src, ...Object.entries(files).filter(([k, v]) => /\.py$/i.test(k) && typeof v === 'string').map(([, v]) => v)].join('\n');
      loadPyModules(pySources, { pgzero }).then(() => { if (id === runId) begin(); }, (e) => {
        vm = null; main = null;
        report({ code: 'err.script.internal', kind: 'RuntimeError', params: { message: String(e?.message ?? e) } });
        end('error', id);
      });
      return done;
    },

    /** End the program now. */
    stop() {
      if (!vm || !isActive()) return;
      for (const t of vm.tasks.values()) vm.kill(t);
      end('stopped', runId);
    },

    /** Text for input(): answers a waiting input() or is kept for the next one. */
    sendInput(text) {
      inputQueue.push(String(text));
      if (main && main.state === 'waiting' && main.wait?.kind === 'input' && open.get(main)?.input) open.get(main).input();
    },

    /** Debugger: halt at the next statement. */
    pause() { if (main && isActive()) vm.debugCommand(main, 'pause'); },
    /** Debugger: run on (to the next breakpoint). */
    continue() { debug('continue'); },
    /** Debugger: one step; kind 'into' | 'over' | 'out'. */
    step(kind = 'over') { debug(kind); },
    /**
     * Debugger: breakpoints, applied immediately (and kept for the next runs when given per file).
     * - setBreakpoints([3, 7]): these lines in any file (the old form);
     * - setBreakpoints('helpers.py', [3]): the lines of one file;
     * - setBreakpoints({ 'main.py': [2], 'helpers.py': [3] }) or a Map of file → lines: all files at once.
     */
    setBreakpoints(a, b) {
      let lines = null;
      if (Array.isArray(a)) lines = a.map(Number);
      else if (typeof a === 'string') {
        fileBps = { ...fileBps, [a]: [...(b ?? [])].map(Number) };
        if (!fileBps[a].length) delete fileBps[a];
      } else fileBps = toFileBps(a ?? {});
      if (!main) return;
      if (!main.debug && !(lines?.length) && !hasBps(fileBps)) return;
      main.debug ??= { mode: 'run', kind: 'into', depth: 0, bps: [], skip: null };
      if (lines) main.debug.bps = lines;
      main.debug.files = { ...fileBps };
    },
    /** Breakpoints per file as set with setBreakpoints / run({ breakpoints }). */
    get breakpoints() { return { ...fileBps }; },
    /** Variables and call stack of the main task (for a debugger panel). */
    inspect() { return vm && main ? vm.inspect(main) : null; },

    /** Run the scheduler again soon (for plugins that made a task ready, e.g. after vm.spawn). */
    wake() { if (isActive()) schedule(runId); },
  };

  function isActive() { return state === 'running' || state === 'waiting' || state === 'paused'; }

  function setState(s, info) {
    if (state === s && s !== 'paused') return;
    state = s;
    emit('state', s, info);
  }

  function debug(cmd) {
    if (!main || !isActive()) return;
    const wasPaused = main.state === 'paused';
    vm.debugCommand(main, cmd);
    if (wasPaused) { setState('running'); schedule(runId); }
  }

  function report(error) {
    emit('error', error, { source, vm, file: mainFile, files: runFiles });
  }

  function end(s, id) {
    if (id !== runId) return;
    for (const w of open.values()) for (const c of w.cancels) try { c(); } catch { /* ignore */ }
    open.clear();
    setState(s);
    for (const p of plugins) try { p.end?.(s); } catch (e) { console.error(e); }
    const f = finishRun;
    finishRun = null;
    f?.(s);
  }

  function schedule(id) {
    if (scheduled) return;
    scheduled = true;
    const go = () => { scheduled = false; if (id === runId) pump(id); };
    // MessageChannel is fast but may starve timers (setTimeout of sleep, turtle timers, pages): now and then use a timer
    if (now() - lastTimer > 30) { lastTimer = now(); setTimeout(go, 0); } else yieldSoon(go);
  }

  /** One slice: run ready tasks until the time is up, then hand waits to their handlers. */
  function pump(id) {
    if (!isActive() || !vm) return;
    const deadline = now() + sliceMs;
    let ready = true;
    while (ready && now() < deadline) {
      ready = false;
      for (const task of [...vm.tasks.values()]) {
        if (task.state !== 'ready') continue;
        const t = now();
        let r;
        try { r = vm.run(task, chunk); } catch (e) {
          // a bug of the interpreter itself: show it as an internal error
          task.state = 'error';
          task.error = new ScriptError('internal', { message: String(e?.message ?? e) }).toJSON();
          console.error(e);
        }
        const ms = now() - t;
        if (r && r.status === 'budget') chunk = Math.max(1000, Math.min(200000, Math.round(chunk * (ms < 1 ? 1.5 : ms > 3 ? 0.7 : 1))));
        if (id !== runId) return;
        if (task.state === 'ready') ready = true;
        else if (afterRun(task, id)) return;
      }
    }
    if (!isActive()) return;
    if (ready) { schedule(id); return; }
    if (main.state === 'paused') setState('paused', vm.placeOf(main));
    else if (main.state === 'waiting' && main.wait?.kind !== 'sleep') setState('waiting', main.wait); // sleeping (animations) counts as running
  }

  /** A task stopped running: dispatch its wait, or end the run. Returns true when the run is over. */
  function afterRun(task, id) {
    if (task.state === 'error') {
      vm.prune();
      for (const t of vm.tasks.values()) vm.kill(t);
      report(task.error);
      end('error', id);
      return true;
    }
    if (task === main && task.state === 'done') {
      for (const t of vm.tasks.values()) vm.kill(t);
      end('done', id);
      return true;
    }
    if (task.state === 'waiting' && !open.has(task)) dispatch(task, id);
    if (task.state === 'done') vm.prune();
    return false;
  }

  function dispatch(task, id) {
    const wait = task.wait;
    const entry = { cancels: [] };
    open.set(task, entry);
    let settled = false;
    const settle = () => {
      if (settled || id !== runId || task.state !== 'waiting') return false;
      settled = true;
      open.delete(task);
      return true;
    };
    const ctx = {
      vm, task, runner,
      resume(value = null) { if (settle()) { vm.resume(task, value); setState('running'); schedule(id); } },
      throwError(e) { if (settle()) { vm.resumeWithError(task, e); setState('running'); schedule(id); } },
      onCancel(fn) { entry.cancels.push(fn); },
    };
    const list = [...(waits.get(wait?.kind) ?? []), ...(BUILTIN_WAITS[wait?.kind] ? [BUILTIN_WAITS[wait.kind]] : [])];
    for (const h of list) {
      try {
        if (h(wait, ctx, entry) !== false) return;
      } catch (e) {
        console.error(e);
        ctx.throwError(new ScriptError('internal', { message: String(e?.message ?? e) }));
        return;
      }
    }
    ctx.throwError(new ScriptError('internal', { message: `the page cannot handle the wait '${wait?.kind}' (no host module for it)` }));
  }

  /** @type {Record<string, WaitHandler>} */
  const BUILTIN_WAITS = {
    sleep(wait, ctx) {
      const ms = Math.max(0, wait.seconds * 1000);
      vm.virtualMs += Math.round(ms);
      const scale = options.timeScale ?? 1;
      if (ms === 0) { ctx.resume(null); return; }
      const h = setTimeout(() => ctx.resume(null), ms * scale);
      ctx.onCancel(() => clearTimeout(h));
    },
    input(wait, ctx, entry) {
      const take = () => {
        if (!inputQueue.length) return false;
        const text = inputQueue.shift();
        emit('output', text + '\n', 'input');
        ctx.resume(text);
        return true;
      };
      if (take()) return;
      entry.input = take;
      emit('input', wait.prompt ?? '', wait);
    },
    http(wait, ctx) {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      ctx.onCancel(() => ctrl?.abort());
      httpWait(wait, { fetch: options.fetch, signal: ctrl?.signal, abort: () => ctrl?.abort(), timeout: options.httpTimeout })
        .then((v) => ctx.resume(v));
    },
    // turtle-event without a turtle module: no events will ever come, the event loop ends (like a headless run)
    'turtle-event'(wait, ctx) { ctx.resume(null); },
  };

  return runner;
}

/** { file: lines } from an object or a Map of iterables. */
function toFileBps(m) {
  const out = {};
  const entries = m instanceof Map ? [...m.entries()] : Object.entries(m);
  for (const [f, l] of entries) { const lines = [...(l ?? [])].map(Number); if (lines.length) out[f] = lines; }
  return out;
}
const hasBps = (m) => Object.values(m).some((l) => l.length);

/** Project files with normalized paths ('./a/b.py' → 'a/b.py'). */
function normFiles(files) {
  const m = new Map();
  for (const [k, v] of Object.entries(files)) m.set(k.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, ''), v);
  return m;
}

const dirOf = (p) => (p && p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

/**
 * readModule over the project files, searched like Python: next to the importing file, next to the program, at the
 * top of the project. `import pkg.mod` finds pkg/mod.py, `import pkg` pkg/__init__.py (or a folder pkg/ without it).
 * @param {() => Map<string, string>} getFiles  @param {() => string} getMain
 */
export function projectModules(getFiles, getMain) {
  return (name, ctx) => {
    const files = getFiles();
    const rel = name.split('.').join('/');
    const bases = [...new Set([dirOf(ctx?.from), dirOf(getMain()), ''])];
    for (const b of bases) {
      const pre = b ? b + '/' : '';
      const mod = files.get(`${pre}${rel}.py`);
      if (typeof mod === 'string') return { source: mod, file: `${pre}${rel}.py`, package: false };
      const init = files.get(`${pre}${rel}/__init__.py`);
      if (typeof init === 'string') return { source: init, file: `${pre}${rel}/__init__.py`, package: true };
    }
    // a folder without __init__.py is a package, too (namespace package)
    for (const b of bases) {
      const dir = `${b ? b + '/' : ''}${rel}/`;
      for (const k of files.keys()) if (k.startsWith(dir) && /\.py$/i.test(k)) return { source: '', file: `${dir}__init__.py`, package: true };
    }
    return null;
  };
}
