// Built-in functions, methods of str/list/dict/tuple and the modules math and random.
// Each function gets (ctx, args, kwargs): ctx = { vm, task }, kwargs is an object without a prototype.
// Functions that call Python functions (sorted(key=…), map, min(key=…)) use vm.callSync.
// math deliberately contains only exactly computing functions (sqrt, floor, ceil …) – no sin/log, those would be
// not identical on all machines.

import { ScriptError } from './errors.js';
import { err, params, noKw, needInt, anyInt, needNum, needStr } from './args.js';
import { MATH_NATIVES, MATH_NAMES, MATH_CONSTS } from './stdlib/math.js';
import { RANDOM_NATIVES, RANDOM_NAMES } from './stdlib/random.js';
import { CLOCK_NATIVES, CLOCK_NAMES } from './stdlib/clock.js';
import { JSON_NATIVES, JSON_NAMES } from './stdlib/json.js';
import { RE_NATIVES, RE_NAMES } from './stdlib/re.js';
import { TURTLE_NATIVES, TURTLE_NAMES } from './stdlib/turtle.js';
import { KARA_NATIVES, KARA_NAMES } from './stdlib/kara.js';
import { FS_NATIVES, FS_NAMES } from './stdlib/fs.js';
import { COPY_NATIVES, COPY_NAMES } from './stdlib/copy.js';
import { EXCEPTION_CLASSES } from './exceptions.js';
import {
  PyFloat, PyList, PyTuple, PyDict, PyRange, PyBuiltin, PyIterator, PyView, PyFunction, PyPartial, PyBoundMethod,
  PyModule, PyHost, checkInt, isInt, isNum, num, typeName, truthy, eq, lt, iterItems, makeIter, iterNext, DONE, length,
  roundFloat, formatValue, binary, TYPE_NAMES, toIndex, keyOf, normBig, pow10, pushAll,
  keyError, getItem, Suspend, PyGenerator, PySlice, PyUserIter, PySet, setOf, PyClass, PyInstance, PyMethod, PySuper, PyProperty, PyStaticMethod, PyClassMethod, OBJECT, NOT_IMPLEMENTED, NO_METHOD,
  callDunder, lookupClass, defaultRepr, setOp,
} from './values.js';

const radix = (v, base, prefix) => {
  const n = BigInt(anyInt(v, prefix));
  return (n < 0n ? '-' : '') + prefix + (n < 0n ? -n : n).toString(base);
};

/** Call a Python function or built-in function. */
const call = (ctx, fn, args) => ctx.vm.callSync(fn, args, null, ctx.task);

/** Stable sort like Python (optionally with key and reverse). */
function sortItems(ctx, items, key, reverse) {
  const keys = key === null || key === undefined ? items : items.map((x) => call(ctx, key, [x]));
  const idx = items.map((_, i) => i);
  idx.sort((a, b) => {
    const x = keys[a], y = keys[b];
    if (reverse) { if (lt(y, x)) return -1; if (lt(x, y)) return 1; }
    else { if (lt(x, y)) return -1; if (lt(y, x)) return 1; }
    return a - b;
  });
  return idx.map((i) => items[i]);
}

function minMax(ctx, name, args, kw, wantMax) {
  const { key = null } = kw;
  const hasDefault = 'default' in kw;
  for (const k of Object.keys(kw)) if (k !== 'key' && k !== 'default') throw err('argUnexpected', { name, arg: k });
  if (!args.length) throw err('argMissing', { name, arg: 'iterable' });
  const items = args.length === 1 ? iterItems(args[0]) : args;
  if (!items.length) {
    if (hasDefault) return kw.default;
    throw err('value', { what: 'emptySeq', name });
  }
  let best = items[0], bk = key ? call(ctx, key, [best]) : best;
  for (let i = 1; i < items.length; i++) {
    const k = key ? call(ctx, key, [items[i]]) : items[i];
    if (wantMax ? lt(bk, k) : lt(k, bk)) { best = items[i]; bk = k; }
  }
  return best;
}

function parseIntStr(s, base) {
  const t = s.trim().replace(/_/g, '');
  const re = base === 16 ? /^[+-]?(0x)?[0-9a-f]+$/i : base === 8 ? /^[+-]?(0o)?[0-7]+$/i : base === 2 ? /^[+-]?(0b)?[01]+$/i : /^[+-]?\d+$/;
  if (!re.test(t) || /^_|_$|__/.test(s.trim())) throw err('value', { what: 'intLiteral', base, text: s });
  const neg = t.startsWith('-');
  const digits = t.replace(/^[+-]/, '').replace(/^0[xob]/i, '').replace(/^0+(?=.)/, '');
  const prefix = { 16: '0x', 8: '0o', 2: '0b', 10: '' }[base];
  if (prefix === undefined) { const v = parseInt(digits, base); return checkInt(neg ? -v : v); }
  const b = BigInt(prefix + digits);
  return normBig(neg ? -b : b);
}

function parseFloatStr(s) {
  const t = s.trim().toLowerCase().replace(/_/g, '');
  if (/^[+-]?(inf|infinity)$/.test(t)) return t.startsWith('-') ? -Infinity : Infinity;
  if (/^[+-]?nan$/.test(t)) return NaN;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/.test(t)) throw err('value', { what: 'floatLiteral', text: s });
  return Number(t);
}

