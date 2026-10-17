// Correctly rounded elementary functions in pure, deterministic JavaScript.
//
// Goal: print the same digits as CPython on Linux. The glibc libm returns the correctly rounded
// result for nearly all arguments (error < ~0.52 ULP), whereas fdlibm (fdlibm.js) is off by up to
// almost 1 ULP. Here every function is evaluated in fixed-point BigInt arithmetic with far more
// than 53 bits and rounded to Float64 once (Ziv's strategy: if the rounding of the result is not
// yet decided by the computed error bound, the working precision is raised and the evaluation is
// repeated). The results are therefore correctly rounded (round to nearest, ties to even).
//
// Only +, -, *, /, comparisons, Math.sqrt/floor/abs/max/min/clz32, BigInt, DataView and a few
// fdlibm.js calls (as *seeds* for the inverse functions and magnitude estimates; the final result
// never depends on the seed) are used, so every engine yields the same bits.
//
// Exports (same names and signatures as fdlibm.js): sin cos tan asin acos atan atan2 exp expm1
//          log log1p log2 log10 sinh cosh tanh asinh acosh atanh pow
//
// Special values follow C99 Annex F (e.g. pow(1, NaN) = 1, pow(-1, +-Infinity) = 1).

import * as F from './fdlibm.js';

// ---------------------------------------------------------------------------------------------
// Bit access

const dv = new DataView(new ArrayBuffer(8));

/** Bit length of a non-negative Number below 2^53. @param {number} m */
function bitLenNum(m) {
  if (m >= 4294967296) return 64 - Math.clz32(Math.floor(m / 4294967296));
  return 32 - Math.clz32(m);
}

/**
 * Splits the magnitude of a finite double into integer mantissa and exponent: |x| = m * 2^e.
 * @param {number} x
 * @returns {[bigint, number, number]} mantissa, exponent of its last bit, bit length of the mantissa
 */
function decomp(x) {
  dv.setFloat64(0, x);
  const hi = dv.getUint32(0) & 0x7fffffff;
  const lo = dv.getUint32(4);
  const ex = hi >>> 20;
  const m = (hi & 0xfffff) * 4294967296 + lo;
  if (ex === 0) return [BigInt(m), -1074, bitLenNum(m)];
  return [BigInt(m + 4503599627370496), ex - 1075, 53];
}

/** 2^e as a Number, for -1074 <= e <= 1023. @param {number} e */
function pow2(e) {
  if (e >= -1022) {
    dv.setUint32(0, (e + 1023) << 20);
    dv.setUint32(4, 0);
  } else {
    const b = e + 1074;
    dv.setUint32(0, b >= 32 ? 1 << (b - 32) : 0);
    dv.setUint32(4, b >= 32 ? 0 : (1 << b) >>> 0);
  }
  return dv.getFloat64(0);
}

/** Bit length of a positive BigInt. @param {bigint} a */
function bitLen(a) {
  const s = a.toString(16);
  const c = s.charCodeAt(0);
  return (s.length - 1) * 4 + 32 - Math.clz32(c <= 57 ? c - 48 : c - 87);
}

/** @param {bigint} a */
function babs(a) {
  return a < 0n ? -a : a;
}

/**
 * Rounds m * 2^-sh to the nearest double (ties to even), including subnormals and overflow.
 * @param {bigint} m
 * @param {number} sh
 * @returns {number}
 */
function toDouble(m, sh) {
  if (m === 0n) return 0;
  const neg = m < 0n;
  if (neg) m = -m;
  const e = bitLen(m) - sh; // 2^(e-1) <= value < 2^e
  if (e > 1024) return neg ? -Infinity : Infinity;
  if (e <= -1075) return neg ? -0 : 0;
  const lsb = e - 53 > -1074 ? e - 53 : -1074; // exponent of the last kept bit
  const s = lsb + sh; // number of low bits of m that are dropped
  let q;
  if (s <= 0) {
    q = m << BigInt(-s);
  } else {
    const sb = BigInt(s);
    q = m >> sb;
    const rem = m & ((1n << sb) - 1n);
    const half = 1n << (sb - 1n);
    if (rem > half || (rem === half && (q & 1n) === 1n)) q += 1n;
  }
  const r = Number(q) * pow2(lsb);
  return neg ? -r : r;
}

