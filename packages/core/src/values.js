// Values of the scripting language and their Python semantics (arithmetic, comparing, representing).
//
// Representation in JavaScript:
//   int   → JS number, from 2^53 BigInt (like Python without an upper limit; back to a number as soon as it fits again)
//   float → PyFloat { v }   (IEEE 754 – + − * / % and sqrt are exactly identical on all machines)
//   bool  → true/false, None → null, str → JS string
//   list, tuple, dict, range, functions, host objects → classes below
// Everything can be saved as JSON (serialize.js); host objects are only handles (class + ID).

import { ScriptError } from './errors.js';
import * as F from './libm.js';

export class PyFloat { constructor(v) { this.v = v; } }
export class PyList { constructor(items = []) { this.items = items; } }
export class PyTuple { constructor(items = []) { this.items = items; } }
export class PyRange { constructor(start, stop, step) { this.start = start; this.stop = stop; this.step = step; } }
export class PySlice { constructor(start, stop, step) { this.start = start; this.stop = stop; this.step = step; } }
/** Variable captured by an inner function (closure). v === undefined: not yet assigned. */
export class Cell { constructor(v) { this.v = v; } }
/** Own function: code number in the program, default values, captured cells. */
export class PyFunction {
  constructor(code, name, defaults = [], cells = []) { this.code = code; this.name = name; this.defaults = defaults; this.cells = cells; }
}
/** Built-in function or host API function, found by name in the directory. */
export class PyBuiltin { constructor(name) { this.name = name; } }
/** Partially applied built-in function, e.g. a decorator with arguments: @on_building_done("farm"). */
export class PyPartial { constructor(fn, args = [], kwargs = []) { this.fn = fn; this.args = args; this.kwargs = kwargs; } }
/** Method with bound object: [1, 2].append, obj.method. */
export class PyBoundMethod { constructor(self, name) { this.self = self; this.name = name; } }
/** Host object (turtle, widget …): only a handle, the data lives in the host. */
export class PyHost { constructor(cls, id) { this.cls = cls; this.id = id; } }
/** Module. `ns` is the namespace of a module written in Python; native modules keep their names in builtins.js. */
export class PyModule { constructor(name, ns = null) { this.name = name; this.ns = ns; } }
/** View of a dictionary: keys(), values(), items(). */
export class PyView { constructor(dict, kind) { this.dict = dict; this.kind = kind; } }
/** Iterator over a sequence (list, tuple, text, range). */
export class PyIterator { constructor(seq, i = 0, label = null) { this.seq = seq; this.i = i; this.label = label; } }

export class PyDict {
  constructor() { /** @type {Map<string, [any, any]>} */ this.map = new Map(); }
  get size() { return this.map.size; }
  /**
   * Key in the map. Instances with their own __hash__ share a hash: the slots after the first hold the ones that
   * are not equal to the first (so __eq__ decides, as in Python).
   */
  slot(k) {
    const key = keyOf(k);
    if (key.charCodeAt(0) !== 120) return key; // only 'x…' keys (user-defined hashes) can collide
    for (let n = 0; ; n++) {
      const sk = n ? `${key}#${n}` : key;
      const e = this.map.get(sk);
      if (!e || eq(e[0], k)) return sk;
    }
  }
  get(k) { const e = this.map.get(this.slot(k)); return e ? e[1] : undefined; }
  set(k, v) { const key = this.slot(k); const e = this.map.get(key); if (e) e[1] = v; else this.map.set(key, [k, v]); }
  has(k) { return this.map.has(this.slot(k)); }
  delete(k) {
    const key = this.slot(k);
    if (!this.map.has(key)) return false;
    this.map.delete(key);
    // close the gap in a chain of colliding keys
    const m = /^(.*)#(\d+)$/.exec(key);
    const base = m ? m[1] : key, start = m ? Number(m[2]) : 0;
    if (base.charCodeAt(0) === 120) {
      for (let n = start + 1; ; n++) {
        const from = `${base}#${n}`;
        const e = this.map.get(from);
        if (!e) break;
        this.map.delete(from);
        this.map.set(n - 1 ? `${base}#${n - 1}` : base, e);
      }
    }
    return true;
  }
  keys() { return [...this.map.values()].map((e) => e[0]); }
  values() { return [...this.map.values()].map((e) => e[1]); }
  entries() { return [...this.map.values()]; }
}

/** Generator: a function frame that can be resumed (see vm.js, genResume). */
export class PyGenerator {
  constructor(frame, fn) { this.frame = frame; this.fn = fn; this.state = 'new'; this.returned = null; }
}

/** set and frozenset: a dictionary of keys. */
export class PySet {
  constructor(frozen = false) { this.d = new PyDict(); this.frozen = frozen; }
  get size() { return this.d.size; }
  add(x) { this.d.set(x, true); }
  has(x) { return this.d.has(x); }
  delete(x) { return this.d.delete(x); }
  items() { return this.d.keys(); }
}
/** New set (or frozenset) from values. */
export function setOf(items, frozen = false) {
  const r = new PySet(frozen);
  for (const x of items) r.add(x);
  return r;
}

// ---------- Objects: classes and instances ----------

/** Hooks the running VM installs so that operators on instances can call Python methods. */
export const hooks = { vm: null, call: (fn, args) => hooks.vm.callSync(fn, args, null, hooks.vm.curTask) };

/** Return value of a native: the task parks until the host resumes it with the result (see vm.js). */
export class Suspend {
  /** @param {any} wait plain data describing what is awaited (e.g. { kind: 'input', prompt: '> ' }) */
  constructor(wait) { this.wait = wait; }
}

/** Marker result of a dunder method that declines the operation (NotImplemented). */
export class PyNotImplemented {}
export const NOT_IMPLEMENTED = new PyNotImplemented();
/** No such method (distinct from NotImplemented). */
export const NO_METHOD = Symbol('no method');

/**
 * Class. `native` is null for classes made in Python and a tag ('object', 'exception') for built-in ones.
 * `dict` holds methods and class attributes.
 */
export class PyClass {
  /** @param {string} name @param {PyClass[]} bases @param {Map<string, any>} dict @param {string|null} [native] */
  constructor(name, bases, dict, native = null) {
    this.name = name;
    this.bases = bases;
    this.dict = dict;
    this.native = native;
    this.mro = computeMro(this);
  }
}

/** Instance of a class made in Python (also exceptions). `id` is stable and used for hashing. */
export class PyInstance {
  constructor(cls) {
    this.cls = cls;
    /** @type {Map<string, any>} */ this.dict = new Map();
    this.id = hooks.vm ? hooks.vm.nextObjectId++ : 0;
  }
}
/** Function bound to an instance (or, for class methods, to the class). */
export class PyMethod { constructor(self, fn) { this.self = self; this.fn = fn; } }
/** super(): methods of the classes after `cls` in the MRO of `obj`. */
export class PySuper { constructor(cls, obj) { this.cls = cls; this.obj = obj; } }
export class PyProperty { constructor(fget, fset = null, fdel = null) { this.fget = fget; this.fset = fset; this.fdel = fdel; } }
export class PyStaticMethod { constructor(fn) { this.fn = fn; } }
export class PyClassMethod { constructor(fn) { this.fn = fn; } }
/** Iterator over an object with __next__. */
export class PyUserIter { constructor(obj) { this.obj = obj; } }