/** isinstance(True, int) is true in Python. */
function isInstance(v, t) {
  if (t instanceof PyTuple) return t.items.some((x) => isInstance(v, x));
  if (t instanceof PyClass) return t === OBJECT || (v instanceof PyInstance && v.cls.mro.includes(t));
  if (!(t instanceof PyBuiltin)) throw err('type', { what: 'isinstanceType' });
  const name = t.name.startsWith('class:') ? t.name.slice(6) : t.name;
  const tn = typeName(v);
  return tn === name || (name === 'int' && tn === 'bool');
}

/** issubclass(a, b) for classes made in Python and for the built-in types. */
function isSubclassOf(a, b) {
  if (b instanceof PyTuple) return b.items.some((x) => isSubclassOf(a, x));
  if (b === OBJECT) return a instanceof PyClass || a instanceof PyBuiltin;
  if (a instanceof PyClass && b instanceof PyClass) return a.mro.includes(b);
  if (a instanceof PyBuiltin && b instanceof PyBuiltin) {
    const x = a.name.replace(/^class:/, ''), y = b.name.replace(/^class:/, '');
    return x === y || (x === 'bool' && y === 'int');
  }
  return false;
}

const isTypeLike = (x) => x instanceof PyClass || (x instanceof PyBuiltin && (TYPE_NAMES.has(x.name) || x.name.startsWith('class:')));

/** Objects of classes with a keys() method count as mappings (dict(x), d.update(x)). */
const hasKeys = (v) => v instanceof PyInstance && lookupClass(v.cls, 'keys') !== undefined;
const ctx0 = (c) => c;
function mappingItems(ctx, src) {
  const keys = iterItems(ctx.vm.callSync(ctx.vm.getattr(ctx.task, src, 'keys'), [], null, ctx.task));
  return keys.map((k) => [k, getItem(src, k)]);
}

/** Iterator over a finished list (enumerate, zip, map, reversed). */
const listIter = (items, label) => new PyIterator(new PyList(items), 0, label);

/** start/end of str methods as slice bounds (None and negative numbers like in slicing). */
function sliceBounds(n, start, end) {
  const fix = (v, dflt) => (v === undefined || v === null ? dflt : Math.max(0, Math.min(n, needInt(v, 'index') < 0 ? n + needInt(v, 'index') : needInt(v, 'index'))));
  return [fix(start, 0), fix(end, n)];
}

function strFind(name, s, a, kw, last) {
  const [sub, start, end] = params(name, a, kw, ['sub', '?start', '?end']);
  const t = needStr(sub, 'sub');
  const [lo, hi] = sliceBounds(s.length, start, end);
  if (lo > hi) return -1;
  const part = s.slice(lo, hi);
  const i = last ? part.lastIndexOf(t) : part.indexOf(t);
  return i < 0 ? -1 : i + lo;
}

const objectIds = new WeakMap();
let nextObjectId = 0x30000000;