// ---------------------------------------------------------------------------------------------
// Fixed-point contexts. A value v is stored as the BigInt v * 2^p.

/**
 * @typedef {object} Ctx
 * @property {number} p
 * @property {bigint} pb
 * @property {bigint} ONE
 * @property {bigint|null} ln2
 * @property {bigint|null} ln10
 * @property {bigint[]|null} lc
 */

/** @type {Map<number, Ctx>} */
const ctxCache = new Map();

/** @param {number} p */
function getCtx(p) {
  let c = ctxCache.get(p);
  if (!c) {
    c = { p, pb: BigInt(p), ONE: 1n << BigInt(p), ln2: null, ln10: null, lc: null };
    ctxCache.set(p, c);
  }
  return c;
}

/** 2 * sum_{k odd} base^-k / k (= ln((base+1)/(base-1))), scaled by 2^g. @param {bigint} base @param {number} g */
function lnSeries(base, g) {
  const scale = 1n << BigInt(g);
  let term = (2n * scale) / base;
  const b2 = base * base;
  let sum = 0n;
  for (let k = 1n; term !== 0n; k += 2n) {
    sum += term / k;
    term /= b2;
  }
  return sum;
}

/** @param {Ctx} c */
function ensureLn(c) {
  const g = c.p + 32;
  const l2 = lnSeries(3n, g);
  c.ln2 = l2 >> 32n;
  c.ln10 = (3n * l2 + lnSeries(9n, g)) >> 32n;
}

/** @param {Ctx} c */
function ln2Of(c) {
  if (c.ln2 === null) ensureLn(c);
  return /** @type {bigint} */ (c.ln2);
}

/** @param {Ctx} c */
function ln10Of(c) {
  if (c.ln10 === null) ensureLn(c);
  return /** @type {bigint} */ (c.ln10);
}

/** ln(j/64) for j = 64..128, scaled by 2^p. @param {Ctx} c @param {number} j */
function logTab(c, j) {
  if (c.lc === null) c.lc = [];
  const i = j - 64;
  let v = c.lc[i];
  if (v === undefined) {
    if (i === 0) v = 0n;
    else {
      const g = BigInt(c.p + 32);
      const s = (BigInt(j - 64) << g) / BigInt(j + 64);
      const s2 = (s * s) >> g;
      let t = s;
      let sum = s;
      for (let k = 3n; t !== 0n; k += 2n) {
        t = (t * s2) >> g;
        sum += t / k;
      }
      v = (2n * sum) >> 32n;
    }
    c.lc[i] = v;
  }
  return v;
}

// pi/2 with `bits` fractional bits (global cache, grown on demand).
let piBits = 0;
let piVal = 0n;

/** @param {bigint} n @param {number} g scaled arctan(1/n) */
function atanInv(n, g) {
  const scale = 1n << BigInt(g);
  let term = scale / n;
  const n2 = n * n;
  let sum = term;
  let neg = true;
  for (let k = 3n; ; k += 2n) {
    term /= n2;
    if (term === 0n) break;
    sum += neg ? -(term / k) : term / k;
    neg = !neg;
  }
  return sum;
}

/** pi/2 scaled by 2^bits. @param {number} bits */
function piHalf(bits) {
  if (bits > piBits) {
    const nb = Math.max(512, Math.floor((bits + 255) / 256) * 256);
    const g = nb + 32;
    // Machin: pi = 16 atan(1/5) - 4 atan(1/239); pi/2 = 8 atan(1/5) - 2 atan(1/239)
    piVal = (8n * atanInv(5n, g) - 2n * atanInv(239n, g)) >> 32n;
    piBits = nb;
  }
  return piVal >> BigInt(piBits - bits);
}

