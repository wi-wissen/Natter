// math: all functions of Python's math module that are used in school, deterministic on every engine.
// The elementary functions come from fdlibm.js; hypot and dist are computed exactly (correctly rounded).

import * as FD from '../fdlibm.js';
import * as L from '../libm.js';

/** CPython's results (libm.js: correctly rounded where glibc is) and cbrt from fdlibm */
const F = { ...FD, ...L };
import { PyFloat, PyTuple, isInt, isNum, num, iterItems, normBig, binary } from '../values.js';
import { err, params, noKw, needInt, needNum } from '../args.js';

const bits = new DataView(new ArrayBuffer(8));

/** A power of two as a double, for exponents of normal numbers (-1022 … 1023). */
function pow2(k) {
  bits.setUint32(0, ((k + 1023) << 20) >>> 0);
  bits.setUint32(4, 0);
  return bits.getFloat64(0);
}

/** x * 2**e without rounding errors in between. */
function ldexp(x, e) {
  while (e > 1000) { x *= pow2(1000); e -= 1000; if (!Number.isFinite(x)) return x; }
  while (e < -1000) { x *= pow2(-1000); e += 1000; if (x === 0) return x; }
  return x * pow2(e);
}

/** A finite double as [mantissa (BigInt), exponent] with |x| = mantissa * 2**exponent. */
function decompose(x) {
  bits.setFloat64(0, Math.abs(x));
  const hi = bits.getUint32(0), lo = bits.getUint32(4);
  const be = (hi >>> 20) & 0x7ff;
  let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  if (be === 0) return [m, -1074];
  m |= 1n << 52n;
  return [m, be - 1075];
}

