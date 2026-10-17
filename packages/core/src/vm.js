// Virtual machine for the bytecode from compiler.js.
//
// - Calls put frames on their own stack (no JS recursion): the VM can stop after every instruction
//   (budget, waiting, breakpoint), save and later continue exactly there.
// - Each task is its own flow: main program, event handler, player program.
// - Built-in functions and host functions are "natives": JS functions, found by their name.
//   A native can return `new Suspend(wait)` instead of a value: the task parks until the host
//   (simulation or playground) resumes it with resume().
// - Deterministic: no Math.random/Date, budget in instructions, fixed order of tasks.

import { OP, BIN_OPS, UNARY_OPS, CMP_OPS } from './compiler.js';
import { ScriptError, suggest } from './errors.js';
import {
  PyFloat, PyList, PyTuple, PyDict, PySlice, PyFunction, PyBuiltin, PyPartial, PyBoundMethod, PyHost, PyModule,
  PySet, setInplace, PyGenerator, PyClass, PyInstance, PyMethod, PySuper, PyProperty, PyStaticMethod, PyClassMethod, OBJECT, NO_METHOD, hooks,
  Cell, binary, binaryDunder, unary, compare, truthy, makeIter, iterNext, DONE, iterItems, getItem, setItem, delItem, toStr,
  formatValue, typeName, keyOf, pushAll, lookupClass, TYPE_NAMES, Suspend,
} from './values.js';
import { BUILTINS, CLASS_GLOBALS, METHODS, MODULES, moduleAttr } from './builtins.js';
import { EXCEPTION_CLASSES, exceptionClassFor, isExceptionClass } from './exceptions.js';
import { pyMessage } from './pymessages.js';
import { PYMODULES } from './stdlib/py/index.js';
import { compile as compileRaw } from './compiler.js';

export { Suspend };

/** Calls nested inside each other, as in CPython (flood fill on a 31×31 field still fits). */
const MAX_DEPTH = 1000;
/** Upper limit for synchronous calls from natives (sorted(key=…), conditions) */
const SYNC_LIMIT = 2_000_000;
/**
 * Synchronous calls nested inside each other (map(f, …) in f …). Each level costs JS stack, so the limit is
 * small and the same everywhere – the JS stack of the device must never decide where a program fails.
 */
const MAX_SYNC_NESTING = 50;
/** Limits for documentation (scripting reference): call depth and instructions of a synchronous call. */
export const BUDGET_LIMITS = { maxDepth: MAX_DEPTH, syncLimit: SYNC_LIMIT };
/** Call stack in error reports: first and last entries, runs of the same call merged. */
const TRACE_HEAD = 3, TRACE_TAIL = 10;

/**
 * @typedef {Object} Frame
 * @property {number} code @property {number} pc @property {any[]} locals @property {any[]} stack @property {Cell[]} cells
 */
/**
 * @typedef {Object} Task
 * @property {number} id
 * @property {Frame[]} frames
 * @property {'ready'|'waiting'|'paused'|'done'|'error'} state
 * @property {any} wait
 * @property {any} result
 * @property {any} error  ScriptError as JSON
 * @property {any} debug  null or { mode: 'run'|'step', kind, depth, bps: number[], skip }
 * @property {any} meta   data of the host (e.g. event, section)
 */

export class VM {
  /**
   * @param {import('./compiler.js').Program} program
   * @param {{ host?: any, natives?: Record<string, Function>, globals?: Record<string, any>, dynamic?: Record<string, () => any>, seed?: number }} [opts]
   *   host: { getattr(ctx, obj, name), setattr(ctx, obj, name, v), callMethod(ctx, obj, name, args, kw), repr(obj), print(text, task), dir(obj) }
   *   natives: additional functions (host API) – name → fn(ctx, args, kwargs)
   *   globals: predefined names (host API: functions as PyBuiltin, modules, constants)
   *   dynamic: predefined names whose value is looked up on every access (heroes that join later, player numbers),
   *     so a program behaves the same before and after loading saved state
   */
  constructor(program, opts = {}) {
    this.program = program;
    /** All code objects: the program first, modules loaded later after it */
    this.codes = program.codes.slice();
    /** @type {Map<string, PyModule>} modules imported so far */
    this.moduleCache = new Map();
    this.host = opts.host ?? {};
    this.opts = opts;
    /** Virtual clock (ms): what time.time() shows and sleep() advances when the host has no clock */
    this.virtualMs = 0;
    this.natives = { ...BUILTINS, ...(opts.natives ?? {}) };
    /** Predefined names (not saved – come back from the host API on loading) */
    this.predef = new Map(Object.entries(opts.globals ?? {}));
    for (const name of Object.keys(BUILTINS)) if (!name.includes('.') && !this.predef.has(name)) this.predef.set(name, new PyBuiltin(name));
    /** Instructions left for synchronous calls (conditions, sorted(key=…)) – the host resets it every tick */
    this.syncBudget = Infinity;
    /** @type {Map<string, () => any>} predefined names resolved on access (not saved) */
    this.dynamic = new Map(Object.entries(opts.dynamic ?? {}));
    // open() is written in Python (module _fileio) and loaded when a program first uses it
    this.dynamic.set('open', () => this.importModule('_fileio', this.curTask).ns.get('open'));
    /** @type {Map<string, any>} global variables assigned by the program */
    this.globals = new Map();
    /** @type {Map<number, Task>} */
    this.tasks = new Map();
    this.nextTask = 1;
    this.rng = seedRng(opts.seed ?? 1);
    /** Counted instructions (statistics, detecting infinite loops) */
    this.steps = 0;
    /** Next number for instances (stable ids for hashing and default repr) */
    this.nextObjectId = 1;
    /** Task whose code is running (operators on instances call methods in its context) */
    this.curTask = null;
    for (const [name, cls] of Object.entries(CLASS_GLOBALS)) if (!this.predef.has(name)) this.predef.set(name, cls);
    if (!this.predef.has('__name__')) this.predef.set('__name__', '__main__');
  }

  /** Run `fn` with this VM as the one that operators on instances call back into. */
  active(fn) {
    const prev = hooks.vm;
    hooks.vm = this;
    try { return fn(); } finally { hooks.vm = prev; }
  }

  // ---------- Tasks ----------

  /** Start the main program as a task. @returns {Task} */
  start(meta = null, debug = null) {
    const frame = this.newFrame(0, []);
    return this.addTask([frame], meta, debug);
  }

  /** Start a function (e.g. event handler) as its own task. @returns {Task} */
  spawn(fn, args = [], meta = null, debug = null) {
    if (fn instanceof PyFunction) {
      const frame = this.bindFrame(fn, args, null);
      return this.addTask([frame], meta, debug);
    }
    // Built-in function: run immediately, report as a finished task
    const task = this.addTask([], meta, debug);
    try {
      const r = this.callNative(task, fn, args, null);
      if (r instanceof Suspend) { task.state = 'waiting'; task.wait = r.wait; } else { task.state = 'done'; task.result = r; }
    } catch (e) { this.fail(task, e, null); }
    return task;
  }

  addTask(frames, meta, debug) {
    const task = { id: this.nextTask++, frames, state: 'ready', wait: null, result: null, error: null, debug: debug ? { mode: 'run', kind: 'into', depth: 0, bps: [], skip: null, ...debug } : null, meta };
    this.tasks.set(task.id, task);
    return task;
  }