/** @param {bigint} n integer square root (floor) of a positive BigInt */
function isqrt(n) {
  const bl = bitLen(n);
  if (bl <= 100) {
    let g = BigInt(Math.floor(Math.sqrt(Number(n))));
    while (g * g > n) g -= 1n;
    while ((g + 1n) * (g + 1n) <= n) g += 1n;
    return g;
  }
  const s = (bl - 100) & ~1;
  let g = BigInt(Math.floor(Math.sqrt(Number(n >> BigInt(s))))) << BigInt(s >> 1);
  for (let i = 0; i < 64; i++) {
    const ng = (g + n / g) >> 1n;
    const d = ng - g;
    g = ng;
    if (d <= 1n && d >= -1n) break;
  }
  while (g * g > n) g -= 1n;
  while ((g + 1n) * (g + 1n) <= n) g += 1n;
  return g;
}

/** Double -> fixed point (truncated toward zero). @param {number} x @param {number} p */
function fx(x, p) {
  const [m, e] = decomp(x);
  const s = e + p;
  const v = s >= 0 ? m << BigInt(s) : m >> BigInt(-s);
  return x < 0 ? -v : v;
}

// ---------------------------------------------------------------------------------------------
// Fixed-point kernels

/** ln(Fm * 2^E2) for Fm > 0. @param {bigint} Fm @param {number} E2 @param {Ctx} c */
function logParts(Fm, E2, c) {
  const { p, pb } = c;
  const n = bitLen(Fm);
  const f = n - 1 <= p ? Fm << BigInt(p - (n - 1)) : Fm >> BigInt(n - 1 - p); // in [1, 2)
  const e = n - 1 + E2;
  const fl = Number(f >> BigInt(p - 7)); // 128..255
  const j = (fl + 1) >> 1; // 64..128
  const cc = BigInt(j) << BigInt(p - 6);
  const s = ((f - cc) << pb) / (f + cc);
  const s2 = (s * s) >> pb;
  let t = s;
  let sum = s;
  for (let k = 3n; ; k += 2n) {
    t = (t * s2) >> pb;
    if (t === 0n) break;
    sum += t / k;
  }
  return BigInt(e) * ln2Of(c) + logTab(c, j) + 2n * sum;
}

/**
 * exp(X) = 2^k * (1 + u) with |u| < 0.5. X scaled by 2^p, |X| < 2^11.
 * @param {bigint} X @param {Ctx} c
 * @returns {[bigint, number]}
 */
function expParts(X, c) {
  const { p, pb } = c;
  const xd = Number(X >> BigInt(p - 30)) / 1073741824;
  const k = Math.floor(xd * 1.4426950408889634 + 0.5);
  const r = (X - BigInt(k) * ln2Of(c)) >> 8n;
  let t = r;
  let u = r;
  for (let n = 2n; t !== 0n; n += 1n) {
    t = ((t * r) >> pb) / n;
    u += t;
  }
  for (let i = 0; i < 8; i++) u = (u << 1n) + ((u * u) >> pb);
  return [u, k];
}

/** exp(X) - 1 from expParts. @param {bigint} u @param {number} k @param {Ctx} c */
function expm1From(u, k, c) {
  if (k === 0) return u;
  const e1 = c.ONE + u;
  return (k > 0 ? e1 << BigInt(k) : e1 >> BigInt(-k)) - c.ONE;
}

/** sin(r) for |r| <= ~0.8. @param {bigint} r @param {Ctx} c */
function sinFx(r, c) {
  const pb = c.pb;
  const r2 = (r * r) >> pb;
  let t = r;
  let sum = r;
  for (let k = 2; t !== 0n; k += 2) {
    t = -((t * r2) >> pb) / BigInt(k * (k + 1));
    sum += t;
  }
  return sum;
}

/** cos(r) for |r| <= ~0.8. @param {bigint} r @param {Ctx} c */
function cosFx(r, c) {
  const pb = c.pb;
  const r2 = (r * r) >> pb;
  let t = c.ONE;
  let sum = t;
  for (let k = 2; t !== 0n; k += 2) {
    t = -((t * r2) >> pb) / BigInt((k - 1) * k);
    sum += t;
  }
  return sum;
}