/** Linearisation of the base classes (C3), as in Python. */
function computeMro(cls) {
  const seqs = [...cls.bases.map((b) => b.mro.slice()), cls.bases.slice()];
  const out = [cls];
  for (;;) {
    const lists = seqs.filter((x) => x.length);
    if (!lists.length) return out;
    let head = null;
    for (const l of lists) {
      if (!lists.some((m) => m.indexOf(l[0]) > 0)) { head = l[0]; break; }
    }
    if (!head) throw err('type', { what: 'mroConflict', name: cls.name });
    out.push(head);
    for (const l of lists) if (l[0] === head) l.shift();
  }
}

/** The root of every class. */
export const OBJECT = new PyClass('object', [], new Map(), 'object');

/** Attribute of a class or one of its bases (undefined if there is none). */
export function lookupClass(cls, name) {
  for (const c of cls.mro) {
    const v = c.dict.get(name);
    if (v !== undefined) return v;
  }
  return undefined;
}

export const isSubclass = (a, b) => a.mro.includes(b);

/** Call a special method of an instance; NO_METHOD if its class has none. */
export function callDunder(obj, name, args = []) {
  const f = lookupClass(obj.cls, name);
  if (f === undefined || f === null) return NO_METHOD;
  return hooks.call(f, [obj, ...args]);
}

/** Does the class define this special method itself (not just the default of object)? */
export const definesDunder = (cls, name) => cls.mro.some((c) => c !== OBJECT && c.dict.get(name) != null);

// ---------- Helpers ----------

export const err = (code, params) => new ScriptError(code, params);
/** KeyError for a missing key; the key itself travels along so that `except KeyError as e` sees it in e.args. */
export function keyError(key) {
  const e = new ScriptError('key', { key: repr(key) });
  e.arg = key;
  return e;
}

/** Check int (for results that must stay small: indices, counters) and avoid -0. */
export function checkInt(n) {
  if (typeof n === 'bigint') return normBig(n);
  if (!Number.isSafeInteger(n)) throw err('overflow', {});
  return n === 0 ? 0 : n;
}

const SAFE = BigInt(Number.MAX_SAFE_INTEGER);
/** At most this many hex digits (≈ 40 000 bits): protects against 2 ** 10 ** 9 */
const BIG_LIMIT = 10_000;

/** BigInt back to a number if it fits; reject numbers that are too large. */
export function normBig(b) {
  if (b <= SAFE && b >= -SAFE) return Number(b);
  if (b.toString(16).length > BIG_LIMIT) throw err('overflow', {});
  return b;
}

export const isInt = (v) => typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint';
export const isNum = (v) => typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint' || v instanceof PyFloat;
/** Numeric value (bool → 0/1, float → v, large int → BigInt). */
export const num = (v) => (typeof v === 'number' || typeof v === 'bigint' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : v.v);
/** Numeric value as JS number (for calculations with float). */
export const fnum = (v) => Number(num(v));
/** Equal as number (also BigInt with number). */
const numEq = (x, y) => (typeof x === 'bigint' || typeof y === 'bigint' ? x == y : x === y); // eslint-disable-line eqeqeq

/** @returns {string} Python type name */
export function typeName(v) {
  if (v === null || v === undefined) return 'NoneType';
  switch (typeof v) {
    case 'number': case 'bigint': return 'int';
    case 'boolean': return 'bool';
    case 'string': return 'str';
    default: break;
  }
  if (v instanceof PyFloat) return 'float';
  if (v instanceof PyList) return 'list';
  if (v instanceof PyTuple) return 'tuple';
  if (v instanceof PyDict) return 'dict';
  if (v instanceof PySet) return v.frozen ? 'frozenset' : 'set';
  if (v instanceof PyRange) return 'range';
  if (v instanceof PyGenerator) return 'generator';
  if (v instanceof PyFunction) return 'function';
  if (v instanceof PyBuiltin) return TYPE_NAMES.has(v.name) || v.name.startsWith('class:') ? 'type' : 'builtin_function_or_method';
  if (v instanceof PyPartial) return 'builtin_function_or_method';
  if (v instanceof PyBoundMethod) return 'method';
  if (v instanceof PyHost) return v.cls;
  if (v instanceof PyModule) return 'module';
  if (v instanceof PyView) return `dict_${v.kind}`;
  if (v instanceof PyIterator) return v.label ?? 'iterator';
  if (v instanceof PySlice) return 'slice';
  if (v instanceof Cell) return 'cell';
  if (v instanceof PyInstance) return v.cls.name;
  if (v instanceof PyClass) return 'type';
  if (v instanceof PyMethod) return 'method';
  if (v instanceof PySuper) return 'super';
  if (v instanceof PyProperty) return 'property';
  if (v instanceof PyStaticMethod) return 'staticmethod';
  if (v instanceof PyClassMethod) return 'classmethod';
  if (v instanceof PyNotImplemented) return 'NotImplementedType';
  return 'object';
}

/** Names that are both a type and a conversion function (int(…), isinstance(x, int)). */
export const TYPE_NAMES = new Set(['int', 'float', 'str', 'bool', 'list', 'tuple', 'dict', 'set', 'frozenset', 'range', 'slice', 'type']);

/** Key for dictionaries (Python: 1 == 1.0 == True are the same key). */
/**
 * Nesting depth for eq, lt, keyOf and str/repr on nested data (x = [x] in a loop). The limit is the same on
 * every device – without it the JS stack would decide where the program fails, and clients in lockstep could disagree.
 */
export const DATA_DEPTH = 500;
let dataDepth = 0;
function nested(fn) {
  if (dataDepth >= DATA_DEPTH) throw err('recursion', { what: 'nested', max: DATA_DEPTH });
  dataDepth++;
  try { return fn(); } finally { dataDepth--; }
}

const identities = new WeakMap();
let nextIdentity = 1;
/** Stable number for an object (functions and classes as dictionary keys). */
function identityOf(v) {
  let id = identities.get(v);
  if (id === undefined) { id = nextIdentity++; identities.set(v, id); }
  return id;
}

export function keyOf(v) {
  if (v === null) return 'N';
  switch (typeof v) {
    case 'boolean': return v ? 'i1' : 'i0';
    case 'number': case 'bigint': return `i${v}`;
    case 'string': return `s${v.length}:${v}`;
    default: break;
  }
  if (v instanceof PyFloat) return Number.isInteger(v.v) ? `i${Number.isSafeInteger(v.v) ? v.v : BigInt(v.v)}` : `f${v.v}`;
  if (v instanceof PyTuple) return nested(() => `t(${v.items.map(keyOf).join(',')})`);
  if (v instanceof PySet && v.frozen) return nested(() => `F(${v.items().map(keyOf).sort().join(',')})`);
  if (v instanceof PyHost) return `h${v.cls}:${v.id}`;
  if (v instanceof PyBuiltin) return `b${v.name}`;
  if (v instanceof PyInstance) {
    const h = lookupClass(v.cls, '__hash__');
    if (h === null) throw err('unhashable', { type: typeName(v) });
    if (h !== undefined) {
      const r = hooks.call(h, [v]);
      if (!isInt(r)) throw err('type', { what: 'hashReturn', type: typeName(r) });
      return `x${num(r)}`;
    }
    return `o${v.id}`;
  }
  if (v instanceof PyClass || v instanceof PyFunction) return `c${identityOf(v)}`;
  if (v instanceof PyMethod) return `m${keyOf(v.self)}:${identityOf(v.fn)}`;
  throw err('unhashable', { type: typeName(v) });
}