  /** Remove finished tasks. */
  prune() {
    for (const [id, t] of this.tasks) if (t.state === 'done' || t.state === 'error') this.tasks.delete(id);
  }

  /** Resume a parked task; `value` is the result of the waiting call. */
  resume(task, value = null) {
    if (task.state !== 'waiting') return;
    task.state = 'ready';
    task.wait = null;
    if (task.frames.length) task.frames[task.frames.length - 1].stack.push(value);
    else { task.state = 'done'; task.result = value; }
  }

  /** Cancel a task. */
  kill(task) { task.state = 'done'; task.frames = []; task.wait = null; }

  // ---------- Debugger ----------

  /**
   * Debug command: 'continue' | 'into' | 'over' | 'out' | 'pause'. Applies to paused and running tasks.
   * @param {Task} task
   */
  debugCommand(task, cmd, bps = null) {
    task.debug ??= { mode: 'run', kind: 'into', depth: 0, bps: [], skip: null };
    const d = task.debug;
    if (bps) d.bps = [...bps];
    const f = task.frames[task.frames.length - 1];
    if (cmd === 'pause') { d.mode = 'step'; d.kind = 'into'; return; }
    d.mode = cmd === 'continue' ? 'run' : 'step';
    d.kind = cmd === 'continue' ? 'into' : cmd;
    d.depth = task.frames.length;
    d.skip = f ? { depth: task.frames.length, pc: f.pc } : null;
    if (task.state === 'paused') task.state = 'ready';
  }

  /** Current line of a task (innermost frame). */
  lineOf(task) {
    const f = task.frames[task.frames.length - 1];
    if (!f) return 0;
    const c = this.codes[f.code];
    return c.lines[Math.min(f.pc, c.lines.length - 1)];
  }

  // ---------- Execution ----------

  newFrame(codeIdx, cells, g = this.globals) {
    const c = this.codes[codeIdx];
    return { code: codeIdx, pc: 0, locals: new Array(c.varnames.length).fill(undefined), stack: [], cells, g };
  }

  /**
   * Frame for a function call with bound arguments.
   * @param {PyFunction} fn @param {any[]} args @param {null|[string, any][]} kw
   */
  bindFrame(fn, args, kw) {
    const c = this.codes[fn.code];
    const n = c.params.length;
    if (args.length > n && !c.vararg) throw new ScriptError('argCount', { name: fn.name, max: n, given: args.length });
    const locals = new Array(c.varnames.length).fill(undefined);
    for (let i = 0; i < Math.min(n, args.length); i++) locals[i] = args[i];
    if (c.vararg) locals[n] = new PyTuple(args.slice(n));
    const extra = c.kwarg ? new PyDict() : null;
    if (c.kwarg) locals[n + (c.vararg ? 1 : 0)] = extra;
    const kwBase = n + (c.vararg ? 1 : 0) + (c.kwarg ? 1 : 0);
    if (kw) {
      for (const [k, v] of kw) {
        const i = c.params.indexOf(k);
        if (i < 0) {
          const j = c.kwonly.indexOf(k);
          if (j >= 0) {
            if (locals[kwBase + j] !== undefined) throw new ScriptError('argDuplicate', { name: fn.name, arg: k });
            locals[kwBase + j] = v;
            continue;
          }
          if (extra) { extra.set(k, v); continue; }
          throw new ScriptError('argUnexpected', { name: fn.name, arg: k, suggestion: suggest(k, [...c.params, ...c.kwonly]) });
        }
        if (locals[i] !== undefined) throw new ScriptError('argDuplicate', { name: fn.name, arg: k });
        locals[i] = v;
      }
    }
    const firstDefault = n - c.ndefaults;
    for (let i = 0; i < n; i++) {
      if (locals[i] !== undefined) continue;
      if (i >= firstDefault) locals[i] = fn.defaults[i - firstDefault];
      else throw new ScriptError('argMissing', { name: fn.name, arg: c.params[i] });
    }
    for (let j = 0; j < c.kwonly.length; j++) {
      if (locals[kwBase + j] !== undefined) continue;
      const d = fn.kwdefaults?.[j];
      if (d === undefined) throw new ScriptError('argMissing', { name: fn.name, arg: c.kwonly[j], what: 'keyword' });
      locals[kwBase + j] = d;
    }
    const cells = c.cellvars.map((_, j) => new Cell(c.cellParams[j] >= 0 ? locals[c.cellParams[j]] : undefined)).concat(fn.cells);
    return { code: fn.code, pc: 0, locals, stack: [], cells, fn, g: fn.g ?? this.globals };
  }

  /**
   * Run a task until it is done, waits, pauses or the budget is used up.
   * @param {Task} task
   * @param {number} budget at most this many instructions
   * @returns {{ status: 'done'|'waiting'|'paused'|'budget'|'error', used: number }}
   */
  run(task, budget = Infinity) {
    if (task.state !== 'ready') return { status: task.state === 'done' ? 'done' : task.state, used: 0 };
    const used = this.execute(task, budget, false);
    const status = task.state === 'ready' ? 'budget' : task.state;
    return { status, used };
  }

  /**
   * Call a Python function synchronously (from natives: sorted(key=…), conditions in wait_until).
   * Must not wait; breakpoints do not apply here.
   */
  callSync(fn, args = [], kw = null, parent = null) {
    const pc = this.prepareCall(parent, fn, args, kw);
    if (pc !== null && pc.value !== undefined) return pc.value;
    if (pc === null) {
      const r = this.callNative(parent, fn, args, kw);
      if (r instanceof Suspend) throw new ScriptError('type', { what: 'waitInSync' });
      return r;
    }
    const task = this.syncTask(parent, pc.frame, pc.fn);
    this.runSync(task);
    if (task.state !== 'done') throw task.state === 'waiting' ? new ScriptError('type', { what: 'waitInSync' }) : new ScriptError('tooLong', {});
    return task.result;
  }

  /** A task for a call made from a native (sorted(key=…), operators on instances, generators). */
  syncTask(parent, frame, fn) {
    // The depth counts on across synchronous calls (base = frames of the calling tasks)
    const base = parent ? parent.frames.length + (parent.base ?? 0) : 0;
    if (base >= MAX_DEPTH) throw this.recursionError(parent, fn);
    return { id: 0, frames: [frame], state: 'ready', wait: null, result: null, error: null, debug: null, meta: parent?.meta ?? null, sync: true, parent, base };
  }

  /** Run a synchronous task until it ends or yields; an error of the task is thrown on. */
  runSync(task) {
    if ((this.syncNesting ?? 0) >= MAX_SYNC_NESTING) throw new ScriptError('recursion', { what: 'callbacks', max: MAX_SYNC_NESTING });
    // All synchronous calls of a tick share the host's budget (syncBudget, reset by the host every tick)
    const limit = Math.min(SYNC_LIMIT, this.syncBudget);
    if (limit <= 0) throw new ScriptError('tooLong', {});
    this.syncNesting = (this.syncNesting ?? 0) + 1;
    try {
      this.syncBudget -= this.execute(task, limit, true);
    } finally {
      this.syncNesting--;
    }
    if (task.state === 'error') {
      const e = task.errorRaw;
      e.inner = true;
      throw e;
    }
  }

