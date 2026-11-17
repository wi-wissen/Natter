// pow(base, exp, mod): modular exponentiation with integers, like CPython (also a negative exponent: modular inverse).

import { err } from './args.js';
import { isInt, num, normBig } from './values.js';

/** Python modulo: the result has the sign of m. */
const pmod = (a, m) => { const r = a % m; return r !== 0n && (r < 0n) !== (m < 0n) ? r + m : r; };

/** Inverse of a modulo m (m > 0) with the extended Euclidean algorithm, or null. */
function inverse(a, m) {
  let [r0, r1] = [pmod(a, m), m];
  let [s0, s1] = [1n, 0n];
  while (r1 !== 0n) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  return r0 === 1n ? pmod(s0, m) : null;
}

/**
 * @param {any} a @param {any} b @param {any} m Python values
 * @returns {number|bigint}
 */
export function powMod(a, b, m) {
  if (!isInt(a) || !isInt(b) || !isInt(m)) throw err('type', { what: 'powModInt' });
  let base = BigInt(num(a)), exp = BigInt(num(b));
  const mod = BigInt(num(m));
  if (mod === 0n) throw err('value', { what: 'powModZero' });
  const am = mod < 0n ? -mod : mod;
  if (exp < 0n) {
    const inv = inverse(base, am);
    if (inv === null) throw err('value', { what: 'powModInverse' });
    base = inv;
    exp = -exp;
  }
  let result = am === 1n ? 0n : 1n;
  base = pmod(base, am);
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % am;
    base = (base * base) % am;
    exp >>= 1n;
  }
  return normBig(mod < 0n && result !== 0n ? result + mod : result);
}