/**
 * Reduces m * 2^e >= 0 modulo pi/2: returns r (|r| <= pi/4, scaled by 2^p) and the quadrant.
 * @param {bigint} m @param {number} e @param {Ctx} c
 * @returns {[bigint, number]}
 */
function reduceTrig(m, e, c) {
  const p = c.p;
  const Q = p + 64 + (e + 53 > 0 ? e + 53 : 0);
  const H = piHalf(Q);
  const Xq = e + Q >= 0 ? m << BigInt(e + Q) : m >> BigInt(-(e + Q));
  const k = (2n * Xq + H) / (2n * H);
  const r = Xq - k * H;
  return [r >> BigInt(Q - p), Number(k & 3n)];
}

/** sin and cos of a fixed-point angle |Y| <= 4. @param {bigint} Y @param {Ctx} c @returns {[bigint, bigint]} */
function sincosFx(Y, c) {
  const [r, q] = reduceTrig(babs(Y), -c.p, c);
  const s = sinFx(r, c);
  const co = cosFx(r, c);
  let sn;
  let cs;
  if (q === 0) { sn = s; cs = co; }
  else if (q === 1) { sn = co; cs = -s; }
  else if (q === 2) { sn = -s; cs = -co; }
  else { sn = -co; cs = s; }
  return [Y < 0n ? -sn : sn, cs];
}

/** atan of a small fixed-point value (|d| < 1). @param {bigint} d @param {Ctx} c */
function atanFx(d, c) {
  const pb = c.pb;
  const d2 = (d * d) >> pb;
  let t = d;
  let sum = d;
  for (let k = 3n; ; k += 2n) {
    t = -((t * d2) >> pb);
    const term = t / k;
    if (term === 0n) break;
    sum += term;
  }
  return sum;
}

/**
 * Given the angle theta with (cos, sin) proportional to (C, S) and a seed angle y0 (double),
 * returns theta as fixed point: y0 + atan((S cos y0 - C sin y0) / (C cos y0 + S sin y0)).
 * @param {Ctx} c @param {number} y0 @param {bigint} C @param {bigint} S
 */
function refineAngle(c, y0, C, S) {
  const { p, pb } = c;
  const Y0 = fx(y0, p);
  const [s, co] = sincosFx(Y0, c);
  const num = ((S * co) >> pb) - ((C * s) >> pb);
  const den = ((C * co) >> pb) + ((S * s) >> pb);
  return Y0 + atanFx((num << pb) / den, c);
}

// ---------------------------------------------------------------------------------------------
// Ziv driver

/** @typedef {[bigint, number, number]} Res value = R * 2^-sh, error bound 2^eb units of R */

/**
 * Evaluates `core` with growing precision until the rounding to double is decided.
 * @param {(c: Ctx, a: number, b: number) => Res} core
 * @param {number} a
 * @param {number} b
 */
function ziv(core, a, b) {
  let p = 192;
  /** @type {Res} */
  let res = [0n, 0, 0];
  for (let it = 0; it < 12; it++) {
    res = core(getCtx(p), a, b);
    const R = res[0];
    const E = 1n << BigInt(res[2]);
    const lo = toDouble(R - E, res[1]);
    if (lo === toDouble(R + E, res[1])) return lo;
    const sig = R === 0n ? 0 : bitLen(babs(R));
    const deficit = 53 + res[2] + 48 - sig;
    p += Math.max((deficit > 0 ? deficit : 0) + 64, p >> 1);
    p = Math.floor((p + 63) / 64) * 64;
    if (p > 6000) break;
  }
  return toDouble(res[0], res[1]);
}

const PI = 3.141592653589793;
const PI_2 = 1.5707963267948966;
const PI_4 = 0.7853981633974483;
const PI_3_4 = 2.356194490192345;
const TINY30 = 9.313225746154785e-10; // 2^-30
const TINY28 = 3.725290298461914e-9; // 2^-28
const TINY55 = 2.7755575615628914e-17; // 2^-55
const TINY60 = 8.673617379884035e-19; // 2^-60
const BIG100 = 1.2676506002282294e30; // 2^100