  /**
   * Run a generator to its next yield.
   * @param {PyGenerator} gen @param {any} sent value of the yield expression (None for next())
   * @returns {any|typeof DONE} the yielded value, or DONE when the generator has ended
   */
  genResume(gen, sent = null) {
    if (gen.state === 'running') throw new ScriptError('value', { what: 'genRunning' });
    if (gen.state === 'done') return DONE;
    if (gen.state === 'new') {
      if (sent !== null) throw new ScriptError('type', { what: 'genSendFirst' });
    } else gen.frame.stack.push(sent);
    const task = this.syncTask(this.curTask, gen.frame, gen.fn);
    task.gen = gen;
    gen.state = 'running';
    try {
      this.runSync(task);
    } catch (e) {
      gen.state = 'done';
      throw e;
    }
    if (task.state === 'yielded') { gen.state = 'suspended'; return task.result; }
    gen.state = 'done';
    gen.returned = task.result;
    if (task.state !== 'done') throw task.state === 'waiting' ? new ScriptError('type', { what: 'waitInSync' }) : new ScriptError('tooLong', {});
    return DONE;
  }

  /**
   * Prepare a call of something made in Python: a frame to run ({ frame, fn }), a finished result ({ value })
   * or null if the callee is a native (built-in function, host method).
   */
  prepareCall(task, fn, args, kw) {
    if (fn instanceof PyFunction) return this.callPython(fn, args, kw);
    if (fn instanceof PyMethod) return this.callPython(fn.fn, [fn.self, ...args], kw);
    if (fn instanceof PyClass) return this.instantiate(task, fn, args, kw);
    if (fn instanceof PyInstance) {
      const call = lookupClass(fn.cls, '__call__');
      if (call === undefined) throw new ScriptError('notCallable', { type: typeName(fn) });
      return this.prepareCall(task, call, [fn, ...args], kw);
    }
    return null;
  }

  /** Frame for a Python function; a generator function only makes the generator (the body runs on the first next()). */
  callPython(fn, args, kw) {
    const frame = this.bindFrame(fn, args, kw);
    if (this.codes[fn.code].gen) return { value: new PyGenerator(frame, fn) };
    return { frame, fn };
  }

  /** Create an instance: run __init__ as a frame (its result is replaced by the instance) or native initialisers at once. */
  instantiate(task, cls, args, kw) {
    const inst = new PyInstance(cls);
    if (cls.mro.some((c) => c.native === 'exception')) {
      inst.dict.set('args', new PyTuple(args.slice()));
      if (cls.mro.some((c) => c.name === 'SystemExit')) inst.dict.set('code', args.length ? (args.length === 1 ? args[0] : new PyTuple(args.slice())) : null);
    }
    const init = lookupClass(cls, '__init__');
    if (init instanceof PyFunction) {
      const frame = this.bindFrame(init, [inst, ...args], kw);
      if (this.codes[init.code].gen) throw new ScriptError('type', { what: 'initReturn', type: 'generator' });
      frame.ctor = inst;
      return { frame, fn: init };
    }
    if (init instanceof PyBuiltin && init.name !== 'object.__init__') {
      this.callNative(task, init, [inst, ...args], kw);
      return { value: inst };
    }
    if (args.length || (kw && kw.length)) throw new ScriptError('type', { what: 'noArgsClass', name: cls.name });
    return { value: inst };
  }

  /** RecursionError for a call that would go too deep; names the function if it calls itself. */
  recursionError(task, fn) {
    let self = false;
    for (let t = task; t && !self; t = t.parent) self = t.frames.some((f) => f.code === fn.code);
    return new ScriptError('recursion', self ? { what: 'self', name: this.codes[fn.code].name, max: MAX_DEPTH } : { what: 'depth', max: MAX_DEPTH });
  }

  /** Call stack for an error report: runs of the same call merged ({ repeat }), long stacks shortened ({ skipped }). */
  static traceback(entries) {
    const runs = [];
    for (const e of entries) {
      const last = runs[runs.length - 1];
      if (last && last.name === e.name && last.line === e.line) last.repeat = (last.repeat ?? 1) + 1;
      else runs.push({ ...e });
    }
    if (runs.length <= TRACE_HEAD + TRACE_TAIL + 1) return runs;
    return [...runs.slice(0, TRACE_HEAD), { name: '…', line: 0, skipped: runs.length - TRACE_HEAD - TRACE_TAIL }, ...runs.slice(-TRACE_TAIL)];
  }

  /**
   * An error was thrown while running `frame`: hand it to a `try` of the task, or end the task with it.
   * @returns {boolean} a handler took it (the task goes on)
   */
  handleThrown(task, e0, frame) {
    const e = this.toScriptError(e0);
    this.annotate(task, e, frame);
    if (!e.uncatchable && task.frames.some((f) => f.blocks?.length) && this.unwind(task, e)) return true;
    this.finish(task, e);
    return false;
  }

  /** Throw an error into a task that is waiting (for example EOFError for input() when there is no more input). */
  resumeWithError(task, e) {
    if (task.state !== 'waiting') return;
    task.state = 'ready';
    task.wait = null;
    task.pendingError = e;
  }

  /** Make sure a thrown value is a ScriptError (anything else is a bug of the interpreter itself). */
  toScriptError(e) {
    if (e instanceof ScriptError) return e;
    const se = new ScriptError('internal', { message: String(e?.message ?? e) });
    se.stack = e?.stack;
    return se;
  }

  /** Line and call stack of an error (once: errors that are caught and thrown again keep the first ones). */
  annotate(task, e, frame) {
    if (e.annotated) return;
    if (!e.inner) {
      if (frame) {
        const c = this.codes[frame.code];
        e.line = c.lines[Math.max(0, frame.pc - 1)] ?? e.line;
      }
      e.traceback = VM.traceback(task.frames.map((f) => {
        const c = this.codes[f.code];
        return { name: c.name, line: c.lines[Math.max(0, f.pc - 1)] ?? 0 };
      }));
    } else if (!e.line && frame) {
      const c = this.codes[frame.code];
      e.line = c.lines[Math.max(0, frame.pc - 1)];
    }
    e.annotated = true;
  }

  /** The task ends with this error. */
  finish(task, e) {
    if (e.kind === 'SystemExit' && !task.sync) {
      // sys.exit(): the program ends quietly
      task.state = 'done';
      task.result = null;
      task.exitCode = e.pyexc?.dict.get('code') ?? null;
      task.frames = [];
      task.wait = null;
      return;
    }
    task.state = 'error';
    task.error = e.toJSON();
    task.errorRaw = e;
    task.wait = null;
  }

  fail(task, e, frame) {
    const se = this.toScriptError(e);
    this.annotate(task, se, frame);
    this.finish(task, se);
  }

  /**
   * Hand an error to the innermost `try` that is still open in this task. Frames without one are left.
   * @returns {boolean} found one (the frame stack and the program counter now point into its handler)
   */
  unwind(task, e) {
    for (;;) {
      const f = task.frames[task.frames.length - 1];
      const blk = f.blocks?.pop();
      if (blk) {
        f.stack.length = blk.depth;
        if (f.excs) f.excs.length = blk.excs;
        f.stack.push(this.toPyException(e));
        f.pc = blk.handler;
        return true;
      }
      task.frames.pop();
    }
  }

  /** The exception that the innermost running `except` clause is handling (for a bare `raise`). */
  currentException(task) {
    for (let i = task.frames.length - 1; i >= 0; i--) {
      const ex = task.frames[i].excs;
      if (ex && ex.length) return ex[ex.length - 1];
    }
    return null;
  }

