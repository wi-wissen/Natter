// Save and restore the state of a VM as JSON – even in the middle of a loop or
// while a task is waiting. The object graph is stored with numbers so that shared objects
// (a = b = []) and cycles (xs.append(xs)) are preserved. The program itself is not stored:
// it is recompiled from the source text on loading (the compiler is deterministic).

import { VM } from './vm.js';
import {
  PyFloat, PyList, PyTuple, PyDict, PyRange, PySlice, PyFunction, PyBuiltin, PyPartial, PyBoundMethod, PyHost,
  PyModule, PyView, PyIterator, Cell,
} from './values.js';

const floatOut = (v) => (Object.is(v, -0) ? '-0' : Number.isNaN(v) ? 'nan' : String(v));
const floatIn = (s) => (s === '-0' ? -0 : s === 'nan' ? NaN : Number(s));

/** @param {VM} vm @returns {any} pure JSON */
export function saveVm(vm) {
  const objs = [];
  const ids = new Map();
  // Objects are numbered when first seen and filled afterwards from a queue: deeply nested data
  // (x = [x] in a loop) needs no JS recursion, so saving works the same on every device.
  const queue = [];
  const ref = (o, make) => {
    let i = ids.get(o);
    if (i !== undefined) return { r: i };
    i = objs.length;
    ids.set(o, i);
    objs.push(null);
    queue.push([i, make]);
    return { r: i };
  };
  const enc = (v) => {
    if (v === undefined) return { u: 1 };
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
    if (typeof v === 'number') return Object.is(v, -0) ? 0 : v;
    if (typeof v === 'bigint') return { bi: v.toString() };
    if (v instanceof PyFloat) return { f: floatOut(v.v) };
    if (v instanceof PyList) return ref(v, () => ({ t: 'l', items: v.items.map(enc) }));
    if (v instanceof PyTuple) return ref(v, () => ({ t: 't', items: v.items.map(enc) }));
    if (v instanceof PyDict) return ref(v, () => ({ t: 'd', e: v.entries().map(([k, x]) => [enc(k), enc(x)]) }));
    if (v instanceof PyFunction) return ref(v, () => ({ t: 'fn', code: v.code, name: v.name, defaults: v.defaults.map(enc), cells: v.cells.map(enc) }));
    if (v instanceof Cell) return ref(v, () => ({ t: 'c', v: enc(v.v) }));
    if (v instanceof PyIterator) return ref(v, () => ({ t: 'it', seq: enc(v.seq), i: v.i, label: v.label }));
    if (v instanceof PyView) return ref(v, () => ({ t: 'vw', d: enc(v.dict), kind: v.kind }));
    if (v instanceof PyRange) return ref(v, () => ({ t: 'rg', a: v.start, b: v.stop, c: v.step }));
    if (v instanceof PySlice) return ref(v, () => ({ t: 'sl', a: enc(v.start), b: enc(v.stop), c: enc(v.step) }));
    if (v instanceof PyPartial) return ref(v, () => ({ t: 'pa', fn: enc(v.fn), args: v.args.map(enc), kw: v.kwargs.map(([k, x]) => [k, enc(x)]) }));
    if (v instanceof PyBoundMethod) return ref(v, () => ({ t: 'bm', self: enc(v.self), name: v.name }));
    if (v instanceof PyHost) return { h: v.cls, id: v.id };
    if (v instanceof PyModule) return { m: v.name };
    if (v instanceof PyBuiltin) return { b: v.name };
    if (Array.isArray(v)) return { a: v.map(enc) };
    if (typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v)) o[k] = enc(v[k]);
      return { o };
    }
    throw new Error(`Not serialisable: ${typeof v}`);
  };
  const frame = (f) => ({ code: f.code, pc: f.pc, locals: f.locals.map(enc), stack: f.stack.map(enc), cells: f.cells.map(enc) });
  const globals = [...vm.globals].map(([k, v]) => [k, enc(v)]);
  const tasks = [...vm.tasks.values()].map((t) => ({
    id: t.id, state: t.state, frames: t.frames.map(frame), wait: enc(t.wait), result: enc(t.result),
    error: t.error, debug: t.debug ? JSON.parse(JSON.stringify(t.debug)) : null, meta: enc(t.meta),
  }));
  for (let q = 0; q < queue.length; q++) { const [i, make] = queue[q]; objs[i] = make(); }
  return { v: 1, globals, tasks, nextTask: vm.nextTask, rng: [...vm.rng], steps: vm.steps, objs };
}

