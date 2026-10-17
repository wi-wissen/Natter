// _pgz: the bridge between the Pygame Zero modules (written in Python, stdlib/py/pgzero_*.js) and the host that draws,
// plays sounds and collects input. Everything the game logic needs runs in Python; the host only
//   - answers resource queries:   host.pgz.resource(kind, name) → [w, h] for images, seconds for sounds, true for
//                                 music and fonts, null when the file does not exist,
//   - executes commands:          host.pgz.cmd(name, args) with plain JavaScript values (see docs/PGZERO-BRIDGE.md),
//   - calls the frame driver:     pgzFrame(vm, events, dt) once per animation frame.
// The natives that look into the VM (argument names of handlers, globals of the main program) are implemented here.

import { PyFloat, PyTuple, PyList, PyDict, PySet, PyFunction, PyMethod, PyBuiltin, Suspend } from '../values.js';
import { params, needStr } from '../args.js';
import { ScriptError } from '../errors.js';

/** Python value → plain JavaScript value for the host (tuples and lists → arrays, dicts → objects, floats → numbers). */
export function toHost(v) {
  if (v instanceof PyFloat) return v.v;
  if (v instanceof PyTuple || v instanceof PyList) return v.items.map(toHost);
  if (v instanceof PyDict) { const o = {}; for (const [k, x] of v.entries()) o[String(k)] = toHost(x); return o; }
  if (v instanceof PySet) return v.items().map(toHost);
  if (typeof v === 'bigint') return Number(v);
  return v;
}

/** JavaScript value → Python value (arrays → tuples, objects → dicts, non-integer numbers → floats). */
export function toPy(v) {
  if (Array.isArray(v)) return new PyTuple(v.map(toPy));
  if (typeof v === 'number') return Number.isInteger(v) && !Object.is(v, -0) ? v : new PyFloat(v);
  if (v && typeof v === 'object') { const d = new PyDict(); for (const [k, x] of Object.entries(v)) d.set(k, toPy(x)); return d; }
  return v ?? null;
}

/** Value of a global of the main program (or a predefined name), undefined if there is none. */
function mainValue(vm, name) {
  const v = vm.globals.get(name);
  return v !== undefined ? v : vm.predef.get(name);
}

export const PGZ_NATIVES = {
  '_pgz.resource'(ctx, args, kw) {
    const [kind, name] = params('resource', args, kw, ['kind', 'name']);
    const r = ctx.vm.host.pgz?.resource?.(needStr(kind, 'kind'), needStr(name, 'name'));
    return r === undefined ? null : toPy(r);
  },
  '_pgz.cmd'(ctx, args, kw) {
    const [name, a = null] = params('cmd', args, kw, ['name', '?args']);
    ctx.vm.host.pgz?.cmd?.(needStr(name, 'name'), a === null ? [] : toHost(a));
    return null;
  },
  /** Names of the positional parameters of a function (code.co_varnames[:code.co_argcount]). */
  '_pgz.argnames'(ctx, args, kw) {
    const [fn] = params('argnames', args, kw, ['fn']);
    if (fn instanceof PyFunction) return new PyTuple(ctx.vm.codes[fn.code].params.slice());
    if (fn instanceof PyMethod && fn.fn instanceof PyFunction) return new PyTuple(ctx.vm.codes[fn.fn.code].params.slice());
    if (fn instanceof PyBuiltin) return new PyTuple([]);
    return null;
  },
  /** A global of the main program, or None. */
  '_pgz.main_get'(ctx, args, kw) {
    const [name] = params('main_get', args, kw, ['name']);
    const v = mainValue(ctx.vm, needStr(name, 'name'));
    return v === undefined ? null : v;
  },
  /** The globals of the main program as a dict (for the spell check of hook names). */
  '_pgz.main_vars'(ctx) {
    const d = new PyDict();
    for (const [k, v] of ctx.vm.globals) d.set(k, v);
    return d;
  },
  /** `import pgzrun`: put the Pygame Zero names into the main program (like pgzero's prepare_mod). */
  '_pgz.install'(ctx, args, kw) {
    const [names] = params('install', args, kw, ['names']);
    if (!(names instanceof PyDict)) throw new ScriptError('type', { what: 'convert', to: 'dict', type: 'object' });
    for (const [k, v] of names.entries()) ctx.vm.globals.set(k, v);
    return null;
  },
  /** pgzrun.go(): the main program waits here while the host runs the game (kind 'pgzero'). */
  '_pgz.go'() { return new Suspend({ kind: 'pgzero' }); },
};
export const PGZ_NAMES = ['resource', 'cmd', 'argnames', 'main_get', 'main_vars', 'install', 'go'];

/**
 * VM options that make `_pgz` importable while builtins.js does not list it yet:
 * `new VM(prog, { natives: PGZ_NATIVES, host: { ...pgzHostModules(), pgz: { resource, cmd } } })`.
 */
export function pgzHostModules() {
  return {
    modules: { _pgz: PGZ_NAMES },
    moduleAttr: (mod, name) => (mod === '_pgz' && PGZ_NAMES.includes(name) ? new PyBuiltin(`_pgz.${name}`) : undefined),
  };
}

/** Names that a Pygame Zero program knows without `import pgzrun` (for compile(src, { known })). */
export const PGZ_BUILTIN_NAMES = ['Actor', 'Rect', 'ZRect', 'animate', 'clock', 'keyboard', 'keys', 'keymods', 'mouse', 'music',
  'sounds', 'images', 'tone', 'screen', 'exit'];

/**
 * Game mode without `import pgzrun`: import the Pygame Zero builtins and predefine them for the main program.
 * Call after `new VM(...)` and before `vm.start()`.
 */
export function installPgzero(vm) {
  const mod = vm.importModule('pgzero_builtins', null);
  for (const [k, v] of mod.ns) if (!k.startsWith('_')) vm.predef.set(k, v);
  return mod;
}

/**
 * Start the game (read WIDTH, HEIGHT, TITLE, find the hooks, spell check them); frame() does it itself if needed.
 * Returns the task; run it with vm.run(task, budget).
 */
export function pgzStart(vm) {
  const start = vm.importModule('pgzero_main', null).ns.get('start');
  return vm.spawn(start, [], { pgzero: 'start' });
}

/**
 * Start one frame: dispatch the events, tick the clock and animations, call update() and maybe draw().
 * Returns the task; run it with vm.run(task, budget). Its result is True when draw() ran (show the canvas).
 * @param {import('../vm.js').VM} vm
 * @param {any[]} events JavaScript arrays like ['key_down', key, mod, unicode] (see docs/PGZERO-BRIDGE.md)
 * @param {number} dt seconds since the last frame
 */
export function pgzFrame(vm, events, dt) {
  const frame = vm.importModule('pgzero_main', null).ns.get('frame');
  return vm.spawn(frame, [new PyList(events.map(toPy)), new PyFloat(dt)], { pgzero: 'frame' });
}
