// numpy.random: the legacy functions (np.random.seed, rand, randn, randint, choice, shuffle …) with the
// Mersenne Twister MT19937 exactly as numpy's RandomState, and np.random.default_rng() (Generator with PCG64,
// seeded by SeedSequence) as in numpy – so seeded programs print the same numbers as with numpy.
// Without a seed, the global state is seeded from the VM's own seeded generator (reproducible runs).

import { PyList, PyTuple, PyInstance, PyClass, PyBuiltin, OBJECT, isInt, num, truthy, typeName } from '../values.js';
import { params } from '../args.js';
import * as M from '../libm.js';
import { KI, WI, FI, NOR_R, NOR_INV_R } from './npziggurat.js';
import { Nd, wrap, isArr, toNd, flat, npErr, scalarNum, toPy, getIndex, setIndex, copyNd, reshape, prodOf } from './numpy.js';

// ---------- Bit generators ----------

/** MT19937 like numpy (mt19937_seed / init_by_array, genrand). */
class MT19937 {
  constructor() { this.mt = new Uint32Array(624); this.pos = 624; this.hasGauss = false; this.gauss = 0; this.binom = null; }
  seed(s) {
    const mt = this.mt;
    let x = s >>> 0;
    for (let i = 0; i < 624; i++) { mt[i] = x; x = (Math.imul(1812433253, x ^ (x >>> 30)) + i + 1) >>> 0; }
    this.pos = 624; this.hasGauss = false; this.gauss = 0; this.binom = null;
  }
  seedArray(key) {
    this.seed(19650218);
    const mt = this.mt, n = 624, len = key.length;
    let i = 1, j = 0;
    for (let k = Math.max(n, len); k; k--) {
      mt[i] = ((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1664525)) + key[j] + j) >>> 0;
      i++; j++;
      if (i >= n) { mt[0] = mt[n - 1]; i = 1; }
      if (j >= len) j = 0;
    }
    for (let k = n - 1; k; k--) {
      mt[i] = ((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1566083941)) - i) >>> 0;
      i++;
      if (i >= n) { mt[0] = mt[n - 1]; i = 1; }
    }
    mt[0] = 0x80000000;
    this.pos = 624; this.hasGauss = false; this.gauss = 0; this.binom = null;
  }
  twist() {
    const mt = this.mt;
    for (let i = 0; i < 624; i++) {
      const y = (mt[i] & 0x80000000) | (mt[(i + 1) % 624] & 0x7fffffff);
      mt[i] = mt[(i + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
    }
    this.pos = 0;
  }
  next32() {
    if (this.pos >= 624) this.twist();
    let y = this.mt[this.pos++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }
  next64() { const hi = this.next32(), lo = this.next32(); return (BigInt(hi) << 32n) | BigInt(lo); }
  nextDouble() { const a = this.next32() >>> 5, b = this.next32() >>> 6; return (a * 67108864 + b) / 9007199254740992; }
}

const M64 = (1n << 64n) - 1n, M128 = (1n << 128n) - 1n;
const PCG_MULT = (2549297995355413924n << 64n) + 4865540595714422341n;

/** PCG64 (XSL-RR 128/64) like numpy, with its buffered 32-bit output. */
class PCG64 {
  constructor(seedWords) {
    // seedWords: 4 uint64 from SeedSequence.generate_state(4, uint64)
    const s = (seedWords[0] << 64n) | seedWords[1];
    const inc = (seedWords[2] << 64n) | seedWords[3];
    this.inc = ((inc << 1n) | 1n) & M128;
    this.state = 0n;
    this.step();
    this.state = (this.state + s) & M128;
    this.step();
    this.hasU32 = false; this.u32 = 0;
  }
  step() { this.state = (this.state * PCG_MULT + this.inc) & M128; }
  next64() {
    this.step();
    const st = this.state;
    const x = ((st >> 64n) ^ st) & M64;
    const rot = st >> 122n;
    return ((x >> rot) | (x << ((64n - rot) & 63n))) & M64;
  }
  next32() {
    if (this.hasU32) { this.hasU32 = false; return this.u32; }
    const n = this.next64();
    this.hasU32 = true;
    this.u32 = Number(n >> 32n);
    return Number(n & 0xffffffffn);
  }
  nextDouble() { return Number(this.next64() >> 11n) / 9007199254740992; }
}

/** numpy's SeedSequence(entropy).generate_state(nWords, uint64). */
function seedSequence(entropy, nWords64) {
  const INIT_A = 0x43b0d7e5, MULT_A = 0x931e8875, INIT_B = 0x8b51f9dd, MULT_B = 0x58f38ded, MIX_L = 0xca01f9dd, MIX_R = 0x4973f715;
  const words = [];
  let n = BigInt(entropy);
  if (n < 0n) throw npErr('ValueError', 'expected non-negative integer');
  if (n === 0n) words.push(0);
  while (n > 0n) { words.push(Number(n & 0xffffffffn)); n >>= 32n; }
  let hc = INIT_A;
  const hashmix = (v) => {
    v = (v ^ hc) >>> 0;
    hc = Math.imul(hc, MULT_A) >>> 0;
    v = Math.imul(v, hc) >>> 0;
    return (v ^ (v >>> 16)) >>> 0;
  };
  const mix = (x, y) => { let r = (Math.imul(MIX_L, x) - Math.imul(MIX_R, y)) >>> 0; return (r ^ (r >>> 16)) >>> 0; };
  const pool = new Array(4);
  for (let i = 0; i < 4; i++) pool[i] = hashmix(i < words.length ? words[i] : 0);
  for (let s = 0; s < 4; s++) for (let d = 0; d < 4; d++) if (s !== d) pool[d] = mix(pool[d], hashmix(pool[s]));
  for (let s = 4; s < words.length; s++) for (let d = 0; d < 4; d++) pool[d] = mix(pool[d], hashmix(words[s]));
  let hb = INIT_B;
  const state = [];
  for (let i = 0; i < nWords64 * 2; i++) {
    let v = pool[i % 4];
    v = (v ^ hb) >>> 0;
    hb = Math.imul(hb, MULT_B) >>> 0;
    v = Math.imul(v, hb) >>> 0;
    v = (v ^ (v >>> 16)) >>> 0;
    state.push(v);
  }
  const out = [];
  for (let i = 0; i < nWords64; i++) out.push((BigInt(state[2 * i + 1]) << 32n) | BigInt(state[2 * i]));
  return out;
}

// ---------- Distributions ----------

const genMask = (max) => { let m = max; m |= m >>> 1; m |= m >>> 2; m |= m >>> 4; m |= m >>> 8; m |= m >>> 16; return m >>> 0; };

/** random_interval: uniform integer 0 … max (masked rejection). */
function randomInterval(bg, max) {
  if (max === 0) return 0;
  if (max <= 0xffffffff) {
    const mask = genMask(max);
    let v;
    while ((v = (bg.next32() & mask) >>> 0) > max);
    return v;
  }
  const big = BigInt(max);
  let mask = big;
  for (const s of [1n, 2n, 4n, 8n, 16n, 32n]) mask |= mask >> s;
  let v;
  while ((v = bg.next64() & mask) > big);
  return Number(v);
}

/** Bounded integer off … off+rng (numpy random_bounded_uint64_fill with one value). */
function bounded(bg, off, rng, masked) {
  if (rng === 0) return off;
  if (rng <= 0xffffffff) {
    if (rng === 0xffffffff) return off + bg.next32();
    if (masked) {
      const mask = genMask(rng);
      let v;
      while ((v = (bg.next32() & mask) >>> 0) > rng);
      return off + v;
    }
    const excl = rng + 1;
    let m = BigInt(bg.next32()) * BigInt(excl);
    let left = Number(m & 0xffffffffn);
    if (left < excl) {
      const threshold = (0xffffffff - rng) % excl;
      while (left < threshold) { m = BigInt(bg.next32()) * BigInt(excl); left = Number(m & 0xffffffffn); }
    }
    return off + Number(m >> 32n);
  }
  // 64-bit range (masked; Lemire 64 for the Generator)
  const big = BigInt(rng);
  if (masked) {
    let mask = big;
    for (const s of [1n, 2n, 4n, 8n, 16n, 32n]) mask |= mask >> s;
    let v;
    while ((v = bg.next64() & mask) > big);
    return off + Number(v);
  }
  const excl = big + 1n;
  let m = bg.next64() * excl;
  let left = m & M64;
  if (left < excl) {
    const threshold = (M64 - big) % excl;
    while (left < threshold) { m = bg.next64() * excl; left = m & M64; }
  }
  return off + Number(m >> 64n);
}

/** legacy_gauss: polar Box-Muller with a saved second value. */
function legacyGauss(bg) {
  if (bg.hasGauss) { bg.hasGauss = false; const t = bg.gauss; bg.gauss = 0; return t; }
  let x1, x2, r2;
  do {
    x1 = 2 * bg.nextDouble() - 1;
    x2 = 2 * bg.nextDouble() - 1;
    r2 = x1 * x1 + x2 * x2;
  } while (r2 >= 1 || r2 === 0);
  const f = Math.sqrt((-2 * M.log(r2)) / r2);
  bg.gauss = f * x1; bg.hasGauss = true;
  return f * x2;
}

/** random_standard_normal: the ziggurat method of numpy's Generator. */
function zigguratNormal(bg) {
  for (;;) {
    let r = bg.next64();
    const idx = Number(r & 0xffn);
    r >>= 8n;
    const rabs = Number((r >> 1n) & 0x000fffffffffffffn);
    let x = rabs * WI[idx] * ((r & 1n) ? -1 : 1);
    if (rabs < KI[idx]) return x;
    if (idx === 0) {
      for (;;) {
        const xx = -NOR_INV_R * M.log1p(-bg.nextDouble());
        const yy = -M.log1p(-bg.nextDouble());
        if (yy + yy > xx * xx) return (rabs >> 8) & 1 ? -(NOR_R + xx) : NOR_R + xx;
      }
    } else if ((FI[idx - 1] - FI[idx]) * bg.nextDouble() + FI[idx] < M.exp(-0.5 * x * x)) return x;
  }
}

function loggam(x) {
  const a = [8.333333333333333e-02, -2.777777777777778e-03, 7.936507936507937e-04, -5.952380952380952e-04, 8.417508417508418e-04,
    -1.917526917526918e-03, 6.410256410256410e-03, -2.955065359477124e-02, 1.796443723688307e-01, -1.39243221690590e+00];
  if (x === 1 || x === 2) return 0;
  const n = x < 7 ? Math.trunc(7 - x) : 0;
  let x0 = x + n;
  const x2 = (1 / x0) * (1 / x0);
  let gl0 = a[9];
  for (let k = 8; k >= 0; k--) { gl0 *= x2; gl0 += a[k]; }
  let gl = gl0 / x0 + 0.5 * 1.8378770664093453e+00 + (x0 - 0.5) * M.log(x0) - x0;
  if (x < 7) for (let k = 1; k <= n; k++) { gl -= M.log(x0 - 1); x0 -= 1; }
  return gl;
}

function poisson(bg, lam) {
  if (lam >= 10) {
    const slam = Math.sqrt(lam), loglam = M.log(lam);
    const b = 0.931 + 2.53 * slam, a = -0.059 + 0.02483 * b;
    const invalpha = 1.1239 + 1.1328 / (b - 3.4), vr = 0.9277 - 3.6224 / (b - 2);
    for (;;) {
      const U = bg.nextDouble() - 0.5, V = bg.nextDouble();
      const us = 0.5 - Math.abs(U);
      const k = Math.floor((2 * a / us + b) * U + lam + 0.43);
      if (us >= 0.07 && V <= vr) return k;
      if (k < 0 || (us < 0.013 && V > us)) continue;
      if (M.log(V) + M.log(invalpha) - M.log(a / (us * us) + b) <= -lam + k * loglam - loggam(k + 1)) return k;
    }
  }
  if (lam === 0) return 0;
  const enlam = M.exp(-lam);
  let X = 0, prod = 1;
  for (;;) { prod *= bg.nextDouble(); if (prod > enlam) X += 1; else return X; }
}

function binomialInversion(bg, n, p) {
  let c = bg.binom;
  if (!c || c.n !== n || c.p !== p || c.kind !== 'inv') {
    const q = 1 - p;
    c = bg.binom = { kind: 'inv', n, p, q, qn: M.exp(n * M.log(q)), np: n * p };
    c.bound = Math.trunc(Math.min(n, c.np + 10 * Math.sqrt(c.np * q + 1)));
  }
  let X = 0, px = c.qn, U = bg.nextDouble();
  while (U > px) {
    X++;
    if (X > c.bound) { X = 0; px = c.qn; U = bg.nextDouble(); } else { U -= px; px = ((n - X + 1) * p * px) / (X * c.q); }
  }
  return X;
}

function binomialBtpe(bg, n, p) {
  let c = bg.binom;
  if (!c || c.n !== n || c.p !== p || c.kind !== 'btpe') {
    const r = Math.min(p, 1 - p), q = 1 - r, fm = n * r + r, m = Math.floor(fm);
    const p1 = Math.floor(2.195 * Math.sqrt(n * r * q) - 4.6 * q) + 0.5;
    const xm = m + 0.5, xl = xm - p1, xr = xm + p1, cc = 0.134 + 20.5 / (15.3 + m);
    let a = (fm - xl) / (fm - xl * r);
    const laml = a * (1 + a / 2);
    a = (xr - fm) / (xr * q);
    const lamr = a * (1 + a / 2);
    const p2 = p1 * (1 + 2 * cc), p3 = p2 + cc / laml, p4 = p3 + cc / lamr;
    c = bg.binom = { kind: 'btpe', n, p, r, q, fm, m, p1, xm, xl, xr, c: cc, laml, lamr, p2, p3, p4 };
  }
  const { r, q, m, p1, xm, xl, xr, laml, lamr, p2, p3, p4 } = c;
  const cc = c.c;
  for (;;) {
    const nrq = n * r * q;
    let u = bg.nextDouble() * p4, v = bg.nextDouble(), y;
    if (u <= p1) { y = Math.floor(xm - p1 * v + u); return p > 0.5 ? n - y : y; }
    if (u <= p2) {
      const x = xl + (u - p1) / cc;
      v = v * cc + 1 - Math.abs(m - x + 0.5) / p1;
      if (v > 1) continue;
      y = Math.floor(x);
    } else if (u <= p3) {
      y = Math.floor(xl + M.log(v) / laml);
      if (y < 0 || v === 0) continue;
      v = v * (u - p2) * laml;
    } else {
      y = Math.floor(xr - M.log(v) / lamr);
      if (y > n || v === 0) continue;
      v = v * (u - p3) * lamr;
    }
    const k = Math.abs(y - m);
    if (!(k > 20 && k < nrq / 2 - 1)) {
      const s = r / q, a = s * (n + 1);
      let F = 1;
      if (m < y) for (let i = m + 1; i <= y; i++) F *= a / i - s;
      else if (m > y) for (let i = y + 1; i <= m; i++) F /= a / i - s;
      if (v > F) continue;
      return p > 0.5 ? n - y : y;
    }
    const rho = (k / nrq) * ((k * (k / 3 + 0.625) + 0.16666666666666666) / nrq + 0.5);
    const t = (-k * k) / (2 * nrq);
    const A = M.log(v);
    if (A < t - rho) return p > 0.5 ? n - y : y;
    if (A > t + rho) continue;
    const x1 = y + 1, f1 = m + 1, z = n + 1 - m, w = n - y + 1;
    const x2 = x1 * x1, f2 = f1 * f1, z2 = z * z, w2 = w * w;
    const st = (g, g2) => (13680 - (462 - (132 - (99 - 140 / g2) / g2) / g2) / g2) / g / 166320;
    if (A > xm * M.log(f1 / x1) + (n - m + 0.5) * M.log(z / w) + (y - m) * M.log((w * r) / (x1 * q)) + st(f1, f2) + st(z, z2) + st(x1, x2) + st(w, w2)) continue;
    return p > 0.5 ? n - y : y;
  }
}

function legacyBinomial(bg, n, p) {
  if (p <= 0.5) return p * n <= 30 ? binomialInversion(bg, n, p) : binomialBtpe(bg, n, p);
  const q = 1 - p;
  return n - (q * n <= 30 ? binomialInversion(bg, n, q) : binomialBtpe(bg, n, q));
}

// ---------- Python classes ----------

export const RANDOMSTATE = new PyClass('RandomState', [OBJECT], new Map(), 'RandomState');
export const GENERATOR = new PyClass('Generator', [OBJECT], new Map(), 'Generator');

/** size argument → shape or null (one value). */
function sizeShape(size) {
  if (size === undefined || size === null) return null;
  if (isInt(size)) return [Number(num(size))];
  if (size instanceof PyTuple || size instanceof PyList) return size.items.map((x) => Number(num(x)));
  throw npErr('TypeError', `'${typeName(size)}' object cannot be interpreted as an integer`);
}
/** n values from gen(), as a Python number (shape null) or an array. */
function fill(shape, dtype, gen) {
  if (shape === null) return toPy(gen(), dtype);
  if (shape.some((s) => s < 0)) throw npErr('ValueError', 'negative dimensions are not allowed');
  const n = prodOf(shape), d = new Float64Array(n);
  for (let i = 0; i < n; i++) d[i] = gen();
  return wrap(new Nd(d, shape, dtype));
}
const dimsShape = (args) => (args.length === 0 ? null : args.map((a) => { if (!isInt(a)) throw npErr('TypeError', `'${typeName(a)}' object cannot be interpreted as an integer`); return Number(num(a)); }));
const fnum = (v, d) => (v === undefined || v === null ? d : scalarNum(v));

/** The bit generator of a RandomState instance, or the module's global one (seeded from the VM). */
function legacyState(ctx, self) {
  if (self) return self.bg;
  const vm = ctx.vm;
  if (!vm.npLegacy) { vm.npLegacy = new MT19937(); vm.npLegacy.seed(vm.random32()); }
  return vm.npLegacy;
}

function seedLegacy(bg, s, vm) {
  if (s === undefined || s === null) { bg.seed(vm.random32()); return; }
  if (isInt(s)) {
    const n = Number(num(s));
    if (n < 0 || n > 0xffffffff) throw npErr('ValueError', 'Seed must be between 0 and 2**32 - 1', 'npSeed');
    bg.seed(n);
    return;
  }
  const key = Array.from(flat(toNd(s)));
  if (!key.length) throw npErr('ValueError', 'Seed must be non-empty');
  if (key.some((k) => k < 0 || k > 0xffffffff || !Number.isInteger(k))) throw npErr('ValueError', 'Seed must be between 0 and 2**32 - 1', 'npSeed');
  bg.seedArray(key);
}

/** Population for choice(): an int n (→ 0 … n-1) or a 1-D array. */
function population(a) {
  if (isInt(a)) {
    const n = Number(num(a));
    if (n <= 0) throw npErr('ValueError', 'a must be a positive integer unless no samples are taken', 'npChoice');
    return { n, arr: null };
  }
  const arr = isArr(a) ? a.nd : toNd(a);
  if (arr.ndim !== 1) throw npErr('ValueError', 'a must be 1-dimensional', 'npChoice');
  if (arr.size === 0) throw npErr('ValueError', 'a cannot be empty unless no samples are taken', 'npChoice');
  return { n: arr.size, arr };
}

function checkP(p, n) {
  const pf = Array.from(flat(toNd(p, 'float64')));
  if (pf.length !== n) throw npErr('ValueError', 'a and p must have same size', 'npChoice');
  if (pf.some((x) => x < 0)) throw npErr('ValueError', 'probabilities are not non-negative', 'npChoice');
  // kahan sum like numpy
  let sum = 0, c = 0;
  for (const x of pf) { const y = x - c, t = sum + y; c = (t - sum) - y; sum = t; }
  if (Math.abs(sum - 1) > Math.sqrt(2.220446049250313e-16)) throw npErr('ValueError', 'probabilities do not sum to 1', 'npChoiceP');
  return pf;
}
const cdfOf = (pf) => { const cdf = []; let s = 0; for (const x of pf) { s += x; cdf.push(s); } const last = cdf[cdf.length - 1]; return cdf.map((x) => x / last); };
const searchRight = (cdf, u) => { let lo = 0, hi = cdf.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] <= u) lo = mid + 1; else hi = mid; } return lo; };