  /** Python exception object for an error (made once; thrown again later it is the same object). */
  toPyException(e) {
    if (e.pyexc) return e.pyexc;
    const inst = new PyInstance(exceptionClassFor(e.kind));
    const args = e.arg !== undefined ? [e.arg] : e.short === 'assertion' && !e.params.message ? [] : e.short === 'stopIteration' ? [] : [pyMessage(e)];
    inst.dict.set('args', new PyTuple(args));
    inst.scriptError = e;
    e.pyexc = inst;
    return inst;
  }

  /** Exception object for `raise x`: a class is instantiated; anything that is not an exception is a TypeError. */
  toException(task, v) {
    if (isExceptionClass(v)) v = this.callSync(v, [], null, task);
    if (!(v instanceof PyInstance) || !isExceptionClass(v.cls)) throw new ScriptError('type', { what: 'raiseType' });
    return v;
  }

  /** The error to throw for an exception object (the same one again if it was caught before). */
  errorOfException(inst) {
    if (inst.scriptError) return inst.scriptError;
    const e = new ScriptError('raised', { message: this.str(inst) });
    e.kind = inst.cls.name;
    e.pyexc = inst;
    inst.scriptError = e;
    return e;
  }

  /** Does an exception match the class (or tuple of classes) of an `except` clause? */
  excMatches(exc, spec) {
    if (spec instanceof PyTuple) return spec.items.some((x) => this.excMatches(exc, x));
    if (!isExceptionClass(spec)) throw new ScriptError('type', { what: 'catchType' });
    return exc.cls.mro.includes(spec);
  }

  /** Run the main loop with this VM and task as the context of callbacks. @returns {number} executed instructions */
  execute(task, budget, sync) {
    const prevVm = hooks.vm, prevTask = this.curTask;
    hooks.vm = this;
    this.curTask = task;
    try { return this.executeLoop(task, budget, sync); } finally { hooks.vm = prevVm; this.curTask = prevTask; }
  }