// ---------------------------------------------------------------------------------------------
// Exponential and logarithms

/** @type {(c: Ctx, x: number) => Res} */
function expCore(c, x) {
  const [u, k] = expParts(fx(x, c.p), c);
  return [c.ONE + u, c.p - k, 24];
}

/** e^x. @param {number} x */
export function exp(x) {
  if (x !== x) return x;
  if (x === Infinity) return x;
  if (x === -Infinity) return 0;
  if (x > 710) return Infinity;
  if (x < -746) return 0;
  if (x < TINY55 && x > -TINY55) return 1;
  return ziv(expCore, x, 0);
}

/** @type {(c: Ctx, x: number) => Res} */
function expm1Core(c, x) {
  const [u, k] = expParts(fx(x, c.p), c);
  return [expm1From(u, k, c), c.p, 24];
}

/** e^x - 1. @param {number} x */
export function expm1(x) {
  if (x !== x) return x;
  if (x === Infinity) return x;
  if (x === -Infinity) return -1;
  if (x > 710) return Infinity;
  if (x < -40) return -1;
  if (x < TINY60 && x > -TINY60) return x;
  return ziv(expm1Core, x, 0);
}

/** @type {(c: Ctx, x: number) => Res} */
function logCore(c, x) {
  const [m, e] = decomp(x);
  return [logParts(m, e, c), c.p, 24];
}

