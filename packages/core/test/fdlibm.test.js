// The fdlibm port must agree bit for bit with the engine's own Math functions (V8 uses fdlibm).
// The reference Math.* calls are allowed here: this file lives in test/, not in src/.

import { describe, it, expect } from 'vitest';
import * as F from '../src/fdlibm.js';

/** Deterministic PRNG. @param {number} a */
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dv = new DataView(new ArrayBuffer(8));
/** Neighbouring doubles of x (bit patterns +-k). @param {number} x @param {number} k */
function nudge(x, k) {
  dv.setFloat64(0, x);
  const big = dv.getBigUint64(0) + BigInt(k);
  dv.setBigUint64(0, BigInt.asUintN(64, big));
  return dv.getFloat64(0);
}

const PI = 3.141592653589793;
const specials = [
  0, -0, NaN, Infinity, -Infinity, 1, -1, 0.5, -0.5, 2, -2, 3, 10, 22, -22, 100, 1e10, 1e22, 1e300,
  Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, -Number.MIN_VALUE, 2.2250738585072014e-308,
  2.225073858507201e-308, 2 ** -27, 2 ** -28, 2 ** -29, 2 ** -54, 2 ** -55, 2 ** -57, 2 ** 53, 2 ** 66, 2 ** 31,
  2 ** 52, 0.3, 0.4375, 0.6744, 0.78125, 0.975, 1.1875, 2.4375, 1.5, 1.4142135623730951, 0.7071067811865476,
  PI / 4, PI / 2, PI, 3 * PI / 2, 2 * PI, 100 * PI, 1e5 * PI, 2 ** 19 * PI / 2, 1e6, 1e9 * PI, 2 ** 1023,
  709.782712893384, 709.7827128933841, 710.4758600739439, 710.475860073944, 709.7822265625, -745.1332191019411,
  -745.1332191019412, -744, 36.04365338911715, 56 * 0.6931471805599453, 2 ** 28, 2 ** 29, 7 / 16, 11 / 16,
  19 / 16, 39 / 16, 0.9999999999999999, 1.0000000000000002, 1.9999999999999998, 2.0000000000000004,
];

/** Specials plus their immediate neighbours. */
function withNeighbours(list) {
  const out = [];
  for (const x of list) {
    out.push(x);
    if (Number.isFinite(x)) for (const k of [1, -1, 2, -2]) out.push(nudge(x, k), -nudge(x, k));
  }
  return out;
}

const rnd = mulberry32(20240607);

function bitsRand() {
  dv.setUint32(0, (rnd() * 4294967296) >>> 0);
  dv.setUint32(4, (rnd() * 4294967296) >>> 0);
  return dv.getFloat64(0);
}

/** A mixed-magnitude input of the given kind (0..9). */
function gen(kind) {
  switch (kind) {
    case 0: return (rnd() - 0.5) * 2;
    case 1: return (rnd() - 0.5) * 20;
    case 2: return (rnd() - 0.5) * 2000;
    case 3: return (rnd() - 0.5) * 1e6;
    case 4: return (rnd() - 0.5) * 1e12;
    case 5: return bitsRand(); // any bit pattern: huge, subnormal, NaN, Infinity
    case 6: return (rnd() - 0.5) * 2 ** Math.floor(rnd() * 2100 - 1074); // all binades
    case 7: return Math.floor((rnd() - 0.5) * 2000) * (PI / 2) + (rnd() - 0.5) * 1e-6; // near multiples of pi/2
    case 8: return (rnd() - 0.5) * 1e-5;
    default: return Math.floor((rnd() - 0.5) * 200) / 4; // exact quarters
  }
}

const N = 3000;
const unary = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'exp', 'expm1', 'log', 'log1p', 'log2', 'log10',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'cbrt'];

/** Domain-specific extra inputs. @param {string} name @param {number} i */
function extra(name, i) {
  const u = rnd();
  switch (name) {
    case 'asin': case 'acos': case 'atanh': case 'log1p': return (rnd() - 0.5) * 2.2;
    case 'acosh': return 1 + u * 10 ** (rnd() * 12 - 6);
    case 'log': case 'log2': case 'log10': return Math.abs(gen(i % 10));
    case 'exp': case 'expm1': return (rnd() - 0.5) * 1500;
    case 'sinh': case 'cosh': case 'tanh': return (rnd() - 0.5) * 60;
    default: return gen(i % 10);
  }
}