  /** Main loop. @returns {number} executed instructions */
  executeLoop(task, budget, sync) {
    let frame = task.frames[task.frames.length - 1];
    let code = this.codes[frame.code];
    let stack = frame.stack;
    let used = 0;
    const debug = !sync && task.debug;
    if (task.pendingError) {
      const e = task.pendingError;
      task.pendingError = null;
      if (!this.handleThrown(task, e, frame)) return 0;
      frame = task.frames[task.frames.length - 1];
      code = this.codes[frame.code];
      stack = frame.stack;
    }
    loop: for (;;) {
      if (used >= budget) {
        if (sync) { this.fail(task, new ScriptError('tooLong', {}), frame); }
        break;
      }
      const pc = frame.pc;
      if (debug && code.stmt[pc] && this.debugStop(task, frame, code, pc)) {
        task.state = 'paused';
        break;
      }
      const op = code.ops[pc], arg = code.args[pc];
      frame.pc = pc + 1;
      used++;
      try {
        switch (op) {
          case OP.NOP: break;
          case OP.LOAD_CONST: stack.push(code.consts[arg]); break;
          case OP.LOAD_FAST: {
            const v = frame.locals[arg];
            if (v === undefined) throw new ScriptError('localUnbound', { name: code.varnames[arg] });
            stack.push(v);
            break;
          }
          case OP.STORE_FAST: frame.locals[arg] = stack.pop(); break;
          case OP.DELETE_FAST:
            if (frame.locals[arg] === undefined) throw new ScriptError('localUnbound', { name: code.varnames[arg] });
            frame.locals[arg] = undefined;
            break;
          case OP.LOAD_GLOBAL: stack.push(this.loadGlobal(code.names[arg], frame.g)); break;
          case OP.STORE_GLOBAL: frame.g.set(code.names[arg], stack.pop()); break;
          case OP.DELETE_GLOBAL:
            if (!frame.g.delete(code.names[arg])) throw new ScriptError('nameUnbound', { name: code.names[arg] });
            break;
          case OP.LOAD_DEREF: {
            const v = frame.cells[arg].v;
            if (v === undefined) throw new ScriptError('localUnbound', { name: this.cellName(code, arg) });
            stack.push(v);
            break;
          }
          case OP.STORE_DEREF: frame.cells[arg].v = stack.pop(); break;
          case OP.DELETE_DEREF: frame.cells[arg].v = undefined; break;
          case OP.LOAD_CLOSURE: stack.push(frame.cells[arg]); break;
          case OP.LOAD_ATTR: stack.push(this.getattr(task, stack.pop(), code.names[arg])); break;
          case OP.STORE_ATTR: {
            const obj = stack.pop(), v = stack.pop();
            this.setattr(task, obj, code.names[arg], v);
            break;
          }
          case OP.LOAD_INDEX: { const i = stack.pop(); stack.push(getItem(stack.pop(), i)); break; }
          case OP.STORE_INDEX: { const i = stack.pop(), obj = stack.pop(); setItem(obj, i, stack.pop()); break; }
          case OP.DELETE_INDEX: { const i = stack.pop(); delItem(stack.pop(), i); break; }
          case OP.BINARY: { const b = stack.pop(); stack.push(binary(BIN_OPS[arg], stack.pop(), b)); break; }
          case OP.INPLACE: {
            const b = stack.pop(), a = stack.pop();
            // list += extends the same list (as in Python)
            if (a instanceof PyList && BIN_OPS[arg] === '+') { pushAll(a.items, iterItems(b)); stack.push(a); }
            else if (a instanceof PySet && b instanceof PySet && '|&-^'.includes(BIN_OPS[arg]) && BIN_OPS[arg].length === 1) stack.push(setInplace(BIN_OPS[arg], a, b));
            else if (a instanceof PyInstance) {
              const r = binaryDunder(BIN_OPS[arg], a, b, 'i');
              stack.push(r !== NO_METHOD ? r : binary(BIN_OPS[arg], a, b));
            } else stack.push(binary(BIN_OPS[arg], a, b));
            break;
          }
          case OP.UNARY: stack.push(unary(UNARY_OPS[arg], stack.pop())); break;
          case OP.COMPARE: { const b = stack.pop(); stack.push(compare(CMP_OPS[arg], stack.pop(), b)); break; }
          case OP.JUMP: frame.pc = arg; break;
          case OP.JUMP_IF_FALSE: if (!truthy(stack.pop())) frame.pc = arg; break;
          case OP.JUMP_IF_TRUE: if (truthy(stack.pop())) frame.pc = arg; break;
          case OP.JUMP_IF_FALSE_OR_POP: if (!truthy(stack[stack.length - 1])) frame.pc = arg; else stack.pop(); break;
          case OP.JUMP_IF_TRUE_OR_POP: if (truthy(stack[stack.length - 1])) frame.pc = arg; else stack.pop(); break;
          case OP.GET_ITER: stack.push(makeIter(stack.pop())); break;
          case OP.FOR_ITER: {
            const v = iterNext(stack[stack.length - 1]);
            if (v === DONE) { stack.pop(); frame.pc = arg; } else stack.push(v);
            break;
          }
          case OP.BUILD_LIST: stack.push(new PyList(arg ? stack.splice(stack.length - arg) : [])); break;
          case OP.BUILD_TUPLE: stack.push(new PyTuple(arg ? stack.splice(stack.length - arg) : [])); break;
          case OP.BUILD_DICT: {
            const d = new PyDict();
            const items = arg ? stack.splice(stack.length - 2 * arg) : [];
            for (let i = 0; i < items.length; i += 2) d.set(items[i], items[i + 1]);
            stack.push(d);
            break;
          }
          case OP.BUILD_SET: {
            const r = new PySet();
            for (const x of arg ? stack.splice(stack.length - arg) : []) r.add(x);
            stack.push(r);
            break;
          }
          case OP.SET_ADD: { const v = stack.pop(); stack[stack.length - 1 - arg].add(v); break; }
          case OP.BUILD_SLICE: { const st = stack.pop(), hi = stack.pop(), lo = stack.pop(); stack.push(new PySlice(lo, hi, st)); break; }
          case OP.UNPACK: {
            const items = iterItems(stack.pop());
            if (items.length !== arg) throw new ScriptError('unpack', { expected: arg, got: items.length });
            for (let i = items.length - 1; i >= 0; i--) stack.push(items[i]);
            break;
          }
          case OP.UNPACK_EX: {
            const before = arg >> 8, after = arg & 255;
            const items = iterItems(stack.pop());
            if (items.length < before + after) throw new ScriptError('unpack', { expected: before + after, got: items.length, atLeast: true });
            const out = [...items.slice(0, before), new PyList(items.slice(before, items.length - after)), ...items.slice(items.length - after)];
            for (let i = out.length - 1; i >= 0; i--) stack.push(out[i]);
            break;
          }
          case OP.LIST_APPEND: { const v = stack.pop(); stack[stack.length - 1 - arg].items.push(v); break; }
          case OP.DICT_SET: { const v = stack.pop(), k = stack.pop(); stack[stack.length - 1 - arg].set(k, v); break; }
          case OP.LIST_PUSH: { const v = stack.pop(); stack[stack.length - 1].items.push(v); break; }
          case OP.LIST_EXTEND: { const v = stack.pop(); pushAll(stack[stack.length - 1].items, iterItems(v)); break; }
          case OP.LIST_TO_TUPLE: stack.push(new PyTuple(stack.pop().items)); break;
          case OP.MAKE_FUNCTION: {
            const c = this.codes[arg];
            const cells = c.freevars.length ? stack.splice(stack.length - c.freevars.length) : [];
            const nkw = c.kwMask.filter(Boolean).length;
            const kwdef = nkw ? stack.splice(stack.length - nkw) : [];
            const defaults = c.ndefaults ? stack.splice(stack.length - c.ndefaults) : [];
            const made = new PyFunction(arg, c.name, defaults, cells);
            if (nkw) { let k = 0; made.kwdefaults = c.kwMask.map((has) => (has ? kwdef[k++] : undefined)); }
            made.g = frame.g;
            stack.push(made);
            break;
          }
          case OP.CALL: case OP.CALL_KW: case OP.CALL_EX: {
            let args, kw = null;
            if (op === OP.CALL) args = arg ? stack.splice(stack.length - arg) : [];
            else {
              const names = stack.pop();
              const nkw = names.length;
              if (op === OP.CALL_KW) {
                const all = stack.splice(stack.length - arg);
                args = all.slice(0, arg - nkw);
                kw = names.map((n, i) => [n, all[arg - nkw + i]]);
              } else {
                const vals = nkw ? stack.splice(stack.length - nkw) : [];
                args = stack.pop().items;
                if (nkw) {
                  kw = [];
                  names.forEach((n, i) => {
                    if (n !== null) { kw.push([n, vals[i]]); return; }
                    const d = vals[i];
                    if (!(d instanceof PyDict)) throw new ScriptError('type', { what: 'kwargsDict', type: typeName(d) });
                    for (const [k, v] of d.entries()) {
                      if (typeof k !== 'string') throw new ScriptError('type', { what: 'kwargsKeys' });
                      kw.push([k, v]);
                    }
                  });
                }
              }
            }
            const fn = stack.pop();
            const pc = this.prepareCall(task, fn, args, kw);
            if (pc !== null) {
              if (pc.value !== undefined) { stack.push(pc.value); break; }
              if (task.frames.length + (task.base ?? 0) >= MAX_DEPTH) throw this.recursionError(task, pc.fn);
              task.frames.push(pc.frame);
              frame = pc.frame; code = this.codes[frame.code]; stack = frame.stack;
              break;
            }
            const r = this.callNative(task, fn, args, kw);
            if (r instanceof Suspend) {
              if (sync) throw new ScriptError('type', { what: 'waitInSync' });
              task.state = 'waiting';
              task.wait = r.wait;
              break loop;
            }
            stack.push(r);
            // A native can end a task (stop()) or send it into a debug halt
            if (task.state !== 'ready') break loop;
            break;
          }
          case OP.RETURN: {
            let v = stack.pop();
            if (frame.ctor !== undefined) {
              if (v !== null) throw new ScriptError('type', { what: 'initReturn', type: typeName(v) });
              v = frame.ctor;
            } else if (frame.classInfo) v = this.buildClass(frame);
            task.frames.pop();
            if (!task.frames.length) {
              task.state = 'done';
              task.result = v;
              break loop;
            }
            frame = task.frames[task.frames.length - 1];
            code = this.codes[frame.code];
            stack = frame.stack;
            stack.push(v);
            break;
          }
          case OP.POP: stack.pop(); break;
          case OP.DUP: stack.push(stack[stack.length - 1]); break;
          case OP.DUP2: stack.push(stack[stack.length - 2], stack[stack.length - 1]); break;
          case OP.ROT2: { const n = stack.length; const t = stack[n - 1]; stack[n - 1] = stack[n - 2]; stack[n - 2] = t; break; }
          case OP.ROT3: { const n = stack.length; const t = stack[n - 1]; stack[n - 1] = stack[n - 2]; stack[n - 2] = stack[n - 3]; stack[n - 3] = t; break; }
          case OP.FORMAT: {
            const spec = arg & 4 ? stack.pop() : '';
            let v = stack.pop();
            const conv = arg & 3;
            if (conv === 1) v = this.str(v);
            else if (conv === 2 || conv === 3) v = this.repr(v);
            stack.push(typeof v === 'string' && !spec ? v : (v instanceof PyHost && !spec ? this.str(v) : formatValue(v, spec)));
            break;
          }
          case OP.BUILD_STRING: stack.push(stack.splice(stack.length - arg).join('')); break;
          case OP.IMPORT: stack.push(this.importModule(code.names[arg], task)); break;
          case OP.IMPORT_FROM: stack.push(this.importFrom(task, stack[stack.length - 1], code.names[arg])); break;
          case OP.IMPORT_STAR: {
            const m = stack.pop();
            for (const n of this.moduleNames(m)) frame.g.set(n, this.getattr(task, m, n));
            break;
          }
          case OP.LOAD_NAME: {
            const n = code.names[arg];
            stack.push(frame.ns.has(n) ? frame.ns.get(n) : this.loadGlobal(n, frame.g));
            break;
          }
          case OP.STORE_NAME: frame.ns.set(code.names[arg], stack.pop()); break;
          case OP.DELETE_NAME:
            if (!frame.ns.delete(code.names[arg])) throw new ScriptError('nameUnbound', { name: code.names[arg] });
            break;
          case OP.DELETE_ATTR: this.delattr(task, stack.pop(), code.names[arg]); break;
          case OP.SUPER: {
            const f = frame.fn;
            if (!f || !f.cls || frame.locals[0] === undefined) throw new ScriptError('type', { what: 'superOutside' });
            stack.push(new PySuper(f.cls, frame.locals[0]));
            break;
          }
          case OP.BUILD_CLASS: {
            const body = stack.pop(), bases = stack.pop(), name = stack.pop();
            const nf = this.bindFrame(body, [], null);
            nf.ns = new Map();
            nf.classInfo = { name, bases: bases.items };
            if (task.frames.length + (task.base ?? 0) >= MAX_DEPTH) throw this.recursionError(task, body);
            task.frames.push(nf);
            frame = nf; code = this.codes[nf.code]; stack = nf.stack;
            break;
          }
          case OP.WITH_SETUP: {
            const mgr = stack.pop();
            let enter, exit;
            try {
              enter = this.getattr(task, mgr, '__enter__');
              exit = this.getattr(task, mgr, '__exit__');
            } catch (e) {
              if (e instanceof ScriptError && e.short === 'attr') throw new ScriptError('type', { what: 'noContext', type: typeName(mgr) });
              throw e;
            }
            const r = this.callSync(enter, [], null, task);
            stack.push(exit, r);
            break;
          }
          case OP.WITH_EXIT_OK: {
            const [exit] = stack.splice(stack.length - 1 - arg, 1);
            this.callSync(exit, [null, null, null], null, task);
            break;
          }
          case OP.WITH_EXC: {
            const exc = stack.pop();
            const r = this.callSync(stack[stack.length - 1], [exc.cls, exc, null], null, task);
            if (truthy(r)) { stack.pop(); frame.pc = arg; } else throw this.errorOfException(exc);
            break;
          }
          case OP.YIELD: { task.result = stack.pop(); task.state = 'yielded'; break loop; }
          case OP.SETUP_TRY: (frame.blocks ??= []).push({ handler: arg, depth: stack.length, excs: frame.excs ? frame.excs.length : 0 }); break;
          case OP.POP_BLOCK: frame.blocks.pop(); break;
          case OP.EXC_MATCH: { const spec = stack.pop(), exc = stack.pop(); stack.push(this.excMatches(exc, spec)); break; }
          case OP.ENTER_HANDLER: (frame.excs ??= []).push(stack.pop()); break;
          case OP.EXIT_HANDLER: frame.excs.pop(); break;
          case OP.LOAD_EXC: stack.push(frame.excs[frame.excs.length - 1]); break;
          case OP.RERAISE: throw this.errorOfException(stack.pop());
          case OP.RAISE: {
            if (arg === 0) {
              const cur = task.frames.length ? this.currentException(task) : null;
              if (!cur) throw new ScriptError('type', { what: 'noActiveException' });
              throw this.errorOfException(cur);
            }
            const cause = arg === 2 ? stack.pop() : undefined;
            const inst = this.toException(task, stack.pop());
            if (arg === 2) inst.dict.set('__cause__', cause === null ? null : this.toException(task, cause));
            throw this.errorOfException(inst);
          }
          case OP.ASSERT_FAIL: {
            const msg = stack.pop();
            throw new ScriptError('assertion', { message: msg === null ? '' : this.str(msg) });
          }
          default: throw new Error(`Unknown instruction ${op}`);
        }
      } catch (e0) {
        if (!this.handleThrown(task, e0, frame)) break;
        frame = task.frames[task.frames.length - 1];
        code = this.codes[frame.code];
        stack = frame.stack;
      }
    }
    this.steps += used;
    return used;
  }