/**
 * Restore a VM from a saved state.
 * @param {import('./compiler.js').Program} program freshly compiled program
 * @param {any} data result of saveVm
 * @param {any} opts as for the VM constructor
 */
export function loadVm(program, data, opts = {}) {
  const vm = new VM(program, opts);
  const shells = data.objs.map((o) => {
    switch (o.t) {
      case 'l': return new PyList([]);
      case 't': return new PyTuple([]);
      case 'd': return new PyDict();
      case 'fn': return new PyFunction(o.code, o.name, [], []);
      case 'c': return new Cell(undefined);
      case 'it': return new PyIterator(null, o.i, o.label);
      case 'vw': return new PyView(null, o.kind);
      case 'rg': return new PyRange(o.a, o.b, o.c);
      case 'sl': return new PySlice(null, null, null);
      case 'pa': return new PyPartial(null, [], []);
      case 'bm': return new PyBoundMethod(null, o.name);
      default: throw new Error(`Unknown object type ${o.t}`);
    }
  });
  const dec = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if ('r' in v) return shells[v.r];
    if ('u' in v) return undefined;
    if ('f' in v) return new PyFloat(floatIn(v.f));
    if ('bi' in v) return BigInt(v.bi);
    if ('h' in v) return new PyHost(v.h, v.id);
    if ('m' in v) return new PyModule(v.m);
    if ('b' in v) return new PyBuiltin(v.b);
    if ('a' in v) return v.a.map(dec);
    if ('o' in v) { const o = {}; for (const k of Object.keys(v.o)) o[k] = dec(v.o[k]); return o; }
    throw new Error('Unknown value in saved state');
  };
  data.objs.forEach((o, i) => {
    const s = shells[i];
    switch (o.t) {
      case 'l': case 't': s.items = o.items.map(dec); break;
      case 'd': break; // below: keys (tuples) must be filled first
      case 'fn': s.defaults = o.defaults.map(dec); s.cells = o.cells.map(dec); break;
      case 'c': s.v = dec(o.v); break;
      case 'it': s.seq = dec(o.seq); break;
      case 'vw': s.dict = dec(o.d); break;
      case 'sl': s.start = dec(o.a); s.stop = dec(o.b); s.step = dec(o.c); break;
      case 'pa': s.fn = dec(o.fn); s.args = o.args.map(dec); s.kwargs = o.kw.map(([k, x]) => [k, dec(x)]); break;
      case 'bm': s.self = dec(o.self); break;
      default: break;
    }
  });
  // Dictionaries last: their keys depend on the content of the tuples
  data.objs.forEach((o, i) => { if (o.t === 'd') for (const [k, x] of o.e) shells[i].set(dec(k), dec(x)); });
  for (const [k, v] of data.globals) vm.globals.set(k, dec(v));
  for (const t of data.tasks) {
    vm.tasks.set(t.id, {
      id: t.id, state: t.state, wait: dec(t.wait), result: dec(t.result), error: t.error,
      debug: t.debug, meta: dec(t.meta),
      frames: t.frames.map((f) => ({ code: f.code, pc: f.pc, locals: f.locals.map(dec), stack: f.stack.map(dec), cells: f.cells.map(dec) })),
    });
  }
  vm.nextTask = data.nextTask;
  vm.rng.splice(0, 4, ...data.rng);
  vm.steps = data.steps ?? 0;
  return vm;
}
