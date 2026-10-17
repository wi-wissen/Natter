// random: numbers from the VM's own generator (seeded, so a program prints the same every time unless the host seeds it randomly).

import { PyFloat, PyList, PyTuple, iterItems, isInt, num, typeName } from '../values.js';
import { err, params, needInt, needNum } from '../args.js';
import * as F from '../fdlibm.js';

/** Uniformly distributed integer 0 … n-1 without bias (rejection). */
export function randBelow(vm, n) {
  if (n <= 0) return 0;
  if (n <= 0x100000000) {
    const limit = Math.floor(0x100000000 / n) * n;
    for (;;) { const r = vm.random32(); if (r < limit) return r % n; }
  }
  for (;;) { const r = random53(vm) * n; const k = Math.floor(r); if (k < n) return k; }
}

/** Float 0 ≤ x < 1 with 53 bits (like Python's random()). */
export function random53(vm) {
  const a = vm.random32() >>> 5, b = vm.random32() >>> 6;
  return (a * 67108864 + b) / 9007199254740992;
}

export const RANDOM_NATIVES = {
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
  'random.choices'(ctx, args, kw) {
    const [pop, weights = null, k = 1] = params('choices', args, kw, ['population', '?weights', '?k']);
    const items = iterItems(pop);
    const n = needInt(k, 'k');
    if (!items.length) throw err('index', { what: 'choiceEmpty' });
    const out = [];
    if (weights === null) {
      for (let i = 0; i < n; i++) out.push(items[randBelow(ctx.vm, items.length)]);
    } else {
      const w = iterItems(weights).map((x) => needNum(x, 'weights'));
      if (w.length !== items.length) throw err('value', { what: 'weightsLength' });
      const cum = [];
      let total = 0;
      for (const x of w) { total += x; cum.push(total); }
      if (!(total > 0)) throw err('value', { what: 'weightsTotal' });
      for (let i = 0; i < n; i++) {
        const r = random53(ctx.vm) * total;
        let j = 0;
        while (j < cum.length - 1 && cum[j] <= r) j++;
        out.push(items[j]);
      }
    }
    return new PyList(out);
  },
  'random.sample'(ctx, args, kw) {
    const [pop, k] = params('sample', args, kw, ['population', 'k']);
    const items = iterItems(pop);
    const n = needInt(k, 'k');
    if (n < 0 || n > items.length) throw err('value', { what: 'sampleSize' });
    const pool = items.slice();
    const out = [];
    for (let i = 0; i < n; i++) {
      const j = randBelow(ctx.vm, pool.length - i) + i;
      [pool[i], pool[j]] = [pool[j], pool[i]];
      out.push(pool[i]);
    }
    return new PyList(out);
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
  'random.triangular'(ctx, args, kw) {
    const [lo = 0, hi = 1, mode = null] = params('triangular', args, kw, ['?low', '?high', '?mode']);
    const a = needNum(lo, 'low'), b = needNum(hi, 'high');
    const u = random53(ctx.vm);
    const c = mode === null ? 0.5 : (needNum(mode, 'mode') - a) / (b - a);
    if (u > c) return new PyFloat(b - (b - a) * Math.sqrt((1 - u) * (1 - c)));
    return new PyFloat(a + (b - a) * Math.sqrt(u * c));
  },
  'random.gauss'(ctx, args, kw) {
    const [mu = 0, sigma = 1] = params('gauss', args, kw, ['?mu', '?sigma']);
    // Box–Muller with the deterministic log/cos/sin
    const u1 = 1 - random53(ctx.vm), u2 = random53(ctx.vm);
    const z = Math.sqrt(-2 * F.log(u1)) * F.cos(2 * Math.PI * u2);
    return new PyFloat(needNum(mu, 'mu') + needNum(sigma, 'sigma') * z);
  },
  'random.expovariate'(ctx, args, kw) {
    const [lambd] = params('expovariate', args, kw, ['lambd']);
    return new PyFloat(-F.log(1 - random53(ctx.vm)) / needNum(lambd, 'lambd'));
  },
  'random.getrandbits'(ctx, args, kw) {
    const [k] = params('getrandbits', args, kw, ['k']);
    const n = needInt(k, 'k');
    if (n < 0 || n > 53) throw err('value', { what: 'randbits' });
    let r = 0;
    for (let got = 0; got < n; got += 32) r = r * 4294967296 + ctx.vm.random32();
    return n === 0 ? 0 : Math.floor(r / 2 ** (Math.ceil(n / 32) * 32 - n)); // rules-ok: exact power of two
  },
  'random.seed'(ctx, args, kw) {
    const [s = 0] = params('seed', args, kw, ['?a']);
    let v;
    if (s === null) v = ctx.vm.host.entropy ? ctx.vm.host.entropy() : 0;
    else v = typeof s === 'string' ? [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7) : isInt(s) ? Number(BigInt.asIntN(32, BigInt(num(s)))) : needInt(s, 'seed');
    const st = [0x9e3779b9, 0x243f6a88, 0xb7e15162, v >>> 0];
    ctx.vm.rng.splice(0, 4, ...st);
    for (let i = 0; i < 15; i++) ctx.vm.random32();
    return null;
  },
};
RANDOM_NATIVES['random.normalvariate'] = RANDOM_NATIVES['random.gauss'];
export const RANDOM_NAMES = Object.keys(RANDOM_NATIVES).map((k) => k.slice(7));
export { PyTuple };