  /** Should the debugger stop before this instruction? */
  debugStop(task, frame, code, pc) {
    const d = task.debug;
    const depth = task.frames.length;
    if (d.skip) {
      const same = d.skip.depth === depth && d.skip.pc === pc;
      d.skip = null;
      if (same) return false;
    }
    if (d.mode === 'step') {
      if (d.kind === 'into' || (d.kind === 'over' && depth <= d.depth) || (d.kind === 'out' && depth < d.depth)) return true;
    }
    return d.bps.length > 0 && d.bps.includes(code.lines[pc]);
  }

  cellName(code, i) {
    return i < code.cellvars.length ? code.cellvars[i] : code.freevars[i - code.cellvars.length];
  }

  /** Value of a global name: the module's own names, then the host's, then the built-in functions and classes. */
  loadGlobal(name, g = this.globals) {
    const v = g.get(name);
    if (v !== undefined) return v;
    const d = this.dynamic.get(name);
    if (d) return d() ?? null;
    const p = this.predef.get(name);
    if (p !== undefined) return p;
    const removed = this.program.removed?.[name];
    // true/false/none: Python writes them with a capital letter
    const constant = { true: 'True', false: 'False', none: 'None', null: 'None' }[name.toLowerCase()];
    const isModule = MODULES[name] || PYMODULES[name] || this.host.modules?.[name];
    throw new ScriptError('nameUnbound', { name, ...(isModule ? { what: 'import' } : {}), ...(removed ?? {}), suggestion: removed?.suggestion ?? constant ?? suggest(name, [...g.keys(), ...this.dynamic.keys(), ...this.predef.keys()]) });
  }

  /** `import name`: a built-in module, a standard module written in Python, or a source the host provides. */
  importModule(name, task) {
    const cached = this.moduleCache.get(name);
    if (cached) return cached;
    const dot = name.lastIndexOf('.');
    if (dot > 0) return this.importSubmodule(name.slice(0, dot), name.slice(dot + 1), task);
    if (MODULES[name] || this.host.modules?.[name]) {
      const m = new PyModule(name);
      this.moduleCache.set(name, m);
      return m;
    }
    const src = PYMODULES[name] ?? this.host.readModule?.(name);
    if (src === undefined || src === null) throw new ScriptError('importUnknown', { name });
    return this.loadModule(name, src, task);
  }

  /**
   * `import a.b`: the package a first, then its submodule b (a source named 'a.b', or a module that a already
   * holds as attribute b, like os.path); the submodule becomes an attribute of a.
   */
  importSubmodule(parentName, child, task) {
    const name = `${parentName}.${child}`;
    const parent = this.importModule(parentName, task);
    const cached = this.moduleCache.get(name);
    if (cached) return cached;
    let mod;
    if (PYMODULES[name] !== undefined || MODULES[name] || this.host.modules?.[name]) {
      mod = MODULES[name] || this.host.modules?.[name] ? new PyModule(name) : this.loadModule(name, PYMODULES[name], task);
      this.moduleCache.set(name, mod);
    } else {
      const v = parent.ns?.get(child);
      if (!(v instanceof PyModule)) throw new ScriptError('importUnknown', { name });
      mod = v;
    }
    if (parent.ns) parent.ns.set(child, mod);
    return mod;
  }

  /** `from m import x`: an attribute of m, or else its submodule m.x (from matplotlib import pyplot). */
  importFrom(task, mod, name) {
    try {
      return this.getattr(task, mod, name);
    } catch (e) {
      if (!(e instanceof ScriptError) || e.short !== 'attr' || !(mod instanceof PyModule)) throw e;
      const sub = `${mod.name}.${name}`;
      if (PYMODULES[sub] === undefined && !MODULES[sub] && !this.host.modules?.[sub]) throw e;
      return this.importModule(sub, task);
    }
  }