/** @param {number} x natural logarithm */
export function log(x) {
  if (x !== x) return x;
  if (x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return x;
  if (x === 1) return 0;
  return ziv(logCore, x, 0);
}

/** @type {(c: Ctx, x: number) => Res} */
function log2Core(c, x) {
  const [m, e] = decomp(x);
  return [(logParts(m, e, c) << c.pb) / ln2Of(c), c.p, 24];
}

/** Base-2 logarithm. @param {number} x */
export function log2(x) {
  if (x !== x) return x;
  if (x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return x;
  if (x === 1) return 0;
  const [m, e, n] = decomp(x);
  if ((m & (m - 1n)) === 0n) return n - 1 + e; // power of two
  return ziv(log2Core, x, 0);
}

/** @type {(c: Ctx, x: number) => Res} */
function log10Core(c, x) {
  const [m, e] = decomp(x);
  return [(logParts(m, e, c) << c.pb) / ln10Of(c), c.p, 24];
}

/** Base-10 logarithm. @param {number} x */
export function log10(x) {
  if (x !== x) return x;
  if (x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return x;
  if (x === 1) return 0;
  return ziv(log10Core, x, 0);
}

/** @type {(c: Ctx, x: number) => Res} */
function log1pCore(c, x) {
  const [m, e] = decomp(x);
  let Fm;
  let E2 = 0;
  if (x > 0) {
    if (e >= 0) Fm = 1n + (m << BigInt(e));
    else { Fm = (1n << BigInt(-e)) + m; E2 = e; }
  } else if (e >= 0) {
    Fm = 1n - (m << BigInt(e)); // unreachable for -1 < x < 0 unless m is tiny; kept for safety
  } else {
    Fm = (1n << BigInt(-e)) - m;
    E2 = e;
  }
  return [logParts(Fm, E2, c), c.p, 24];
}

/** ln(1 + x). @param {number} x */
export function log1p(x) {
  if (x !== x) return x;
  if (x < -1) return NaN;
  if (x === -1) return -Infinity;
  if (x === Infinity) return x;
  if (x < TINY60 && x > -TINY60) return x;
  return ziv(log1pCore, x, 0);
}

// ---------------------------------------------------------------------------------------------
// Hyperbolic functions

/** @type {(c: Ctx, x: number) => Res} */
function sinhCore(c, x) {
  const [u, k] = expParts(fx(x, c.p), c);
  const uu = expm1From(u, k, c);
  return [(uu + (uu << c.pb) / (c.ONE + uu)) >> 1n, c.p, 24];
}

/** Hyperbolic sine. @param {number} x */
export function sinh(x) {
  if (x !== x || x === Infinity || x === -Infinity || x === 0) return x;
  const a = x < 0 ? -x : x;
  if (a < TINY30) return x;
  if (a > 711) return x < 0 ? -Infinity : Infinity;
  const r = ziv(sinhCore, a, 0);
  return x < 0 ? -r : r;
}

/** @type {(c: Ctx, x: number) => Res} */
function coshCore(c, x) {
  const [u, k] = expParts(fx(x, c.p), c);
  const e1 = c.ONE + expm1From(u, k, c);
  return [(e1 + (c.ONE << c.pb) / e1) >> 1n, c.p, 24];
}

/** Hyperbolic cosine. @param {number} x */
export function cosh(x) {
  if (x !== x) return x;
  const a = x < 0 ? -x : x;
  if (a === Infinity || a > 711) return Infinity;
  if (a < TINY28) return 1;
  return ziv(coshCore, a, 0);
}

/** @type {(c: Ctx, x: number) => Res} */
function tanhCore(c, x) {
  const [u, k] = expParts(fx(x + x, c.p), c);
  const u2 = expm1From(u, k, c);
  return [(u2 << c.pb) / (u2 + 2n * c.ONE), c.p, 24];
}

/** Hyperbolic tangent. @param {number} x */
export function tanh(x) {
  if (x !== x || x === 0) return x;
  const a = x < 0 ? -x : x;
  if (a < TINY30) return x;
  if (a >= 20) return x < 0 ? -1 : 1;
  const r = ziv(tanhCore, a, 0);
  return x < 0 ? -r : r;
}

/** @type {(c: Ctx, x: number) => Res} */
function asinhCore(c, x) {
  const { p, pb, ONE } = c;
  if (x >= BIG100) {
    const [m, e] = decomp(x);
    return [logParts(m, e, c) + ln2Of(c), p, 24];
  }
  const X = fx(x, p);
  const S = isqrt(X * X + ONE * ONE);
  return [logParts(X + S, -p, c), p, 24];
}

/** Inverse hyperbolic sine. @param {number} x */
export function asinh(x) {
  if (x !== x || x === Infinity || x === -Infinity || x === 0) return x;
  const a = x < 0 ? -x : x;
  if (a < TINY30) return x;
  const r = ziv(asinhCore, a, 0);
  return x < 0 ? -r : r;
}

/** @type {(c: Ctx, x: number) => Res} */
function acoshCore(c, x) {
  const { p, ONE } = c;
  if (x >= BIG100) {
    const [m, e] = decomp(x);
    return [logParts(m, e, c) + ln2Of(c), p, 24];
  }
  const X = fx(x, p);
  const S = isqrt(X * X - ONE * ONE);
  return [logParts(X + S, -p, c), p, 24];
}

/** Inverse hyperbolic cosine. @param {number} x */
export function acosh(x) {
  if (x !== x) return x;
  if (x < 1) return NaN;
  if (x === 1) return 0;
  if (x === Infinity) return x;
  return ziv(acoshCore, x, 0);
}

/** @type {(c: Ctx, x: number) => Res} */
function atanhCore(c, x) {
  const { p, pb, ONE } = c;
  const X = fx(x, p);
  const ratio = ((ONE + X) << pb) / (ONE - X);
  return [logParts(ratio, -p, c) >> 1n, p, 24];
}

/** Inverse hyperbolic tangent. @param {number} x */
export function atanh(x) {
  if (x !== x || x === 0) return x;
  const a = x < 0 ? -x : x;
  if (a > 1) return NaN;
  if (a === 1) return x < 0 ? -Infinity : Infinity;
  if (a < TINY30) return x;
  const r = ziv(atanhCore, a, 0);
  return x < 0 ? -r : r;
}

// ---------------------------------------------------------------------------------------------
// Trigonometric functions

/** @type {(c: Ctx, x: number) => Res} */
function sinCore(c, x) {
  const [m, e] = decomp(x);
  const [r, q] = reduceTrig(m, e, c);
  const R = q === 0 ? sinFx(r, c) : q === 1 ? cosFx(r, c) : q === 2 ? -sinFx(r, c) : -cosFx(r, c);
  return [R, c.p, 24];
}

/** Sine. @param {number} x */
export function sin(x) {
  if (x !== x || x === Infinity || x === -Infinity || x === 0) return x - x === 0 ? x : NaN;
  const a = x < 0 ? -x : x;
  if (a < TINY30) return x;
  const r = ziv(sinCore, a, 0);
  return x < 0 ? -r : r;
}

/** @type {(c: Ctx, x: number) => Res} */
function cosCore(c, x) {
  const [m, e] = decomp(x);
  const [r, q] = reduceTrig(m, e, c);
  const R = q === 0 ? cosFx(r, c) : q === 1 ? -sinFx(r, c) : q === 2 ? -cosFx(r, c) : sinFx(r, c);
  return [R, c.p, 24];
}

/** Cosine. @param {number} x */
export function cos(x) {
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  const a = x < 0 ? -x : x;
  if (a < TINY28) return 1;
  return ziv(cosCore, a, 0);
}

/** @type {(c: Ctx, x: number) => Res} */
function tanCore(c, x) {
  const [m, e] = decomp(x);
  const [r, q] = reduceTrig(m, e, c);
  const s = sinFx(r, c);
  const co = cosFx(r, c);
  const num = (q & 1) === 0 ? s : -co;
  const den = (q & 1) === 0 ? co : s;
  const R = (num << c.pb) / den;
  const eb = bitLen(babs(R)) + 8 - bitLen(babs(den));
  return [R, c.p, eb > 24 ? eb : 24];
}

/** Tangent. @param {number} x */
export function tan(x) {
  if (x !== x || x === Infinity || x === -Infinity || x === 0) return x - x === 0 ? x : NaN;
  const a = x < 0 ? -x : x;
  if (a < TINY30) return x;
  const r = ziv(tanCore, a, 0);
  return x < 0 ? -r : r;
}

/** @type {(c: Ctx, x: number) => Res} */
function asinCore(c, x) {
  const { p, ONE } = c;
  const X = fx(x, p);
  const w = isqrt(ONE * ONE - X * X);
  return [refineAngle(c, F.asin(x), w, X), p, 24];
}

/** Inverse sine. @param {number} x */
export function asin(x) {
  if (x !== x || x === 0) return x;
  const a = x < 0 ? -x : x;
  if (a > 1) return NaN;
  if (a === 1) return x < 0 ? -PI_2 : PI_2;
  if (a < TINY30) return x;
  const r = ziv(asinCore, a, 0);
  return x < 0 ? -r : r;
}

/** @type {(c: Ctx, x: number) => Res} */
function acosCore(c, x) {
  const { p, ONE } = c;
  const X = fx(x, p);
  const w = isqrt(ONE * ONE - X * X);
  return [refineAngle(c, F.acos(x), X, w), p, 24];
}

/** Inverse cosine. @param {number} x */
export function acos(x) {
  if (x !== x) return x;
  if (x > 1 || x < -1) return NaN;
  if (x === 1) return 0;
  if (x === -1) return PI;
  return ziv(acosCore, x, 0);
}

/** @type {(c: Ctx, x: number) => Res} */
function atanCore(c, x) {
  return [refineAngle(c, F.atan(x), c.ONE, fx(x, c.p)), c.p, 24];
}

/** Inverse tangent. @param {number} x */
export function atan(x) {
  if (x !== x || x === 0) return x;
  if (x === Infinity) return PI_2;
  if (x === -Infinity) return -PI_2;
  const a = x < 0 ? -x : x;
  if (a < TINY30) return x;
  const r = ziv(atanCore, a, 0);
  return x < 0 ? -r : r;
}

/** @type {(c: Ctx, y: number, x: number) => Res} */
function atan2Core(c, y, x) {
  const { p } = c;
  const [ym, ye, yn] = decomp(y);
  const [xm, xe, xn] = decomp(x);
  const s0 = ye + yn > xe + xn ? ye + yn : xe + xn; // max coordinate is in [2^(s0-1), 2^s0)
  const sc = (/** @type {bigint} */ m, /** @type {number} */ e, /** @type {number} */ neg) => {
    const s = e - s0 + p;
    const v = s >= 0 ? m << BigInt(s) : m >> BigInt(-s);
    return neg ? -v : v;
  };
  const Y = sc(ym, ye, y < 0);
  const X = sc(xm, xe, x < 0);
  return [refineAngle(c, F.atan2(y, x), X, Y), p, 24];
}

/** Angle of the point (x, y). @param {number} y @param {number} x */
export function atan2(y, x) {
  if (x !== x || y !== y) return NaN;
  const yneg = y < 0 || (y === 0 && 1 / y < 0);
  const xneg = x < 0 || (x === 0 && 1 / x < 0);
  if (y === 0) {
    if (xneg) return yneg ? -PI : PI;
    return y;
  }
  if (x === 0) return yneg ? -PI_2 : PI_2;
  if (x === Infinity) {
    if (y === Infinity) return PI_4;
    if (y === -Infinity) return -PI_4;
    return yneg ? -0 : 0;
  }
  if (x === -Infinity) {
    if (y === Infinity) return PI_3_4;
    if (y === -Infinity) return -PI_3_4;
    return yneg ? -PI : PI;
  }
  if (y === Infinity) return PI_2;
  if (y === -Infinity) return -PI_2;
  return ziv(atan2Core, y, x);
}

// ---------------------------------------------------------------------------------------------
// Power

/** @type {(c: Ctx, x: number, y: number) => Res} */
function powCore(c, x, y) {
  const [xm, xe] = decomp(x);
  const [ym, ye, yn] = decomp(y);
  let Z = logParts(xm, xe, c) * ym;
  Z = ye >= 0 ? Z << BigInt(ye) : Z >> BigInt(-ye);
  if (y < 0) Z = -Z;
  const [u, k] = expParts(Z, c);
  const top = ye + yn;
  return [c.ONE + u, c.p - k, 24 + (top > 0 ? top : 0)];
}

/** x to the power y. @param {number} x @param {number} y */
export function pow(x, y) {
  if (y === 0) return 1;
  if (x === 1) return 1;
  if (x !== x || y !== y) return NaN;
  const yInt = y !== Infinity && y !== -Infinity && Math.floor(y) === y;
  const yOdd = yInt && (y < 9007199254740992 && y > -9007199254740992) && y - 2 * Math.floor(y / 2) !== 0;
  if (y === Infinity || y === -Infinity) {
    const a = x < 0 ? -x : x;
    if (a === 1) return 1;
    return a > 1 === y > 0 ? Infinity : 0;
  }
  if (x === 0) {
    if (y < 0) return yOdd ? 1 / x : Infinity;
    return yOdd ? x : 0;
  }
  if (x === Infinity) return y < 0 ? 0 : Infinity;
  if (x === -Infinity) {
    if (y < 0) return yOdd ? -0 : 0;
    return yOdd ? -Infinity : Infinity;
  }
  let neg = false;
  let ax = x;
  if (x < 0) {
    if (!yInt) return NaN;
    neg = yOdd;
    ax = -x;
  }
  let r;
  if (y === 1) r = ax;
  else if (y === -1) r = 1 / ax;
  else if (y === 2) r = ax * ax;
  else if (y === 0.5) r = Math.sqrt(ax);
  else if (yInt && y > 2 && y <= 64) {
    const [m, e] = decomp(ax);
    r = toDouble(m ** BigInt(y), -e * y);
  } else {
    const zd = y * F.log(ax);
    if (zd > 800) r = Infinity;
    else if (zd < -800) r = 0;
    else r = ziv(powCore, ax, y);
  }
  return neg ? -r : r;
}