// ---------- Truth value, equality, ordering ----------

export function truthy(v) {
  if (v === null || v === undefined) return false;
  switch (typeof v) {
    case 'boolean': return v;
    case 'number': return v !== 0;
    case 'bigint': return true;
    case 'string': return v.length > 0;
    default: break;
  }
  if (v instanceof PyFloat) return v.v !== 0;
  if (v instanceof PyList || v instanceof PyTuple) return v.items.length > 0;
  if (v instanceof PyDict || v instanceof PySet) return v.size > 0;
  if (v instanceof PyRange) return rangeLen(v) > 0;
  if (v instanceof PyView) return v.dict.size > 0;
  if (v instanceof PyInstance) {
    const b = callDunder(v, '__bool__');
    if (b !== NO_METHOD) {
      if (typeof b !== 'boolean') throw err('type', { what: 'boolReturn', type: typeName(b) });
      return b;
    }
    const n = callDunder(v, '__len__');
    if (n !== NO_METHOD) return num(n) !== 0;
  }
  return true;
}

function instEq(a, b) {
  if (a instanceof PyInstance) {
    const r = callDunder(a, '__eq__', [b]);
    if (r !== NO_METHOD && r !== NOT_IMPLEMENTED) return truthy(r);
  }
  if (b instanceof PyInstance) {
    const r = callDunder(b, '__eq__', [a]);
    if (r !== NO_METHOD && r !== NOT_IMPLEMENTED) return truthy(r);
  }
  return a === b;
}

export function eq(a, b) {
  if (a === b) return !(a instanceof PyFloat && Number.isNaN(a.v));
  if (a instanceof PyInstance || b instanceof PyInstance) return instEq(a, b);
  if (isNum(a) && isNum(b)) return numEq(num(a), num(b));
  if (typeof a === 'string' || typeof b === 'string') return false;
  if (a instanceof PyList && b instanceof PyList) return nested(() => seqEq(a.items, b.items));
  if (a instanceof PyTuple && b instanceof PyTuple) return nested(() => seqEq(a.items, b.items));
  if (a instanceof PyDict && b instanceof PyDict) {
    if (a.size !== b.size) return false;
    return nested(() => {
      for (const [k, [, v]] of a.map) { const o = b.map.get(k); if (!o || !eq(v, o[1])) return false; }
      return true;
    });
  }
  if (a instanceof PySet && b instanceof PySet) return a.size === b.size && a.items().every((x) => b.has(x));
  if (a instanceof PyRange && b instanceof PyRange) return seqEq(rangeItems(a), rangeItems(b));
  if (a instanceof PyHost && b instanceof PyHost) return a.cls === b.cls && a.id === b.id;
  if (a instanceof PyBuiltin && b instanceof PyBuiltin) return a.name === b.name;
  if (a instanceof PyBoundMethod && b instanceof PyBoundMethod) return a.name === b.name && eq(a.self, b.self);
  return false;
}

function seqEq(x, y) {
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (!eq(x[i], y[i])) return false;
  return true;
}

/** a < b by Python rules. */
const CMP_DUNDER = { '<': ['__lt__', '__gt__'], '>': ['__gt__', '__lt__'], '<=': ['__le__', '__ge__'], '>=': ['__ge__', '__le__'] };

/** a < b, a > b, a <= b or a >= b with special methods (the reflected one of b is tried second). */
function richCompare(op, a, b) {
  const [m, r] = CMP_DUNDER[op];
  if (a instanceof PyInstance) {
    const x = callDunder(a, m, [b]);
    if (x !== NO_METHOD && x !== NOT_IMPLEMENTED) return truthy(x);
  }
  if (b instanceof PyInstance) {
    const x = callDunder(b, r, [a]);
    if (x !== NO_METHOD && x !== NOT_IMPLEMENTED) return truthy(x);
  }
  throw err('compare', { op, a: typeName(a), b: typeName(b) });
}

export function lt(a, b, op = '<') {
  if (isNum(a) && isNum(b)) return num(a) < num(b);
  if (a instanceof PyInstance || b instanceof PyInstance) return richCompare('<', a, b);
  if (a instanceof PySet && b instanceof PySet) return a.size < b.size && a.items().every((x) => b.has(x));
  if (typeof a === 'string' && typeof b === 'string') return a < b;
  if ((a instanceof PyList && b instanceof PyList) || (a instanceof PyTuple && b instanceof PyTuple)) {
    const x = a.items, y = b.items;
    return nested(() => {
      for (let i = 0; i < Math.min(x.length, y.length); i++) {
        if (!eq(x[i], y[i])) return lt(x[i], y[i], op);
      }
      return x.length < y.length;
    });
  }
  throw err('compare', { op, a: typeName(a), b: typeName(b) });
}

export function compare(op, a, b) {
  switch (op) {
    case '==': return eq(a, b);
    case '!=': return !eq(a, b);
    case '<': return lt(a, b, '<');
    case '>': return a instanceof PyInstance || b instanceof PyInstance ? richCompare('>', a, b) : lt(b, a, '>');
    case '<=': return a instanceof PyInstance || b instanceof PyInstance ? richCompare('<=', a, b) : isNum(a) && isNum(b) ? num(a) <= num(b) : (lt(a, b, '<=') || eq(a, b));
    case '>=': return a instanceof PyInstance || b instanceof PyInstance ? richCompare('>=', a, b) : isNum(a) && isNum(b) ? num(a) >= num(b) : (lt(b, a, '>=') || eq(a, b));
    case 'in': return contains(b, a);
    case 'not in': return !contains(b, a);
    case 'is': return a === b || (a === null && b === undefined);
    case 'is not': return !(a === b);
    default: throw err('syntax', { op });
  }
}

export function contains(c, x) {
  if (typeof c === 'string') {
    if (typeof x !== 'string') throw err('type', { what: 'inStr', type: typeName(x) });
    return c.includes(x);
  }
  if (c instanceof PyList || c instanceof PyTuple) return c.items.some((v) => eq(v, x));
  if (c instanceof PyDict) return c.has(x);
  if (c instanceof PySet) return c.has(x);
  if (c instanceof PyView) {
    if (c.kind === 'keys') return c.dict.has(x);
    return iterItems(c).some((v) => eq(v, x));
  }
  if (c instanceof PyRange) {
    if (!isNum(x) || typeof num(x) === 'bigint' || !Number.isInteger(num(x))) return false;
    const v = num(x), { start, stop, step } = c;
    if (step > 0 ? v < start || v >= stop : v > start || v <= stop) return false;
    return (v - start) % step === 0;
  }
  if (c instanceof PyGenerator || c instanceof PyIterator || c instanceof PyUserIter) {
    // looks through the values until it finds the element (the iterator is used up as far as that)
    for (let v = iterNext(c); v !== DONE; v = iterNext(c)) if (eq(v, x)) return true;
    return false;
  }
  if (c instanceof PyInstance) {
    const r = callDunder(c, '__contains__', [x]);
    if (r !== NO_METHOD) return truthy(r);
    return iterItems(c).some((v) => eq(v, x));
  }
  throw err('notIterable', { type: typeName(c) });
}

// ---------- Ranges and sequences ----------