export const BUILTINS = {
  '_sys.write_err'(ctx, args) { ctx.vm.printErr(needStr(args[0], 'write'), ctx.task); return null; },
  print(ctx, args, kw) {
    const [sep = ' ', end = '\n'] = [kw.sep ?? undefined, kw.end ?? undefined];
    for (const k of Object.keys(kw)) if (k !== 'sep' && k !== 'end' && k !== 'flush' && k !== 'file') throw err('argUnexpected', { name: 'print', arg: k });
    const s = sep === null ? ' ' : needStr(sep, 'sep'), e = end === null ? '\n' : needStr(end, 'end');
    const text = args.map((a) => ctx.vm.str(a)).join(s) + e;
    if (kw.file !== undefined && kw.file !== null) ctx.vm.callSync(ctx.vm.getattr(ctx.task, kw.file, 'write'), [text], null, ctx.task);
    else ctx.vm.print(text, ctx.task);
    return null;
  },
  len(ctx, args, kw) { const [x] = params('len', args, kw, ['obj']); return length(x); },
  range(ctx, args, kw) {
    noKw('range', kw);
    if (!args.length || args.length > 3) throw err('argCount', { name: 'range', max: 3, given: args.length });
    const ints = args.map((a) => needInt(a, 'range'));
    const [start, stop, step] = ints.length === 1 ? [0, ints[0], 1] : [ints[0], ints[1], ints[2] ?? 1];
    if (step === 0) throw err('value', { what: 'rangeStep' });
    return new PyRange(start, stop, step);
  },
  int(ctx, args, kw) {
    const [x = 0, base] = params('int', args, kw, ['?x', '?base']);
    if (base !== undefined) return parseIntStr(needStr(x, 'int'), needInt(base, 'base'));
    if (typeof x === 'string') return parseIntStr(x, 10);
    if (x instanceof PyFloat) {
      if (!Number.isFinite(x.v)) throw err(Number.isNaN(x.v) ? 'value' : 'overflow', { what: 'floatToInt' });
      const tr = Math.trunc(x.v);
      return Number.isSafeInteger(tr) ? tr || 0 : normBig(BigInt(tr));
    }
    if (isInt(x)) return num(x);
    throw err('type', { what: 'convert', to: 'int', type: typeName(x) });
  },
  float(ctx, args, kw) {
    const [x = 0] = params('float', args, kw, ['?x']);
    if (typeof x === 'string') return new PyFloat(parseFloatStr(x));
    if (isNum(x)) return x instanceof PyFloat ? x : new PyFloat(Number(num(x)));
    throw err('type', { what: 'convert', to: 'float', type: typeName(x) });
  },
  str(ctx, args, kw) { const [x = ''] = params('str', args, kw, ['?object']); return ctx.vm.str(x); },
  repr(ctx, args, kw) { const [x] = params('repr', args, kw, ['obj']); return ctx.vm.repr(x); },
  bool(ctx, args, kw) { const [x = false] = params('bool', args, kw, ['?x']); return truthy(x); },
  list(ctx, args, kw) { const [x] = params('list', args, kw, ['?iterable']); return new PyList(x === undefined ? [] : iterItems(x)); },
  tuple(ctx, args, kw) { const [x] = params('tuple', args, kw, ['?iterable']); return new PyTuple(x === undefined ? [] : iterItems(x)); },
  dict(ctx, args, kw) {
    if (args.length > 1) throw err('argCount', { name: 'dict', max: 1, given: args.length });
    const d = new PyDict();
    if (args.length) {
      const src = args[0];
      if (src instanceof PyDict) for (const [k, v] of src.entries()) d.set(k, v);
      else if (hasKeys(src)) for (const [k, v] of mappingItems(ctx, src)) d.set(k, v);
      else {
        for (const pair of iterItems(src)) {
          const kv = iterItems(pair);
          if (kv.length !== 2) throw err('value', { what: 'dictPair', n: kv.length });
          d.set(kv[0], kv[1]);
        }
      }
    }
    for (const k of Object.keys(kw)) d.set(k, kw[k]);
    return d;
  },
  abs(ctx, args, kw) {
    const [x] = params('abs', args, kw, ['x']);
    if (x instanceof PyInstance) { const r = callDunder(x, '__abs__'); if (r !== NO_METHOD) return r; }
    if (x instanceof PyFloat) return new PyFloat(Math.abs(x.v));
    const n = anyInt(x, 'abs');
    return typeof n === 'bigint' ? (n < 0n ? normBig(-n) : n) : Math.abs(n);
  },
  min(ctx, args, kw) { return minMax(ctx, 'min', args, kw, false); },
  max(ctx, args, kw) { return minMax(ctx, 'max', args, kw, true); },
  sum(ctx, args, kw) {
    const [it, start = 0] = params('sum', args, kw, ['iterable', '?start']);
    if (typeof start === 'string') throw err('type', { what: 'sumStr' });
    return sumValues(iterItems(it), start);
  },
  sorted(ctx, args, kw) {
    const [it, key = null, reverse = false] = params('sorted', args, kw, ['iterable', '?key', '?reverse']);
    return new PyList(sortItems(ctx, iterItems(it), key, truthy(reverse)));
  },
  reversed(ctx, args, kw) {
    const [x] = params('reversed', args, kw, ['seq']);
    if (x instanceof PyDict) throw err('type', { what: 'notReversible', type: 'dict' });
    return listIter(iterItems(x).reverse(), 'reversed');
  },
  enumerate(ctx, args, kw) {
    const [it, start = 0] = params('enumerate', args, kw, ['iterable', '?start']);
    const s = needInt(start, 'start');
    return listIter(iterItems(it).map((x, i) => new PyTuple([checkInt(s + i), x])), 'enumerate');
  },
  zip(ctx, args, kw) {
    noKw('zip', kw);
    const lists = args.map(iterItems);
    const n = lists.length ? Math.min(...lists.map((l) => l.length)) : 0;
    const out = [];
    for (let i = 0; i < n; i++) out.push(new PyTuple(lists.map((l) => l[i])));
    return listIter(out, 'zip');
  },
  round(ctx, args, kw) {
    const [x, nd = null] = params('round', args, kw, ['number', '?ndigits']);
    if (isInt(x)) {
      const v = num(x);
      if (nd === null || typeof v === 'bigint') return v;
      const d = needInt(nd, 'ndigits');
      if (d >= 0) return v;
      const p = pow10(-d);
      // round to integer, at exactly half to the even number
      const q = Math.floor(v / p), r = v - q * p;
      const up = r * 2 > p || (r * 2 === p && q % 2 !== 0);
      return checkInt((q + (up ? 1 : 0)) * p);
    }
    const f = needNum(x, 'round');
    if (nd === null) return roundFloat(f, null);
    return new PyFloat(roundFloat(f, needInt(nd, 'ndigits')));
  },
  type(ctx, args, kw) {
    const [x] = params('type', args, kw, ['object']);
    if (x instanceof PyInstance) return x.cls;
    const t = typeName(x);
    return new PyBuiltin(TYPE_NAMES.has(t) ? t : `class:${t}`);
  },
  isinstance(ctx, args, kw) { const [x, t] = params('isinstance', args, kw, ['obj', 'class']); return isInstance(x, t); },
  slice(ctx, args, kw) {
    noKw('slice', kw);
    if (!args.length || args.length > 3) throw err('argCount', { name: 'slice', max: 3, given: args.length });
    return args.length === 1 ? new PySlice(null, args[0], null) : new PySlice(args[0], args[1], args[2] ?? null);
  },
  issubclass(ctx, args, kw) {
    const [a, b] = params('issubclass', args, kw, ['class', 'classinfo']);
    if (!isTypeLike(a)) throw err('type', { what: 'issubclassArg', type: typeName(a) });
    return isSubclassOf(a, b);
  },
  hasattr(ctx, args, kw) {
    const [o, n] = params('hasattr', args, kw, ['object', 'name']);
    try { ctx.vm.getattr(ctx.task, o, needStr(n, 'name')); return true; } catch (e) { if (e instanceof ScriptError && e.short === 'attr') return false; throw e; }
  },
  getattr(ctx, args, kw) {
    const [o, n, def] = params('getattr', args, kw, ['object', 'name', '?default']);
    try { return ctx.vm.getattr(ctx.task, o, needStr(n, 'name')); } catch (e) {
      if (e instanceof ScriptError && e.short === 'attr' && (args.length > 2 || 'default' in kw)) return def;
      throw e;
    }
  },
  setattr(ctx, args, kw) {
    const [o, n, v] = params('setattr', args, kw, ['object', 'name', 'value']);
    ctx.vm.setattr(ctx.task, o, needStr(n, 'name'), v);
    return null;
  },
  delattr(ctx, args, kw) {
    const [o, n] = params('delattr', args, kw, ['object', 'name']);
    ctx.vm.delattr(ctx.task, o, needStr(n, 'name'));
    return null;
  },
  super(ctx, args, kw) {
    const [cls, obj] = params('super', args, kw, ['type', 'object']);
    if (!(cls instanceof PyClass)) throw err('type', { what: 'superArgs', type: typeName(cls) });
    const ok = obj instanceof PyInstance ? obj.cls.mro.includes(cls) : obj instanceof PyClass && obj.mro.includes(cls);
    if (!ok) throw err('type', { what: 'superArgs', type: typeName(obj) });
    return new PySuper(cls, obj);
  },
  property(ctx, args, kw) {
    const [get = null, set = null, del = null] = params('property', args, kw, ['?fget', '?fset', '?fdel']);
    return new PyProperty(get, set, del);
  },
  staticmethod(ctx, args, kw) { const [f] = params('staticmethod', args, kw, ['function']); return new PyStaticMethod(f); },
  classmethod(ctx, args, kw) { const [f] = params('classmethod', args, kw, ['function']); return new PyClassMethod(f); },
  id(ctx, args, kw) {
    const [x] = params('id', args, kw, ['obj']);
    if (x instanceof PyInstance) return 0x10000000 + x.id * 16;
    if (typeof x === 'object' && x !== null && !(x instanceof PyFloat)) {
      // containers and the like: one number per object, handed out in the order they are asked for
      if (!objectIds.has(x)) { objectIds.set(x, nextObjectId); nextObjectId += 16; }
      return objectIds.get(x);
    }
    return fnv(keyOfLoose(x)) + 0x20000000;
  },
  hash(ctx, args, kw) {
    const [x] = params('hash', args, kw, ['obj']);
    const k = keyOf(x);
    if (isNum(x) && !(x instanceof PyFloat && !Number.isInteger(x.v))) return typeof num(x) === 'bigint' ? fnv(k) : num(x);
    return fnv(k);
  },
  vars(ctx, args, kw) {
    const [o] = params('vars', args, kw, ['object']);
    if (!(o instanceof PyInstance)) throw err('type', { what: 'varsArg', type: typeName(o) });
    const d = new PyDict();
    for (const [k, v] of o.dict) d.set(k, v);
    return d;
  },

  // ---------- Methods of object and helpers for properties ----------
  'object.__init__'() { return null; },
  'object.__repr__'(ctx, args) { return defaultRepr(args[0]); },
  'object.__str__'(ctx, args) { return ctx.vm.repr(args[0]); },
  'object.__eq__'(ctx, args) { return args[0] === args[1] ? true : NOT_IMPLEMENTED; },
  'object.__ne__'(ctx, args) {
    const r = callDunder(args[0], '__eq__', [args[1]]);
    return r === NO_METHOD || r === NOT_IMPLEMENTED ? NOT_IMPLEMENTED : !truthy(r);
  },
  'BaseException.__init__'(ctx, args) { args[0].dict.set('args', new PyTuple(args.slice(1))); return null; },
  'BaseException.__str__'(ctx, args) {
    const a = args[0].dict.get('args');
    const items = a ? a.items : [];
    return items.length === 0 ? '' : items.length === 1 ? ctx.vm.str(items[0]) : ctx.vm.str(a);
  },
  'BaseException.__repr__'(ctx, args) {
    const a = args[0].dict.get('args');
    return `${args[0].cls.name}(${(a ? a.items : []).map((x) => ctx.vm.repr(x)).join(', ')})`;
  },
  'KeyError.__str__'(ctx, args) {
    const a = args[0].dict.get('args');
    return a && a.items.length === 1 ? ctx.vm.repr(a.items[0]) : BUILTINS['BaseException.__str__'](ctx, args);
  },
  'property.setter'(ctx, args) { return new PyProperty(args[0].fget, args[1], args[0].fdel); },
  'property.getter'(ctx, args) { return new PyProperty(args[1], args[0].fset, args[0].fdel); },
  'property.deleter'(ctx, args) { return new PyProperty(args[0].fget, args[0].fset, args[1]); },
  callable(ctx, args, kw) {
    const [x] = params('callable', args, kw, ['obj']);
    return x instanceof PyFunction || x instanceof PyPartial || x instanceof PyBoundMethod || x instanceof PyMethod || x instanceof PyClass
      || (x instanceof PyBuiltin && !x.name.startsWith('class:')) || (x instanceof PyInstance && lookupClass(x.cls, '__call__') !== undefined);
  },
  any(ctx, args, kw) { const [it] = params('any', args, kw, ['iterable']); return iterItems(it).some(truthy); },
  all(ctx, args, kw) { const [it] = params('all', args, kw, ['iterable']); return iterItems(it).every(truthy); },
  map(ctx, args, kw) {
    noKw('map', kw);
    if (args.length < 2) throw err('argMissing', { name: 'map', arg: 'iterable' });
    const [fn, ...its] = args;
    const lists = its.map(iterItems);
    const n = Math.min(...lists.map((l) => l.length));
    const out = [];
    for (let i = 0; i < n; i++) out.push(call(ctx, fn, lists.map((l) => l[i])));
    return listIter(out, 'map');
  },
  filter(ctx, args, kw) {
    const [fn, it] = params('filter', args, kw, ['function', 'iterable']);
    return listIter(iterItems(it).filter((x) => truthy(fn === null ? x : call(ctx, fn, [x]))), 'filter');
  },
  chr(ctx, args, kw) {
    const [i] = params('chr', args, kw, ['i']);
    const n = needInt(i, 'chr');
    if (n < 0 || n > 0x10ffff) throw err('value', { what: 'chrRange' });
    return String.fromCodePoint(n);
  },
  ord(ctx, args, kw) {
    const [c] = params('ord', args, kw, ['c']);
    const s = needStr(c, 'ord');
    if ([...s].length !== 1) throw err('type', { what: 'ordLength', n: [...s].length });
    return s.codePointAt(0);
  },
  divmod(ctx, args, kw) {
    const [a, b] = params('divmod', args, kw, ['a', 'b']);
    return new PyTuple([binary('//', a, b), binary('%', a, b)]);
  },
  pow(ctx, args, kw) { const [a, b] = params('pow', args, kw, ['base', 'exp']); return binary('**', a, b); },
  hex(ctx, args, kw) { return radix(params('hex', args, kw, ['x'])[0], 16, '0x'); },
  bin(ctx, args, kw) { return radix(params('bin', args, kw, ['x'])[0], 2, '0b'); },
  oct(ctx, args, kw) { return radix(params('oct', args, kw, ['x'])[0], 8, '0o'); },
  iter(ctx, args, kw) { const [x] = params('iter', args, kw, ['obj']); return makeIter(x); },
  next(ctx, args, kw) {
    const [it, def] = params('next', args, kw, ['iterator', '?default']);
    let v;
    if (it instanceof PyIterator || it instanceof PyGenerator || it instanceof PyUserIter) v = iterNext(it);
    else if (it instanceof PyInstance && lookupClass(it.cls, '__next__') !== undefined) {
      try { v = callDunder(it, '__next__'); } catch (e) { if (e instanceof ScriptError && e.kind === 'StopIteration') v = DONE; else throw e; }
    } else throw err('type', { what: 'notIterator', type: typeName(it) });
    if (v === DONE) { if (args.length > 1) return def; throw err('stopIteration', {}); }
    return v;
  },
  input(ctx, args, kw) {
    const [prompt = ''] = params('input', args, kw, ['?prompt']);
    const text = ctx.vm.str(prompt);
    if (text) ctx.vm.print(text, ctx.task);
    return new Suspend({ kind: 'input', prompt: text });
  },
  set(ctx, args, kw) { const [x] = params('set', args, kw, ['?iterable']); return setOf(x === undefined ? [] : iterItems(x)); },
  frozenset(ctx, args, kw) { const [x] = params('frozenset', args, kw, ['?iterable']); return setOf(x === undefined ? [] : iterItems(x), true); },

  ...MATH_NATIVES,

  ...RANDOM_NATIVES,
  ...CLOCK_NATIVES,
  ...JSON_NATIVES,
  ...RE_NATIVES,
  ...TURTLE_NATIVES,
  ...KARA_NATIVES,
  ...FS_NATIVES,
  ...COPY_NATIVES,
};

