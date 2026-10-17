// libm.js: correctly rounded elementary functions that reproduce CPython's (glibc's) digits.
// The vector file packages/core/test/data/libm-vectors.json is produced by scripts/gen-libm-vectors.py
// (CPython 3.13 on glibc 2.39); Python is not needed to run this test. The reference Math.* calls
// are not used here either.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as L from '../src/libm.js';
import * as F from '../src/fdlibm.js';

const vectors = JSON.parse(readFileSync(new URL('./data/libm-vectors.json', import.meta.url), 'utf8'));

const bits = new DataView(new ArrayBuffer(8));
/** @param {string} hex */
function fromHex(hex) {
  bits.setBigUint64(0, BigInt('0x' + hex));
  return bits.getFloat64(0);
}
/** @param {number} a @param {number} b */
const same = (a, b) => Object.is(a, b) || (a !== a && b !== b);

/** @param {{arity:number,count:number,data:string,exact?:[number,string][]}} e */
function decode(e) {
  const buf = Buffer.from(e.data, 'base64');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const w = e.arity + 1;
  const rows = [];
  for (let i = 0; i < e.count; i++) {
    const r = [];
    for (let k = 0; k < w; k++) r.push(dv.getFloat64((i * w + k) * 8));
    rows.push(r);
  }
  return rows;
}

// Minimum agreement with CPython. The vectors are rich in hard cases (arguments next to multiples
// of pi/2, exact ties of x**2, huge arguments), and glibc itself is not correctly rounded there.
const MIN_RATE = { tan: 0.997, asin: 0.998, pow: 0.997 };
const DEFAULT_MIN = 0.999;

describe('libm vs CPython vectors', () => {
  for (const [name, e] of Object.entries(vectors.fns)) {
    it(name, () => {
      const rows = decode(e);
      const fn = /** @type {(...a: number[]) => number} */ (/** @type {any} */ (L)[name]);
      const ffn = /** @type {(...a: number[]) => number} */ (/** @type {any} */ (F)[name]);
      let ok = 0;
      let okF = 0;
      const firstBad = [];
      for (const r of rows) {
        const args = r.slice(0, e.arity);
        const want = r[e.arity];
        if (same(fn(...args), want)) ok++;
        else if (firstBad.length < 3) firstBad.push(args);
        if (same(ffn(...args), want)) okF++;
      }
      const rate = ok / rows.length;
      expect(rate, `${name} agrees with CPython in ${(100 * rate).toFixed(3)} % (fdlibm: ${(100 * okF / rows.length).toFixed(3)} %), e.g. ${firstBad.join(' | ')}`).toBeGreaterThanOrEqual(MIN_RATE[/** @type {'pow'} */ (name)] ?? DEFAULT_MIN);
      expect(ok).toBeGreaterThanOrEqual(okF);
    });

    if (e.exact) {
      it(`${name}: exact variant is correctly rounded`, () => {
        const rows = decode(e);
        const fn = /** @type {(...a: number[]) => number} */ (/** @type {any} */ (L.exact)[name]);
        const over = new Map(e.exact?.map(([i, h]) => [i, fromHex(h)]));
        const bad = [];
        rows.forEach((r, i) => {
          const args = r.slice(0, e.arity);
          const want = over.has(i) ? /** @type {number} */ (over.get(i)) : r[e.arity];
          if (!same(fn(...args), want)) bad.push(`${args.join(',')} -> ${fn(...args)} (want ${want})`);
        });
        expect(bad.slice(0, 5)).toEqual([]);
      });
    }
  }
});