function shuffleInPlace(bg, x, interval = randomInterval) {
  if (isArr(x)) {
    const nd = x.nd;
    if (nd.ndim === 0) throw npErr('TypeError', 'object of type numpy.ndarray has no len()');
    const n = nd.shape[0];
    for (let i = n - 1; i > 0; i--) {
      const j = interval(bg, i);
      if (i === j) continue;
      const rowJ = copyNd(getIndex(nd, j)), rowI = copyNd(getIndex(nd, i));
      setIndex(null, nd, j, wrap(rowI));
      setIndex(null, nd, i, wrap(rowJ));
    }
    return;
  }
  if (!(x instanceof PyList)) throw npErr('TypeError', `shuffle() needs a list or an array, not '${typeName(x)}'`);
  const it = x.items;
  for (let i = it.length - 1; i > 0; i--) { const j = interval(bg, i); const t = it[i]; it[i] = it[j]; it[j] = t; }
}

const take = (pop, idx) => (pop.arr ? toPy(pop.arr.data[pop.arr.offset + idx * pop.arr.strides[0]], pop.arr.dtype) : idx);
function takeMany(pop, shape, idx) {
  const out = new Float64Array(idx.length);
  for (let i = 0; i < idx.length; i++) out[i] = pop.arr ? pop.arr.data[pop.arr.offset + idx[i] * pop.arr.strides[0]] : idx[i];
  return wrap(new Nd(out, shape, pop.arr ? pop.arr.dtype : 'int64'));
}