export function rangeLen(r) {
  if (r.step > 0) return r.stop > r.start ? Math.floor((r.stop - r.start - 1) / r.step) + 1 : 0;
  return r.stop < r.start ? Math.floor((r.start - r.stop - 1) / -r.step) + 1 : 0;
}
/** Most elements a list may get, longest text (memory of a shared level stays bounded). */
export const MAX_ITEMS = 1_000_000;
export const MAX_STR = 10_000_000;

/** Append all items with a loop: spreading a huge array depends on the engine's argument limit. */
export function pushAll(target, items) {
  if (target.length + items.length > MAX_ITEMS) throw err('overflow', {});
  for (let i = 0; i < items.length; i++) target.push(items[i]);
}

export function rangeItems(r) {
  const n = rangeLen(r);
  if (n > MAX_ITEMS) throw err('overflow', {});
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = r.start + i * r.step;
  return out;
}

/** All elements of an iterable value as an array (for list(), sorted(), unpacking …). */
export function iterItems(v) {
  if (v instanceof PyList || v instanceof PyTuple) return v.items.slice();
  if (typeof v === 'string') return [...v];
  if (v instanceof PyRange) return rangeItems(v);
  if (v instanceof PyDict) return v.keys();
  if (v instanceof PySet) return v.items();
  if (v instanceof PyView) {
    if (v.kind === 'keys') return v.dict.keys();
    if (v.kind === 'values') return v.dict.values();
    return v.dict.entries().map(([k, x]) => new PyTuple([k, x]));
  }
  if (v instanceof PyIterator || v instanceof PyUserIter || v instanceof PyGenerator || v instanceof PyInstance) {
    const it = makeIter(v);
    const out = [];
    for (let x = iterNext(it); x !== DONE; x = iterNext(it)) { if (out.length >= MAX_ITEMS) throw err('overflow', {}); out.push(x); }
    return out;
  }
  throw err('notIterable', { type: typeName(v) });
}

export const DONE = Symbol('done');

/** Iterator for a value (for loops). */
export function makeIter(v) {
  if (v instanceof PyIterator || v instanceof PyUserIter || v instanceof PyGenerator) return v;
  if (v instanceof PyInstance) {
    const r = callDunder(v, '__iter__');
    if (r === NO_METHOD) {
      if (lookupClass(v.cls, '__getitem__') !== undefined) return new PyUserIter({ seq: v, i: 0 });
      throw err('notIterable', { type: typeName(v) });
    }
    if (r instanceof PyInstance) {
      if (lookupClass(r.cls, '__next__') === undefined) throw err('type', { what: 'iterReturn', type: typeName(r) });
      return new PyUserIter(r);
    }
    return makeIter(r);
  }
  if (v instanceof PyList || v instanceof PyTuple || typeof v === 'string' || v instanceof PyRange) return new PyIterator(v, 0);
  if (v instanceof PyDict || v instanceof PyView || v instanceof PySet) return new PyIterator(new PyList(iterItems(v)), 0);
  throw err('notIterable', { type: typeName(v) });
}

/** Next element or DONE. */
export function iterNext(it) {
  if (it instanceof PyGenerator) return hooks.vm.genResume(it, null);
  if (it instanceof PyUserIter) {
    const o = it.obj;
    if (o instanceof PyInstance) {
      try { return callDunder(o, '__next__'); } catch (e) { if (e instanceof ScriptError && e.kind === 'StopIteration') return DONE; throw e; }
    }
    // sequence protocol: __getitem__(0), __getitem__(1) … until IndexError
    try { const v = callDunder(o.seq, '__getitem__', [o.i]); o.i++; return v; } catch (e) { if (e instanceof ScriptError && e.kind === 'IndexError') return DONE; throw e; }
  }
  const s = it.seq;
  if (s instanceof PyRange) {
    if (it.i >= rangeLen(s)) return DONE;
    return s.start + it.i++ * s.step;
  }
  if (typeof s === 'string') return it.i < s.length ? s[it.i++] : DONE;
  if (s instanceof PyIterator) return iterNext(s);
  return it.i < s.items.length ? s.items[it.i++] : DONE;
}

/** Length (len()). */
export function length(v) {
  if (typeof v === 'string') return v.length;
  if (v instanceof PyList || v instanceof PyTuple) return v.items.length;
  if (v instanceof PyDict || v instanceof PySet) return v.size;
  if (v instanceof PyRange) return rangeLen(v);
  if (v instanceof PyView) return v.dict.size;
  if (v instanceof PyInstance) {
    const n = callDunder(v, '__len__');
    if (n !== NO_METHOD) {
      if (!isInt(n)) throw err('type', { what: 'lenReturn', type: typeName(n) });
      if (num(n) < 0) throw err('value', { what: 'lenNegative' });
      return num(n);
    }
  }
  throw err('type', { what: 'noLen', type: typeName(v) });
}

/** Check index as int (bool counts as int, as in Python). */
export function toIndex(v, container) {
  if (typeof v === 'bigint') throw err('index', { what: 'big' });
  if (isInt(v)) return num(v);
  throw err('notIndex', { type: typeName(v), ...(container ? { container } : {}) });
}

/** Python algorithm slice.indices(len). */
export function sliceIndices(sl, len) {
  const step = sl.step === null ? 1 : toIndex(sl.step);
  if (step === 0) throw err('value', { what: 'sliceStep' });
  let start, stop;
  const lower = step < 0 ? -1 : 0, upper = step < 0 ? len - 1 : len;
  if (sl.start === null) start = step < 0 ? upper : lower;
  else { start = toIndex(sl.start); if (start < 0) { start += len; if (start < lower) start = lower; } else if (start > upper) start = upper; }
  if (sl.stop === null) stop = step < 0 ? lower : upper;
  else { stop = toIndex(sl.stop); if (stop < 0) { stop += len; if (stop < lower) stop = lower; } else if (stop > upper) stop = upper; }
  return [start, stop, step];
}

function sliceSeq(items, sl) {
  const [start, stop, step] = sliceIndices(sl, items.length);
  const out = [];
  if (step > 0) for (let i = start; i < stop; i += step) out.push(items[i]);
  else for (let i = start; i > stop; i += step) out.push(items[i]);
  return out;
}

function normIndex(i, len, what) {
  const k = i < 0 ? i + len : i;
  // Index and length in the message: "the list has 3 elements (index 0 to 2)"
  if (k < 0 || k >= len) throw err('index', { what: `${what}${len ? 'Range' : 'Empty'}`, index: i, len, last: len - 1 });
  return k;
}

export function getItem(obj, idx) {
  if (obj instanceof PyList || obj instanceof PyTuple) {
    if (idx instanceof PySlice) { const it = sliceSeq(obj.items, idx); return obj instanceof PyList ? new PyList(it) : new PyTuple(it); }
    return obj.items[normIndex(toIndex(idx, typeName(obj)), obj.items.length, typeName(obj))];
  }
  if (typeof obj === 'string') {
    if (idx instanceof PySlice) return sliceSeq([...obj], idx).join('');
    return obj[normIndex(toIndex(idx, 'str'), obj.length, 'str')];
  }
  if (obj instanceof PyDict) {
    const v = obj.get(idx);
    if (v === undefined) throw keyError(idx);
    return v;
  }
  if (obj instanceof PyRange) {
    if (idx instanceof PySlice) {
      const [a, , s] = sliceIndices(idx, rangeLen(obj));
      const items = sliceSeq(rangeItems(obj), idx);
      return new PyRange(obj.start + a * obj.step, obj.start + a * obj.step + items.length * s * obj.step, s * obj.step);
    }
    return obj.start + normIndex(toIndex(idx), rangeLen(obj), 'range') * obj.step;
  }
  if (obj instanceof PyInstance) {
    const r = callDunder(obj, '__getitem__', [idx]);
    if (r !== NO_METHOD) return r;
  }
  if (obj instanceof PyBuiltin || obj instanceof PyFunction) throw err('notSubscriptable', { what: 'function', type: typeName(obj), name: obj.name.replace(/^.*[.:]/, '') });
  throw err('notSubscriptable', { type: typeName(obj) });
}

