// Built-in functions, methods of str/list/dict/tuple and the modules math and random.
// Each function gets (ctx, args, kwargs): ctx = { vm, task }, kwargs is an object without a prototype.
// Functions that call Python functions (sorted(key=…), map, min(key=…)) use vm.callSync.
// math deliberately contains only exactly computing functions (sqrt, floor, ceil …) – no sin/log, those would be
// not identical on all machines.

import { ScriptError } from './errors.js';
import {
  PyFloat, PyList, PyTuple, PyDict, PyRange, PyBuiltin, PyIterator, PyView, PyFunction, PyPartial, PyBoundMethod,
  PyModule, PyHost, checkInt, isInt, isNum, num, typeName, truthy, eq, lt, iterItems, makeIter, iterNext, DONE, length,
  roundFloat, formatValue, binary, TYPE_NAMES, toIndex, keyOf, normBig, pow10, pushAll,
} from './values.js';

const err = (code, params) => new ScriptError(code, params);

/**
 * Resolve arguments by name.
 * @param {string} fname @param {any[]} args @param {any} kw
 * @param {string[]} names parameters; '?' prefix = optional
 * @returns {any[]} values (missing optional ones: undefined)
 */
function params(fname, args, kw, names) {
  const plain = names.map((n) => n.replace(/^\?/, ''));
  if (args.length > names.length) throw err('argCount', { name: fname, max: names.length, given: args.length });
  const out = names.map((_, i) => args[i]);
  for (const k of Object.keys(kw)) {
    const i = plain.indexOf(k);
    if (i < 0) throw err('argUnexpected', { name: fname, arg: k });
    if (out[i] !== undefined) throw err('argDuplicate', { name: fname, arg: k });
    out[i] = kw[k];
  }
  names.forEach((n, i) => { if (out[i] === undefined && !n.startsWith('?')) throw err('argMissing', { name: fname, arg: plain[i] }); });
  return out;
}

function noKw(fname, kw) {
  const k = Object.keys(kw)[0];
  if (k !== undefined) throw err('argUnexpected', { name: fname, arg: k });
}

/** Integer as JS number (large numbers are too large here). */
function needInt(v, what) {
  if (!isInt(v)) throw err('type', { what: 'intNeeded', name: what, type: typeName(v) });
  const n = num(v);
  if (typeof n === 'bigint') throw err('overflow', {});
  return n;
}

/** Integer, also large (BigInt). */
function anyInt(v, what) {
  if (!isInt(v)) throw err('type', { what: 'intNeeded', name: what, type: typeName(v) });
  return num(v);
}

/** Number as JS number (float arithmetic). */
function needNum(v, what) {
  if (!isNum(v)) throw err('type', { what: 'numberNeeded', name: what, type: typeName(v) });
  return Number(num(v));
}

const radix = (v, base, prefix) => {
  const n = BigInt(anyInt(v, prefix));
  return (n < 0n ? '-' : '') + prefix + (n < 0n ? -n : n).toString(base);
};

function needStr(v, what) {
  if (typeof v !== 'string') throw err('type', { what: 'strNeeded', name: what, type: typeName(v) });
  return v;
}

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
  if (!(t instanceof PyBuiltin)) throw err('type', { what: 'isinstanceType' });
  const name = t.name.startsWith('class:') ? t.name.slice(6) : t.name;
  const tn = typeName(v);
  return tn === name || (name === 'int' && tn === 'bool');
}

/** Iterator over a finished list (enumerate, zip, map, reversed). */
const listIter = (items, label) => new PyIterator(new PyList(items), 0, label);