function choiceCommon(ctx, bg, args, kw, legacy) {
  const [, a, size, replace, p] = params('choice', args, kw, ['self', 'a', '?size', '?replace', '?p', '?axis', '?shuffle']);
  const pop = population(a);
  const shape = sizeShape(size);
  const count = shape === null ? 1 : prodOf(shape);
  const pf = p === undefined || p === null ? null : checkP(p, pop.n);
  const rep = replace === undefined ? true : truthy(replace);
  let idx;
  if (rep) {
    if (pf) { const cdf = cdfOf(pf); idx = []; for (let i = 0; i < count; i++) idx.push(searchRight(cdf, bg.nextDouble())); } else {
      idx = [];
      for (let i = 0; i < count; i++) idx.push(bounded(bg, 0, pop.n - 1, legacy));
    }
  } else {
    if (count > pop.n) throw npErr('ValueError', "Cannot take a larger sample than population when 'replace=False'", 'npChoiceSize');
    if (pf) {
      if (pf.filter((x) => x > 0).length < count) throw npErr('ValueError', 'Fewer non-zero entries in p than size');
      const pp = pf.slice(), found = [];
      while (found.length < count) {
        const xs = [];
        for (let i = 0; i < count - found.length; i++) xs.push(bg.nextDouble());
        for (const f of found) pp[f] = 0;
        const cdf = cdfOf(pp);
        const fresh = xs.map((u) => searchRight(cdf, u));
        // unique values in order of first appearance
        const seen = new Set();
        for (const v of fresh) if (!seen.has(v)) { seen.add(v); found.push(v); }
      }
      idx = found;
    } else if (legacy) {
      const perm = [...Array(pop.n).keys()];
      for (let i = pop.n - 1; i > 0; i--) { const j = randomInterval(bg, i); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
      idx = perm.slice(0, count);
    } else {
      idx = generatorSample(bg, pop.n, count);
    }
  }
  if (shape === null) return take(pop, idx[0]);
  return takeMany(pop, shape, idx);
}

/** Generator.choice without replacement: tail shuffle or Floyd's algorithm with a final shuffle (as numpy). */
function generatorSample(bg, popSize, size) {
  if (popSize > 10000 && size > Math.floor(popSize / 50)) {
    const idx = [...Array(popSize).keys()];
    for (let i = popSize - 1; i >= Math.max(popSize - size, 1); i--) { const j = bounded(bg, 0, i, false); const t = idx[j]; idx[j] = idx[i]; idx[i] = t; }
    return idx.slice(popSize - size);
  }
  const out = new Array(size);
  let setSize = Math.trunc(1.2 * size);
  const mask = genMask(setSize);
  setSize = 1 + mask;
  const hash = new Array(setSize).fill(-1);
  for (let j = popSize - size; j < popSize; j++) {
    const val = bounded(bg, 0, j, false);
    let loc = val & mask;
    while (hash[loc] !== -1 && hash[loc] !== val) loc = (loc + 1) & mask;
    if (hash[loc] === -1) { hash[loc] = val; out[j - popSize + size] = val; } else {
      loc = j & mask;
      while (hash[loc] !== -1) loc = (loc + 1) & mask;
      hash[loc] = j;
      out[j - popSize + size] = j;
    }
  }
  for (let i = size - 1; i >= 1; i--) { const j = bounded(bg, 0, i, false); const t = out[j]; out[j] = out[i]; out[i] = t; }
  return out;
}

function randintCommon(ctx, bg, name, args, kw, legacy, endpointDefault = false) {
  const [, low, high, size, , endpoint] = params(name, args, kw, ['self', 'low', '?high', '?size', '?dtype', '?endpoint']);
  let lo, hi;
  if (high === undefined || high === null) { lo = 0; hi = scalarNum(low); } else { lo = scalarNum(low); hi = scalarNum(high); }
  if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw npErr('TypeError', `'float' object cannot be interpreted as an integer`);
  const incl = endpoint === undefined ? endpointDefault : truthy(endpoint);
  const top = incl ? hi : hi - 1;
  if (top < lo) throw npErr('ValueError', high === undefined || high === null ? (incl ? 'high < 0' : 'high <= 0') : (incl ? 'low > high' : 'low >= high'), 'npRandint');
  return fill(sizeShape(size), 'int64', () => bounded(bg, lo, top - lo, legacy));
}

const RS_METHODS = {
  __init__: (ctx, args) => { const self = args[0]; self.bg = new MT19937(); seedLegacy(self.bg, args[1], ctx.vm); return null; },
  seed: (ctx, args) => { seedLegacy(legacyState(ctx, args[0]), args[1], ctx.vm); return null; },
  rand: (ctx, args) => { const bg = legacyState(ctx, args[0]); return fill(dimsShape(args.slice(1)), 'float64', () => bg.nextDouble()); },
  randn: (ctx, args) => { const bg = legacyState(ctx, args[0]); return fill(dimsShape(args.slice(1)), 'float64', () => legacyGauss(bg)); },
  random_sample: (ctx, args, kw) => { const [s, size] = params('random_sample', args, kw, ['self', '?size']); const bg = legacyState(ctx, s); return fill(sizeShape(size), 'float64', () => bg.nextDouble()); },
  standard_normal: (ctx, args, kw) => { const [s, size] = params('standard_normal', args, kw, ['self', '?size']); const bg = legacyState(ctx, s); return fill(sizeShape(size), 'float64', () => legacyGauss(bg)); },
  randint: (ctx, args, kw) => randintCommon(ctx, legacyState(ctx, args[0]), 'randint', args, kw, true),
  random_integers: (ctx, args, kw) => randintCommon(ctx, legacyState(ctx, args[0]), 'random_integers', args, kw, true, true),
  uniform: (ctx, args, kw) => {
    const [s, low, high, size] = params('uniform', args, kw, ['self', '?low', '?high', '?size']);
    const bg = legacyState(ctx, s), lo = fnum(low, 0), range = fnum(high, 1) - lo;
    return fill(sizeShape(size), 'float64', () => lo + range * bg.nextDouble());
  },
  normal: (ctx, args, kw) => {
    const [s, loc, scale, size] = params('normal', args, kw, ['self', '?loc', '?scale', '?size']);
    const bg = legacyState(ctx, s), m = fnum(loc, 0), sd = fnum(scale, 1);
    if (sd < 0) throw npErr('ValueError', 'scale < 0', 'npScale');
    return fill(sizeShape(size), 'float64', () => m + sd * legacyGauss(bg));
  },
  exponential: (ctx, args, kw) => {
    const [s, scale, size] = params('exponential', args, kw, ['self', '?scale', '?size']);
    const bg = legacyState(ctx, s), sc = fnum(scale, 1);
    return fill(sizeShape(size), 'float64', () => sc * -M.log(1 - bg.nextDouble()));
  },
  poisson: (ctx, args, kw) => {
    const [s, lam, size] = params('poisson', args, kw, ['self', '?lam', '?size']);
    const bg = legacyState(ctx, s), l = fnum(lam, 1);
    if (l < 0) throw npErr('ValueError', 'lam < 0');
    return fill(sizeShape(size), 'int64', () => poisson(bg, l));
  },
  binomial: (ctx, args, kw) => {
    const [s, n, p, size] = params('binomial', args, kw, ['self', 'n', 'p', '?size']);
    const bg = legacyState(ctx, s), nn = scalarNum(n), pp = scalarNum(p);
    if (nn < 0) throw npErr('ValueError', 'n < 0');
    if (!(pp >= 0 && pp <= 1)) throw npErr('ValueError', pp < 0 ? 'p < 0' : pp > 1 ? 'p > 1' : 'p is nan');
    return fill(sizeShape(size), 'int64', () => (nn === 0 || pp === 0 ? 0 : pp === 1 ? nn : legacyBinomial(bg, Math.trunc(nn), pp)));
  },
  choice: (ctx, args, kw) => choiceCommon(ctx, legacyState(ctx, args[0]), args, kw, true),
  shuffle: (ctx, args) => { shuffleInPlace(legacyState(ctx, args[0]), args[1]); return null; },
  permutation: (ctx, args) => {
    const bg = legacyState(ctx, args[0]), x = args[1];
    if (isInt(x)) { const d = Float64Array.from({ length: Number(num(x)) }, (_, i) => i); const a = wrap(new Nd(d, [d.length], 'int64')); shuffleInPlace(bg, a); return a; }
    const a = wrap(copyNd(isArr(x) ? x.nd : toNd(x)));
    shuffleInPlace(bg, a);
    return a;
  },
};
RS_METHODS.random = RS_METHODS.random_sample;
RS_METHODS.ranf = RS_METHODS.random_sample;
RS_METHODS.sample = RS_METHODS.random_sample;

const genState = (self) => self.bg;
const GEN_METHODS = {
  __init__: (ctx, args) => { const [self, seed] = args; self.bg = new PCG64(seedSequence(seed === undefined || seed === null ? ctx.vm.random32() : seedValue(seed), 4)); return null; },
  __repr__: () => 'Generator(PCG64)',
  random: (ctx, args, kw) => { const [s, size] = params('random', args, kw, ['self', '?size', '?dtype', '?out']); const bg = genState(s); return fill(sizeShape(size), 'float64', () => bg.nextDouble()); },
  integers: (ctx, args, kw) => randintCommon(ctx, genState(args[0]), 'integers', args, kw, false),
  uniform: (ctx, args, kw) => {
    const [s, low, high, size] = params('uniform', args, kw, ['self', '?low', '?high', '?size']);
    const bg = genState(s), lo = fnum(low, 0), range = fnum(high, 1) - lo;
    return fill(sizeShape(size), 'float64', () => lo + range * bg.nextDouble());
  },
  normal: (ctx, args, kw) => {
    const [s, loc, scale, size] = params('normal', args, kw, ['self', '?loc', '?scale', '?size']);
    const bg = genState(s), m = fnum(loc, 0), sd = fnum(scale, 1);
    if (sd < 0) throw npErr('ValueError', 'scale < 0', 'npScale');
    return fill(sizeShape(size), 'float64', () => m + sd * zigguratNormal(bg));
  },
  standard_normal: (ctx, args, kw) => { const [s, size] = params('standard_normal', args, kw, ['self', '?size', '?dtype', '?out']); const bg = genState(s); return fill(sizeShape(size), 'float64', () => zigguratNormal(bg)); },
  choice: (ctx, args, kw) => choiceCommon(ctx, genState(args[0]), args, kw, false),
  shuffle: (ctx, args) => { shuffleInPlace(genState(args[0]), args[1]); return null; },
  permutation: (ctx, args) => {
    const bg = genState(args[0]), x = args[1];
    if (isInt(x)) { const d = Float64Array.from({ length: Number(num(x)) }, (_, i) => i); const a = wrap(new Nd(d, [d.length], 'int64')); shuffleInPlace(bg, a); return a; }
    const a = wrap(copyNd(isArr(x) ? x.nd : toNd(x)));
    shuffleInPlace(bg, a);
    return a;
  },
};

function seedValue(s) {
  if (isInt(s)) return BigInt(num(s));
  throw npErr('TypeError', "Natter's default_rng() takes an int seed or None");
}

export const NPRANDOM_NATIVES = {};
for (const [name, f] of Object.entries(RS_METHODS)) {
  NPRANDOM_NATIVES[`_np.RandomState.${name}`] = f;
  RANDOMSTATE.dict.set(name, new PyBuiltin(`_np.RandomState.${name}`));
  // module-level legacy functions: np.random.rand(...) uses the global state (self = None)
  if (name !== '__init__') NPRANDOM_NATIVES[`_np.random_${name}`] = (ctx, args, kw) => f(ctx, [null, ...args], kw);
}
for (const [name, f] of Object.entries(GEN_METHODS)) {
  NPRANDOM_NATIVES[`_np.Generator.${name}`] = f;
  GENERATOR.dict.set(name, new PyBuiltin(`_np.Generator.${name}`));
}
NPRANDOM_NATIVES['_np.random_default_rng'] = (ctx, args, kw) => {
  const [seed] = params('default_rng', args, kw, ['?seed']);
  const g = new PyInstance(GENERATOR);
  GEN_METHODS.__init__(ctx, [g, seed]);
  return g;
};
NPRANDOM_NATIVES['_np.random_get_state_pos'] = (ctx) => legacyState(ctx, null).pos;

export const NPRANDOM_NAMES = Object.keys(NPRANDOM_NATIVES).filter((n) => n.startsWith('_np.random_')).map((n) => n.slice(4));
export const NPRANDOM_CONSTS = { RandomState: RANDOMSTATE, Generator: GENERATOR };
