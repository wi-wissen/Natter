// Helpers for natives: arguments by name, checked numbers and texts.

import { ScriptError } from './errors.js';
import { isInt, isNum, num, typeName } from './values.js';

export const err = (code, params) => new ScriptError(code, params);

/**
 * Resolve arguments by name.
 * @param {string} fname @param {any[]} args @param {any} kw
 * @param {string[]} names parameters; '?' prefix = optional
 * @returns {any[]} values (missing optional ones: undefined)
 */
export function params(fname, args, kw, names) {
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

export function noKw(fname, kw) {
  const k = Object.keys(kw)[0];
  if (k !== undefined) throw err('argUnexpected', { name: fname, arg: k });
}

/** Integer as JS number (large numbers are too large here). */
export function needInt(v, what) {
  if (!isInt(v)) throw err('type', { what: 'intNeeded', name: what, type: typeName(v) });
  const n = num(v);
  if (typeof n === 'bigint') throw err('overflow', {});
  return n;
}

/** Integer, also large (BigInt). */
export function anyInt(v, what) {
  if (!isInt(v)) throw err('type', { what: 'intNeeded', name: what, type: typeName(v) });
  return num(v);
}

/** Number as JS number (float arithmetic). */
export function needNum(v, what) {
  if (!isNum(v)) throw err('type', { what: 'numberNeeded', name: what, type: typeName(v) });
  return Number(num(v));
}


export function needStr(v, what) {
  if (typeof v !== 'string') throw err('type', { what: 'strNeeded', name: what, type: typeName(v) });
  return v;
}

