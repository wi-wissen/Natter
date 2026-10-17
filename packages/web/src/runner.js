// Runs a Natter program in a web page: time slices with an instruction budget (the page never freezes), a registry of
// wait handlers (sleep, input, http, turtle-event, ... and whatever other modules add), host callbacks and a thin
// debugger passthrough. Uses only the public exports of the core.

import { compile, VM, ScriptError } from '@natter/core';
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
 *   onError?: (error: any, ctx: { source: string, vm: VM|null }) => void,
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
  let runId = 0, scheduled = false, chunk = 5000, finishRun = null;
  const inputQueue = [];
  /** @type {Map<any, { cancels: (() => void)[] }>} open waits by task */
  const open = new Map();

  const runner = {
    get vm() { return vm; },
    get task() { return main; },
    get state() { return state; },
    get source() { return source; },
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
     * @param {{ files?: Record<string,string>, seed?: number, globals?: Record<string, any>, inputs?: string[], debug?: boolean, breakpoints?: number[], file?: string }} [opts]
     * @returns {Promise<RunState>}
     */
    run(src, opts = {}) {
      if (vm) runner.stop();
      const id = ++runId;
      source = src;
      inputQueue.length = 0;
      inputQueue.push(...(opts.inputs ?? []));
      const done = new Promise((res) => { finishRun = res; });
      const globals = { ...(options.globals ?? {}), ...(opts.globals ?? {}) };
      let prog;
      try {
        prog = compile(src, { known: Object.keys(globals) });
      } catch (e) {
        if (!(e instanceof ScriptError)) throw e;
        vm = null; main = null;
        report(e.toJSON());
        end('error', id);
        return done;
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
      vm = new VM(prog, { host, globals, files: opts.files ?? {}, seed: opts.seed ?? ((Math.random() * 2 ** 31) | 0) });
      const dbg = opts.debug || opts.breakpoints?.length ? { bps: opts.breakpoints ?? [] } : null;
      main = vm.start(null, dbg);
      for (const p of plugins) p.start?.({ vm, task: main, runner, source: src });
      setState('running');
      schedule(id);
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
    /** Debugger: lines with a breakpoint (applies immediately). */
    setBreakpoints(lines) {
      if (!main) return;
      if (!main.debug && !lines.length) return;
      main.debug ??= { mode: 'run', kind: 'into', depth: 0, bps: [], skip: null };
      main.debug.bps = [...lines];
    },
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
    emit('error', error, { source, vm });
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
    yieldSoon(() => { scheduled = false; if (id === runId) pump(id); });
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
    if (main.state === 'paused') setState('paused', { line: vm.lineOf(main) });
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