/**
 * sum() like CPython 3.12+: integers exactly, floats with compensated (Neumaier) summation so that
 * sum([0.1] * 10) is 1.0.
 */
function sumValues(items, start) {
  let acc = start, i = 0;
  const n = items.length;
  while (i < n && isInt(acc) && isInt(items[i])) acc = binary('+', acc, items[i++]);
  if (i < n && (isInt(acc) || acc instanceof PyFloat) && items[i] instanceof PyFloat) {
    let f = Number(num(acc)), c = 0;
    for (; i < n; i++) {
      const x = items[i];
      let v;
      if (x instanceof PyFloat) v = x.v;
      else if (isInt(x) && typeof num(x) !== 'bigint') v = Number(num(x));
      else break;
      const t = f + v;
      if (Number.isFinite(t)) c += Math.abs(f) >= Math.abs(v) ? (f - t) + v : (v - t) + f;
      f = t;
    }
    acc = new PyFloat(Number.isFinite(c) ? f + c : f);
  }
  for (; i < n; i++) acc = binary('+', acc, items[i]);
  return acc;
}

/** FNV-1a of a text as a non-negative 31-bit number (hash(), id()). */
function fnv(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) & 0x7fffffff;
}

/** Text key of any value (also unhashable ones, for id()). */
function keyOfLoose(v) {
  try { return keyOf(v); } catch { return `u${typeName(v)}`; }
}