describe('libm known values', () => {
  it('rounds correctly where fdlibm is off by one ulp', () => {
    expect(L.log(3)).toBe(1.0986122886681098);
    expect(F.log(3)).toBe(1.0986122886681096);
    expect(L.exp(1)).toBe(2.718281828459045);
    expect(L.exp(-745.1332191019411)).toBe(5e-324);
    expect(L.sin(Math.PI)).toBe(1.2246467991473532e-16);
    expect(L.cos(Math.PI / 2)).toBe(6.123233995736766e-17);
    expect(L.tan(Math.PI / 2)).toBe(1.633123935319537e16);
    expect(L.sin(1e22)).toBe(-0.8522008497671888);
    expect(L.atan(1)).toBe(Math.PI / 4);
    expect(L.log2(8)).toBe(3);
    expect(L.log2(1e-320)).toBe(-1063.0170064253057);
    expect(L.log10(1000)).toBe(3);
    expect(L.pow(2, 0.5)).toBe(1.4142135623730951);
    expect(L.pow(10, -3)).toBe(0.001);
    expect(L.pow(2, -1074)).toBe(5e-324);
    expect(L.pow(3, 40)).toBe(12157665459056929000);
    // glibc keeps the fdlibm formulas for these: the named exports match CPython, `exact` is the true rounding
    expect(L.expm1(1)).toBe(1.718281828459045);
    expect(L.exact.expm1(1)).toBe(1.7182818284590453);
    expect(L.sinh(2)).toBe(3.626860407847019);
    expect(L.exact.sinh(2)).toBe(3.6268604078470186);
  });

  it('handles special values like C99', () => {
    const inf = Infinity;
    expect([L.exp(inf), L.exp(-inf), L.exp(NaN), L.exp(710), L.exp(-746), L.exp(0)]).toEqual([inf, 0, NaN, inf, 0, 1]);
    expect([L.log(0), L.log(-1), L.log(inf), L.log(1), L.log(NaN)]).toEqual([-inf, NaN, inf, 0, NaN]);
    expect(Object.is(L.log1p(-0), -0)).toBe(true);
    expect([L.log1p(-1), L.log1p(-2), L.log2(0), L.log10(-0)]).toEqual([-inf, NaN, -inf, -inf]);
    expect([L.sin(inf), L.cos(-inf), L.tan(NaN)]).toEqual([NaN, NaN, NaN]);
    expect(Object.is(L.sin(-0), -0) && Object.is(L.tan(-0), -0) && Object.is(L.atan(-0), -0)).toBe(true);
    expect([L.asin(2), L.acos(-2), L.asin(1), L.acos(1), L.acos(-1)]).toEqual([NaN, NaN, Math.PI / 2, 0, Math.PI]);
    expect([L.atan(inf), L.atan(-inf)]).toEqual([Math.PI / 2, -Math.PI / 2]);
    expect([L.sinh(inf), L.cosh(-inf), L.tanh(inf), L.tanh(-inf), L.sinh(711), L.cosh(-711)]).toEqual([inf, inf, 1, -1, inf, inf]);
    expect([L.acosh(0.5), L.acosh(1), L.atanh(1), L.atanh(-1), L.atanh(2), L.asinh(-inf)]).toEqual([NaN, 0, inf, -inf, NaN, -inf]);
    const PI = Math.PI;
    expect([L.atan2(0, -0), L.atan2(-0, -0), L.atan2(0, 0), L.atan2(-0, 0)]).toEqual([PI, -PI, 0, -0]);
    expect([L.atan2(1, 0), L.atan2(-1, -0), L.atan2(1, -inf), L.atan2(1, inf), L.atan2(inf, 1), L.atan2(inf, -inf), L.atan2(-inf, inf)])
      .toEqual([PI / 2, -PI / 2, PI, 0, PI / 2, 2.356194490192345, -PI / 4]);
    expect(L.atan2(NaN, 1)).toBeNaN();
  });

  it('pow follows C99 Annex F', () => {
    const inf = Infinity;
    expect([L.pow(0, 0), L.pow(NaN, 0), L.pow(1, NaN), L.pow(-1, inf), L.pow(-1, -inf), L.pow(1, inf)]).toEqual([1, 1, 1, 1, 1, 1]);
    expect([L.pow(0, -1), L.pow(-0, -1), L.pow(-0, -2), L.pow(0, 3), L.pow(-0, 3), L.pow(-0, 2)]).toEqual([inf, -inf, inf, 0, -0, 0]);
    expect([L.pow(2, inf), L.pow(0.5, inf), L.pow(2, -inf), L.pow(0.5, -inf)]).toEqual([inf, 0, 0, inf]);
    expect([L.pow(inf, -1), L.pow(inf, 2), L.pow(-inf, 3), L.pow(-inf, 2), L.pow(-inf, -3), L.pow(-inf, -2)]).toEqual([0, inf, -inf, inf, -0, 0]);
    expect([L.pow(-8, 1 / 3), L.pow(-2, 3), L.pow(-2, 2), L.pow(-2, -3), L.pow(2, 1024), L.pow(2, -1100)]).toEqual([NaN, -8, 4, -0.125, inf, 0]);
    expect(L.pow(NaN, 1)).toBeNaN();
    expect(L.pow(-2, 2 ** 60)).toBe(inf);
  });

  it('is fast enough (graph plotting)', () => {
    const t0 = performance.now();
    let s = 0;
    for (let i = 0; i < 3000; i++) {
      const x = -10 + (20 * i) / 3000;
      s += L.sin(x) + L.exp(x) + L.atan(x) + L.log(x * x + 0.5) + L.pow(x * x + 0.5, 1.7) + L.tan(x);
    }
    const perCall = ((performance.now() - t0) * 1000) / 18000;
    expect(Number.isFinite(s)).toBe(true);
    expect(perCall).toBeLessThan(100); // typically 5-10 us
  });
});