  /** Compile a module and run its code in a namespace of its own (the module object is cached before it runs). */
  loadModule(name, src, task) {
    const prog = compileRaw(src, { known: [...this.predef.keys(), ...Object.keys(CLASS_GLOBALS)], modules: MODULES, codeBase: this.codes.length });
    this.codes.push(...prog.codes);
    const ns = new Map([['__name__', name]]);
    const mod = new PyModule(name, ns);
    this.moduleCache.set(name, mod);
    const frame = this.newFrame(prog.base, [], ns);
    try {
      this.runSync(this.syncTask(task ?? this.curTask, frame, { code: prog.base }));
    } catch (e) {
      this.moduleCache.delete(name);
      throw e;
    }
    return mod;
  }

  moduleNames(m) {
    if (!(m instanceof PyModule)) return [];
    if (m.ns) return [...m.ns.keys()].filter((k) => !k.startsWith('_'));
    return MODULES[m.name] ?? this.host.modules?.[m.name] ?? [];
  }

  // ---------- Calls and attributes ----------

  /**
   * Call a native (built-in function, method, host API).
   * @returns {any|Suspend}
   */
  callNative(task, fn, args, kw) {
    const ctx = { vm: this, task };
    if (fn instanceof PyBuiltin) {
      const f = this.natives[fn.name];
      if (!f) {
        // Unbound method: str.lower("ABC")
        const [tn, mn] = fn.name.split('.');
        const m = METHODS[tn]?.[mn];
        if (m && args.length && typeName(args[0]) === tn) return m(ctx, args[0], args.slice(1), kw ? Object.fromEntries(kw) : EMPTY);
        if (m) throw new ScriptError('type', { what: 'unboundMethod', name: fn.name, type: typeName(args[0]) });
        throw new ScriptError('notCallable', { type: fn.name });
      }
      return f(ctx, args, kw ? Object.fromEntries(kw) : EMPTY);
    }
    if (fn instanceof PyPartial) {
      const f = this.natives[fn.fn.name];
      const kws = Object.fromEntries([...fn.kwargs, ...(kw ?? [])]);
      return f(ctx, [...fn.args, ...args], kws);
    }
    if (fn instanceof PyBoundMethod) {
      const self = fn.self;
      const kwo = kw ? Object.fromEntries(kw) : EMPTY;
      if (self instanceof PyHost) return this.host.callMethod(ctx, self, fn.name, args, kwo);
      if (self instanceof PyModule) {
        const f = this.natives[`${self.name}.${fn.name}`];
        return f(ctx, args, kwo);
      }
      const table = METHODS[typeName(self)];
      const m = table?.[fn.name];
      if (!m) throw new ScriptError('attr', { type: typeName(self), name: fn.name });
      return m(ctx, self, args, kwo);
    }
    if (fn instanceof PyFunction) return this.callSync(fn, args, kw, task);
    throw new ScriptError('notCallable', { type: typeName(fn) });
  }

  getattr(task, obj, name) {
    if (obj instanceof PyInstance) return this.instAttr(task, obj, name);
    if (obj instanceof PyClass) return this.classAttr(task, obj, name);
    if (obj instanceof PySuper) return this.superAttr(task, obj, name);
    if (obj instanceof PyMethod) {
      if (name === '__name__') return obj.fn.name;
      if (name === '__self__') return obj.self;
      if (name === '__func__') return obj.fn;
    }
    if (obj instanceof PySlice && (name === 'start' || name === 'stop' || name === 'step')) return obj[name];
    if (obj instanceof PyProperty && (name === 'setter' || name === 'getter' || name === 'deleter')) return new PyPartial(new PyBuiltin(`property.${name}`), [obj]);
    if (obj instanceof PyModule) {
      if (obj.ns) {
        const nv = obj.ns.get(name);
        if (nv !== undefined) return nv;
        throw new ScriptError('attr', { type: `module '${obj.name}'`, name, suggestion: suggest(name, this.moduleNames(obj)) });
      }
      const v = moduleAttr(obj.name, name);
      if (v !== undefined) return v;
      const hv = this.host.moduleAttr?.(obj.name, name);
      if (hv !== undefined) return hv;
      throw new ScriptError('attr', { type: `module '${obj.name}'`, name, suggestion: suggest(name, this.moduleNames(obj)) });
    }
    if (obj instanceof PyHost) {
      const v = this.host.getattr?.({ vm: this, task }, obj, name);
      if (v !== undefined) return v;
      throw new ScriptError('attr', { type: obj.cls, name, suggestion: suggest(name, this.host.dir?.(obj) ?? []) });
    }
    if (obj instanceof PyFunction && name === '__name__') return obj.name;
    if (obj instanceof PyBuiltin && name === '__name__') return obj.name.replace(/^class:/, '');
    if (name === '__class__' && !(obj instanceof PyHost)) { const t = typeName(obj); return new PyBuiltin(TYPE_NAMES.has(t) ? t : `class:${t}`); }
    if (obj instanceof PyBuiltin && METHODS[obj.name] && Object.hasOwn(METHODS[obj.name], name)) return new PyBuiltin(`${obj.name}.${name}`);
    const t = typeName(obj);
    const table = METHODS[t];
    if (table && Object.hasOwn(table, name)) return new PyBoundMethod(obj, name);
    if (obj instanceof PyFloat && (name === 'real')) return obj;
    throw new ScriptError('attr', { type: t, name, suggestion: table ? suggest(name, Object.keys(table)) : null, ...(obj === null || obj === undefined ? { what: 'none' } : {}) });
  }

  /** A function found in a class, seen from an instance: methods get bound, static methods are plain functions. */
  bindAttr(task, attr, obj, cls, name = '?') {
    if (attr instanceof PyFunction) return new PyMethod(obj, attr);
    if (attr instanceof PyBuiltin) return new PyPartial(attr, [obj]);
    if (attr instanceof PyStaticMethod) return attr.fn;
    if (attr instanceof PyClassMethod) return new PyMethod(cls, attr.fn);
    if (attr instanceof PyProperty) {
      if (!attr.fget) throw new ScriptError('attr', { type: cls.name, name, what: 'noGetter' });
      return this.callSync(attr.fget, [obj], null, task);
    }
    return attr;
  }

  instAttr(task, obj, name) {
    const cls = obj.cls;
    const attr = lookupClass(cls, name);
    if (attr instanceof PyProperty) return this.bindAttr(task, attr, obj, cls, name);
    const own = obj.dict.get(name);
    if (own !== undefined) return own;
    if (attr !== undefined) return this.bindAttr(task, attr, obj, cls, name);
    if (name === '__class__') return cls;
    if (name === '__dict__') { const d = new PyDict(); for (const [k, v] of obj.dict) d.set(k, v); return d; }
    const ga = lookupClass(cls, '__getattr__');
    if (ga) return this.callSync(ga, [obj, name], null, task);
    const names = [...obj.dict.keys(), ...cls.mro.flatMap((c) => [...c.dict.keys()])].filter((n) => !n.startsWith('__'));
    throw new ScriptError('attr', { type: cls.name, name, suggestion: suggest(name, names) });
  }