/** Names of classes and constants that every program knows. */
export const CLASS_GLOBALS = { object: OBJECT, NotImplemented: NOT_IMPLEMENTED, ...EXCEPTION_CLASSES };

// object's default methods (found by lookups in the class chain, so that super().__init__() and friends work)
OBJECT.dict.set('__init__', new PyBuiltin('object.__init__'));
OBJECT.dict.set('__repr__', new PyBuiltin('object.__repr__'));
OBJECT.dict.set('__str__', new PyBuiltin('object.__str__'));
OBJECT.dict.set('__eq__', new PyBuiltin('object.__eq__'));
OBJECT.dict.set('__ne__', new PyBuiltin('object.__ne__'));

export const MODULES = {
  math: MATH_NAMES,
  random: RANDOM_NAMES,
  _time: CLOCK_NAMES,
  _json: JSON_NAMES,
  _re: RE_NAMES,
  _turtle_host: TURTLE_NAMES,
  kara: KARA_NAMES,
  _fs: FS_NAMES,
  _sys: ['write_err'],
  copy: COPY_NAMES,
};

/** Values of module attributes that are not functions (constants, classes). */
const MODULE_CONSTS = { math: MATH_CONSTS };

/** Attribute of a built-in module or undefined. */
export function moduleAttr(mod, name) {
  if (!MODULES[mod] || !MODULES[mod].includes(name)) return undefined;
  const c = MODULE_CONSTS[mod]?.[name];
  if (c !== undefined) return c;
  return new PyBuiltin(`${mod}.${name}`);
}