export function setItem(obj, idx, v) {
  if (obj instanceof PyList) {
    if (idx instanceof PySlice) {
      const [start, stop, step] = sliceIndices(idx, obj.items.length);
      const vals = iterItems(v);
      if (step === 1) { obj.items.splice(start, Math.max(0, stop - start), ...vals); return; }
      const targets = [];
      if (step > 0) for (let i = start; i < stop; i += step) targets.push(i);
      else for (let i = start; i > stop; i += step) targets.push(i);
      if (targets.length !== vals.length) throw err('value', { what: 'sliceAssign', n: vals.length, m: targets.length });
      targets.forEach((t, k) => { obj.items[t] = vals[k]; });
      return;
    }
    obj.items[normIndex(toIndex(idx), obj.items.length, 'list')] = v;
    return;
  }
  if (obj instanceof PyDict) { keyOf(idx); obj.set(idx, v); return; }
  if (obj instanceof PyInstance && callDunder(obj, '__setitem__', [idx, v]) !== NO_METHOD) return;
  throw err('type', { what: 'noItemAssign', type: typeName(obj) });
}

export function delItem(obj, idx) {
  if (obj instanceof PyList) {
    if (idx instanceof PySlice) {
      const [start, stop, step] = sliceIndices(idx, obj.items.length);
      const drop = new Set();
      if (step > 0) for (let i = start; i < stop; i += step) drop.add(i);
      else for (let i = start; i > stop; i += step) drop.add(i);
      obj.items = obj.items.filter((_, i) => !drop.has(i));
      return;
    }
    obj.items.splice(normIndex(toIndex(idx), obj.items.length, 'list'), 1);
    return;
  }
  if (obj instanceof PyDict) {
    if (!obj.delete(idx)) throw keyError(idx);
    return;
  }
  if (obj instanceof PyInstance && callDunder(obj, '__delitem__', [idx]) !== NO_METHOD) return;
  throw err('type', { what: 'noItemDelete', type: typeName(obj) });
}

// ---------- Arithmetic ----------

/** a | b, a & b, a - b, a ^ b for sets (a new set; frozen if the left operand is). */
export function setOp(op, a, b, frozen = a.frozen) {
  const r = new PySet(frozen);
  const ai = a.items();
  switch (op) {
    case '|': for (const x of ai) r.add(x); for (const x of b.items()) r.add(x); break;
    case '&': for (const x of ai) if (b.has(x)) r.add(x); break;
    case '-': for (const x of ai) if (!b.has(x)) r.add(x); break;
    default: for (const x of ai) if (!b.has(x)) r.add(x); for (const x of b.items()) if (!a.has(x)) r.add(x); break;
  }
  return r;
}

/** a |= b and friends: change a set in place (a frozenset gets a new value, as in Python). */
export function setInplace(op, a, b) {
  if (a.frozen) return setOp(op, a, b);
  const r = setOp(op, a, b, false);
  a.d = r.d;
  return a;
}

const BIN_DUNDER = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'truediv', '//': 'floordiv', '%': 'mod', '**': 'pow', '&': 'and', '|': 'or', '^': 'xor', '<<': 'lshift', '>>': 'rshift' };

/** a + b with __add__ and the reflected __radd__ of b; NO_METHOD if neither exists or both decline. */
export function binaryDunder(op, a, b, prefix = '') {
  const n = BIN_DUNDER[op];
  if (a instanceof PyInstance) {
    const r = callDunder(a, `__${prefix}${n}__`, [b]);
    if (r !== NO_METHOD && r !== NOT_IMPLEMENTED) return r;
  }
  if (b instanceof PyInstance && !prefix) {
    const r = callDunder(b, `__r${n}__`, [a]);
    if (r !== NO_METHOD && r !== NOT_IMPLEMENTED) return r;
  }
  return NO_METHOD;
}

const opErr = (op, a, b) => err('operand', { op, a: typeName(a), b: typeName(b), ...(a === null || b === null || a === undefined || b === undefined ? { what: 'none' } : {}) });

/** Integer power by squaring (exact, with overflow check). */
function ipow(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    let r = 1, base = a, e = b;
    while (e > 0) {
      if (e % 2 === 1) { r *= base; if (!Number.isSafeInteger(r)) return bigPow(BigInt(a), BigInt(b)); }
      e = Math.floor(e / 2);
      if (e > 0) { base *= base; if (!Number.isSafeInteger(base)) return bigPow(BigInt(a), BigInt(b)); }
    }
    return r === 0 ? 0 : r;
  }
  return bigPow(BigInt(a), BigInt(b));
}

function bigPow(a, b) {
  // Estimate the result size in advance: bits(a) * b
  const bits = a === 0n || a === 1n || a === -1n ? 0 : a.toString(2).length * Number(b);
  if (bits > BIG_LIMIT * 4) throw err('overflow', {});
  return normBig(a ** b); // rules-ok: BigInt
}

/** Calculation with large integers. */
function bigOp(op, x, y) {
  switch (op) {
    case '+': return normBig(x + y);
    case '-': return normBig(x - y);
    case '*': return normBig(x * y);
    case '/': if (y === 0n) throw err('zeroDivision', { op: 'div' }); return new PyFloat(Number(x) / Number(y));
    case '//': {
      if (y === 0n) throw err('zeroDivision', { op: 'floordiv' });
      let q = x / y;
      if ((x % y !== 0n) && ((x < 0n) !== (y < 0n))) q -= 1n;
      return normBig(q);
    }
    case '%': {
      if (y === 0n) throw err('zeroDivision', { op: 'mod' });
      let r = x % y;
      if (r !== 0n && (r < 0n) !== (y < 0n)) r += y;
      return normBig(r);
    }
    case '**':
      if (y < 0n) { if (x === 0n) throw err('zeroDivision', { op: 'pow' }); return new PyFloat(1 / Number(bigPow(x, -y))); }
      return bigPow(x, y);
    default: return null;
  }
}

/** Exact powers of ten up to 1e22 (representable without rounding). */
const POW10 = [1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15, 1e16, 1e17, 1e18, 1e19, 1e20, 1e21, 1e22];

/** 10 ** n for an integer n ≥ 0, correctly rounded on every engine (BigInt beyond the table). */
export const pow10 = (n) => (n < POW10.length ? POW10[n] : Number(10n ** BigInt(n))); // rules-ok: BigInt

/** Float to an integer exponent (squaring – deterministic, unlike Math.pow). */
function fpow(a, b) {
  let r = 1, base = a, e = Math.abs(b);
  while (e > 0) {
    if (e % 2 === 1) r *= base;
    e = Math.floor(e / 2);
    if (e > 0) base *= base;
  }
  return b < 0 ? 1 / r : r;
}

/** Python remainder for integers (sign of the divisor). */
function imod(a, b) {
  const r = a % b;
  return r !== 0 && (r < 0) !== (b < 0) ? r + b : r;
}