export const BUILTINS = {
  print(ctx, args, kw) {
    const [sep = ' ', end = '\n'] = [kw.sep ?? undefined, kw.end ?? undefined];
    for (const k of Object.keys(kw)) if (k !== 'sep' && k !== 'end' && k !== 'flush') throw err('argUnexpected', { name: 'print', arg: k });
    const s = sep === null ? ' ' : needStr(sep, 'sep'), e = end === null ? '\n' : needStr(end, 'end');
    ctx.vm.print(args.map((a) => ctx.vm.str(a)).join(s) + e, ctx.task);
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
    if (x instanceof PyFloat) return new PyFloat(Math.abs(x.v));
    const n = anyInt(x, 'abs');
    return typeof n === 'bigint' ? (n < 0n ? normBig(-n) : n) : Math.abs(n);
  },
  min(ctx, args, kw) { return minMax(ctx, 'min', args, kw, false); },
  max(ctx, args, kw) { return minMax(ctx, 'max', args, kw, true); },
  sum(ctx, args, kw) {
    const [it, start = 0] = params('sum', args, kw, ['iterable', '?start']);
    if (typeof start === 'string') throw err('type', { what: 'sumStr' });
    let acc = start;
    for (const x of iterItems(it)) acc = binary('+', acc, x);
    return acc;
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
    const t = typeName(x);
    return new PyBuiltin(TYPE_NAMES.has(t) ? t : `class:${t}`);
  },
  isinstance(ctx, args, kw) { const [x, t] = params('isinstance', args, kw, ['obj', 'class']); return isInstance(x, t); },
  callable(ctx, args, kw) {
    const [x] = params('callable', args, kw, ['obj']);
    return x instanceof PyFunction || x instanceof PyPartial || x instanceof PyBoundMethod || (x instanceof PyBuiltin && !x.name.startsWith('class:'));
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
    if (!(it instanceof PyIterator)) throw err('type', { what: 'notIterator', type: typeName(it) });
    const v = iterNext(it);
    if (v === DONE) { if (args.length > 1) return def; throw err('stopIteration', {}); }
    return v;
  },
  input() { throw err('notSupported', { feature: 'input' }); },
  set() { throw err('notSupported', { feature: 'set' }); },

  // ---------- math ----------
  'math.sqrt'(ctx, args, kw) {
    const [x] = params('sqrt', args, kw, ['x']);
    const v = needNum(x, 'sqrt');
    if (v < 0) throw err('mathDomain', {});
    return new PyFloat(Math.sqrt(v));
  },
  'math.floor'(ctx, args, kw) { const [x] = params('floor', args, kw, ['x']); return checkInt(Math.floor(needNum(x, 'floor'))); },
  'math.ceil'(ctx, args, kw) { const [x] = params('ceil', args, kw, ['x']); return checkInt(Math.ceil(needNum(x, 'ceil'))); },
  'math.trunc'(ctx, args, kw) { const [x] = params('trunc', args, kw, ['x']); return checkInt(Math.trunc(needNum(x, 'trunc'))); },
  'math.fabs'(ctx, args, kw) { const [x] = params('fabs', args, kw, ['x']); return new PyFloat(Math.abs(needNum(x, 'fabs'))); },
  'math.hypot'(ctx, args, kw) {
    noKw('hypot', kw);
    return new PyFloat(Math.sqrt(args.reduce((s, a) => { const v = needNum(a, 'hypot'); return s + v * v; }, 0)));
  },
  'math.isqrt'(ctx, args, kw) {
    const [x] = params('isqrt', args, kw, ['n']);
    const n = needInt(x, 'isqrt');
    if (n < 0) throw err('mathDomain', {});
    let r = Math.floor(Math.sqrt(n));
    while (r * r > n) r--;
    while ((r + 1) * (r + 1) <= n) r++;
    return r;
  },
  'math.gcd'(ctx, args, kw) {
    noKw('gcd', kw);
    let g = 0;
    for (const a of args) { let x = Math.abs(needInt(a, 'gcd')); while (x) [g, x] = [x, g % x]; }
    return g;
  },
  'math.dist'(ctx, args, kw) {
    const [p, q] = params('dist', args, kw, ['p', 'q']);
    const a = iterItems(p), b = iterItems(q);
    if (a.length !== b.length) throw err('value', { what: 'distLength' });
    return new PyFloat(Math.sqrt(a.reduce((s, x, i) => { const v = needNum(x, 'dist') - needNum(b[i], 'dist'); return s + v * v; }, 0)));
  },

  // ---------- random (the VM's own randomness, saved along) ----------
  'random.random'(ctx, args, kw) { params('random', args, kw, []); return new PyFloat(random53(ctx.vm)); },
  'random.randint'(ctx, args, kw) {
    const [a, b] = params('randint', args, kw, ['a', 'b']);
    const lo = needInt(a, 'a'), hi = needInt(b, 'b');
    if (hi < lo) throw err('value', { what: 'emptyRange' });
    return lo + randBelow(ctx.vm, hi - lo + 1);
  },
  'random.randrange'(ctx, args, kw) {
    const [a, b, s = 1] = params('randrange', args, kw, ['start', '?stop', '?step']);
    const [start, stop] = b === undefined ? [0, needInt(a, 'stop')] : [needInt(a, 'start'), needInt(b, 'stop')];
    const step = needInt(s, 'step');
    if (step === 0) throw err('value', { what: 'rangeStep' });
    const n = step > 0 ? Math.ceil((stop - start) / step) : Math.ceil((start - stop) / -step);
    if (n <= 0) throw err('value', { what: 'emptyRange' });
    return start + step * randBelow(ctx.vm, n);
  },
  'random.choice'(ctx, args, kw) {
    const [seq] = params('choice', args, kw, ['seq']);
    const items = iterItems(seq);
    if (!items.length) throw err('index', { what: 'choiceEmpty' });
    return items[randBelow(ctx.vm, items.length)];
  },
  'random.shuffle'(ctx, args, kw) {
    const [lst] = params('shuffle', args, kw, ['x']);
    if (!(lst instanceof PyList)) throw err('type', { what: 'listNeeded', type: typeName(lst) });
    const a = lst.items;
    for (let i = a.length - 1; i > 0; i--) { const j = randBelow(ctx.vm, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return null;
  },
  'random.uniform'(ctx, args, kw) {
    const [a, b] = params('uniform', args, kw, ['a', 'b']);
    const lo = needNum(a, 'a'), hi = needNum(b, 'b');
    return new PyFloat(lo + (hi - lo) * random53(ctx.vm));
  },
  'random.seed'(ctx, args, kw) {
    const [s = 0] = params('seed', args, kw, ['?a']);
    const v = typeof s === 'string' ? [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7) : needInt(s, 'seed');
    const st = [0x9e3779b9, 0x243f6a88, 0xb7e15162, v >>> 0];
    ctx.vm.rng.splice(0, 4, ...st);
    for (let i = 0; i < 15; i++) ctx.vm.random32();
    return null;
  },
};

/** Uniformly distributed integer 0 … n-1 without bias (rejection). */
function randBelow(vm, n) {
  if (n <= 0) return 0;
  if (n <= 0x100000000) {
    const limit = Math.floor(0x100000000 / n) * n;
    for (;;) { const r = vm.random32(); if (r < limit) return r % n; }
  }
  for (;;) { const r = random53(vm) * n; const k = Math.floor(r); if (k < n) return k; }
}

/** Float 0 ≤ x < 1 with 53 bits (like Python's random()). */
function random53(vm) {
  const a = vm.random32() >>> 5, b = vm.random32() >>> 6;
  return (a * 67108864 + b) / 9007199254740992;
}

export const MODULES = {
  math: ['sqrt', 'floor', 'ceil', 'trunc', 'fabs', 'hypot', 'isqrt', 'gcd', 'dist', 'pi', 'e', 'inf', 'nan', 'tau'],
  random: ['random', 'randint', 'randrange', 'choice', 'shuffle', 'uniform', 'seed'],
};

const MATH_CONST = { pi: Math.PI, e: Math.E, inf: Infinity, nan: NaN, tau: 2 * Math.PI };

/** Attribute of a built-in module or undefined. */
export function moduleAttr(mod, name) {
  if (!MODULES[mod] || !MODULES[mod].includes(name)) return undefined;
  if (mod === 'math' && name in MATH_CONST) return new PyFloat(MATH_CONST[name]);
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
    splitlines: (c, s) => new PyList(s.split(/\r?\n/).filter((x, i, arr) => i < arr.length - 1 || x !== '')),
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
    find: (c, s, a, kw) => s.indexOf(needStr(params('find', a, kw, ['sub'])[0], 'sub')),
    rfind: (c, s, a, kw) => s.lastIndexOf(needStr(params('rfind', a, kw, ['sub'])[0], 'sub')),
    index: (c, s, a, kw) => {
      const i = s.indexOf(needStr(params('index', a, kw, ['sub'])[0], 'sub'));
      if (i < 0) throw err('value', { what: 'substringNotFound' });
      return i;
    },
    count: (c, s, a, kw) => {
      const sub = needStr(params('count', a, kw, ['sub'])[0], 'sub');
      if (!sub) return s.length + 1;
      return s.split(sub).length - 1;
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
      if (i < 0) throw err('value', { what: 'notInList' });
      l.items.splice(i, 1);
      return null;
    },
    index: (c, l, a, kw) => {
      const [x] = params('index', a, kw, ['value']);
      const i = listOf(l).findIndex((y) => eq(y, x));
      if (i < 0) throw err('value', { what: 'notInList' });
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
  dict: {
    keys: (c, d) => new PyView(d, 'keys'),
    values: (c, d) => new PyView(d, 'values'),
    items: (c, d) => new PyView(d, 'items'),
    get: (c, d, a, kw) => { const [k, def = null] = params('get', a, kw, ['key', '?default']); const v = d.get(k); return v === undefined ? def : v; },
    pop: (c, d, a, kw) => {
      const [k, def] = params('pop', a, kw, ['key', '?default']);
      const v = d.get(k);
      if (v === undefined) { if (a.length > 1 || 'default' in kw) return def; throw err('key', { key: c.vm.repr(k) }); }
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