  classAttr(task, cls, name) {
    if (name === '__name__') return cls.name;
    if (name === '__bases__') return new PyTuple(cls.bases.slice());
    if (name === '__mro__') return new PyTuple(cls.mro.slice());
    const attr = lookupClass(cls, name);
    if (attr !== undefined) {
      if (attr instanceof PyStaticMethod) return attr.fn;
      if (attr instanceof PyClassMethod) return new PyMethod(cls, attr.fn);
      return attr;
    }
    const names = cls.mro.flatMap((c) => [...c.dict.keys()]).filter((n) => !n.startsWith('__'));
    throw new ScriptError('attr', { type: `type object '${cls.name}'`, name, suggestion: suggest(name, names), what: 'class' });
  }

  superAttr(task, sup, name) {
    const obj = sup.obj;
    const start = obj instanceof PyClass ? obj : obj instanceof PyInstance ? obj.cls : null;
    if (!start) throw new ScriptError('type', { what: 'superArgs', type: typeName(obj) });
    const mro = start.mro;
    for (let k = mro.indexOf(sup.cls) + 1; k < mro.length; k++) {
      if (!mro[k].dict.has(name)) continue;
      const attr = mro[k].dict.get(name);
      if (obj instanceof PyInstance) return this.bindAttr(task, attr, obj, start);
      if (attr instanceof PyClassMethod) return new PyMethod(obj, attr.fn);
      if (attr instanceof PyStaticMethod) return attr.fn;
      return attr;
    }
    throw new ScriptError('attr', { type: 'super', name });
  }

  /** Class from the finished body of a class statement. */
  buildClass(frame) {
    const { name, bases } = frame.classInfo;
    for (const b of bases) if (!(b instanceof PyClass)) throw new ScriptError('notSupported', { feature: 'subclassBuiltin' });
    const dict = new Map();
    for (const [k, v] of frame.ns) if (!k.startsWith('.')) dict.set(k, v);
    // As in Python: a class that compares with __eq__ but has no __hash__ is not hashable
    if (dict.has('__eq__') && !dict.has('__hash__')) dict.set('__hash__', null);
    const cls = new PyClass(name, bases.length ? bases : [OBJECT], dict, null);
    // Functions remember their class (for super())
    for (const v of dict.values()) {
      if (v instanceof PyFunction) v.cls = cls;
      else if (v instanceof PyStaticMethod || v instanceof PyClassMethod) { if (v.fn instanceof PyFunction) v.fn.cls = cls; }
      else if (v instanceof PyProperty) for (const f of [v.fget, v.fset, v.fdel]) if (f instanceof PyFunction) f.cls = cls;
    }
    return cls;
  }

  delattr(task, obj, name) {
    if (obj instanceof PyInstance || obj instanceof PyClass) {
      const d = obj instanceof PyInstance ? obj.dict : obj.dict;
      if (!d.delete(name)) throw new ScriptError('attr', { type: obj instanceof PyInstance ? obj.cls.name : `type object '${obj.name}'`, name });
      return;
    }
    throw new ScriptError('attr', { type: typeName(obj), name, readonly: true });
  }

  setattr(task, obj, name, v) {
    if (obj instanceof PyInstance) {
      const attr = lookupClass(obj.cls, name);
      if (attr instanceof PyProperty) {
        if (!attr.fset) throw new ScriptError('attr', { type: obj.cls.name, name, what: 'noSetter' });
        this.callSync(attr.fset, [obj, v], null, task);
        return;
      }
      obj.dict.set(name, v);
      return;
    }
    if (obj instanceof PyClass) { if (name === '__name__' && typeof v === 'string') obj.name = v; else obj.dict.set(name, v); return; }
    if (obj instanceof PyModule && obj.ns) { obj.ns.set(name, v); return; }
    if (obj instanceof PyHost && this.host.setattr?.({ vm: this, task }, obj, name, v)) return;
    throw new ScriptError('attr', { type: typeName(obj), name, readonly: true });
  }

  str(v) { return this.active(() => toStr(v, false, (h) => this.hostRepr(h))); }
  repr(v) { return this.active(() => toStr(v, true, (h) => this.hostRepr(h))); }
  hostRepr(h) { return this.host.repr?.(h) ?? `<${h.cls} ${h.id}>`; }

  /** Output of print(). */
  print(text, task) {
    if (this.host.print) this.host.print(text, task);
  }

  /** Output to stderr (sys.stderr); hosts without a separate channel get it on print. */
  printErr(text, task) {
    if (this.host.printErr) this.host.printErr(text, task);
    else this.print(text, task);
  }

  /** Random number 0 … 2^32-1 (sfc32, saved). */
  random32() {
    const s = this.rng;
    let [a, b, c, d] = s;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    s[0] = a; s[1] = b; s[2] = c; s[3] = d;
    return t >>> 0;
  }

  // ---------- Insight for debugger and UI ----------

  /**
   * Variables of a task: global, parameters and local variables of the innermost frame, call stack.
   * Values as short texts (repr), so the UI does not need to know anything about the VM.
   */
  inspect(task, maxLen = 120) {
    const short = (v) => {
      let s;
      try { s = this.repr(v); } catch { s = '?'; }
      return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
    };
    const item = (name, v) => ({ name, type: typeName(v), value: short(v) });
    const globals = [];
    for (const [k, v] of this.globals) {
      if (k.startsWith('.') || k.startsWith('__')) continue;
      if (v instanceof PyFunction || v instanceof PyBuiltin || v instanceof PyModule) continue;
      globals.push(item(k, v));
    }
    // Call stack with simple arguments (ice(4, 3, […])); deep stacks shortened to the first 2 and last 8 calls
    const simple = (v) => (v === null || typeof v === 'boolean' || typeof v === 'number' || typeof v === 'bigint' || v instanceof PyFloat
      || (typeof v === 'string' && v.length <= 12) ? short(v) : '…');
    const callOf = (f) => {
      const c = this.codes[f.code];
      const args = c.module ? null : c.params.map((p, i) => {
        const ci = c.cellvars.indexOf(p);
        const v = ci >= 0 ? f.cells[ci]?.v : f.locals[i];
        return v === undefined ? '…' : simple(v);
      }).join(', ');
      return { name: c.name, line: c.lines[Math.min(f.pc, c.lines.length - 1)], args };
    };
    const all = task ? task.frames : [];
    const frames = all.length > 12
      ? [...all.slice(0, 2).map(callOf), { name: '…', line: 0, args: null, skipped: all.length - 10 }, ...all.slice(-8).map(callOf)]
      : all.map(callOf);
    const top = task?.frames[task.frames.length - 1];
    const args = [], locals = [];
    if (top && !this.codes[top.code].module) {
      const c = this.codes[top.code];
      c.varnames.forEach((n, i) => {
        if (n.startsWith('.')) return;
        const ci = c.cellvars.indexOf(n);
        const v = ci >= 0 ? top.cells[ci].v : top.locals[i];
        if (v === undefined) return;
        (i < c.params.length ? args : locals).push(item(n, v));
      });
      c.freevars.forEach((n, j) => {
        const v = top.cells[c.cellvars.length + j]?.v;
        if (v !== undefined && !n.startsWith('.')) locals.push(item(n, v));
      });
    }
    return { globals, args, locals, frames, line: task ? this.lineOf(task) : 0 };
  }
}

const EMPTY = Object.freeze(Object.create(null));

function seedRng(seed) {
  const s = [0x9e3779b9, 0x243f6a88, 0xb7e15162, seed >>> 0];
  const vm = { rng: s };
  for (let i = 0; i < 15; i++) VM.prototype.random32.call(vm);
  return s;
}

export { keyOf };