/** float_divmod from CPython (Objects/floatobject.c), bit for bit identical. */
function fdivmod(vx, wx) {
  if (wx === 0) throw err('zeroDivision', { op: vx === vx ? 'mod' : 'mod' });
  let mod = vx % wx;
  let div = (vx - mod) / wx;
  if (mod) {
    if ((wx < 0) !== (mod < 0)) { mod += wx; div -= 1; }
  } else mod = wx < 0 ? -0 : 0;
  let floordiv;
  if (div) {
    floordiv = Math.floor(div);
    if (div - floordiv > 0.5) floordiv += 1;
  } else floordiv = (vx / wx < 0 || Object.is(vx / wx, -0)) ? -0 : 0;
  return [floordiv, mod];
}

function bigBits(op, a, b) {
  const x = BigInt(num(a)), y = BigInt(num(b));
  let r;
  switch (op) {
    case '&': r = x & y; break;
    case '|': r = x | y; break;
    case '^': r = x ^ y; break;
    case '<<': if (y < 0n) throw err('value', { what: 'negativeShift' }); if (y > 64n) throw err('overflow', {}); r = x << y; break;
    case '>>': if (y < 0n) throw err('value', { what: 'negativeShift' }); r = x >> (y > 64n ? 64n : y); break;
    default: throw opErr(op, a, b);
  }
  return normBig(r);
}

/**
 * Binary operator by Python rules.
 * @param {string} op '+', '-', '*', '/', '//', '%', '**', '&', '|', '^', '<<', '>>'
 */
export function binary(op, a, b) {
  if (isNum(a) && isNum(b)) {
    if (a instanceof PyFloat || b instanceof PyFloat) return floatOp(op, fnum(a), fnum(b), a, b);
    const x = num(a), y = num(b);
    if (typeof x === 'bigint' || typeof y === 'bigint') {
      const r = bigOp(op, BigInt(x), BigInt(y));
      if (r !== null) return r;
      return bigBits(op, a, b);
    }
    switch (op) {
      case '+': { const r = x + y; return Number.isSafeInteger(r) ? r : bigOp(op, BigInt(x), BigInt(y)); }
      case '-': { const r = x - y; return Number.isSafeInteger(r) ? r : bigOp(op, BigInt(x), BigInt(y)); }
      case '*': { const r = x * y; return Number.isSafeInteger(r) ? (r === 0 ? 0 : r) : bigOp(op, BigInt(x), BigInt(y)); }
      case '/': if (y === 0) throw err('zeroDivision', { op: 'div' }); return new PyFloat(x / y);
      case '//': { if (y === 0) throw err('zeroDivision', { op: 'floordiv' }); const r = imod(x, y); return checkInt((x - r) / y); }
      case '%': if (y === 0) throw err('zeroDivision', { op: 'mod' }); return checkInt(imod(x, y));
      case '**':
        if (y < 0) { if (x === 0) throw err('zeroDivision', { op: 'pow' }); return new PyFloat(F.pow(x, y)); }
        return ipow(x, y);
      default: return bigBits(op, a, b);
    }
  }
  if (a instanceof PyInstance || b instanceof PyInstance) {
    const r = binaryDunder(op, a, b);
    if (r !== NO_METHOD) return r;
  }
  if (a instanceof PySet && b instanceof PySet && '|&-^'.includes(op) && op.length === 1) return setOp(op, a, b, a.frozen);
  switch (op) {
    case '+':
      if (typeof a === 'string' && typeof b === 'string') { if (a.length + b.length > MAX_STR) throw err('overflow', {}); return a + b; }
      if ((a instanceof PyList && b instanceof PyList) || (a instanceof PyTuple && b instanceof PyTuple)) {
        if (a.items.length + b.items.length > MAX_ITEMS) throw err('overflow', {});
        return a instanceof PyList ? new PyList(a.items.concat(b.items)) : new PyTuple(a.items.concat(b.items));
      }
      break;
    case '*': {
      const [s, n0] = isInt(b) ? [a, num(b)] : isInt(a) ? [b, num(a)] : [null, 0];
      if (typeof n0 === 'bigint' && s !== null && (typeof s === 'string' || s instanceof PyList || s instanceof PyTuple)) throw err('overflow', {});
      const n = Number(n0);
      if (typeof s === 'string') { if (s.length * Math.max(0, n) > MAX_STR) throw err('overflow', {}); return n > 0 ? s.repeat(n) : ''; }
      if (s instanceof PyList || s instanceof PyTuple) {
        if (s.items.length * Math.max(0, n) > MAX_ITEMS) throw err('overflow', {});
        const out = [];
        for (let i = 0; i < n; i++) pushAll(out, s.items);
        return s instanceof PyList ? new PyList(out) : new PyTuple(out);
      }
      break;
    }
    case '%':
      if (typeof a === 'string') return percentFormat(a, b);
      break;
    default: break;
  }
  throw opErr(op, a, b);
}

function floatOp(op, x, y, a, b) {
  switch (op) {
    case '+': return new PyFloat(x + y);
    case '-': return new PyFloat(x - y);
    case '*': return new PyFloat(x * y);
    case '/': if (y === 0) throw err('zeroDivision', { op: 'div', float: true }); return new PyFloat(x / y);
    case '//': if (y === 0) throw err('zeroDivision', { op: 'floordiv', float: true }); return new PyFloat(fdivmod(x, y)[0]);
    case '%': if (y === 0) throw err('zeroDivision', { op: 'mod', float: true }); return new PyFloat(fdivmod(x, y)[1]);
    case '**': {
      if (x === 0 && y < 0) throw err('zeroDivision', { op: 'pow' });
      // A negative base with a fractional exponent would be a complex number in Python
      if (x < 0 && Number.isFinite(y) && !Number.isInteger(y)) throw err('powFraction', {});
      const r = F.pow(x, y);
      if (!Number.isFinite(r) && Number.isFinite(x) && Number.isFinite(y)) throw err('overflow', { what: 'float' });
      return new PyFloat(r);
    }
    default: throw opErr(op, a, b);
  }
}

export function unary(op, v) {
  if (op === 'not') return !truthy(v);
  if (v instanceof PyInstance) {
    const r = callDunder(v, { '-': '__neg__', '+': '__pos__', '~': '__invert__' }[op]);
    if (r !== NO_METHOD) return r;
  }
  if (op === '-') {
    if (v instanceof PyFloat) return new PyFloat(-v.v);
    if (typeof v === 'bigint') return normBig(-v);
    if (isInt(v)) return checkInt(-num(v));
  } else if (op === '+') {
    if (v instanceof PyFloat) return v;
    if (isInt(v)) return num(v);
  } else if (op === '~') {
    if (typeof v === 'bigint') return normBig(-v - 1n);
    if (isInt(v)) return checkInt(-num(v) - 1);
  }
  throw err('unaryOperand', { op, type: typeName(v) });
}

// ---------- Representation ----------

/** repr() of a text with Python quotation marks. */
export function reprStr(s) {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = q;
  for (const c of s) {
    const code = c.codePointAt(0);
    if (c === q || c === '\\') out += '\\' + c;
    else if (c === '\n') out += '\\n';
    else if (c === '\t') out += '\\t';
    else if (c === '\r') out += '\\r';
    else if (code < 32 || code === 127) out += '\\x' + code.toString(16).padStart(2, '0');
    else out += c;
  }
  return out + q;
}