/** Collect mismatches (at most a few) between ours and the reference. */
function check1(name) {
  const ours = F[name];
  const ref = Math[name];
  const bad = [];
  const test = (x) => {
    const a = ours(x);
    const b = ref(x);
    if (!Object.is(a, b) && bad.length < 5) bad.push([x, a, b]);
  };
  for (const x of withNeighbours(specials)) test(x);
  for (let i = 0; i < N; i++) {
    test(gen(i % 10));
    test(extra(name, i));
  }
  return bad;
}

describe('fdlibm matches the engine bit for bit', () => {
  for (const name of unary) {
    it(name, () => {
      expect(check1(name)).toEqual([]);
    });
  }

  it('atan2', () => {
    const bad = [];
    const test = (y, x) => {
      const a = F.atan2(y, x);
      const b = Math.atan2(y, x);
      if (!Object.is(a, b) && bad.length < 5) bad.push([y, x, a, b]);
    };
    const sp = specials.slice(0, 30);
    for (const y of sp) for (const x of sp) test(y, x);
    for (let i = 0; i < N * 2; i++) {
      test(gen(i % 10), gen((i * 7 + 3) % 10));
      test((rnd() - 0.5) * 10, (rnd() - 0.5) * 10);
      test(rnd() * 1e-300, rnd() * 1e300);
    }
    expect(bad).toEqual([]);
  });

  it('pow', () => {
    const bad = [];
    const test = (x, y) => {
      const a = F.pow(x, y);
      const b = Math.pow(x, y);
      if (!Object.is(a, b) && bad.length < 5) bad.push([x, y, a, b]);
    };
    // all special values against each other (includes +-0, +-1, +-Infinity, NaN, odd/even integers)
    const sp = [...specials, 4, -3, 5, 7, 0.25, -2.5, 1e-300, 1074, -1074, 1024, -1075, 2 ** 31, 2 ** 31 + 1, 2 ** 64];
    for (const x of sp) for (const y of sp) test(x, y);
    for (const x of [0.99999999, 1.00000001, -0.99999999, -1.00000001, 1 - 2 ** -52, 1 + 2 ** -52]) {
      for (const y of [2 ** 31, 2 ** 32, 2 ** 40 + 1, 2 ** 62, -(2 ** 31) - 2, 2 ** 64, 2 ** 65, -(2 ** 64) - 4096]) test(x, y);
    }
    for (let i = 0; i < N * 4; i++) {
      const k = i % 10;
      let x = gen(k);
      let y = gen((i * 7 + 3) % 10);
      if (i % 3 === 0) y = Math.round(y) % 200; // integer exponents (negative bases)
      if (i % 5 === 0) x = Math.abs(x);
      if (i % 11 === 0) y /= 2;
      if (i % 13 === 0) { x = rnd() * 4; y = (rnd() - 0.5) * 40; } // typical use
      if (i % 17 === 0) { x = rnd() * 1e-300; y = rnd() * 3; } // subnormal results
      test(x, y);
    }
    expect(bad).toEqual([]);
  });

  it('keeps the spots people notice', () => {
    expect(F.exp(1)).toBe(Math.E);
    expect(F.pow(10, 308)).toBe(1e308);
    expect(F.pow(2, 0.5)).toBe(Math.SQRT2);
    expect(F.pow(1, Infinity)).toBeNaN();
    expect(F.pow(-8, 1 / 3)).toBeNaN();
    expect(Object.is(F.pow(-0, 3), -0)).toBe(true);
    expect(F.log10(1000)).toBe(3);
    expect(F.log2(8)).toBe(3);
    expect(Object.is(F.sin(-0), -0)).toBe(true);
    expect(F.sin(1e22)).toBe(Math.sin(1e22));
    expect(F.cos(Number.MAX_VALUE)).toBe(Math.cos(Number.MAX_VALUE));
    expect(F.sin(Infinity)).toBeNaN();
    expect(F.acosh(0.5)).toBeNaN();
    expect(F.atanh(1)).toBe(Infinity);
    expect(F.log(0)).toBe(-Infinity);
    expect(F.exp(-Infinity)).toBe(0);
    expect(F.expm1(-Infinity)).toBe(-1);
  });
});