function isqrtBig(n) {
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** The correctly rounded square root of m * 2**e (m: BigInt). */
function sqrtExact(m, e) {
  if (m === 0n) return 0;
  if (e % 2 !== 0) { m <<= 1n; e -= 1; }
  const bl = m.toString(2).length;
  const p = Math.max(0, Math.ceil((130 - bl) / 2));
  const t = m << BigInt(2 * p);
  let q = isqrtBig(t);
  let exp = e / 2 - p;
  if (q * q !== t) { q = (q << 1n) | 1n; exp -= 1; } // sticky bit: decides ties correctly
  return ldexp(Number(q), exp);
}

/** sqrt(x1² + x2² + …), correctly rounded. */
function norm(values) {
  let inf = false, nan = false;
  for (const v of values) { if (Number.isNaN(v)) nan = true; else if (!Number.isFinite(v)) inf = true; }
  if (inf) return Infinity;
  if (nan) return NaN;
  const parts = values.filter((v) => v !== 0).map(decompose);
  if (!parts.length) return 0;
  const base = Math.min(...parts.map(([, e]) => 2 * e));
  let sum = 0n;
  for (const [m, e] of parts) sum += (m * m) << BigInt(2 * e - base);
  return sqrtExact(sum, base);
}

/** Result of a function of one real number: domain and range errors as in CPython. */
function check(r, xs, canOverflow) {
  if (Number.isNaN(r) && !xs.some(Number.isNaN)) throw err('mathDomain', {});
  if (!Number.isFinite(r) && !Number.isNaN(r) && xs.every(Number.isFinite)) throw err(canOverflow ? 'mathRange' : 'mathDomain', {});
  return new PyFloat(r);
}

const f1 = (name, fn, canOverflow = false) => (ctx, args, kw) => {
  const [x] = params(name, args, kw, ['x']);
  const v = needNum(x, name);
  return check(fn(v), [v], canOverflow);
};

/** An integer from a float (floor, ceil, trunc): large values become big integers. */
function intOf(r) {
  if (Number.isNaN(r)) throw err('value', { what: 'floatToInt' });
  if (!Number.isFinite(r)) throw err('overflow', { what: 'floatToInt' });
  return Number.isSafeInteger(r) ? (r === 0 ? 0 : r) : normBig(BigInt(r));
}

const intFn = (name, fn) => (ctx, args, kw) => {
  const [x] = params(name, args, kw, ['x']);
  if (isInt(x)) return num(x);
  return intOf(fn(needNum(x, name)));
};

/** Shewchuk's sum of floats (math.fsum): no rounding errors in between. */
function fsum(values) {
  const partials = [];
  let special = 0;
  for (let x of values) {
    if (!Number.isFinite(x)) { special += x; continue; }
    let i = 0;
    for (let y of partials) {
      if (Math.abs(x) < Math.abs(y)) { const t = x; x = y; y = t; }
      const hi = x + y;
      const lo = y - (hi - x);
      if (lo !== 0) partials[i++] = lo;
      x = hi;
    }
    partials.length = i;
    partials.push(x);
  }
  if (special !== 0 || Number.isNaN(special)) return special;
  let total = 0;
  for (let i = partials.length - 1; i >= 0; i--) total += partials[i];
  return total;
}

const bigInt = (v, name) => {
  if (!isInt(v)) throw err('type', { what: 'intNeeded', name, type: v === null ? 'NoneType' : typeof v });
  return BigInt(num(v));
};

export const MATH_NATIVES = {
  'math.sqrt': f1('sqrt', Math.sqrt),
  'math.sin': f1('sin', F.sin),
  'math.cos': f1('cos', F.cos),
  'math.tan': f1('tan', F.tan),
  'math.asin': f1('asin', F.asin),
  'math.acos': f1('acos', F.acos),
  'math.atan': f1('atan', F.atan),
  'math.sinh': f1('sinh', F.sinh, true),
  'math.cosh': f1('cosh', F.cosh, true),
  'math.tanh': f1('tanh', F.tanh),
  'math.asinh': f1('asinh', F.asinh),
  'math.acosh': f1('acosh', F.acosh),
  'math.atanh': f1('atanh', F.atanh),
  'math.exp': f1('exp', F.exp, true),
  'math.expm1': f1('expm1', F.expm1, true),
  'math.exp2': f1('exp2', (x) => F.pow(2, x), true),
  'math.log2': f1('log2', F.log2),
  'math.log10': f1('log10', F.log10),
  'math.log1p': f1('log1p', F.log1p),
  'math.cbrt': f1('cbrt', F.cbrt),
  'math.fabs': f1('fabs', Math.abs),
  'math.degrees': f1('degrees', (x) => x * 57.29577951308232),
  'math.radians': f1('radians', (x) => x * 0.017453292519943295),
  'math.log'(ctx, args, kw) {
    const [x, base] = params('log', args, kw, ['x', '?base']);
    const v = needNum(x, 'log');
    const a = check(F.log(v), [v], false).v;
    if (base === undefined) return new PyFloat(a);
    const b = check(F.log(needNum(base, 'log')), [needNum(base, 'log')], false).v;
    if (b === 0) throw err('zeroDivision', { op: 'div', float: true });
    return new PyFloat(a / b);
  },
  'math.pow'(ctx, args, kw) {
    const [x, y] = params('pow', args, kw, ['x', 'y']);
    const a = needNum(x, 'pow'), b = needNum(y, 'pow');
    if (a === 0 && b < 0) throw err('mathDomain', {});
    return check(F.pow(a, b), [a, b], true);
  },
  'math.atan2'(ctx, args, kw) {
    const [y, x] = params('atan2', args, kw, ['y', 'x']);
    return new PyFloat(F.atan2(needNum(y, 'atan2'), needNum(x, 'atan2')));
  },
  'math.floor': intFn('floor', Math.floor),
  'math.ceil': intFn('ceil', Math.ceil),
  'math.trunc': intFn('trunc', Math.trunc),
  'math.hypot'(ctx, args, kw) {
    noKw('hypot', kw);
    return new PyFloat(norm(args.map((a) => needNum(a, 'hypot'))));
  },
  'math.dist'(ctx, args, kw) {
    const [p, q] = params('dist', args, kw, ['p', 'q']);
    const a = iterItems(p), b = iterItems(q);
    if (a.length !== b.length) throw err('value', { what: 'distLength' });
    return new PyFloat(norm(a.map((x, i) => needNum(x, 'dist') - needNum(b[i], 'dist'))));
  },
  'math.isqrt'(ctx, args, kw) {
    const [x] = params('isqrt', args, kw, ['n']);
    const n = bigInt(x, 'isqrt');
    if (n < 0n) throw err('mathDomain', {});
    return normBig(isqrtBig(n));
  },
  'math.gcd'(ctx, args, kw) {
    noKw('gcd', kw);
    let g = 0n;
    for (const a of args) { let x = bigInt(a, 'gcd'); if (x < 0n) x = -x; while (x) [g, x] = [x, g % x]; }
    return normBig(g);
  },
  'math.lcm'(ctx, args, kw) {
    noKw('lcm', kw);
    let l = 1n;
    for (const a of args) {
      let x = bigInt(a, 'lcm'); if (x < 0n) x = -x;
      if (x === 0n) return 0;
      let g = l, y = x;
      while (y) [g, y] = [y, g % y];
      l = (l / g) * x;
    }
    return normBig(l);
  },
  'math.factorial'(ctx, args, kw) {
    const [x] = params('factorial', args, kw, ['n']);
    const n = bigInt(x, 'factorial');
    if (n < 0n) throw err('value', { what: 'factorialNegative' });
    if (n > 20000n) throw err('overflow', {});
    let r = 1n;
    for (let i = 2n; i <= n; i++) r *= i;
    return normBig(r);
  },
  'math.comb'(ctx, args, kw) {
    const [nn, kk] = params('comb', args, kw, ['n', 'k']);
    const n = bigInt(nn, 'comb'); let k = bigInt(kk, 'comb');
    if (n < 0n || k < 0n) throw err('value', { what: 'combNegative' });
    if (k > n) return 0;
    if (k > n - k) k = n - k;
    let r = 1n;
    for (let i = 1n; i <= k; i++) r = (r * (n - k + i)) / i;
    return normBig(r);
  },
  'math.perm'(ctx, args, kw) {
    const [nn, kk] = params('perm', args, kw, ['n', '?k']);
    const n = bigInt(nn, 'perm');
    const k = kk === undefined || kk === null ? n : bigInt(kk, 'perm');
    if (n < 0n || k < 0n) throw err('value', { what: 'combNegative' });
    if (k > n) return 0;
    let r = 1n;
    for (let i = 0n; i < k; i++) r *= n - i;
    return normBig(r);
  },
  'math.prod'(ctx, args, kw) {
    const [it, start = 1] = params('prod', args, kw, ['iterable', '?start']);
    let acc = start;
    for (const x of iterItems(it)) acc = binary('*', acc, x);
    return acc;
  },
  'math.fsum'(ctx, args, kw) {
    const [it] = params('fsum', args, kw, ['iterable']);
    return new PyFloat(fsum(iterItems(it).map((x) => needNum(x, 'fsum'))));
  },
  'math.isclose'(ctx, args, kw) {
    const rel = kw.rel_tol === undefined ? 1e-9 : needNum(kw.rel_tol, 'rel_tol');
    const abs = kw.abs_tol === undefined ? 0 : needNum(kw.abs_tol, 'abs_tol');
    const rest = { ...kw }; delete rest.rel_tol; delete rest.abs_tol;
    const [a, b] = params('isclose', args, rest, ['a', 'b']);
    const x = needNum(a, 'isclose'), y = needNum(b, 'isclose');
    if (rel < 0 || abs < 0) throw err('value', { what: 'isclose' });
    if (x === y) return true;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const d = Math.abs(y - x);
    return d <= Math.abs(rel * y) || d <= Math.abs(rel * x) || d <= abs;
  },
  'math.isfinite': (ctx, args, kw) => Number.isFinite(needNum(params('isfinite', args, kw, ['x'])[0], 'isfinite')),
  'math.isinf': (ctx, args, kw) => { const v = needNum(params('isinf', args, kw, ['x'])[0], 'isinf'); return v === Infinity || v === -Infinity; },
  'math.isnan': (ctx, args, kw) => Number.isNaN(needNum(params('isnan', args, kw, ['x'])[0], 'isnan')),
  'math.copysign'(ctx, args, kw) {
    const [x, y] = params('copysign', args, kw, ['x', 'y']);
    const a = Math.abs(needNum(x, 'copysign')), b = needNum(y, 'copysign');
    return new PyFloat(b < 0 || Object.is(b, -0) ? -a : a);
  },
  'math.fmod'(ctx, args, kw) {
    const [x, y] = params('fmod', args, kw, ['x', 'y']);
    const a = needNum(x, 'fmod'), b = needNum(y, 'fmod');
    if (b === 0 || !Number.isFinite(a)) { if (!Number.isNaN(a) && !Number.isNaN(b)) throw err('mathDomain', {}); }
    return new PyFloat(a % b);
  },
  'math.modf'(ctx, args, kw) {
    const [x] = params('modf', args, kw, ['x']);
    const v = needNum(x, 'modf');
    if (!Number.isFinite(v)) return new PyTuple([new PyFloat(Number.isNaN(v) ? v : 0), new PyFloat(v)]);
    const whole = Math.trunc(v);
    return new PyTuple([new PyFloat(v - whole), new PyFloat(whole)]);
  },
  'math.ldexp'(ctx, args, kw) {
    const [x, e] = params('ldexp', args, kw, ['x', 'i']);
    return new PyFloat(ldexp(needNum(x, 'ldexp'), needInt(e, 'i')));
  },
};

/** Names a program can take from the module (also for `from math import *`). */
export const MATH_NAMES = [...Object.keys(MATH_NATIVES).map((k) => k.slice(5)), 'pi', 'e', 'tau', 'inf', 'nan'];

export const MATH_CONSTS = { pi: new PyFloat(Math.PI), e: new PyFloat(Math.E), tau: new PyFloat(2 * Math.PI), inf: new PyFloat(Infinity), nan: new PyFloat(NaN) };
export { isNum };