/** repr() of a float like CPython (shortest unambiguous digit sequence). */
export function formatFloat(x) {
  if (Number.isNaN(x)) return 'nan';
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const m = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(x.toExponential());
  const sign = m[1], digits = m[2] + (m[3] ?? ''), exp = Number(m[4]);
  if (exp < -4 || exp >= 16) {
    const mant = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    const e = Math.abs(exp) < 10 ? `0${Math.abs(exp)}` : `${Math.abs(exp)}`;
    return `${sign}${mant}e${exp < 0 ? '-' : '+'}${e}`;
  }
  if (exp < 0) return `${sign}0.${'0'.repeat(-exp - 1)}${digits}`;
  const intPart = digits.slice(0, exp + 1).padEnd(exp + 1, '0');
  const frac = digits.slice(exp + 1);
  return `${sign}${intPart}.${frac || '0'}`;
}

/**
 * Float to f decimal places, exact (BigInt) and rounded half-to-even like Python
 * (format(2.5, '.0f') == '2', format(0.125, '.2f') == '0.12').
 */
export function toFixedExact(x, f) {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? 'nan' : x > 0 ? 'inf' : '-inf';
  const neg = x < 0 || Object.is(x, -0);
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, Math.abs(x));
  const hi = dv.getUint32(0), lo = dv.getUint32(4);
  const expBits = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e;
  if (expBits === 0) e = -1074; else { mant |= 1n << 52n; e = expBits - 1075; }
  let n = mant * 10n ** BigInt(f), d = 1n; // rules-ok: BigInt
  if (e >= 0) n <<= BigInt(e); else d <<= BigInt(-e);
  let q = n / d;
  const r2 = (n % d) * 2n;
  if (r2 > d || (r2 === d && (q & 1n) === 1n)) q += 1n;
  let s = q.toString();
  if (f > 0) { s = s.padStart(f + 1, '0'); s = `${s.slice(0, -f)}.${s.slice(-f)}`; }
  return (neg ? '-' : '') + s;
}

/** x rounded to a multiple of 10^k (k > 0), exact as in CPython: half to even, then the nearest float. */
function roundToTens(x, k) {
  const neg = x < 0 || Object.is(x, -0);
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, Math.abs(x));
  const hi = dv.getUint32(0), lo = dv.getUint32(4);
  const expBits = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e;
  if (expBits === 0) e = -1074; else { mant |= 1n << 52n; e = expBits - 1075; }
  const p = 10n ** BigInt(k); // rules-ok: BigInt
  let n = mant, d = p;
  if (e >= 0) n <<= BigInt(e); else d <<= BigInt(-e);
  let q = n / d;
  const r2 = (n % d) * 2n;
  if (r2 > d || (r2 === d && (q & 1n) === 1n)) q += 1n;
  const v = Number(q * p);
  return neg ? -v : v;
}

/** round() like Python (even number at exactly .5, relative to the exact binary number). */
export function roundFloat(x, nd) {
  if (!Number.isFinite(x)) {
    if (nd === null) throw err(Number.isNaN(x) ? 'value' : 'overflow', { what: 'roundNan' });
    return x;
  }
  if (nd === null) return normBig(BigInt(toFixedExact(x, 0)));
  if (nd >= 0) return Number(toFixedExact(x, Math.min(nd, 330)));
  return roundToTens(x, -nd);
}

/**
 * str() or repr() of a value.
 * @param {any} v @param {boolean} [asRepr] @param {(v: PyHost) => string} [hostRepr]
 */
export function toStr(v, asRepr = false, hostRepr = null, seen = new Set()) {
  if (v === null || v === undefined) return 'None';
  switch (typeof v) {
    case 'boolean': return v ? 'True' : 'False';
    case 'number': case 'bigint': return String(v);
    case 'string': return asRepr ? reprStr(v) : v;
    default: break;
  }
  if (v instanceof PyFloat) return formatFloat(v.v);
  if (v instanceof PyInstance) return instStr(v, asRepr);
  if (v instanceof PyClass) return v.native ? `<class '${v.name}'>` : `<class '__main__.${v.name}'>`;
  if (v instanceof PyMethod) return `<bound method ${v.fn.name} of ${toStr(v.self, true, hostRepr, seen)}>`;
  if (v instanceof PyNotImplemented) return 'NotImplemented';
  if (v instanceof PyGenerator) return `<generator object ${v.fn.name}>`;
  if (v instanceof PySuper) return `<super: <class '${v.cls.name}'>, <${typeName(v.obj)} object>>`;
  if (v instanceof PyProperty) return '<property object>';
  if (v instanceof PyStaticMethod) return '<staticmethod object>';
  if (v instanceof PyClassMethod) return '<classmethod object>';
  const rec = (x) => toStr(x, true, hostRepr, seen);
  if (v instanceof PyList || v instanceof PyTuple || v instanceof PyDict) {
    if (seen.has(v)) return v instanceof PyList ? '[...]' : v instanceof PyDict ? '{...}' : '(...)';
    seen.add(v);
    try {
      return nested(() => {
        if (v instanceof PyList) return `[${v.items.map(rec).join(', ')}]`;
        if (v instanceof PyTuple) return v.items.length === 1 ? `(${rec(v.items[0])},)` : `(${v.items.map(rec).join(', ')})`;
        return `{${v.entries().map(([k, x]) => `${rec(k)}: ${rec(x)}`).join(', ')}}`;
      });
    } finally {
      seen.delete(v);
    }
  }
  if (v instanceof PySet) {
    if (seen.has(v)) return v.frozen ? 'frozenset({...})' : '{...}';
    seen.add(v);
    try {
      return nested(() => {
        const inner = v.items().map((x) => toStr(x, true, hostRepr, seen)).join(', ');
        if (v.frozen) return v.size ? `frozenset({${inner}})` : 'frozenset()';
        return v.size ? `{${inner}}` : 'set()';
      });
    } finally { seen.delete(v); }
  }
  if (v instanceof PyRange) return v.step === 1 ? `range(${v.start}, ${v.stop})` : `range(${v.start}, ${v.stop}, ${v.step})`;
  if (v instanceof PyFunction) return `<function ${v.name}>`;
  if (v instanceof PyBuiltin) {
    if (TYPE_NAMES.has(v.name)) return `<class '${v.name}'>`;
    if (v.name.startsWith('class:')) return `<class '${v.name.slice(6)}'>`;
    return `<built-in function ${v.name.replace(/^.*[.:]/, '')}>`;
  }
  if (v instanceof PyPartial) return `<built-in function ${v.fn.name.replace(/^.*[.:]/, '')}>`;
  if (v instanceof PyBoundMethod) return `<bound method ${v.name} of ${rec(v.self)}>`;
  if (v instanceof PyHost) return hostRepr ? hostRepr(v) : `<${v.cls} ${v.id}>`;
  if (v instanceof PyModule) return `<module '${v.name}'>`;
  if (v instanceof PyView) return `dict_${v.kind}([${iterItems(v).map(rec).join(', ')}])`;
  if (v instanceof PyIterator) return `<${v.label ?? 'iterator'} object>`;
  if (v instanceof PySlice) return `slice(${rec(v.start)}, ${rec(v.stop)}, ${rec(v.step)})`;
  return '<object>';
}

/** Default repr of an instance, like CPython without the memory address. */
export const defaultRepr = (v) => `<__main__.${v.cls.name} object at 0x${v.id.toString(16).padStart(12, '0')}>`;