// ---------- Methods ----------

const strip = (s, chars, left, right) => {
  if (chars === null || chars === undefined) {
    let a = 0, b = s.length;
    if (left) while (a < b && /\s/.test(s[a])) a++;
    if (right) while (b > a && /\s/.test(s[b - 1])) b--;
    return s.slice(a, b);
  }
  const set = new Set(needStr(chars, 'chars'));
  let a = 0, b = s.length;
  if (left) while (a < b && set.has(s[a])) a++;
  if (right) while (b > a && set.has(s[b - 1])) b--;
  return s.slice(a, b);
};

function prefixTest(s, x, fn) {
  if (x instanceof PyTuple) return x.items.some((p) => fn(s, needStr(p, 'prefix')));
  return fn(s, needStr(x, 'prefix'));
}

/** str.format: "{} has {:>4} wood".format(name, n), "{name}".format(name=…) */
function strFormat(ctx, s, args, kw) {
  let auto = 0;
  return s.replace(/\{\{|\}\}|\{([^{}!:]*)(?:!([rsa]))?(?::([^{}]*))?\}/g, (m, field, conv, spec) => {
    if (m === '{{') return '{';
    if (m === '}}') return '}';
    let v;
    const parts = field.split(/(?=[.[])/);
    const head = parts.shift();
    if (head === '') { if (auto >= args.length) throw err('index', { what: 'formatIndex' }); v = args[auto++]; }
    else if (/^\d+$/.test(head)) { const i = Number(head); if (i >= args.length) throw err('index', { what: 'formatIndex' }); v = args[i]; }
    else { if (!(head in kw)) throw err('key', { key: `'${head}'` }); v = kw[head]; }
    for (const p of parts) {
      if (p.startsWith('[')) { const k = p.slice(1, -1); v = /^\d+$/.test(k) ? v.items?.[Number(k)] ?? v.get?.(Number(k)) : v.get?.(k); }
      else v = ctx.vm.getattr(ctx.task, v, p.slice(1));
    }
    if (conv === 'r' || conv === 'a') v = ctx.vm.repr(v); else if (conv === 's') v = ctx.vm.str(v);
    if (v instanceof PyHost && !spec) return ctx.vm.str(v);
    return formatValue(v, spec ?? '');
  });
}

function splitStr(s, sep, maxsplit) {
  const max = maxsplit === undefined ? -1 : needInt(maxsplit, 'maxsplit');
  if (sep === null || sep === undefined) {
    const out = [];
    let rest = s.replace(/^\s+/, '');
    while (rest.length) {
      if (max >= 0 && out.length >= max) { out.push(rest.replace(/\s+$/, '')); return out; }
      const m = /\s+/.exec(rest);
      if (!m) { out.push(rest); break; }
      out.push(rest.slice(0, m.index));
      rest = rest.slice(m.index + m[0].length);
    }
    return out;
  }
  const d = needStr(sep, 'sep');
  if (!d) throw err('value', { what: 'emptySeparator' });
  const parts = s.split(d);
  if (max >= 0 && parts.length > max + 1) return [...parts.slice(0, max), parts.slice(max).join(d)];
  return parts;
}

const listOf = (self) => self.items;

const asSet = (v) => (v instanceof PySet ? v : setOf(iterItems(v)));
/** Error raised by set.pop() on an empty set (a KeyError with a text, not a key). */
function keyErrorText(text) { const e = err('key', { key: text }); e.arg = text; return e; }

const SET_COMMON = {
  union: (c, st, a) => a.reduce((acc, o) => setOp('|', acc, asSet(o), st.frozen), setOf(st.items(), st.frozen)),
  intersection: (c, st, a) => a.reduce((acc, o) => setOp('&', acc, asSet(o), st.frozen), setOf(st.items(), st.frozen)),
  difference: (c, st, a) => a.reduce((acc, o) => setOp('-', acc, asSet(o), st.frozen), setOf(st.items(), st.frozen)),
  symmetric_difference: (c, st, a, kw) => { const [o] = params('symmetric_difference', a, kw, ['other']); return setOp('^', st, asSet(o), st.frozen); },
  issubset: (c, st, a, kw) => { const [o] = params('issubset', a, kw, ['other']); const t = asSet(o); return st.items().every((x) => t.has(x)); },
  issuperset: (c, st, a, kw) => { const [o] = params('issuperset', a, kw, ['other']); return iterItems(o).every((x) => st.has(x)); },
  isdisjoint: (c, st, a, kw) => { const [o] = params('isdisjoint', a, kw, ['other']); return iterItems(o).every((x) => !st.has(x)); },
};

export const METHODS = {
  str: {
    upper: (c, s) => s.toUpperCase(),
    lower: (c, s) => s.toLowerCase(),
    capitalize: (c, s) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s),
    title: (c, s) => s.toLowerCase().replace(/(^|[^a-zA-ZäöüÄÖÜß])([a-zäöüß])/g, (m, a, b) => a + b.toUpperCase()),
    swapcase: (c, s) => [...s].map((ch) => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase())).join(''),
    strip: (c, s, a, kw) => strip(s, params('strip', a, kw, ['?chars'])[0], true, true),
    lstrip: (c, s, a, kw) => strip(s, params('lstrip', a, kw, ['?chars'])[0], true, false),
    rstrip: (c, s, a, kw) => strip(s, params('rstrip', a, kw, ['?chars'])[0], false, true),
    split: (c, s, a, kw) => { const [sep, max] = params('split', a, kw, ['?sep', '?maxsplit']); return new PyList(splitStr(s, sep, max)); },
    splitlines: (c, s, a, kw) => {
      const [keep = false] = params('splitlines', a, kw, ['?keepends']);
      const out = [];
      const re = /\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/g;
      let last = 0, m;
      while ((m = re.exec(s))) { out.push(s.slice(last, keep ? m.index + m[0].length : m.index)); last = m.index + m[0].length; }
      if (last < s.length) out.push(s.slice(last));
      return new PyList(out);
    },
    expandtabs: (c, s, a, kw) => {
      const [size = 8] = params('expandtabs', a, kw, ['?tabsize']);
      const n = needInt(size, 'tabsize');
      let out = '', col = 0;
      for (const ch of s) {
        if (ch === '\t') { const k = n > 0 ? n - (col % n) : 0; out += ' '.repeat(k); col += k; } else { out += ch; col = ch === '\n' || ch === '\r' ? 0 : col + 1; }
      }
      return out;
    },
    join: (c, s, a, kw) => {
      const [it] = params('join', a, kw, ['iterable']);
      return iterItems(it).map((x, i) => { if (typeof x !== 'string') throw err('type', { what: 'joinStr', i, type: typeName(x) }); return x; }).join(s);
    },
    replace: (c, s, a, kw) => {
      const [o, n, count = -1] = params('replace', a, kw, ['old', 'new', '?count']);
      const old = needStr(o, 'old'), nw = needStr(n, 'new'), k = needInt(count, 'count');
      if (k < 0) return old === '' ? [...s].join(nw).replace(/^/, nw) + nw : s.split(old).join(nw);
      let out = s, done = 0, from = 0;
      while (done < k) { const i = out.indexOf(old, from); if (i < 0) break; out = out.slice(0, i) + nw + out.slice(i + old.length); from = i + nw.length + (old === '' ? 1 : 0); done++; }
      return out;
    },
    startswith: (c, s, a, kw) => prefixTest(s, params('startswith', a, kw, ['prefix'])[0], (x, p) => x.startsWith(p)),
    endswith: (c, s, a, kw) => prefixTest(s, params('endswith', a, kw, ['suffix'])[0], (x, p) => x.endsWith(p)),
    find: (c, s, a, kw) => strFind('find', s, a, kw, false),
    rfind: (c, s, a, kw) => strFind('rfind', s, a, kw, true),
    index: (c, s, a, kw) => { const i = strFind('index', s, a, kw, false); if (i < 0) throw err('value', { what: 'substringNotFound' }); return i; },
    rindex: (c, s, a, kw) => { const i = strFind('rindex', s, a, kw, true); if (i < 0) throw err('value', { what: 'substringNotFound' }); return i; },
    count: (c, s, a, kw) => {
      const [sub, start, end] = params('count', a, kw, ['sub', '?start', '?end']);
      const [lo, hi] = sliceBounds(s.length, start, end);
      const part = s.slice(lo, hi);
      const t = needStr(sub, 'sub');
      if (!t) return lo > s.length ? 0 : part.length + 1;
      return part.split(t).length - 1;
    },
    isdigit: (c, s) => s.length > 0 && /^\d+$/.test(s),
    isnumeric: (c, s) => s.length > 0 && /^\d+$/.test(s),
    isalpha: (c, s) => s.length > 0 && /^\p{L}+$/u.test(s),
    isalnum: (c, s) => s.length > 0 && /^[\p{L}\d]+$/u.test(s),
    isspace: (c, s) => s.length > 0 && /^\s+$/.test(s),
    isupper: (c, s) => /\p{L}/u.test(s) && s === s.toUpperCase(),
    islower: (c, s) => /\p{L}/u.test(s) && s === s.toLowerCase(),
    format: (c, s, a, kw) => strFormat(c, s, a, kw),
    center: (c, s, a, kw) => { const [w, f = ' '] = params('center', a, kw, ['width', '?fillchar']); return formatValue(s, `${f}^${needInt(w, 'width')}`); },
    ljust: (c, s, a, kw) => { const [w, f = ' '] = params('ljust', a, kw, ['width', '?fillchar']); return formatValue(s, `${f}<${needInt(w, 'width')}`); },
    rjust: (c, s, a, kw) => { const [w, f = ' '] = params('rjust', a, kw, ['width', '?fillchar']); return formatValue(s, `${f}>${needInt(w, 'width')}`); },
    zfill: (c, s, a, kw) => {
      const w = needInt(params('zfill', a, kw, ['width'])[0], 'width');
      const sign = s[0] === '-' || s[0] === '+' ? s[0] : '';
      const body = sign ? s.slice(1) : s;
      return sign + body.padStart(w - sign.length, '0');
    },
  },
  list: {
    append: (c, l, a, kw) => { const [x] = params('append', a, kw, ['object']); l.items.push(x); return null; },
    extend: (c, l, a, kw) => { const [x] = params('extend', a, kw, ['iterable']); pushAll(l.items, iterItems(x)); return null; },
    insert: (c, l, a, kw) => {
      const [i, x] = params('insert', a, kw, ['index', 'object']);
      let k = toIndex(i);
      const n = l.items.length;
      if (k < 0) k = Math.max(0, k + n); else if (k > n) k = n;
      l.items.splice(k, 0, x);
      return null;
    },
    pop: (c, l, a, kw) => {
      const [i = -1] = params('pop', a, kw, ['?index']);
      if (!l.items.length) throw err('index', { what: 'popEmpty' });
      let k = toIndex(i);
      if (k < 0) k += l.items.length;
      if (k < 0 || k >= l.items.length) throw err('index', { what: 'list' });
      return l.items.splice(k, 1)[0];
    },
    remove: (c, l, a, kw) => {
      const [x] = params('remove', a, kw, ['value']);
      const i = l.items.findIndex((y) => eq(y, x));
      if (i < 0) throw err('value', { what: 'notInList', op: 'remove' });
      l.items.splice(i, 1);
      return null;
    },
    index: (c, l, a, kw) => {
      const [x] = params('index', a, kw, ['value']);
      const i = listOf(l).findIndex((y) => eq(y, x));
      if (i < 0) throw err('value', { what: 'notInList', op: 'index', value: c.vm.repr(x) });
      return i;
    },
    count: (c, l, a, kw) => { const [x] = params('count', a, kw, ['value']); return l.items.filter((y) => eq(y, x)).length; },
    sort: (c, l, a, kw) => {
      if (a.length) throw err('argCount', { name: 'sort', max: 0, given: a.length });
      const { key = null, reverse = false } = kw;
      for (const k of Object.keys(kw)) if (k !== 'key' && k !== 'reverse') throw err('argUnexpected', { name: 'sort', arg: k });
      l.items = sortItems(c, l.items, key, truthy(reverse));
      return null;
    },
    reverse: (c, l) => { l.items.reverse(); return null; },
    clear: (c, l) => { l.items = []; return null; },
    copy: (c, l) => new PyList(l.items.slice()),
  },
  tuple: {
    index: (c, t, a, kw) => {
      const [x] = params('index', a, kw, ['value']);
      const i = t.items.findIndex((y) => eq(y, x));
      if (i < 0) throw err('value', { what: 'notInTuple' });
      return i;
    },
    count: (c, t, a, kw) => { const [x] = params('count', a, kw, ['value']); return t.items.filter((y) => eq(y, x)).length; },
  },
  generator: {
    send: (c, g, a, kw) => { const [x] = params('send', a, kw, ['value']); const v = c.vm.genResume(g, x); if (v === DONE) throw err('stopIteration', {}); return v; },
    close: (c, g) => { g.state = 'done'; return null; },
  },
  set: {
    add: (c, st, a, kw) => { const [x] = params('add', a, kw, ['elem']); st.add(x); return null; },
    discard: (c, st, a, kw) => { const [x] = params('discard', a, kw, ['elem']); st.delete(x); return null; },
    remove: (c, st, a, kw) => { const [x] = params('remove', a, kw, ['elem']); if (!st.delete(x)) throw keyError(x); return null; },
    pop: (c, st) => { const it = st.items(); if (!it.length) throw keyErrorText('pop from an empty set'); st.delete(it[0]); return it[0]; },
    clear: (c, st) => { st.d = new PyDict(); return null; },
    copy: (c, st) => setOf(st.items()),
    update: (c, st, a) => { for (const o of a) for (const x of iterItems(o)) st.add(x); return null; },
    intersection_update: (c, st, a) => { const r = a.reduce((acc, o) => setOp('&', acc, asSet(o), false), st); st.d = r.d; return null; },
    difference_update: (c, st, a) => { for (const o of a) for (const x of iterItems(o)) st.delete(x); return null; },
    symmetric_difference_update: (c, st, a, kw) => { const [o] = params('symmetric_difference_update', a, kw, ['other']); st.d = setOp('^', st, asSet(o), false).d; return null; },
    ...SET_COMMON,
  },
  frozenset: { copy: (c, st) => st, ...SET_COMMON },
  dict: {
    keys: (c, d) => new PyView(d, 'keys'),
    values: (c, d) => new PyView(d, 'values'),
    items: (c, d) => new PyView(d, 'items'),
    get: (c, d, a, kw) => { const [k, def = null] = params('get', a, kw, ['key', '?default']); const v = d.get(k); return v === undefined ? def : v; },
    pop: (c, d, a, kw) => {
      const [k, def] = params('pop', a, kw, ['key', '?default']);
      const v = d.get(k);
      if (v === undefined) { if (a.length > 1 || 'default' in kw) return def; throw keyError(k); }
      d.delete(k);
      return v;
    },
    setdefault: (c, d, a, kw) => {
      const [k, def = null] = params('setdefault', a, kw, ['key', '?default']);
      const v = d.get(k);
      if (v !== undefined) return v;
      keyOf(k);
      d.set(k, def);
      return def;
    },
    update: (c, d, a, kw) => {
      if (a.length > 1) throw err('argCount', { name: 'update', max: 1, given: a.length });
      if (a.length) {
        const src = a[0];
        if (src instanceof PyDict) for (const [k, v] of src.entries()) d.set(k, v);
        else if (hasKeys(src)) for (const [k, v] of mappingItems(ctx0(c), src)) d.set(k, v);
        else for (const p of iterItems(src)) { const kv = iterItems(p); d.set(kv[0], kv[1]); }
      }
      for (const k of Object.keys(kw)) d.set(k, kw[k]);
      return null;
    },
    clear: (c, d) => { d.map.clear(); return null; },
    copy: (c, d) => { const n = new PyDict(); for (const [k, v] of d.entries()) n.set(k, v); return n; },
  },
};

export { PyModule };