/** str() or repr() of an instance: __str__ (falling back to __repr__) or __repr__. */
function instStr(v, asRepr) {
  const names = asRepr ? ['__repr__'] : ['__str__', '__repr__'];
  for (const n of names) {
    const f = lookupClass(v.cls, n);
    if (f === undefined || f === null) continue;
    const r = hooks.call(f, [v]);
    if (typeof r !== 'string') throw err('type', { what: 'strReturn', name: n, type: typeName(r) });
    return r;
  }
  return defaultRepr(v);
}

export const repr = (v) => toStr(v, true);

// ---------- Formatting (f-strings, format(), str.format, %) ----------

const SPEC = /^(?:(.)?([<>=^]))?([+\- ])?(#)?(0)?(\d+)?([,_])?(?:\.(\d+))?([bcdeEfFgGnosxX%])?$/s;

function group(intStr, sep) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

function expFormat(x, p, upper) {
  const s = x.toExponential(p);
  const m = /^(-?[\d.]+)e([+-])(\d+)$/.exec(s);
  const out = `${m[1]}e${m[2]}${m[3].padStart(2, '0')}`;
  return upper ? out.toUpperCase() : out;
}

function generalFormat(x, p, alt, upper) {
  if (!Number.isFinite(x)) return toFixedExact(x, 0);
  if (p === 0) p = 1;
  if (x === 0) return Object.is(x, -0) ? '-0' : '0';
  const exp = Number(/e([+-]\d+)$/.exec(x.toExponential(p - 1))[1]);
  let s;
  if (exp < -4 || exp >= p) {
    s = expFormat(x, p - 1, upper);
    if (!alt) s = s.replace(/\.?0+e/, 'e').replace(/\.?0+E/, 'E');
  } else {
    s = toFixedExact(x, p - 1 - exp);
    if (!alt && s.includes('.')) s = s.replace(/\.?0+$/, '');
  }
  return s;
}

/**
 * Apply a format specification (Python Format Specification Mini-Language, without locale).
 * @param {any} v @param {string} spec e.g. '.2f', '>8', '05d', ',.1f'
 */
export function formatValue(v, spec) {
  if (v instanceof PyInstance && definesDunder(v.cls, '__format__')) return callDunder(v, '__format__', [spec]);
  if (!spec) return toStr(v);
  const m = SPEC.exec(spec);
  if (!m) throw err('value', { what: 'formatSpec', spec });
  const [, fill0, align0, sign = '-', alt, zero, width0, grouping, prec0, type0] = m;
  const width = width0 ? Number(width0) : 0;
  const prec = prec0 !== undefined ? Number(prec0) : null;
  let type = type0 ?? '';
  let fill = fill0 ?? (zero && !align0 ? '0' : ' ');
  let align = align0 ?? (zero ? '=' : null);
  let body, signStr = '';
  const numeric = isNum(v);
  if (typeof v === 'string' || (!numeric && v !== null)) {
    if (type && type !== 's') throw err('value', { what: 'formatSpec', spec });
    body = toStr(v);
    if (prec !== null) body = body.slice(0, prec);
    align = align ?? '<';
  } else if (v === null) {
    body = 'None'; align = align ?? '<';
  } else {
    let x = num(v);
    const isF = v instanceof PyFloat;
    if (typeof x === 'bigint' && !'dbxXon'.includes(type || 'd')) x = Number(x);
    if (!type) type = isF ? (prec !== null ? 'g*' : 'r') : 'd';
    if (type === 'n') type = isF ? 'g' : 'd';
    if ('dbcoxX'.includes(type) && isF) throw err('value', { what: 'formatSpec', spec });
    const big = typeof x === 'bigint';
    const neg = big ? x < 0n : x < 0 || Object.is(x, -0);
    const ax = big ? (x < 0n ? -x : x) : Math.abs(x);
    switch (type) {
      case 'd': body = String(ax); if (grouping) body = group(body, grouping); break;
      case 'b': body = ax.toString(2); if (alt) body = '0b' + body; break;
      case 'o': body = ax.toString(8); if (alt) body = '0o' + body; break;
      case 'x': body = ax.toString(16); if (alt) body = '0x' + body; break;
      case 'X': body = ax.toString(16).toUpperCase(); if (alt) body = '0X' + body; break;
      case 'c': body = String.fromCodePoint(ax); break;
      case 'f': case 'F': case '%': {
        const p = prec ?? 6;
        body = toFixedExact(type === '%' ? ax * 100 : ax, p);
        if (alt && p === 0) body += '.';
        if (grouping) { const [i, f] = body.split('.'); body = group(i, grouping) + (f !== undefined ? '.' + f : ''); }
        if (type === '%') body += '%';
        if (type === 'F') body = body.toUpperCase();
        break;
      }
      case 'e': case 'E': body = expFormat(ax, prec ?? 6, type === 'E'); break;
      case 'g': case 'G': body = generalFormat(ax, prec ?? 6, !!alt, type === 'G'); break;
      case 'g*': body = generalFormat(ax, prec, false, false); if (/^\d+$/.test(body)) body += '.0'; break;
      case 'r': body = formatFloat(ax); if (grouping) { const [i, f] = body.split('.'); body = group(i, grouping) + '.' + f; } break;
      default: throw err('value', { what: 'formatSpec', spec });
    }
    if (neg && !(x === 0 && !isF)) signStr = '-';
    else if (sign === '+') signStr = '+';
    else if (sign === ' ') signStr = ' ';
    align = align ?? '>';
  }
  const total = signStr.length + body.length;
  if (total >= width) return signStr + body;
  const pad = width - total;
  switch (align) {
    case '<': return signStr + body + fill.repeat(pad);
    case '^': return fill.repeat(Math.floor(pad / 2)) + signStr + body + fill.repeat(Math.ceil(pad / 2));
    case '=': return signStr + fill.repeat(pad) + body;
    default: return fill.repeat(pad) + signStr + body;
  }
}

/** Old %-formatting: "%d wood" % n, "%s and %s" % (a, b), "%.2f" % x. */
export function percentFormat(fmt, args) {
  const list = args instanceof PyTuple ? args.items : [args];
  let k = 0;
  const out = fmt.replace(/%([-+ 0#]*)(\d+|\*)?(?:\.(\d+))?([sdirfFeEgGxXoc%])/g, (all, flags, width, prec, type) => {
    if (type === '%') return '%';
    if (k >= list.length) throw err('type', { what: 'fewFormatArgs' });
    const v = list[k++];
    let spec = '';
    if (flags.includes('-')) spec += '<';
    else if (!flags.includes('0')) spec += '>';
    if (flags.includes('+')) spec += '+'; else if (flags.includes(' ')) spec += ' ';
    if (flags.includes('#')) spec += '#';
    if (flags.includes('0') && !flags.includes('-')) spec += '0';
    if (width) spec += width;
    if (prec !== undefined) spec += '.' + prec;
    if (type === 's') return formatValue(toStr(v), spec);
    if (type === 'r') return formatValue(repr(v), spec);
    if (!isNum(v)) throw err('type', { what: 'numberNeeded', type: typeName(v) });
    if (type === 'd' || type === 'i') return formatValue(v instanceof PyFloat ? Math.trunc(v.v) : num(v), spec + 'd');
    return formatValue(v, spec + type);
  });
  if (k < list.length && args instanceof PyTuple) throw err('type', { what: 'manyFormatArgs' });
  return out;
}
