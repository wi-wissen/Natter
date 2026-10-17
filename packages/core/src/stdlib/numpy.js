// _np: the native part of the numpy subset. Arrays (class numpy.ndarray) keep their numbers in a Float64Array
// (dtype int64, float64 or bool – ints are exact up to 2^53), with shape, strides and offset, so slices are
// views on the same data as in numpy. The Python module `numpy` (stdlib/py/numpy.js) re-exports these functions.
//
// Rules taken over from numpy 2.x: broadcasting, type promotion (bool < int64 < float64, Python numbers are
// "weak"), pairwise summation (same digits as numpy), RuntimeWarnings instead of exceptions for division by zero
// and invalid values (printed once per line on stderr), the error messages of numpy for the usual mistakes.

import {
  PyFloat, PyList, PyTuple, PySlice, PyInstance, PyClass, PyBuiltin, PyProperty, PyIterator, PyRange, PyDict, OBJECT,
  isInt, isNum, num, typeName, sliceIndices, rangeItems, normBig, formatFloat, NOT_IMPLEMENTED, truthy, pow10,
} from '../values.js';
import { ScriptError } from '../errors.js';
import { EXCEPTION_CLASSES as EXC } from '../exceptions.js';
import { params } from '../args.js';
import * as M from '../libm.js';
import { array2string, arrayRepr, arrayStr, PRINT_DEFAULTS, shapeText } from './npformat.js';

/** Most elements an array may have (memory stays bounded on every device). */
export const NP_MAX = 20_000_000;

// ---------- Errors and warnings ----------

/** numpy's own exception classes (catchable as their Python bases, e.g. AxisError as ValueError and IndexError). */
export const NP_EXCEPTIONS = {
  AxisError: new PyClass('AxisError', [EXC.ValueError, EXC.IndexError], new Map(), 'exception'),
  LinAlgError: new PyClass('LinAlgError', [EXC.ValueError], new Map(), 'exception'),
  UFuncTypeError: new PyClass('UFuncTypeError', [EXC.TypeError], new Map(), 'exception'),
  MemoryError: new PyClass('MemoryError', [EXC.Exception], new Map(), 'exception'),
};

/** Python exception `kind` with numpy's message; `what` selects a friendlier text in messages.js. */
export function npErr(kind, message, what = null, extra = {}) {
  const e = new ScriptError('raised', { message, msg: message.trim(), ...(what ? { what } : {}), ...extra });
  e.kind = kind;
  const cls = NP_EXCEPTIONS[kind];
  if (cls) {
    const inst = new PyInstance(cls);
    inst.dict.set('args', new PyTuple([message]));
    inst.scriptError = e;
    e.pyexc = inst;
  }
  return e;
}

/** Line of the user's program that is running (innermost frame of the program's own code). */
function userLine(vm, task) {
  const nProg = vm.program.codes.length;
  let fallback = 0;
  for (let t = task; t; t = t.parent) {
    for (let i = t.frames.length - 1; i >= 0; i--) {
      const f = t.frames[i];
      const line = vm.codes[f.code].lines[Math.max(0, f.pc - 1)] ?? 0;
      if (f.code < nProg) return line;
      if (!fallback) fallback = line;
    }
  }
  return fallback;
}

/** RuntimeWarning like numpy: on stderr, once per line and message (Python's default warning filter). */
export function npWarn(ctx, message, category = 'RuntimeWarning') {
  const vm = ctx.vm;
  const line = ctx.task ? userLine(vm, ctx.task) : 0;
  const key = `${line}:${category}:${message}`;
  vm.npWarned ??= new Set();
  if (vm.npWarned.has(key)) return;
  vm.npWarned.add(key);
  vm.printErr(`${line ? `line ${line}: ` : ''}${category}: ${message}\n`, ctx.task);
  vm.host.warning?.({ category, message, line });
}

/** Floating point flags of one operation (numpy's errstate 'warn'). */
class Flags {
  constructor(name) { this.name = name; this.divide = false; this.invalid = false; this.overflow = false; }
  check(r, x, y) {
    if (Number.isNaN(r)) { if (!Number.isNaN(x) && !Number.isNaN(y)) this.invalid = true; } else if (!Number.isFinite(r) && Number.isFinite(x) && Number.isFinite(y)) {
      if (y === 0) this.divide = true; else this.overflow = true;
    }
  }
  emit(ctx) {
    if (this.divide) npWarn(ctx, `divide by zero encountered in ${this.name}`);
    if (this.overflow) npWarn(ctx, `overflow encountered in ${this.name}`);
    if (this.invalid) npWarn(ctx, `invalid value encountered in ${this.name}`);
  }
}

// ---------- Arrays ----------

const DT_RANK = { bool: 0, int64: 1, float64: 2 };
/** Text arrays have the dtype '<U' + length (like numpy); they support indexing, comparing, sorting, printing. */
export const isStrDt = (dt) => dt.startsWith('<U');
const strLen = (dt) => Number(dt.slice(2));
/** Length of numbers turned into texts (numpy: '<U21' for int64, '<U32' for float64, '<U5' for bool). */
const STR_LEN = { bool: 5, int64: 21, float64: 32 };
export const promote = (a, b) => {
  if (isStrDt(a) || isStrDt(b)) return `<U${Math.max(isStrDt(a) ? strLen(a) : STR_LEN[a], isStrDt(b) ? strLen(b) : STR_LEN[b])}`;
  return DT_RANK[a] >= DT_RANK[b] ? a : b;
};
/** numbers only: text arrays give numpy's TypeError for maths. */
function needNumeric(nd, name) {
  if (isStrDt(nd.dtype)) throw npErr('TypeError', `ufunc '${name}' not supported for the input types, and the inputs could not be safely coerced to any supported types according to the casting rule ''safe''`, 'npStrMath');
  return nd;
}
/** Text of a number in a text array (str() of the Python value). */
const numText = (v, dt) => (dt === 'bool' ? (v ? 'True' : 'False') : dt === 'int64' ? String(v + 0) : formatFloat(v));
export const prodOf = (shape) => { let n = 1; for (const s of shape) n *= s; return n; };
export function cStrides(shape) {
  const s = new Array(shape.length);
  let k = 1;
  for (let i = shape.length - 1; i >= 0; i--) { s[i] = k; k *= shape[i]; }
  return s;
}

/** n-dimensional array: data (shared by views), shape, strides (in elements), offset, dtype. */
export class Nd {
  /** @param {Float64Array} data @param {number[]} shape @param {'bool'|'int64'|'float64'} dtype */
  constructor(data, shape, dtype, strides = null, offset = 0) {
    this.data = data; this.shape = shape; this.dtype = dtype; this.strides = strides ?? cStrides(shape); this.offset = offset;
    this.size = prodOf(shape);
  }
  get ndim() { return this.shape.length; }
  /** Laid out in C order without gaps (data[offset … offset+size)). */
  contiguous() {
    let k = 1;
    for (let i = this.shape.length - 1; i >= 0; i--) {
      if (this.shape[i] !== 1 && this.strides[i] !== k) return false;
      k *= this.shape[i];
    }
    return true;
  }
}

function newData(n, dtype = null) {
  if (n > NP_MAX) throw npErr('MemoryError', `Unable to allocate an array with ${n} elements (Natter allows at most ${NP_MAX}).`, 'npTooBig');
  return dtype && isStrDt(dtype) ? new Array(n).fill('') : new Float64Array(n);
}

export const fromFlat = (data, shape, dtype) => new Nd(data, shape, dtype);

/** Offsets of all elements in C order. */
function offsets(nd) {
  const n = nd.size;
  const out = new Int32Array(n);
  if (!n) return out;
  const d = nd.shape.length;
  if (d === 0) { out[0] = nd.offset; return out; }
  const idx = new Array(d).fill(0);
  const last = d - 1, sl = nd.strides[last], nl = nd.shape[last];
  let off = nd.offset, k = 0;
  for (;;) {
    for (let j = 0; j < nl; j++) out[k++] = off + j * sl;
    let a = last - 1;
    while (a >= 0) {
      idx[a]++; off += nd.strides[a];
      if (idx[a] < nd.shape[a]) break;
      off -= nd.strides[a] * nd.shape[a]; idx[a] = 0; a--;
    }
    if (a < 0) break;
  }
  return out;
}

/** Values in C order (a view of the data when contiguous: read only!). */
export function flat(nd) {
  if (nd.contiguous()) return nd.data.subarray ? nd.data.subarray(nd.offset, nd.offset + nd.size) : nd.data.slice(nd.offset, nd.offset + nd.size);
  if (nd.size && nd.strides.every((s) => s === 0)) return newData(nd.size, nd.dtype).fill(nd.data[nd.offset]);
  const o = offsets(nd), out = newData(o.length, nd.dtype);
  for (let i = 0; i < o.length; i++) out[i] = nd.data[o[i]];
  return out;
}

/** A contiguous copy. */
export const copyNd = (nd, dtype = nd.dtype) => new Nd(castData(flat(nd).slice(), nd.dtype, dtype), nd.shape.slice(), dtype);

function castData(data, from, to) {
  if (from === to) return data;
  if (isStrDt(to)) return isStrDt(from) ? data : Array.from(data, (v) => numText(v, from));
  if (isStrDt(from)) {
    return Float64Array.from(data, (t) => {
      const v = Number(t.trim());
      if (to === 'bool') return t.length ? 1 : 0;
      if (t.trim() === '' || Number.isNaN(v) && !/^[+-]?nan$/i.test(t.trim())) throw npErr('ValueError', to === 'int64' ? `invalid literal for int() with base 10: '${t}'` : `could not convert string to float: '${t}'`, 'npStrConvert');
      return to === 'int64' ? castInt(v) : v;
    });
  }
  if (to === 'float64') return data;
  if (to === 'bool') { for (let i = 0; i < data.length; i++) data[i] = data[i] !== 0 ? 1 : 0; return data; }
  if (from === 'float64') for (let i = 0; i < data.length; i++) data[i] = castInt(data[i]);
  return data;
}
const castInt = (v) => (Number.isFinite(v) ? Math.trunc(v) + 0 : -9223372036854775808);

export function astype(ctx, nd, dtype) {
  if (dtype === 'str') dtype = isStrDt(nd.dtype) ? nd.dtype : `<U${STR_LEN[nd.dtype]}`;
  if (dtype === nd.dtype) return copyNd(nd);
  const src = flat(nd);
  if (dtype === 'int64' && nd.dtype === 'float64' && ctx) {
    for (let i = 0; i < src.length; i++) if (!Number.isFinite(src[i])) { npWarn(ctx, 'invalid value encountered in cast'); break; }
  }
  return new Nd(castData(src.slice(), nd.dtype, dtype), nd.shape.slice(), dtype);
}

/** Shape of broadcasting a and b, or null. */
export function broadcastShapes(a, b) {
  const n = Math.max(a.length, b.length), out = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = a[a.length - n + i] ?? 1, y = b[b.length - n + i] ?? 1;
    if (x !== y && x !== 1 && y !== 1) return null;
    out[i] = x === 1 ? y : x;
  }
  return out;
}

/** View of nd broadcast to `shape` (strides 0 along stretched axes), or null if impossible. */
export function broadcastTo(nd, shape) {
  const n = shape.length, k = nd.shape.length;
  if (k > n) return null;
  const strides = new Array(n).fill(0);
  for (let i = 0; i < k; i++) {
    const s = nd.shape[i], t = shape[n - k + i];
    if (s === t) strides[n - k + i] = nd.strides[i];
    else if (s !== 1) return null;
  }
  return new Nd(nd.data, shape.slice(), nd.dtype, strides, nd.offset);
}

/** Values of nd broadcast to `shape`, in C order. */
function flatAs(nd, shape) {
  if (nd.size === 1) return newData(prodOf(shape), nd.dtype).fill(nd.data[nd.offset]);
  if (nd.shape.length === shape.length && nd.shape.every((s, i) => s === shape[i])) return flat(nd);
  return flat(broadcastTo(nd, shape));
}

/** Shape as numpy writes it in error messages: (2,3), (3,). */
export const shapeErr = (shape) => (shape.length === 1 ? `(${shape[0]},)` : `(${shape.join(',')})`);
const broadcastErr = (a, b) => npErr('ValueError', `operands could not be broadcast together with shapes ${shapeErr(a)} ${shapeErr(b)} `, 'npBroadcast', { a: shapeErr(a), b: shapeErr(b) });

// ---------- Python values ----------

/** The class numpy.ndarray; methods are natives `_np.nd.<name>` (filled in below). */
export const NDARRAY = new PyClass('numpy.ndarray', [OBJECT], new Map(), 'ndarray');
export const DTYPE = new PyClass('numpy.dtype', [OBJECT], new Map(), 'dtype');

export const isArr = (v) => v instanceof PyInstance && v.nd !== undefined;
export function wrap(nd) { const o = new PyInstance(NDARRAY); o.nd = nd; return o; }

/** Python value of one element. */
export function toPy(v, dtype) {
  if (dtype === 'float64') return new PyFloat(v);
  if (typeof v === 'string') return v;
  if (dtype === 'bool') return v !== 0;
  if (v === 0) return 0;
  return Number.isSafeInteger(v) ? v : normBig(BigInt(v));
}
/** A 0-d result as a Python number, anything else as an array. */
export const result = (nd) => (nd.shape.length === 0 ? toPy(nd.data[nd.offset], nd.dtype) : wrap(nd));

const dtypeOfScalar = (v) => (typeof v === 'boolean' ? 'bool' : v instanceof PyFloat ? 'float64' : 'int64');

function shapeOf(x, path) {
  if (isArr(x)) return x.nd.shape.slice();
  if (x instanceof PyList || x instanceof PyTuple) {
    const n = x.items.length;
    if (!n) return [0];
    const first = shapeOf(x.items[0], [...path, n]);
    for (let i = 1; i < n; i++) {
      const s = shapeOf(x.items[i], [...path, n]);
      if (s.length !== first.length || s.some((v, j) => v !== first[j])) {
        const dims = [...path, n];
        throw npErr('ValueError', `setting an array element with a sequence. The requested array has an inhomogeneous shape after ${dims.length} dimensions. The detected shape was ${shapeText(dims)} + inhomogeneous part.`, 'npInhomogeneous');
      }
    }
    return [n, ...first];
  }
  if (x instanceof PyRange) return [rangeItems(x).length];
  return [];
}

/** Number of a Python scalar (bool, int, float) or a TypeError. */
export function scalarNum(v, what = 'value') {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof PyFloat) return v.v;
  throw npErr('TypeError', `Natter's numpy only works with numbers (int, float, bool), not '${typeName(v)}' (${what})`, 'npNotNumber', { type: typeName(v) });
}

/** Any Python value (array, nested lists, number) as an Nd; dtype forces the element type. */
export function toNd(v, dtype = null) {
  if (isArr(v)) return dtype && dtype !== v.nd.dtype ? astype(null, v.nd, dtype) : v.nd;
  if (isNum(v)) {
    const dt = dtype ?? dtypeOfScalar(v);
    const d = new Float64Array(1);
    d[0] = scalarNum(v);
    return new Nd(castData(d, dtypeOfScalar(v), dt), [], dt);
  }
  if (typeof v === 'string') return new Nd([v], [], dtype && dtype !== 'str' ? dtype : `<U${v.length}`);
  if (!(v instanceof PyList || v instanceof PyTuple || v instanceof PyRange)) {
    if (v === null || v === undefined) throw npErr('TypeError', "Natter's numpy only works with numbers and texts, not None", 'npNotNumber', { type: 'NoneType' });
    scalarNum(v);
  }
  const shape = shapeOf(v, []);
  const n = prodOf(shape);
  if (hasText(v)) return textNd(v, shape, n, dtype);
  const data = newData(n);
  let kind = 0, k = 0;
  const fill = (x) => {
    if (isArr(x)) {
      const f = flat(x.nd);
      for (let i = 0; i < f.length; i++) data[k++] = f[i];
      kind = Math.max(kind, DT_RANK[x.nd.dtype]);
    } else if (x instanceof PyList || x instanceof PyTuple) { for (const y of x.items) fill(y); } else if (x instanceof PyRange) {
      for (const y of rangeItems(x)) data[k++] = y;
      kind = Math.max(kind, 1);
    } else {
      data[k++] = scalarNum(x);
      kind = Math.max(kind, typeof x === 'boolean' ? 0 : x instanceof PyFloat ? 2 : 1);
    }
  };
  fill(v);
  const inferred = n === 0 ? 'float64' : ['bool', 'int64', 'float64'][kind];
  const dt = dtype === 'str' ? `<U${STR_LEN[inferred]}` : dtype ?? inferred;
  return new Nd(castData(data, inferred, dt), shape, dt);
}

/** Does a nested list contain a text (or a text array)? */
function hasText(x) {
  if (typeof x === 'string') return true;
  if (isArr(x)) return isStrDt(x.nd.dtype);
  if (x instanceof PyList || x instanceof PyTuple) return x.items.some(hasText);
  return false;
}

/** Text array from nested lists: numbers become their texts, the length is numpy's itemsize. */
function textNd(v, shape, n, dtype) {
  const data = new Array(n);
  let k = 0, len = 0;
  const fill = (x) => {
    if (isArr(x)) { const f = flat(x.nd); for (const t of f) data[k++] = isStrDt(x.nd.dtype) ? t : numText(t, x.nd.dtype); len = Math.max(len, isStrDt(x.nd.dtype) ? strLen(x.nd.dtype) : STR_LEN[x.nd.dtype]); } else if (x instanceof PyList || x instanceof PyTuple) { for (const y of x.items) fill(y); } else if (typeof x === 'string') { data[k++] = x; len = Math.max(len, x.length); } else {
      const dt = dtypeOfScalar(x);
      data[k++] = numText(scalarNum(x), dt);
      len = Math.max(len, STR_LEN[dt]);
    }
  };
  fill(v);
  const dt = `<U${len}`;
  if (dtype && dtype !== 'str' && !isStrDt(dtype)) return new Nd(castData(data, dt, dtype), shape, dtype);
  return new Nd(data, shape, dtype && isStrDt(dtype) ? dtype : dt);
}

/** Operand of an operator: array, number or list (Python numbers keep the array's dtype where they fit). */
function operand(v) {
  if (isArr(v)) return v.nd;
  if (isNum(v) || v instanceof PyList || v instanceof PyTuple || (typeof v === 'string')) return toNd(v);
  return null;
}

// ---------- dtype ----------

const DTYPE_NAMES = {
  float64: 'float64', float: 'float64', f8: 'float64', d: 'float64', float32: 'float64', f4: 'float64', float16: 'float64', double: 'float64',
  int64: 'int64', int: 'int64', i8: 'int64', int32: 'int64', i4: 'int64', int16: 'int64', int8: 'int64', uint8: 'int64', uint16: 'int64', uint32: 'int64', uint64: 'int64', intp: 'int64', l: 'int64',
  bool: 'bool', bool_: 'bool', '?': 'bool', b1: 'bool',
  str: 'str', str_: 'str', U: 'str', unicode: 'str',
};

/** dtype argument (np.float64, float, 'int32', a dtype object …) → 'bool' | 'int64' | 'float64'. */
export function resolveDtype(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof PyInstance && v.dt) return v.dt;
  let name = null;
  if (typeof v === 'string') name = v;
  else if (v instanceof PyBuiltin) name = v.name.replace(/^_np\./, '').replace(/^class:/, '');
  const dt = name !== null ? DTYPE_NAMES[name] : undefined;
  if (dt) return dt;
  if (name && /^<?U\d+$/.test(name)) return `<U${name.replace(/^<?U/, '')}`;
  throw npErr('TypeError', `data type ${typeof v === 'string' ? `'${v}'` : typeName(v)} not understood (Natter's numpy knows int64, float64 and bool)`, 'npDtype');
}

function dtypeObj(dt) { const o = new PyInstance(DTYPE); o.dt = dt; return o; }

// ---------- Element-wise operations ----------

const UFUNC_NAME = { '+': 'add', '-': 'subtract', '*': 'multiply', '/': 'divide', '//': 'floor_divide', '%': 'remainder', '**': 'power', '&': 'bitwise_and', '|': 'bitwise_or', '^': 'bitwise_xor', '<<': 'left_shift', '>>': 'right_shift' };

/** float floor division and remainder like numpy (npy_divmod, same as CPython's float_divmod). */
function fdivmod(vx, wx) {
  if (wx === 0) return [vx / wx, NaN];
  let mod = vx % wx;
  let div = (vx - mod) / wx;
  if (mod) { if ((wx < 0) !== (mod < 0)) { mod += wx; div -= 1; } } else mod = wx < 0 ? -0 : 0;
  let fl;
  if (div) { fl = Math.floor(div); if (div - fl > 0.5) fl += 1; } else fl = vx / wx < 0 || Object.is(vx / wx, -0) ? -0 : 0;
  return [fl, mod];
}

/** x ** y for floats (C99 pow, correctly rounded). */
const fpow = (x, y) => M.pow(x, y);

function intPow(x, y) {
  let r = 1, b = x, e = y;
  while (e > 0) { if (e % 2 === 1) r *= b; e = Math.floor(e / 2); if (e > 0) b *= b; }
  return r;
}

function binaryDtype(op, a, b) {
  const p = promote(a, b);
  if (op === '/') return 'float64';
  if (op === '==' || op === '!=' || op === '<' || op === '>' || op === '<=' || op === '>=') return 'bool';
  if (op === '//' || op === '%' || op === '**' || op === '<<' || op === '>>') return p === 'bool' ? 'int64' : p;
  if (op === '-' && p === 'bool') throw npErr('TypeError', 'numpy boolean subtract, the `-` operator, is not supported, use the bitwise_xor, the `^` operator, or the logical_xor function instead.', 'npBoolSub');
  if ((op === '&' || op === '|' || op === '^' || op === '<<' || op === '>>') && p === 'float64') {
    throw npErr('TypeError', `ufunc '${UFUNC_NAME[op]}' not supported for the input types, and the inputs could not be safely coerced to any supported types according to the casting rule ''safe''`, 'npUfuncType');
  }
  return p;
}

/** a op b for arrays (with broadcasting). */
export function binop(ctx, op, A, B) {
  const shape = broadcastShapes(A.shape, B.shape);
  if (!shape) throw broadcastErr(A.shape, B.shape);
  if (isStrDt(A.dtype) || isStrDt(B.dtype)) return textBinop(op, A, B, shape);
  const dt = binaryDtype(op, A.dtype, B.dtype);
  const n = prodOf(shape);
  const x = flatAs(A, shape), y = flatAs(B, shape);
  const out = newData(n);
  const fl = new Flags(UFUNC_NAME[op]);
  const isInt = dt === 'int64' || (dt === 'bool' && op !== '/');
  const intIn = promote(A.dtype, B.dtype) !== 'float64';
  switch (op) {
    case '+': if (dt === 'bool') for (let i = 0; i < n; i++) out[i] = x[i] || y[i] ? 1 : 0; else for (let i = 0; i < n; i++) { out[i] = x[i] + y[i]; if (!isInt) fl.check(out[i], x[i], y[i]); } break;
    case '-': for (let i = 0; i < n; i++) { out[i] = x[i] - y[i]; if (!isInt) fl.check(out[i], x[i], y[i]); } break;
    case '*': if (dt === 'bool') for (let i = 0; i < n; i++) out[i] = x[i] && y[i] ? 1 : 0; else for (let i = 0; i < n; i++) { out[i] = x[i] * y[i]; if (!isInt) fl.check(out[i], x[i], y[i]); } break;
    case '/': for (let i = 0; i < n; i++) { out[i] = x[i] / y[i]; fl.check(out[i], x[i], y[i]); } break;
    case '//':
      if (intIn) for (let i = 0; i < n; i++) { if (y[i] === 0) { out[i] = 0; fl.divide = true; } else out[i] = Math.floor(x[i] / y[i]) + 0; }
      else for (let i = 0; i < n; i++) { out[i] = fdivmod(x[i], y[i])[0]; if (y[i] === 0) { if (x[i] === 0 || Number.isNaN(x[i])) { if (!Number.isNaN(x[i])) fl.invalid = true; } else if (Number.isFinite(x[i])) fl.divide = true; } }
      break;
    case '%':
      if (intIn) for (let i = 0; i < n; i++) { if (y[i] === 0) { out[i] = 0; fl.divide = true; } else { const r = x[i] % y[i]; out[i] = (r !== 0 && (r < 0) !== (y[i] < 0) ? r + y[i] : r) + 0; } }
      else for (let i = 0; i < n; i++) { if (y[i] === 0) { out[i] = NaN; if (!Number.isNaN(x[i])) fl.invalid = true; } else out[i] = fdivmod(x[i], y[i])[1]; }
      break;
    case '**':
      if (intIn) {
        for (let i = 0; i < n; i++) {
          if (y[i] < 0) throw npErr('ValueError', 'Integers to negative integer powers are not allowed.', 'npIntPower');
          out[i] = intPow(x[i], y[i]);
        }
      } else if (B.size === 1 && (y[0] === 2 || y[0] === 0.5 || y[0] === -1 || y[0] === 1)) {
        // numpy's fast_scalar_power: a ** 2 is square, ** 0.5 sqrt, ** -1 reciprocal (exactly what numpy computes)
        const e = y[0];
        if (e === 0.5) fl.name = 'sqrt'; else if (B.dtype !== 'float64') fl.name = e === 2 ? 'square' : e === -1 ? 'reciprocal' : fl.name;
        for (let i = 0; i < n; i++) { const v = x[i]; out[i] = e === 2 ? v * v : e === 0.5 ? Math.sqrt(v) : e === -1 ? 1 / v : v; fl.check(out[i], v, e === -1 ? v : e); }
      } else for (let i = 0; i < n; i++) { out[i] = fpow(x[i], y[i]); fl.check(out[i], x[i], y[i]); }
      break;
    case '==': for (let i = 0; i < n; i++) out[i] = x[i] === y[i] ? 1 : 0; break;
    case '!=': for (let i = 0; i < n; i++) out[i] = x[i] !== y[i] ? 1 : 0; break;
    case '<': for (let i = 0; i < n; i++) out[i] = x[i] < y[i] ? 1 : 0; break;
    case '>': for (let i = 0; i < n; i++) out[i] = x[i] > y[i] ? 1 : 0; break;
    case '<=': for (let i = 0; i < n; i++) out[i] = x[i] <= y[i] ? 1 : 0; break;
    case '>=': for (let i = 0; i < n; i++) out[i] = x[i] >= y[i] ? 1 : 0; break;
    case '&': case '|': case '^': case '<<': case '>>':
      for (let i = 0; i < n; i++) {
        const a = BigInt.asIntN(64, BigInt(x[i])), b = BigInt.asIntN(64, BigInt(y[i]));
        const r = op === '&' ? a & b : op === '|' ? a | b : op === '^' ? a ^ b : op === '<<' ? BigInt.asIntN(64, a << b) : a >> b;
        out[i] = Number(r);
      }
      break;
    default: throw npErr('TypeError', `operator ${op} is not supported for arrays`);
  }
  fl.emit(ctx);
  return new Nd(out, shape, dt);
}

/** Operators on text arrays: comparisons and + (joining texts). */
function textBinop(op, A, B, shape) {
  const n = prodOf(shape), x = flatAs(A, shape), y = flatAs(B, shape);
  const both = isStrDt(A.dtype) && isStrDt(B.dtype);
  if (op === '+' && both) {
    const out = newData(n, '<U1');
    for (let i = 0; i < n; i++) out[i] = x[i] + y[i];
    return new Nd(out, shape, `<U${strLen(A.dtype) + strLen(B.dtype)}`);
  }
  const CMP = { '==': (a, b) => a === b, '!=': (a, b) => a !== b, '<': (a, b) => a < b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '>=': (a, b) => a >= b };
  if (CMP[op] && (both || op === '==' || op === '!=')) {
    const out = newData(n);
    for (let i = 0; i < n; i++) out[i] = both ? (CMP[op](x[i], y[i]) ? 1 : 0) : op === '!=' ? 1 : 0;
    return new Nd(out, shape, 'bool');
  }
  throw npErr('UFuncTypeError', `ufunc '${UFUNC_NAME[op] ?? op}' did not contain a loop with signature matching types (dtype('${A.dtype}'), dtype('${B.dtype}')) -> None`, 'npStrMath');
}

/** max/min/... of two arrays: function f(x, y) element-wise, result dtype promoted (or forced). */
function zipWith(ctx, A, B, f, dtype = null, name = null) {
  needNumeric(A, name ?? 'ufunc'); needNumeric(B, name ?? 'ufunc');
  dtype ??= promote(A.dtype, B.dtype);
  const shape = broadcastShapes(A.shape, B.shape);
  if (!shape) throw broadcastErr(A.shape, B.shape);
  const x = flatAs(A, shape), y = flatAs(B, shape), n = prodOf(shape), out = newData(n);
  const fl = name ? new Flags(name) : null;
  for (let i = 0; i < n; i++) { out[i] = f(x[i], y[i]); if (fl) fl.check(out[i], x[i], y[i]); }
  if (fl) fl.emit(ctx);
  return new Nd(out, shape, dtype);
}

/** Element-wise function of one array. `dt`: 'float' (result float64), 'same' (keep dtype), 'bool'. */
export function unaryMap(ctx, A, f, dt, name) {
  needNumeric(A, name);
  if (dt === 'same' && A.dtype === 'bool' && (name === 'negative')) {
    throw npErr('TypeError', 'The numpy boolean negative, the `-` operator, is not supported, use the `~` operator or the logical_not function instead.', 'npBoolNeg');
  }
  const x = flat(A), n = x.length, out = newData(n);
  const fl = new Flags(name);
  for (let i = 0; i < n; i++) {
    const r = f(x[i]);
    out[i] = r;
    if (Number.isNaN(r)) { if (!Number.isNaN(x[i])) fl.invalid = true; } else if (!Number.isFinite(r) && Number.isFinite(x[i])) { if (x[i] === 0) fl.divide = true; else fl.overflow = true; }
  }
  fl.emit(ctx);
  const rdt = dt === 'float' ? 'float64' : dt === 'bool' ? 'bool' : dt === 'int' ? 'int64' : A.dtype === 'bool' && dt === 'same+' ? 'int64' : A.dtype;
  return new Nd(out, A.shape.slice(), rdt);
}

const rint = (x) => {
  if (!Number.isFinite(x)) return x;
  const f = Math.floor(x), d = x - f;
  let r = d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1);
  if (r === 0 && (x < 0 || Object.is(x, -0))) r = -0;
  return r;
};
const DEG = 180 / 3.141592653589793;

/** The functions of one argument: name → [f, result kind]. Integer arrays give floats for the transcendental ones. */
const UNARY = {
  sqrt: [(x) => Math.sqrt(x), 'float'],
  exp: [M.exp, 'float'], exp2: [(x) => M.pow(2, x), 'float'], expm1: [M.expm1, 'float'],
  log: [M.log, 'float'], log2: [M.log2, 'float'], log10: [M.log10, 'float'], log1p: [M.log1p, 'float'],
  sin: [M.sin, 'float'], cos: [M.cos, 'float'], tan: [M.tan, 'float'],
  arcsin: [M.asin, 'float'], arccos: [M.acos, 'float'], arctan: [M.atan, 'float'],
  sinh: [M.sinh, 'float'], cosh: [M.cosh, 'float'], tanh: [M.tanh, 'float'],
  arcsinh: [M.asinh, 'float'], arccosh: [M.acosh, 'float'], arctanh: [M.atanh, 'float'],
  degrees: [(x) => x * DEG, 'float'], radians: [(x) => x * (3.141592653589793 / 180), 'float'],
  rad2deg: [(x) => x * DEG, 'float'], deg2rad: [(x) => x * (3.141592653589793 / 180), 'float'],
  absolute: [(x) => Math.abs(x), 'same'], fabs: [(x) => Math.abs(x), 'float'],
  negative: [(x) => -x, 'same'], positive: [(x) => x, 'same'],
  floor: [(x) => Math.floor(x), 'same'], ceil: [(x) => Math.ceil(x), 'same'], trunc: [(x) => Math.trunc(x), 'same'],
  rint: [rint, 'same'], fix: [(x) => Math.trunc(x), 'same'],
  sign: [(x) => (Number.isNaN(x) ? NaN : x > 0 ? 1 : x < 0 ? -1 : 0), 'same+'],
  square: [(x) => x * x, 'same+'], reciprocal: [(x) => 1 / x, 'same'], cbrt: [(x) => (x < 0 ? -M.pow(-x, 1 / 3) : M.pow(x, 1 / 3)), 'float'],
  isnan: [(x) => (Number.isNaN(x) ? 1 : 0), 'bool'], isinf: [(x) => (x === Infinity || x === -Infinity ? 1 : 0), 'bool'],
  isfinite: [(x) => (Number.isFinite(x) ? 1 : 0), 'bool'], logical_not: [(x) => (x === 0 ? 1 : 0), 'bool'],
  signbit: [(x) => (x < 0 || Object.is(x, -0) ? 1 : 0), 'bool'],
};
UNARY.abs = UNARY.absolute;

export function applyUnary(ctx, name, A) {
  const [f, kind] = UNARY[name];
  if (name === 'reciprocal' && A.dtype !== 'float64') return unaryMap(ctx, A, (x) => (x === 0 ? -9223372036854775808 : Math.trunc(1 / x) + 0), 'same', name);
  if ((name === 'sign' || name === 'square') && A.dtype === 'bool') {
    if (name === 'sign') throw npErr('TypeError', "ufunc 'sign' did not contain a loop with signature matching types <class 'numpy.dtypes.BoolDType'> -> None");
  }
  return unaryMap(ctx, A, f, kind, name);
}

// ---------- Indexing ----------

const idxErr = (msg, what = 'npIndex') => npErr('IndexError', msg, what);
const ADV_MSG = 'only integers, slices (`:`), ellipsis (`...`), numpy.newaxis (`None`) and integer or boolean arrays are valid indices';

/** Indices of the true entries of a bool array: one int array per dimension (np.nonzero). */
function nonzero(nd) {
  const f = flat(nd);
  const strides = cStrides(nd.shape);
  const hits = [];
  for (let i = 0; i < f.length; i++) if (f[i] !== 0) hits.push(i);
  return nd.shape.map((s, d) => {
    const out = new Float64Array(hits.length);
    for (let k = 0; k < hits.length; k++) out[k] = Math.floor(hits[k] / strides[d]) % s;
    return new Nd(out, [hits.length], 'int64');
  });
}

/**
 * Resolve an index expression. Result: { view } for basic indexing (a view on the data), or
 * { shape, offs } with the data offsets of all selected elements in C order (advanced indexing).
 */
function resolveIndex(nd, key) {
  let items = key instanceof PyTuple ? key.items : [key];
  // bool arrays become one int array per dimension they cover
  const entries = [];
  for (const it of items) {
    if (it === null || it === undefined) entries.push({ t: 'new' });
    else if (it instanceof PySlice) entries.push({ t: 'slice', s: it });
    else if (typeof it === 'number' || typeof it === 'bigint' || typeof it === 'boolean') entries.push({ t: 'int', i: Number(it) });
    else if (isArr(it) || it instanceof PyList) {
      const a = isArr(it) ? it.nd : toNd(it);
      if (a.dtype === 'bool') {
        const dim = entries.filter((e) => e.t !== 'new').length;
        for (let d = 0; d < a.ndim; d++) {
          const have = nd.shape[dim + d];
          if (have === undefined) throw idxErr(`too many indices for array: array is ${nd.ndim}-dimensional, but ${dim + a.ndim} were indexed`, 'npTooManyIndices');
          if (have !== a.shape[d]) throw idxErr(`boolean index did not match indexed array along axis ${dim + d}; size of axis is ${have} but size of corresponding boolean axis is ${a.shape[d]}`, 'npMask');
        }
        for (const z of nonzero(a)) entries.push({ t: 'adv', a: z });
      } else if (a.dtype === 'int64' || a.size === 0) entries.push({ t: 'adv', a: a.dtype === 'int64' ? a : new Nd(new Float64Array(0), a.shape, 'int64') });
      else throw idxErr('arrays used as indices must be of integer (or boolean) type', 'npIndexType');
    } else throw idxErr(ADV_MSG, 'npIndexType');
  }
  const used = entries.filter((e) => e.t !== 'new').length;
  if (used > nd.ndim) throw idxErr(`too many indices for array: array is ${nd.ndim}-dimensional, but ${used} were indexed`, 'npTooManyIndices');
  for (let d = used; d < nd.ndim; d++) entries.push({ t: 'slice', s: new PySlice(null, null, null) });
  const hasAdv = entries.some((e) => e.t === 'adv');
  let offset = nd.offset;
  if (!hasAdv) {
    const shape = [], strides = [];
    let d = 0;
    for (const e of entries) {
      if (e.t === 'new') { shape.push(1); strides.push(0); continue; }
      const len = nd.shape[d], st = nd.strides[d];
      if (e.t === 'int') {
        let i = e.i;
        if (i < -len || i >= len) throw idxErr(`index ${e.i} is out of bounds for axis ${d} with size ${len}`, 'npBounds');
        if (i < 0) i += len;
        offset += i * st;
      } else {
        const [start, stop, step] = sliceIndices(e.s, len);
        const n = step > 0 ? Math.max(0, Math.ceil((stop - start) / step)) : Math.max(0, Math.ceil((start - stop) / -step));
        shape.push(n); strides.push(st * step);
        if (n) offset += start * st;
      }
      d++;
    }
    return { view: new Nd(nd.data, shape, nd.dtype, strides, offset) };
  }
  // advanced indexing: plain ints count as 0-d index arrays; all index arrays are broadcast together
  const groups = []; // pseudo dimensions: { n, contrib: Float64Array }
  const adv = [];
  let d = 0, advPos = -1, advContiguous = true, lastAdv = -2, pos = 0;
  const basic = [];
  for (const e of entries) {
    if (e.t === 'new') { basic.push({ at: pos++, n: 1, contrib: new Float64Array(1) }); continue; }
    const len = nd.shape[d], st = nd.strides[d];
    if (e.t === 'int' || e.t === 'adv') {
      const a = e.t === 'int' ? new Nd(Float64Array.of(e.i), [], 'int64') : e.a;
      const f = flat(a).slice();
      for (let k = 0; k < f.length; k++) {
        if (f[k] < -len || f[k] >= len) throw idxErr(`index ${f[k]} is out of bounds for axis ${d} with size ${len}`, 'npBounds');
        if (f[k] < 0) f[k] += len;
      }
      adv.push({ a: new Nd(f, a.shape.slice(), 'int64'), st });
      if (advPos < 0) advPos = pos;
      else if (lastAdv !== pos - 1) advContiguous = false;
      lastAdv = pos;
      pos++;
    } else {
      const [start, stop, step] = sliceIndices(e.s, len);
      const n = step > 0 ? Math.max(0, Math.ceil((stop - start) / step)) : Math.max(0, Math.ceil((start - stop) / -step));
      const c = new Float64Array(n);
      for (let k = 0; k < n; k++) c[k] = (start + k * step) * st;
      basic.push({ at: pos++, n, contrib: c });
    }
    d++;
  }
  let bshape = [];
  for (const x of adv) {
    const s = broadcastShapes(bshape, x.a.shape);
    if (!s) throw idxErr(`shape mismatch: indexing arrays could not be broadcast together with shapes ${adv.map((y) => shapeErr(y.a.shape)).join(' ')} `, 'npIndexShape');
    bshape = s;
  }
  const bn = prodOf(bshape);
  const advContrib = new Float64Array(bn);
  for (const x of adv) { const f = flatAs(x.a, bshape); for (let k = 0; k < bn; k++) advContrib[k] += f[k] * x.st; }
  const advGroup = { n: bn, contrib: advContrib, shape: bshape };
  if (advContiguous) {
    for (const b of basic) groups.push(b);
    groups.splice(basic.filter((b) => b.at < advPos).length, 0, advGroup);
  } else groups.push(advGroup, ...basic);
  const shape = groups.flatMap((g) => (g === advGroup ? bshape : [g.n]));
  const total = prodOf(shape);
  if (total > NP_MAX) newData(total);
  const offs = new Int32Array(total);
  // odometer over the pseudo dimensions
  const ng = groups.length, idx = new Array(ng).fill(0);
  if (total) {
    let k = 0;
    for (;;) {
      let off = offset;
      for (let g = 0; g < ng; g++) off += groups[g].contrib[idx[g]];
      offs[k++] = off;
      let g = ng - 1;
      while (g >= 0) { if (++idx[g] < groups[g].n) break; idx[g] = 0; g--; }
      if (g < 0) break;
    }
  }
  return { shape, offs };
}

export function getIndex(nd, key) {
  const r = resolveIndex(nd, key);
  if (r.view) return r.view;
  const out = newData(r.offs.length, nd.dtype);
  for (let i = 0; i < out.length; i++) out[i] = nd.data[r.offs[i]];
  return new Nd(out, r.shape, nd.dtype);
}

export function setIndex(ctx, nd, key, value) {
  const r = resolveIndex(nd, key);
  const shape = r.view ? r.view.shape : r.shape;
  const V = toNd(value);
  const b = broadcastTo(V, shape);
  if (!b) throw npErr('ValueError', `could not broadcast input array from shape ${shapeErr(V.shape)} into shape ${shapeErr(shape)}`, 'npAssignShape');
  let vals = flat(b);
  if (isStrDt(nd.dtype) || isStrDt(V.dtype)) {
    if (nd.dtype !== V.dtype) vals = castData(isStrDt(V.dtype) ? Array.from(vals) : vals.slice(), V.dtype, nd.dtype);
    if (isStrDt(nd.dtype)) { const L = strLen(nd.dtype); vals = Array.from(vals, (t) => t.slice(0, L)); }
  } else if (nd.dtype !== V.dtype) {
    if (nd.dtype === 'int64' && V.dtype === 'float64') {
      for (let i = 0; i < vals.length; i++) if (!Number.isFinite(vals[i])) throw npErr('ValueError', `cannot convert float ${Number.isNaN(vals[i]) ? 'NaN' : 'infinity'} to integer`, 'npNanToInt');
    }
    vals = castData(vals.slice(), V.dtype, nd.dtype);
  }
  const offs = r.view ? offsets(r.view) : r.offs;
  if (r.view && r.view.data === V.data) vals = vals.slice(); // a[1:] = a[:-1] reads before it writes
  for (let i = 0; i < offs.length; i++) nd.data[offs[i]] = vals[i];
}

// ---------- Shape changes ----------

/** New shape for reshape (one -1 allowed). */
function newShape(nd, args) {
  let items = args.length === 1 && (args[0] instanceof PyTuple || args[0] instanceof PyList) ? args[0].items : args;
  const shape = items.map((v) => { if (!isInt(v)) throw npErr('TypeError', `'${typeName(v)}' object cannot be interpreted as an integer`); return Number(num(v)); });
  const unknown = shape.filter((s) => s === -1).length;
  if (unknown > 1) throw npErr('ValueError', 'can only specify one unknown dimension');
  const known = prodOf(shape.filter((s) => s !== -1));
  if (unknown) {
    if (known === 0 || nd.size % known !== 0) throw reshapeErr(nd, shape);
    shape[shape.indexOf(-1)] = nd.size / known;
  }
  if (prodOf(shape) !== nd.size || shape.some((s) => s < 0)) throw reshapeErr(nd, shape);
  return shape;
}
const reshapeErr = (nd, shape) => {
  const t = shapeErr(shape).replace(/-1/g, 'newaxis'); // numpy's wording for the unknown dimension
  return npErr('ValueError', `cannot reshape array of size ${nd.size} into shape ${t}`, 'npReshape', { size: nd.size, shape: t });
};

export function reshape(nd, shape) {
  if (nd.contiguous()) return new Nd(nd.data, shape, nd.dtype, null, nd.offset);
  return new Nd(flat(nd).slice(), shape, nd.dtype);
}

export function transpose(nd, axes = null) {
  const order = axes ?? nd.shape.map((_, i) => nd.ndim - 1 - i);
  return new Nd(nd.data, order.map((a) => nd.shape[a]), nd.dtype, order.map((a) => nd.strides[a]), nd.offset);
}

function normAxis(axis, ndim) {
  const a = Number(num(axis));
  if (a < -ndim || a >= ndim) throw npErr('AxisError', `axis ${a} is out of bounds for array of dimension ${ndim}`, 'npAxis');
  return a < 0 ? a + ndim : a;
}

/** View with `axis` moved to the end. */
const axisLast = (nd, axis) => transpose(nd, [...nd.shape.keys()].filter((i) => i !== axis).concat([axis]));

// ---------- Reductions ----------

/** numpy's pairwise summation (pairwise_sum_DOUBLE): the same rounding as numpy. */
export function pairwiseSum(a, lo, n) {
  if (n < 8) {
    let res = 0;
    for (let i = 0; i < n; i++) res += a[lo + i];
    return res;
  }
  if (n <= 128) {
    const r = [a[lo], a[lo + 1], a[lo + 2], a[lo + 3], a[lo + 4], a[lo + 5], a[lo + 6], a[lo + 7]];
    let i;
    for (i = 8; i < n - (n % 8); i += 8) {
      r[0] += a[lo + i]; r[1] += a[lo + i + 1]; r[2] += a[lo + i + 2]; r[3] += a[lo + i + 3];
      r[4] += a[lo + i + 4]; r[5] += a[lo + i + 5]; r[6] += a[lo + i + 6]; r[7] += a[lo + i + 7];
    }
    let res = ((r[0] + r[1]) + (r[2] + r[3])) + ((r[4] + r[5]) + (r[6] + r[7]));
    for (; i < n; i++) res += a[lo + i];
    return res;
  }
  let n2 = Math.floor(n / 2);
  n2 -= n2 % 8;
  return pairwiseSum(a, lo, n2) + pairwiseSum(a, lo + n2, n - n2);
}

/**
 * Reduce along an axis (or all: axis null). fn(values, lo, len, pairwise) → number.
 * Returns an Nd with the axis removed (or kept with length 1).
 */
function reduceAxis(nd, axis, keepdims, fn, dtype, name) {
  needNumeric(nd, name ?? 'add');
  if (axis === null || axis === undefined) {
    const f = flat(nd);
    if (!f.length && name) throw npErr('ValueError', `zero-size array to reduction operation ${name} which has no identity`, 'npEmptyReduce');
    const v = fn(f, 0, f.length, true);
    return new Nd(Float64Array.of(v), keepdims ? nd.shape.map(() => 1) : [], dtype);
  }
  const ax = normAxis(axis, nd.ndim);
  const len = nd.shape[ax];
  const rest = nd.shape.filter((_, i) => i !== ax);
  const m = prodOf(rest);
  if (!len && name && m) throw npErr('ValueError', `zero-size array to reduction operation ${name} which has no identity`, 'npEmptyReduce');
  const f = flat(axisLast(nd, ax));
  const out = newData(m);
  const pairwise = ax === nd.ndim - 1;
  for (let i = 0; i < m; i++) out[i] = fn(f, i * len, len, pairwise);
  const shape = keepdims ? nd.shape.map((s, i) => (i === ax ? 1 : s)) : rest;
  return new Nd(out, shape, dtype);
}

const sumFn = (a, lo, n, pairwise) => {
  if (pairwise) return pairwiseSum(a, lo, n);
  let s = n ? a[lo] : 0;
  for (let i = 1; i < n; i++) s += a[lo + i];
  return s;
};
const intSum = (dt) => (dt === 'float64' ? 'float64' : 'int64');

export function sumNd(nd, axis, keepdims = false) { return reduceAxis(nd, axis, keepdims, sumFn, intSum(nd.dtype)); }

export function meanNd(ctx, nd, axis, keepdims = false) {
  const n = axis === null || axis === undefined ? nd.size : nd.shape[normAxis(axis, nd.ndim)];
  const s = reduceAxis(nd, axis, keepdims, sumFn, 'float64');
  if (n === 0) npWarn(ctx, 'Mean of empty slice');
  const d = s.data;
  const fl = new Flags('divide');
  for (let i = 0; i < d.length; i++) { const r = d[i] / n; if (n !== 0) fl.check(r, d[i], n); d[i] = r; }
  if (n === 0 && nd.size === 0) npWarn(ctx, 'invalid value encountered in scalar divide');
  return s;
}

export function varNd(ctx, nd, axis, ddof = 0, keepdims = false) {
  const n = axis === null || axis === undefined ? nd.size : nd.shape[normAxis(axis, nd.ndim)];
  const mean = meanNd(ctx, nd, axis, true);
  const x = binop(ctx, '-', nd.dtype === 'float64' ? nd : astype(null, nd, 'float64'), mean);
  const xd = x.data;
  for (let i = 0; i < xd.length; i++) xd[i] *= xd[i];
  const s = reduceAxis(x, axis, keepdims, sumFn, 'float64');
  const div = Math.max(n - ddof, 0);
  if (div <= 0) npWarn(ctx, 'Degrees of freedom <= 0 for slice');
  for (let i = 0; i < s.data.length; i++) s.data[i] /= div;
  return s;
}

function minMaxFn(isMax) {
  return (a, lo, n) => {
    let best = a[lo];
    for (let i = 1; i < n; i++) {
      const v = a[lo + i];
      if (Number.isNaN(best)) break;
      if (Number.isNaN(v) || (isMax ? v > best : v < best)) best = v;
    }
    return best;
  };
}
function argFn(isMax) {
  return (a, lo, n) => {
    let best = a[lo], k = 0;
    for (let i = 1; i < n; i++) {
      const v = a[lo + i];
      if (Number.isNaN(best)) break;
      if (Number.isNaN(v) || (isMax ? v > best : v < best)) { best = v; k = i; }
    }
    return k;
  };
}

/** Sorted copy of numbers with NaN at the end (numpy's order). */
const sortNum = (arr) => arr.sort((x, y) => (Number.isNaN(x) ? (Number.isNaN(y) ? 0 : 1) : Number.isNaN(y) ? -1 : x - y));

/** numpy's linear interpolation (_lerp) used by percentile/quantile. */
function lerp(a, b, t) {
  const diff = b - a;
  return t >= 0.5 ? b - diff * (1 - t) : a + diff * t;
}
/** Quantile q (0…1) of sorted values (method 'linear': virtual index (n-1)*q, numpy's bounds and lerp). */
function quantileSorted(s, lo, n, q) {
  if (Number.isNaN(s[lo + n - 1])) return NaN;
  const virtual = (n - 1) * q;
  let prev = Math.floor(virtual), next = prev + 1;
  if (virtual >= n - 1) { prev = -1; next = -1; } else if (virtual < 0) { prev = 0; next = 0; }
  const gamma = virtual - prev;
  const at = (i) => s[lo + (i < 0 ? n + i : i)];
  return lerp(at(prev), at(next), gamma);
}

// ---------- Construction helpers ----------

function shapeArg(v) {
  if (isInt(v)) return [Number(num(v))];
  if (v instanceof PyTuple || v instanceof PyList) return v.items.map((x) => { if (!isInt(x)) throw npErr('TypeError', `'${typeName(x)}' object cannot be interpreted as an integer`); return Number(num(x)); });
  throw npErr('TypeError', `'${typeName(v)}' object cannot be interpreted as an integer`);
}
function checkShape(shape) {
  if (shape.some((s) => s < 0)) throw npErr('ValueError', 'negative dimensions are not allowed');
  return shape;
}
function filled(shape, value, dtype) {
  const d = newData(prodOf(checkShape(shape)));
  if (value !== 0) d.fill(value);
  return new Nd(castData(d, 'float64', dtype), shape, dtype);
}

/** np.arange like numpy: length ceil((stop-start)/step), values start + i*delta with delta = (start+step)-start. */
export function arange(start, stop, step, dtype) {
  if (step === 0) throw npErr('ZeroDivisionError', 'division by zero', 'npArangeStep');
  const len = Math.max(0, Math.ceil((stop - start) / step));
  const d = newData(len);
  if (len > 0) d[0] = start;
  if (len > 1) {
    d[1] = start + step;
    const delta = d[1] - d[0];
    for (let i = 2; i < len; i++) d[i] = start + i * delta;
  }
  return new Nd(castData(d, 'float64', dtype), [len], dtype);
}

export function linspace(start, stop, num, endpoint = true) {
  if (num < 0) throw npErr('ValueError', `Number of samples, ${num}, must be non-negative.`);
  const div = endpoint ? num - 1 : num;
  const d = newData(num);
  const delta = stop - start;
  const step = div > 0 ? delta / div : NaN;
  for (let i = 0; i < num; i++) {
    if (div > 0) d[i] = step === 0 ? (i / div) * delta + start : i * step + start;
    else d[i] = i * delta + start;
  }
  if (endpoint && num > 1) d[num - 1] = stop;
  return { nd: new Nd(d, [num], 'float64'), step };
}

// ---------- Linear algebra ----------

export function matmul(ctx, A, B, name = 'matmul') {
  needNumeric(A, name); needNumeric(B, name);
  if (A.ndim === 0 || B.ndim === 0) {
    if (name === 'dot') return binop(ctx, '*', A, B);
    throw npErr('ValueError', "matmul: Input operand 0 does not have enough dimensions (has 0, gufunc core with signature (n?,k),(k,m?)->(n?,m?) requires 1)");
  }
  if (A.ndim > 2 || B.ndim > 2) throw npErr('ValueError', 'Natter supports @, dot and matmul only for 1-D and 2-D arrays');
  const a2 = A.ndim === 1 ? new Nd(A.data, [1, A.shape[0]], A.dtype, [0, A.strides[0]], A.offset) : A;
  const b2 = B.ndim === 1 ? new Nd(B.data, [B.shape[0], 1], B.dtype, [B.strides[0], 0], B.offset) : B;
  const [n, k] = a2.shape, [k2, m] = b2.shape;
  if (k !== k2) {
    if (name === 'dot') throw npErr('ValueError', `shapes ${shapeErr(A.shape)} and ${shapeErr(B.shape)} not aligned: ${k} (dim ${A.ndim - 1}) != ${k2} (dim 0)`, 'npMatmul');
    throw npErr('ValueError', `matmul: Input operand 1 has a mismatch in its core dimension 0, with gufunc signature (n?,k),(k,m?)->(n?,m?) (size ${k2} is different from ${k})`, 'npMatmul');
  }
  const x = flat(a2), y = flat(b2), out = newData(n * m);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      let s = 0;
      for (let t = 0; t < k; t++) s += x[i * k + t] * y[t * m + j];
      out[i * m + j] = s;
    }
  }
  let dt = promote(A.dtype, B.dtype);
  if (dt === 'bool') { for (let i = 0; i < out.length; i++) out[i] = out[i] ? 1 : 0; }
  const shape = A.ndim === 1 && B.ndim === 1 ? [] : A.ndim === 1 ? [m] : B.ndim === 1 ? [n] : [n, m];
  return new Nd(out, shape, dt);
}

/** LU decomposition with partial pivoting (like LAPACK getrf). Returns null when singular. */
function lu(A) {
  needNumeric(A, 'linalg');
  const n = A.shape[0];
  const a = Array.from(flat(astype(null, A, 'float64')));
  const piv = [...Array(n).keys()];
  let sign = 1;
  for (let k = 0; k < n; k++) {
    let p = k, best = Math.abs(a[k * n + k]);
    for (let i = k + 1; i < n; i++) { const v = Math.abs(a[i * n + k]); if (v > best) { best = v; p = i; } }
    if (best === 0) return { a, piv, sign: 0, singular: true };
    if (p !== k) {
      for (let j = 0; j < n; j++) { const t = a[k * n + j]; a[k * n + j] = a[p * n + j]; a[p * n + j] = t; }
      [piv[k], piv[p]] = [piv[p], piv[k]];
      sign = -sign;
    }
    for (let i = k + 1; i < n; i++) {
      const f = (a[i * n + k] /= a[k * n + k]);
      for (let j = k + 1; j < n; j++) a[i * n + j] -= f * a[k * n + j];
    }
  }
  return { a, piv, sign, singular: false };
}

function squareCheck(A) {
  if (A.ndim < 2) throw npErr('LinAlgError', `${A.ndim}-dimensional array given. Array must be at least two-dimensional`, 'npLinalgDim');
  if (A.ndim > 2) throw npErr('LinAlgError', 'Natter supports linalg only for 2-D arrays');
  if (A.shape[0] !== A.shape[1]) throw npErr('LinAlgError', 'Last 2 dimensions of the array must be square', 'npLinalgSquare');
}

export function det(A) {
  squareCheck(A);
  const n = A.shape[0];
  const { a, sign, singular } = lu(A);
  if (singular) return 0;
  let d = sign;
  for (let i = 0; i < n; i++) d *= a[i * n + i];
  return d;
}

/** Solve A X = B (B: n or n×m); null if A is singular. */
export function solve(A, B) {
  squareCheck(A);
  const n = A.shape[0];
  const { a, piv, singular } = lu(A);
  if (singular) return null;
  const Bf = astype(null, B, 'float64');
  const m = B.ndim === 1 ? 1 : B.shape[1];
  if (B.shape[0] !== n) throw npErr('ValueError', `solve: Input operand 1 has a mismatch in its core dimension 0, with gufunc signature (m,m),(m,n)->(m,n) (size ${B.shape[0]} is different from ${n})`);
  const b = flat(Bf);
  const x = new Float64Array(n * m);
  for (let c = 0; c < m; c++) {
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = b[piv[i] * m + c];
      for (let j = 0; j < i; j++) s -= a[i * n + j] * y[j];
      y[i] = s;
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i];
      for (let j = i + 1; j < n; j++) s -= a[i * n + j] * y[j];
      y[i] = s / a[i * n + i];
    }
    for (let i = 0; i < n; i++) x[i * m + c] = y[i];
  }
  return new Nd(x, B.ndim === 1 ? [n] : [n, m], 'float64');
}

// ---------- Printing ----------

const getter = (nd) => (idx) => { let off = nd.offset; for (let i = 0; i < idx.length; i++) off += idx[i] * nd.strides[i]; return nd.data[off]; };
const printOpts = (vm) => vm.npPrint ?? PRINT_DEFAULTS;

export function reprNd(vm, nd) { return arrayRepr(nd, getter(nd), printOpts(vm)); }
export function strNd(vm, nd) {
  const s = arrayStr(nd, getter(nd), printOpts(vm));
  return s ?? formatFloat(nd.data[nd.offset]);
}

// ---------- Natives ----------

const A = (v, what = 'a') => {
  if (isArr(v)) return v.nd;
  try { return toNd(v); } catch (e) { if (e instanceof ScriptError && e.params?.what === 'npNotNumber') throw npErr('TypeError', e.params.message.replace(/\(value\)$/, `(${what})`), 'npNotNumber', { type: e.params.type }); throw e; }
};
const axisArg = (v) => (v === undefined || v === null ? null : v instanceof PyTuple ? (() => { throw npErr('TypeError', "Natter's numpy supports only one axis (an int) or axis=None"); })() : Number(num(v)));
const optNum = (v, d) => (v === undefined || v === null ? d : scalarNum(v));
const T = (items) => new PyTuple(items);
const shapeTuple = (shape) => T(shape.slice());

/** Python value → plain JS numbers (for plotting): array, list, range, number. */
export function toFloatList(v) {
  if (isArr(v)) return Array.from(flat(v.nd));
  return Array.from(flat(toNd(v)));
}

/** Iterator over the first axis: numbers for 1-D arrays, views otherwise. */
function iterNd(nd) {
  if (nd.ndim === 0) throw npErr('TypeError', 'iteration over a 0-d array', 'npIter0d');
  const items = [];
  for (let i = 0; i < nd.shape[0]; i++) items.push(result(new Nd(nd.data, nd.shape.slice(1), nd.dtype, nd.strides.slice(1), nd.offset + i * nd.strides[0])));
  return items;
}

function tolist(nd) {
  if (nd.ndim === 0) return toPy(nd.data[nd.offset], nd.dtype);
  const out = [];
  for (let i = 0; i < nd.shape[0]; i++) out.push(tolist(new Nd(nd.data, nd.shape.slice(1), nd.dtype, nd.strides.slice(1), nd.offset + i * nd.strides[0])));
  return new PyList(out);
}

function sortAlong(nd, axis, arg) {
  if (axis === null) nd = reshape(nd.contiguous() ? nd : copyNd(nd), [nd.size]);
  const ax = axis === null ? 0 : normAxis(axis, nd.ndim);
  if (nd.ndim === 0) throw npErr('AxisError', `axis ${axis} is out of bounds for array of dimension 0`, 'npAxis');
  const moved = axisLast(nd, ax);
  const f = flat(moved), len = nd.shape[ax], m = len ? f.length / len : 0;
  const out = newData(f.length, arg ? null : nd.dtype);
  const cmp = (x, y) => (Number.isNaN(x) ? (Number.isNaN(y) ? 0 : 1) : Number.isNaN(y) ? -1 : x < y ? -1 : x > y ? 1 : 0);
  for (let r = 0; r < m; r++) {
    const lo = r * len;
    if (arg) {
      const idx = [...Array(len).keys()].sort((i, j) => cmp(f[lo + i], f[lo + j]) || i - j);
      for (let i = 0; i < len; i++) out[lo + i] = idx[i];
    } else {
      const part = Array.from(f.slice(lo, lo + len)).sort(cmp);
      for (let i = 0; i < len; i++) out[lo + i] = part[i];
    }
  }
  const sorted = new Nd(out, moved.shape.slice(), arg ? 'int64' : nd.dtype);
  // move the axis back
  const order = [...Array(nd.ndim).keys()];
  const back = order.map((i) => (i < ax ? i : i === ax ? nd.ndim - 1 : i - 1));
  return copyNd(transpose(sorted, back));
}

function concat(ctx, arrays, axis) {
  if (!arrays.length) throw npErr('ValueError', 'need at least one array to concatenate');
  if (axis === null) arrays = arrays.map((a) => reshape(a, [a.size]));
  const nd0 = arrays[0];
  if (nd0.ndim === 0) throw npErr('ValueError', 'zero-dimensional arrays cannot be concatenated');
  const ax = normAxis(axis ?? 0, nd0.ndim);
  arrays.forEach((a, i) => {
    if (a.ndim !== nd0.ndim) throw npErr('ValueError', `all the input arrays must have same number of dimensions, but the array at index 0 has ${nd0.ndim} dimension(s) and the array at index ${i} has ${a.ndim} dimension(s)`, 'npConcat');
    a.shape.forEach((s, d) => {
      if (d !== ax && s !== nd0.shape[d]) throw npErr('ValueError', `all the input array dimensions except for the concatenation axis must match exactly, but along dimension ${d}, the array at index 0 has size ${nd0.shape[d]} and the array at index ${i} has size ${s}`, 'npConcat');
    });
  });
  const dt = arrays.reduce((d, a) => promote(d, a.dtype), 'bool');
  const shape = nd0.shape.slice();
  shape[ax] = arrays.reduce((s, a) => s + a.shape[ax], 0);
  const out = newData(prodOf(shape), dt);
  const res = new Nd(out, shape, dt);
  let start = 0;
  for (const a of arrays) {
    const sl = shape.map((s, d) => (d === ax ? new PySlice(start, start + a.shape[ax], null) : new PySlice(null, null, null)));
    setIndex(ctx, res, T(sl), wrap(a));
    start += a.shape[ax];
  }
  return res;
}

const atLeast = (nd, k) => {
  if (nd.ndim >= k) return nd;
  if (k === 1) return reshape(nd, [1]);
  return nd.ndim === 0 ? reshape(nd, [1, 1]) : reshape(nd.contiguous() ? nd : copyNd(nd), [1, ...nd.shape]);
};
const seqArrays = (v, name) => {
  if (isArr(v)) return iterNd(v.nd).map((x) => A(x));
  if (!(v instanceof PyList || v instanceof PyTuple)) throw npErr('TypeError', `${name}() expects a list or tuple of arrays`);
  return v.items.map((x) => A(x));
};

/** histogram like numpy (equal bins; edges from linspace). */
export function histogram(ctx, a, bins, range, weights, edgesDtype = 'float64') {
  needNumeric(a, 'histogram');
  const f = Array.from(flat(a));
  let lo, hi;
  if (range) [lo, hi] = range;
  else if (f.length) {
    lo = Infinity; hi = -Infinity;
    for (const v of f) { if (v < lo) lo = v; if (v > hi) hi = v; }
  } else { lo = 0; hi = 1; }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw npErr('ValueError', `autodetected range of [${lo}, ${hi}] is not finite`, 'npHistRange');
  if (lo > hi) throw npErr('ValueError', 'max must be larger than min in range parameter.');
  if (lo === hi) { lo -= 0.5; hi += 0.5; }
  let edges;
  if (Array.isArray(bins)) {
    edges = bins;
    for (let i = 1; i < edges.length; i++) if (edges[i] < edges[i - 1]) throw npErr('ValueError', '`bins` must increase monotonically, when an array');
  } else {
    if (bins < 1) throw npErr('ValueError', '`bins` must be positive, when an integer');
    edges = Array.from(linspace(lo, hi, bins + 1).nd.data);
  }
  const nb = edges.length - 1;
  const counts = new Float64Array(nb);
  const w = weights ? Array.from(flat(weights)) : null;
  if (!Array.isArray(bins)) {
    const first = edges[0], last = edges[nb];
    const norm = nb / (last - first);
    f.forEach((v, k) => {
      if (!(v >= first && v <= last)) return;
      let i = Math.trunc((v - first) * norm);
      if (i === nb) i -= 1;
      if (v < edges[i]) i -= 1;
      else if (v >= edges[i + 1] && i !== nb - 1) i += 1;
      counts[i] += w ? w[k] : 1;
    });
  } else {
    f.forEach((v, k) => {
      if (!(v >= edges[0] && v <= edges[nb])) return;
      let i = 0;
      while (i < nb - 1 && v >= edges[i + 1]) i++;
      counts[i] += w ? w[k] : 1;
    });
  }
  return { counts: new Nd(counts, [nb], w && weights.dtype === 'float64' ? 'float64' : 'int64'), edges: new Nd(Float64Array.from(edges), [nb + 1], edgesDtype) };
}

/** Least squares polynomial fit (numpy.polyfit; via QR, so digits may differ from numpy in the last places). */
function polyfit(x, y, deg) {
  const n = x.length, m = deg + 1;
  if (n < m) throw npErr('ValueError', 'Natter: polyfit needs more points than the degree');
  // Vandermonde matrix with highest power first, scaled columns (like numpy's lstsq scaling)
  const V = [];
  for (let i = 0; i < n; i++) { const row = new Array(m); for (let j = 0; j < m; j++) row[j] = intPowF(x[i], deg - j); V.push(row); }
  const scale = new Array(m).fill(0);
  for (let j = 0; j < m; j++) { let s = 0; for (let i = 0; i < n; i++) s += V[i][j] * V[i][j]; scale[j] = Math.sqrt(s) || 1; for (let i = 0; i < n; i++) V[i][j] /= scale[j]; }
  // Householder QR
  const b = y.slice();
  for (let k = 0; k < m; k++) {
    let norm = 0;
    for (let i = k; i < n; i++) norm += V[i][k] * V[i][k];
    norm = Math.sqrt(norm);
    if (norm === 0) continue;
    const alpha = V[k][k] > 0 ? -norm : norm;
    const v = new Array(n).fill(0);
    for (let i = k; i < n; i++) v[i] = V[i][k];
    v[k] -= alpha;
    let vv = 0;
    for (let i = k; i < n; i++) vv += v[i] * v[i];
    if (vv === 0) continue;
    for (let j = k; j < m; j++) {
      let s = 0;
      for (let i = k; i < n; i++) s += v[i] * V[i][j];
      s = (2 * s) / vv;
      for (let i = k; i < n; i++) V[i][j] -= s * v[i];
    }
    let s = 0;
    for (let i = k; i < n; i++) s += v[i] * b[i];
    s = (2 * s) / vv;
    for (let i = k; i < n; i++) b[i] -= s * v[i];
  }
  const c = new Array(m).fill(0);
  for (let i = m - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < m; j++) s -= V[i][j] * c[j];
    c[i] = s / V[i][i];
  }
  return c.map((v, j) => v / scale[j]);
}
const intPowF = (x, e) => { let r = 1; for (let i = 0; i < e; i++) r *= x; return r; };

/** np.round: numpy multiplies by 10**d, rounds half to even and divides (not exact like Python's round). */
function roundNd(nd, decimals) {
  if (nd.dtype !== 'float64') {
    if (decimals >= 0) return copyNd(nd);
    const p = pow10(-decimals);
    return unaryMap(null, nd, (x) => rint(x / p) * p, 'same', 'round');
  }
  if (decimals === 0) return unaryMap(null, nd, rint, 'same', 'rint');
  const f = pow10(Math.abs(decimals));
  return unaryMap(null, nd, decimals > 0 ? (x) => rint(x * f) / f : (x) => rint(x / f) * f, 'same', 'round');
}

/** Callable natives of the module _np (also used by the ndarray methods). */
const scalarOrArray = (nd) => result(nd);

function reduceNative(name, compute) {
  return (ctx, args, kw) => {
    const [a, axis, , , keepdims] = params(name, args, kw, ['a', '?axis', '?dtype', '?out', '?keepdims']);
    return scalarOrArray(compute(ctx, A(a), axisArg(axis), truthy(keepdims ?? false)));
  };
}

const REDUCE = {
  sum: (ctx, nd, ax, kd) => sumNd(nd, ax, kd),
  prod: (ctx, nd, ax, kd) => reduceAxis(nd, ax, kd, (a, lo, n) => { let p = 1; for (let i = 0; i < n; i++) p *= a[lo + i]; return p; }, intSum(nd.dtype)),
  mean: (ctx, nd, ax, kd) => meanNd(ctx, nd, ax, kd),
  min: (ctx, nd, ax, kd) => reduceAxis(nd, ax, kd, minMaxFn(false), nd.dtype, 'minimum'),
  max: (ctx, nd, ax, kd) => reduceAxis(nd, ax, kd, minMaxFn(true), nd.dtype, 'maximum'),
  any: (ctx, nd, ax, kd) => reduceAxis(nd, ax, kd, (a, lo, n) => { for (let i = 0; i < n; i++) if (a[lo + i] !== 0) return 1; return 0; }, 'bool'),
  all: (ctx, nd, ax, kd) => reduceAxis(nd, ax, kd, (a, lo, n) => { for (let i = 0; i < n; i++) if (a[lo + i] === 0) return 0; return 1; }, 'bool'),
  ptp: (ctx, nd, ax, kd) => reduceAxis(nd, ax, kd, (a, lo, n) => minMaxFn(true)(a, lo, n) - minMaxFn(false)(a, lo, n), nd.dtype, 'maximum'),
  count_nonzero: (ctx, nd, ax, kd) => reduceAxis(nd, ax, kd, (a, lo, n) => { let c = 0; for (let i = 0; i < n; i++) if (a[lo + i] !== 0) c++; return c; }, 'int64'),
};
REDUCE.amin = REDUCE.min; REDUCE.amax = REDUCE.max;

function argReduce(name, isMax) {
  return (ctx, args, kw) => {
    const [a, axis] = params(name, args, kw, ['a', '?axis', '?out']);
    const nd = A(a);
    if (!nd.size) throw npErr('ValueError', `attempt to get ${name} of an empty sequence`, 'npEmptyReduce');
    return scalarOrArray(reduceAxis(nd, axisArg(axis), false, argFn(isMax), 'int64'));
  };
}

function statNative(name, ddofDefault = 0, sqrt = false) {
  return (ctx, args, kw) => {
    const [a, axis, , , ddof, keepdims] = params(name, args, kw, ['a', '?axis', '?dtype', '?out', '?ddof', '?keepdims']);
    const r = varNd(ctx, A(a), axisArg(axis), optNum(ddof, ddofDefault), truthy(keepdims ?? false));
    if (sqrt) for (let i = 0; i < r.data.length; i++) r.data[i] = Math.sqrt(r.data[i]);
    return scalarOrArray(r);
  };
}

function cumNative(name, mul) {
  return (ctx, args, kw) => {
    const [a, axis] = params(name, args, kw, ['a', '?axis', '?dtype', '?out']);
    let nd = needNumeric(A(a), name);
    const ax0 = axisArg(axis);
    if (ax0 === null) nd = reshape(nd.contiguous() ? nd : copyNd(nd), [nd.size]);
    const ax = ax0 === null ? 0 : normAxis(ax0, nd.ndim);
    const moved = axisLast(nd, ax);
    const f = flat(moved), len = nd.shape[ax], out = new Float64Array(f.length);
    for (let r = 0; len && r < f.length / len; r++) {
      let acc = mul ? 1 : 0;
      for (let i = 0; i < len; i++) { acc = mul ? acc * f[r * len + i] : acc + f[r * len + i]; out[r * len + i] = acc; }
    }
    const order = [...Array(nd.ndim).keys()].map((i) => (i < ax ? i : i === ax ? nd.ndim - 1 : i - 1));
    return wrap(copyNd(transpose(new Nd(out, moved.shape.slice(), intSum(nd.dtype)), order)));
  };
}

function percentileOf(ctx, nd, qs, axis, scale, name) {
  needNumeric(nd, 'percentile');
  const qv = flat(toNd(qs, 'float64'));
  const qnd = toNd(qs);
  for (const q of qv) if (!(q >= 0 && q <= scale)) throw npErr('ValueError', scale === 100 ? 'Percentiles must be in the range [0, 100]' : 'Quantiles must be in the range [0, 1]', 'npPercentile');
  const ax = axis === null ? null : normAxis(axis, nd.ndim);
  const work = ax === null ? reshape(nd.contiguous() ? nd : copyNd(nd), [nd.size]) : nd;
  const a2 = ax === null ? 0 : ax;
  const moved = axisLast(work, a2);
  const f = flat(moved), len = work.shape[a2];
  if (!len) throw npErr('IndexError', `index -1 is out of bounds for axis 0 with size 0`, 'npEmptyReduce');
  const m = f.length / len;
  const rest = work.shape.filter((_, i) => i !== a2);
  const out = new Float64Array(qv.length * m);
  for (let r = 0; r < m; r++) {
    const s = sortNum(Array.from(f.subarray(r * len, r * len + len)));
    qv.forEach((q, k) => { out[k * m + r] = quantileSorted(s, 0, len, scale === 100 ? q / 100 : q); });
  }
  return result(new Nd(out, [...qnd.shape, ...(ax === null ? [] : rest)], 'float64'));
}

function medianOf(ctx, nd, axis) {
  needNumeric(nd, 'median');
  const ax = axis === null ? null : normAxis(axis, nd.ndim);
  const work = ax === null ? reshape(nd.contiguous() ? nd : copyNd(nd), [nd.size]) : nd;
  const a2 = ax === null ? 0 : ax;
  const len = work.shape[a2];
  if (!len) { npWarn(ctx, 'Mean of empty slice'); npWarn(ctx, 'invalid value encountered in divide'); return new PyFloat(NaN); }
  const moved = axisLast(work, a2);
  const f = flat(moved), m = f.length / len;
  const out = new Float64Array(m);
  for (let r = 0; r < m; r++) {
    const s = sortNum(Array.from(f.subarray(r * len, r * len + len)));
    if (Number.isNaN(s[len - 1])) { out[r] = NaN; continue; }
    out[r] = len % 2 ? s[(len - 1) / 2] : (s[len / 2 - 1] + s[len / 2]) / 2;
  }
  return result(new Nd(out, ax === null ? [] : work.shape.filter((_, i) => i !== a2), 'float64'));
}

const floatArg = (v, name) => scalarNum(v, name);

export const NP_NATIVES = {
  // ----- creation -----
  '_np.array'(ctx, args, kw) {
    const [obj, dtype, copy, , , ndmin] = params('array', args, kw, ['object', '?dtype', '?copy', '?order', '?subok', '?ndmin']);
    let nd = toNd(obj, resolveDtype(dtype));
    if (isArr(obj) && nd === obj.nd && (copy === undefined || truthy(copy))) nd = copyNd(nd);
    if (ndmin !== undefined && nd.ndim < Number(num(ndmin))) nd = reshape(nd, [...Array(Number(num(ndmin)) - nd.ndim).fill(1), ...nd.shape]);
    return wrap(nd);
  },
  '_np.asarray'(ctx, args, kw) {
    const [obj, dtype] = params('asarray', args, kw, ['a', '?dtype', '?order']);
    return isArr(obj) && (dtype === undefined || dtype === null || resolveDtype(dtype) === obj.nd.dtype) ? obj : wrap(toNd(obj, resolveDtype(dtype)));
  },
  '_np.copy'(ctx, args, kw) { const [a] = params('copy', args, kw, ['a']); return wrap(copyNd(A(a))); },
  '_np.zeros'(ctx, args, kw) { const [s, dt] = params('zeros', args, kw, ['shape', '?dtype']); return wrap(filled(shapeArg(s), 0, resolveDtype(dt) ?? 'float64')); },
  '_np.ones'(ctx, args, kw) { const [s, dt] = params('ones', args, kw, ['shape', '?dtype']); return wrap(filled(shapeArg(s), 1, resolveDtype(dt) ?? 'float64')); },
  '_np.empty'(ctx, args, kw) { const [s, dt] = params('empty', args, kw, ['shape', '?dtype']); return wrap(filled(shapeArg(s), 0, resolveDtype(dt) ?? 'float64')); },
  '_np.full'(ctx, args, kw) {
    const [s, v, dt] = params('full', args, kw, ['shape', 'fill_value', '?dtype']);
    const val = toNd(v);
    return wrap(filled(shapeArg(s), val.data[0], resolveDtype(dt) ?? val.dtype));
  },
  '_np.zeros_like'(ctx, args, kw) { const [a, dt] = params('zeros_like', args, kw, ['a', '?dtype']); const nd = A(a); return wrap(filled(nd.shape.slice(), 0, resolveDtype(dt) ?? nd.dtype)); },
  '_np.ones_like'(ctx, args, kw) { const [a, dt] = params('ones_like', args, kw, ['a', '?dtype']); const nd = A(a); return wrap(filled(nd.shape.slice(), 1, resolveDtype(dt) ?? nd.dtype)); },
  '_np.empty_like'(ctx, args, kw) { const [a, dt] = params('empty_like', args, kw, ['a', '?dtype']); const nd = A(a); return wrap(filled(nd.shape.slice(), 0, resolveDtype(dt) ?? nd.dtype)); },
  '_np.full_like'(ctx, args, kw) {
    const [a, v, dt] = params('full_like', args, kw, ['a', 'fill_value', '?dtype']);
    const nd = A(a);
    const d = resolveDtype(dt) ?? nd.dtype;
    return wrap(filled(nd.shape.slice(), d === 'int64' ? castInt(scalarNum(v)) : scalarNum(v), d));
  },
  '_np.eye'(ctx, args, kw) {
    const [N, Mv, k, dt] = params('eye', args, kw, ['N', '?M', '?k', '?dtype']);
    const n = Number(num(N)), m = Mv === undefined || Mv === null ? n : Number(num(Mv)), kk = k === undefined ? 0 : Number(num(k));
    const nd = filled([n, m], 0, resolveDtype(dt) ?? 'float64');
    for (let i = 0; i < n; i++) if (i + kk >= 0 && i + kk < m) nd.data[i * m + i + kk] = 1;
    return wrap(nd);
  },
  '_np.identity'(ctx, args, kw) { const [n, dt] = params('identity', args, kw, ['n', '?dtype']); return NP_NATIVES['_np.eye'](ctx, [n], dt === undefined ? {} : { dtype: dt }); },
  '_np.arange'(ctx, args, kw) {
    const [a, b, c, dt] = params('arange', args, kw, ['?start', '?stop', '?step', '?dtype']);
    if (a === undefined) throw npErr('TypeError', 'arange() requires stop to be specified.');
    const [start, stop, step] = b === undefined || b === null ? [0, a, c ?? 1] : [a, b, c ?? 1];
    const vals = [start, stop, step];
    const isF = vals.some((v) => v instanceof PyFloat);
    const d = resolveDtype(dt) ?? (isF ? 'float64' : 'int64');
    return wrap(arange(floatArg(start, 'start'), floatArg(stop, 'stop'), floatArg(step, 'step'), d));
  },
  '_np.linspace'(ctx, args, kw) {
    const [a, b, n, endpoint, retstep, dt] = params('linspace', args, kw, ['start', 'stop', '?num', '?endpoint', '?retstep', '?dtype']);
    if (n !== undefined && !isInt(n)) throw npErr('TypeError', `'${typeName(n)}' object cannot be interpreted as an integer`, 'npLinspaceNum');
    const { nd, step } = linspace(floatArg(a, 'start'), floatArg(b, 'stop'), n === undefined ? 50 : Number(num(n)), endpoint === undefined ? true : truthy(endpoint));
    const d = resolveDtype(dt);
    const out = wrap(d && d !== 'float64' ? astype(ctx, nd, d) : nd);
    return truthy(retstep ?? false) ? T([out, new PyFloat(step)]) : out;
  },
  '_np.meshgrid'(ctx, args, kw) {
    const [x, y] = params('meshgrid', args, kw, ['x', 'y']);
    const X = A(x), Y = A(y);
    const nx = X.size, ny = Y.size, fx = flat(X), fy = flat(Y);
    const a = newData(nx * ny), b = newData(nx * ny);
    for (let i = 0; i < ny; i++) for (let j = 0; j < nx; j++) { a[i * nx + j] = fx[j]; b[i * nx + j] = fy[i]; }
    return new PyList([wrap(new Nd(a, [ny, nx], X.dtype)), wrap(new Nd(b, [ny, nx], Y.dtype))]);
  },
  // ----- shape -----
  '_np.reshape'(ctx, args, kw) { const [a, s] = params('reshape', args, kw, ['a', 'shape']); const nd = A(a); return wrap(reshape(nd, newShape(nd, [s]))); },
  '_np.ravel'(ctx, args, kw) { const [a] = params('ravel', args, kw, ['a']); const nd = A(a); return wrap(reshape(nd, [nd.size])); },
  '_np.transpose'(ctx, args, kw) { const [a, axes] = params('transpose', args, kw, ['a', '?axes']); const nd = A(a); return wrap(transpose(nd, axes ? axes.items.map((x) => normAxis(x, nd.ndim)) : null)); },
  '_np.shape'(ctx, args, kw) { const [a] = params('shape', args, kw, ['a']); return shapeTuple(A(a).shape); },
  '_np.size'(ctx, args, kw) { const [a] = params('size', args, kw, ['a']); return A(a).size; },
  '_np.ndim'(ctx, args, kw) { const [a] = params('ndim', args, kw, ['a']); return A(a).ndim; },
  '_np.squeeze'(ctx, args, kw) { const [a] = params('squeeze', args, kw, ['a', '?axis']); const nd = A(a); return wrap(new Nd(nd.data, nd.shape.filter((s) => s !== 1), nd.dtype, nd.strides.filter((_, i) => nd.shape[i] !== 1), nd.offset)); },
  '_np.expand_dims'(ctx, args, kw) {
    const [a, axis] = params('expand_dims', args, kw, ['a', 'axis']);
    const nd = A(a), ax = normAxis(axis, nd.ndim + 1);
    const shape = nd.shape.slice(); shape.splice(ax, 0, 1);
    return wrap(reshape(nd.contiguous() ? nd : copyNd(nd), shape));
  },
  '_np.concatenate'(ctx, args, kw) {
    const [seq, axis] = params('concatenate', args, kw, ['arrays', '?axis']);
    return wrap(concat(ctx, seqArrays(seq, 'concatenate'), axis === undefined ? 0 : axisArg(axis)));
  },
  '_np.vstack'(ctx, args, kw) { const [seq] = params('vstack', args, kw, ['tup']); return wrap(concat(ctx, seqArrays(seq, 'vstack').map((a) => atLeast(a, 2)), 0)); },
  '_np.hstack'(ctx, args, kw) {
    const [seq] = params('hstack', args, kw, ['tup']);
    const arrs = seqArrays(seq, 'hstack').map((a) => atLeast(a, 1));
    return wrap(concat(ctx, arrs, arrs[0]?.ndim === 1 ? 0 : 1));
  },
  '_np.column_stack'(ctx, args, kw) {
    const [seq] = params('column_stack', args, kw, ['tup']);
    return wrap(concat(ctx, seqArrays(seq, 'column_stack').map((a) => (a.ndim < 2 ? transpose(atLeast(a, 2)) : a)), 1));
  },
  '_np.stack'(ctx, args, kw) {
    const [seq, axis] = params('stack', args, kw, ['arrays', '?axis']);
    const arrs = seqArrays(seq, 'stack');
    if (arrs.some((a) => a.shape.length !== arrs[0].shape.length || a.shape.some((s, i) => s !== arrs[0].shape[i]))) throw npErr('ValueError', 'all input arrays must have the same shape', 'npStack');
    const ax = normAxis(axis ?? 0, arrs[0].ndim + 1);
    return wrap(concat(ctx, arrs.map((a) => { const s = a.shape.slice(); s.splice(ax, 0, 1); return reshape(a.contiguous() ? a : copyNd(a), s); }), ax));
  },
  '_np.append'(ctx, args, kw) {
    const [arr, values, axis] = params('append', args, kw, ['arr', 'values', '?axis']);
    const ax = axisArg(axis);
    return wrap(concat(ctx, [A(arr), A(values)], ax));
  },
  '_np.flip'(ctx, args, kw) {
    const [a, axis] = params('flip', args, kw, ['m', '?axis']);
    const nd = A(a);
    const axes = axis === undefined || axis === null ? nd.shape.map((_, i) => i) : [normAxis(axis, nd.ndim)];
    const strides = nd.strides.slice();
    let off = nd.offset;
    for (const ax of axes) { if (nd.shape[ax]) off += (nd.shape[ax] - 1) * strides[ax]; strides[ax] = -strides[ax]; }
    return wrap(new Nd(nd.data, nd.shape.slice(), nd.dtype, strides, off));
  },
  '_np.repeat'(ctx, args, kw) {
    const [a, reps, axis] = params('repeat', args, kw, ['a', 'repeats', '?axis']);
    const nd = A(a);
    if (axisArg(axis) !== null) throw npErr('TypeError', "Natter's numpy supports repeat() only without axis");
    const f = flat(nd), r = Array.from(flat(toNd(reps)));
    const out = [];
    for (let i = 0; i < f.length; i++) for (let k = 0; k < (r.length === 1 ? r[0] : r[i]); k++) out.push(f[i]);
    const d = newData(out.length, nd.dtype);
    out.forEach((v, i) => { d[i] = v; });
    return wrap(new Nd(d, [out.length], nd.dtype));
  },
  '_np.tile'(ctx, args, kw) {
    const [a, reps] = params('tile', args, kw, ['A', 'reps']);
    let nd = A(a);
    const r = isInt(reps) ? [Number(num(reps))] : iterItemsArr(reps).map((v) => Number(num(v)));
    if (r.length > 2 || nd.ndim > 2) throw npErr('TypeError', "Natter's numpy supports tile() only for 1-D and 2-D");
    if (r.length === 2 && nd.ndim === 1) nd = reshape(nd.contiguous() ? nd : copyNd(nd), [1, nd.size]);
    const along = (x, n, ax) => concat(ctx, Array(n).fill(x), ax);
    if (r.length === 1) return wrap(along(nd, r[0], nd.ndim - 1));
    return wrap(along(along(nd, r[1], nd.ndim - 1), r[0], 0));
  },
  // ----- element-wise -----
  '_np.where'(ctx, args, kw) {
    const [c, x, y] = params('where', args, kw, ['condition', '?x', '?y']);
    const C = A(c, 'condition');
    if (x === undefined && y === undefined) return T(nonzero(C).map(wrap));
    if (x === undefined || y === undefined) throw npErr('ValueError', 'either both or neither of x and y should be given');
    const X = A(x), Y = A(y);
    let shape = broadcastShapes(C.shape, X.shape);
    shape = shape && broadcastShapes(shape, Y.shape);
    if (!shape) throw npErr('ValueError', `operands could not be broadcast together with shapes ${shapeErr(C.shape)} ${shapeErr(X.shape)} ${shapeErr(Y.shape)} `, 'npBroadcast');
    const dt = promote(X.dtype, Y.dtype);
    const fc = flatAs(C, shape), fx = castData(Array.from(flatAs(X, shape)), X.dtype, dt), fy = castData(Array.from(flatAs(Y, shape)), Y.dtype, dt), out = newData(fc.length, dt);
    for (let i = 0; i < out.length; i++) out[i] = fc[i] !== 0 ? fx[i] : fy[i];
    return wrap(new Nd(out, shape, dt));
  },
  '_np.nonzero'(ctx, args, kw) { const [a] = params('nonzero', args, kw, ['a']); return T(nonzero(A(a)).map(wrap)); },
  '_np.argwhere'(ctx, args, kw) {
    const [a] = params('argwhere', args, kw, ['a']);
    const nd = A(a), z = nonzero(nd), n = z[0]?.size ?? 0, out = newData(n * nd.ndim);
    for (let i = 0; i < n; i++) for (let d = 0; d < nd.ndim; d++) out[i * nd.ndim + d] = z[d].data[i];
    return wrap(new Nd(out, [n, nd.ndim], 'int64'));
  },
  '_np.clip'(ctx, args, kw) {
    const [a, lo, hi] = params('clip', args, kw, ['a', 'a_min', 'a_max', '?out']);
    let nd = A(a);
    if (lo !== null) nd = zipWith(ctx, nd, A(lo), (x, y) => (Number.isNaN(x) || Number.isNaN(y) ? NaN : Math.max(x, y)));
    if (hi !== null) nd = zipWith(ctx, nd, A(hi), (x, y) => (Number.isNaN(x) || Number.isNaN(y) ? NaN : Math.min(x, y)));
    return wrap(nd === A(a) ? copyNd(nd) : nd);
  },
  '_np.maximum'(ctx, args, kw) { const [a, b] = params('maximum', args, kw, ['x1', 'x2']); return result(zipWith(ctx, A(a), A(b), (x, y) => (Number.isNaN(x) || Number.isNaN(y) ? NaN : x >= y ? x : y))); },
  '_np.minimum'(ctx, args, kw) { const [a, b] = params('minimum', args, kw, ['x1', 'x2']); return result(zipWith(ctx, A(a), A(b), (x, y) => (Number.isNaN(x) || Number.isNaN(y) ? NaN : x <= y ? x : y))); },
  '_np.arctan2'(ctx, args, kw) { const [a, b] = params('arctan2', args, kw, ['x1', 'x2']); return result(zipWith(ctx, A(a), A(b), M.atan2, 'float64')); },
  '_np.hypot'(ctx, args, kw) {
    const [a, b] = params('hypot', args, kw, ['x1', 'x2']);
    return result(zipWith(ctx, A(a), A(b), (x, y) => { const p = Math.abs(x), q = Math.abs(y); if (p === Infinity || q === Infinity) return Infinity; const m = Math.max(p, q); if (m === 0) return 0; const r = Math.min(p, q) / m; return m * Math.sqrt(1 + r * r); }, 'float64'));
  },
  '_np.logical_and'(ctx, args, kw) { const [a, b] = params('logical_and', args, kw, ['x1', 'x2']); return result(zipWith(ctx, A(a), A(b), (x, y) => (x !== 0 && y !== 0 ? 1 : 0), 'bool')); },
  '_np.logical_or'(ctx, args, kw) { const [a, b] = params('logical_or', args, kw, ['x1', 'x2']); return result(zipWith(ctx, A(a), A(b), (x, y) => (x !== 0 || y !== 0 ? 1 : 0), 'bool')); },
  '_np.logical_xor'(ctx, args, kw) { const [a, b] = params('logical_xor', args, kw, ['x1', 'x2']); return result(zipWith(ctx, A(a), A(b), (x, y) => ((x !== 0) !== (y !== 0) ? 1 : 0), 'bool')); },
  '_np.isclose'(ctx, args, kw) {
    const [a, b, rtol, atol, eqnan] = params('isclose', args, kw, ['a', 'b', '?rtol', '?atol', '?equal_nan']);
    const rt = optNum(rtol, 1e-5), at = optNum(atol, 1e-8), en = truthy(eqnan ?? false);
    return result(zipWith(ctx, A(a), A(b), (x, y) => (closeTo(x, y, rt, at, en) ? 1 : 0), 'bool'));
  },
  '_np.allclose'(ctx, args, kw) {
    const [a, b, rtol, atol, eqnan] = params('allclose', args, kw, ['a', 'b', '?rtol', '?atol', '?equal_nan']);
    const rt = optNum(rtol, 1e-5), at = optNum(atol, 1e-8), en = truthy(eqnan ?? false);
    const r = zipWith(ctx, A(a), A(b), (x, y) => (closeTo(x, y, rt, at, en) ? 1 : 0), 'bool');
    return r.data.every((v) => v === 1);
  },
  '_np.array_equal'(ctx, args, kw) {
    const [a, b] = params('array_equal', args, kw, ['a1', 'a2', '?equal_nan']);
    const x = A(a), y = A(b);
    if (x.shape.length !== y.shape.length || x.shape.some((s, i) => s !== y.shape[i])) return false;
    const fx = flat(x), fy = flat(y);
    for (let i = 0; i < fx.length; i++) if (fx[i] !== fy[i]) return false;
    return true;
  },
  '_np.round'(ctx, args, kw) {
    const [a, d] = params('round', args, kw, ['a', '?decimals', '?out']);
    return result(roundNd(A(a), d === undefined ? 0 : Number(num(d))));
  },
  '_np.power'(ctx, args, kw) { const [a, b] = params('power', args, kw, ['x1', 'x2']); return result(binop(ctx, '**', A(a), A(b))); },
  '_np.add'(ctx, args, kw) { const [a, b] = params('add', args, kw, ['x1', 'x2']); return result(binop(ctx, '+', A(a), A(b))); },
  '_np.subtract'(ctx, args, kw) { const [a, b] = params('subtract', args, kw, ['x1', 'x2']); return result(binop(ctx, '-', A(a), A(b))); },
  '_np.multiply'(ctx, args, kw) { const [a, b] = params('multiply', args, kw, ['x1', 'x2']); return result(binop(ctx, '*', A(a), A(b))); },
  '_np.divide'(ctx, args, kw) { const [a, b] = params('divide', args, kw, ['x1', 'x2']); return result(binop(ctx, '/', A(a), A(b))); },
  '_np.floor_divide'(ctx, args, kw) { const [a, b] = params('floor_divide', args, kw, ['x1', 'x2']); return result(binop(ctx, '//', A(a), A(b))); },
  '_np.mod'(ctx, args, kw) { const [a, b] = params('mod', args, kw, ['x1', 'x2']); return result(binop(ctx, '%', A(a), A(b))); },
  // ----- reductions -----
  ...Object.fromEntries(Object.entries(REDUCE).map(([n, f]) => [`_np.${n}`, reduceNative(n, f)])),
  '_np.argmin': argReduce('argmin', false),
  '_np.argmax': argReduce('argmax', true),
  '_np.var': statNative('var'),
  '_np.std': statNative('std', 0, true),
  '_np.cumsum': cumNative('cumsum', false),
  '_np.cumprod': cumNative('cumprod', true),
  '_np.nansum'(ctx, args, kw) { const [a, axis, , , keepdims] = params('nansum', args, kw, ['a', '?axis', '?dtype', '?out', '?keepdims']); const { arr } = nanParts(A(a), axisArg(axis), false); return result(sumNd(arr, axisArg(axis), truthy(keepdims ?? false))); },
  '_np.nanmean'(ctx, args, kw) { const [a, axis, , , keepdims] = params('nanmean', args, kw, ['a', '?axis', '?dtype', '?out', '?keepdims']); return result(nanStat(ctx, A(a), axisArg(axis), 'mean', 0, truthy(keepdims ?? false))); },
  '_np.nanvar'(ctx, args, kw) { const [a, axis, , , ddof, keepdims] = params('nanvar', args, kw, ['a', '?axis', '?dtype', '?out', '?ddof', '?keepdims']); return result(nanStat(ctx, A(a), axisArg(axis), 'var', optNum(ddof, 0), truthy(keepdims ?? false))); },
  '_np.nanstd'(ctx, args, kw) { const [a, axis, , , ddof, keepdims] = params('nanstd', args, kw, ['a', '?axis', '?dtype', '?out', '?ddof', '?keepdims']); return result(nanStat(ctx, A(a), axisArg(axis), 'std', optNum(ddof, 0), truthy(keepdims ?? false))); },
  '_np.nanmax'(ctx, args, kw) { const [a, axis] = params('nanmax', args, kw, ['a', '?axis', '?out', '?keepdims']); return result(nanMinMax(ctx, A(a), axisArg(axis), true)); },
  '_np.nanmin'(ctx, args, kw) { const [a, axis] = params('nanmin', args, kw, ['a', '?axis', '?out', '?keepdims']); return result(nanMinMax(ctx, A(a), axisArg(axis), false)); },
  '_np.nanmedian'(ctx, args, kw) {
    const [a, axis] = params('nanmedian', args, kw, ['a', '?axis']);
    const nd = A(a);
    if (axisArg(axis) !== null) throw npErr('TypeError', "Natter's numpy supports nanmedian() only without axis");
    const f = Array.from(flat(needNumeric(nd, 'nanmedian'))).filter((v) => !Number.isNaN(v));
    if (!f.length) { npWarn(ctx, 'All-NaN slice encountered'); return new PyFloat(NaN); }
    return medianOf(ctx, new Nd(Float64Array.from(f), [f.length], 'float64'), null);
  },
  '_np.median'(ctx, args, kw) { const [a, axis] = params('median', args, kw, ['a', '?axis']); return medianOf(ctx, A(a), axisArg(axis)); },
  '_np.percentile'(ctx, args, kw) { const [a, q, axis] = params('percentile', args, kw, ['a', 'q', '?axis']); return percentileOf(ctx, A(a), q, axisArg(axis), 100); },
  '_np.quantile'(ctx, args, kw) { const [a, q, axis] = params('quantile', args, kw, ['a', 'q', '?axis']); return percentileOf(ctx, A(a), q, axisArg(axis), 1); },
  '_np.average'(ctx, args, kw) {
    const [a, axis, weights] = params('average', args, kw, ['a', '?axis', '?weights']);
    const nd = A(a);
    if (weights === undefined || weights === null) return result(meanNd(ctx, nd, axisArg(axis)));
    const w = A(weights);
    if (axisArg(axis) !== null) throw npErr('TypeError', "Natter's numpy supports average(weights=…) only without axis");
    if (w.size !== nd.size) throw npErr('ValueError', 'Length of weights not compatible with specified axis.');
    const prodW = binop(ctx, '*', nd, reshape(w.contiguous() ? w : copyNd(w), nd.shape.slice()));
    const sw = sumFn(flat(astype(null, w, 'float64')), 0, w.size, true);
    if (sw === 0) throw npErr('ZeroDivisionError', "Weights sum to zero, can't be normalized");
    return new PyFloat(sumFn(flat(astype(null, prodW, 'float64')), 0, nd.size, true) / sw);
  },
  '_np.diff'(ctx, args, kw) {
    const [a, n] = params('diff', args, kw, ['a', '?n', '?axis']);
    let nd = A(a);
    for (let k = 0; k < (n === undefined ? 1 : Number(num(n))); k++) {
      const len = nd.shape[nd.ndim - 1];
      const hi = getIndex(nd, T([...nd.shape.slice(0, -1).map(() => new PySlice(null, null, null)), new PySlice(1, null, null)]));
      const lo = getIndex(nd, T([...nd.shape.slice(0, -1).map(() => new PySlice(null, null, null)), new PySlice(null, Math.max(0, len - 1), null)]));
      nd = nd.dtype === 'bool' ? zipWith(ctx, hi, lo, (x, y) => (x !== y ? 1 : 0), 'bool') : binop(ctx, '-', hi, lo);
    }
    return wrap(nd);
  },
  '_np.sort'(ctx, args, kw) { const [a, axis] = params('sort', args, kw, ['a', '?axis', '?kind']); return wrap(sortAlong(A(a), axis === undefined ? -1 : axisArg(axis), false)); },
  '_np.argsort'(ctx, args, kw) { const [a, axis] = params('argsort', args, kw, ['a', '?axis', '?kind']); return wrap(sortAlong(A(a), axis === undefined ? -1 : axisArg(axis), true)); },
  '_np.unique'(ctx, args, kw) {
    const [a, ri, rinv, rc] = params('unique', args, kw, ['ar', '?return_index', '?return_inverse', '?return_counts', '?axis']);
    const nd = A(a), f = Array.from(flat(nd));
    const cmpv = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
    const order = [...f.keys()].sort((i, j) => (Number.isNaN(f[i]) ? (Number.isNaN(f[j]) ? i - j : 1) : Number.isNaN(f[j]) ? -1 : cmpv(f[i], f[j]) || i - j));
    const vals = [], first = [], counts = [], inv = new Float64Array(f.length);
    for (const i of order) {
      const v = f[i];
      if (vals.length && (vals[vals.length - 1] === v || (Number.isNaN(v) && Number.isNaN(vals[vals.length - 1])))) counts[counts.length - 1]++;
      else { vals.push(v); first.push(i); counts.push(1); }
      inv[i] = vals.length - 1;
    }
    const u = wrap(new Nd(isStrDt(nd.dtype) ? vals : Float64Array.from(vals), [vals.length], nd.dtype));
    const extra = [];
    if (truthy(ri ?? false)) extra.push(wrap(new Nd(Float64Array.from(first), [first.length], 'int64')));
    if (truthy(rinv ?? false)) extra.push(wrap(new Nd(inv, nd.ndim <= 1 ? [f.length] : nd.shape.slice(), 'int64')));
    if (truthy(rc ?? false)) extra.push(wrap(new Nd(Float64Array.from(counts), [counts.length], 'int64')));
    return extra.length ? T([u, ...extra]) : u;
  },
  '_np.bincount'(ctx, args, kw) {
    const [x, w, ml] = params('bincount', args, kw, ['x', '?weights', '?minlength']);
    const nd = A(x), f = flat(nd);
    if (nd.dtype === 'float64') throw npErr('TypeError', "Cannot cast array data from dtype('float64') to dtype('int64') according to the rule 'safe'");
    let n = ml ? Number(num(ml)) : 0;
    for (const v of f) { if (v < 0) throw npErr('ValueError', "'list' argument must have no negative elements"); n = Math.max(n, v + 1); }
    const out = newData(n), wf = w ? flat(A(w)) : null;
    f.forEach((v, i) => { out[v] += wf ? wf[i] : 1; });
    return wrap(new Nd(out, [n], wf ? 'float64' : 'int64'));
  },
  '_np.histogram'(ctx, args, kw) {
    const [a, bins, range, density, weights] = params('histogram', args, kw, ['a', '?bins', '?range', '?density', '?weights']);
    const b = bins === undefined || bins === null ? 10 : isInt(bins) ? Number(num(bins)) : Array.from(flat(A(bins, 'bins')));
    const r = range === undefined || range === null ? null : Array.from(flat(A(range, 'range')));
    const edt = Array.isArray(b) ? A(bins).dtype : 'float64';
    const { counts, edges } = histogram(ctx, A(a), b, r, weights === undefined || weights === null ? null : A(weights), edt);
    if (truthy(density ?? false)) {
      const total = sumFn(counts.data, 0, counts.size, true);
      const d = new Float64Array(counts.size);
      for (let i = 0; i < d.length; i++) d[i] = counts.data[i] / total / (edges.data[i + 1] - edges.data[i]);
      return T([wrap(new Nd(d, [d.length], 'float64')), wrap(edges)]);
    }
    return T([wrap(counts), wrap(edges)]);
  },
  // ----- linear algebra -----
  '_np.dot'(ctx, args, kw) { const [a, b] = params('dot', args, kw, ['a', 'b', '?out']); return result(matmul(ctx, A(a), A(b), 'dot')); },
  '_np.matmul'(ctx, args, kw) { const [a, b] = params('matmul', args, kw, ['x1', 'x2']); return result(matmul(ctx, A(a), A(b))); },
  '_np.outer'(ctx, args, kw) {
    const [a, b] = params('outer', args, kw, ['a', 'b']);
    const x = A(a), y = A(b);
    return wrap(binop(ctx, '*', reshape(x.contiguous() ? x : copyNd(x), [x.size, 1]), reshape(y.contiguous() ? y : copyNd(y), [1, y.size])));
  },
  '_np.trace'(ctx, args, kw) { const [a] = params('trace', args, kw, ['a']); const nd = A(a); let s = 0; for (let i = 0; i < Math.min(nd.shape[0], nd.shape[1]); i++) s += nd.data[nd.offset + i * (nd.strides[0] + nd.strides[1])]; return toPy(s, intSum(nd.dtype)); },
  '_np.diag'(ctx, args, kw) {
    const [a, k] = params('diag', args, kw, ['v', '?k']);
    const nd = A(a), kk = k === undefined ? 0 : Number(num(k));
    if (nd.ndim === 1) {
      const n = nd.size + Math.abs(kk), out = filled([n, n], 0, nd.dtype), f = flat(nd);
      for (let i = 0; i < nd.size; i++) out.data[(kk >= 0 ? i : i - kk) * n + (kk >= 0 ? i + kk : i)] = f[i];
      return wrap(out);
    }
    const vals = [];
    for (let i = 0; i < nd.shape[0]; i++) { const j = i + kk; if (j >= 0 && j < nd.shape[1]) vals.push(nd.data[nd.offset + i * nd.strides[0] + j * nd.strides[1]]); }
    return wrap(new Nd(Float64Array.from(vals), [vals.length], nd.dtype));
  },
  '_np._linalg_det'(ctx, args) { return new PyFloat(det(A(args[0]))); },
  '_np._linalg_solve'(ctx, args) { const r = solve(A(args[0]), A(args[1])); if (!r) throw npErr('LinAlgError', 'Singular matrix', 'npSingular'); return wrap(r); },
  '_np._linalg_inv'(ctx, args) {
    const nd = A(args[0]);
    squareCheck(nd);
    const r = solve(nd, eyeNd(nd.shape[0]));
    if (!r) throw npErr('LinAlgError', 'Singular matrix', 'npSingular');
    return wrap(r);
  },
  '_np._linalg_norm'(ctx, args) {
    const nd = A(args[0]), f = flat(nd);
    let s = 0;
    for (let i = 0; i < f.length; i++) s += f[i] * f[i];
    return new PyFloat(Math.sqrt(s));
  },
  '_np.polyfit'(ctx, args, kw) {
    const [x, y, deg] = params('polyfit', args, kw, ['x', 'y', 'deg']);
    const X = Array.from(flat(needNumeric(A(x, 'x'), 'polyfit'))), Y = Array.from(flat(needNumeric(A(y, 'y'), 'polyfit')));
    if (X.length !== Y.length) throw npErr('TypeError', 'expected x and y to have same length', 'npPolyfit');
    return wrap(new Nd(Float64Array.from(polyfit(X, Y, Number(num(deg)))), [Number(num(deg)) + 1], 'float64'));
  },
  '_np.polyval'(ctx, args, kw) {
    const [p, x] = params('polyval', args, kw, ['p', 'x']);
    const c = Array.from(flat(A(p, 'p'))), X = A(x);
    const pd = A(p).dtype;
    return result(unaryMap(ctx, X, (v) => { let r = 0; for (const k of c) r = r * v + k; return r; }, promote(pd, X.dtype) === 'float64' ? 'float' : 'same', 'polyval'));
  },
  '_np.corrcoef'(ctx, args, kw) {
    const [x, y] = params('corrcoef', args, kw, ['x', '?y']);
    const rows = covRows(x, y);
    const c = covMatrix(rows);
    const n = rows.length, out = newData(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i * n + j] = Math.max(-1, Math.min(1, c[i * n + j] / Math.sqrt(c[i * n + i]) / Math.sqrt(c[j * n + j])));
    return result(new Nd(out, n === 1 ? [] : [n, n], 'float64'));
  },
  '_np.cov'(ctx, args, kw) {
    const [x, y] = params('cov', args, kw, ['m', '?y']);
    const rows = covRows(x, y), n = rows.length;
    return result(new Nd(Float64Array.from(covMatrix(rows)), n === 1 ? [] : [n, n], 'float64'));
  },
  '_np.interp'(ctx, args, kw) {
    const [x, xp, fp] = params('interp', args, kw, ['x', 'xp', 'fp']);
    const XP = Array.from(flat(A(xp, 'xp'))), FP = Array.from(flat(A(fp, 'fp')));
    if (XP.length !== FP.length) throw npErr('ValueError', 'fp and xp are not of the same length.');
    return result(unaryMap(ctx, A(x), (v) => {
      if (Number.isNaN(v)) return NaN;
      if (v <= XP[0]) return FP[0];
      if (v >= XP[XP.length - 1]) return FP[FP.length - 1];
      let j = 0;
      while (XP[j + 1] < v) j++;
      if (XP[j + 1] === v) return FP[j + 1];
      const slope = (FP[j + 1] - FP[j]) / (XP[j + 1] - XP[j]);
      return slope * (v - XP[j]) + FP[j];
    }, 'float', 'interp'));
  },
  // ----- misc -----
  '_np.isscalar'(ctx, args) { return isNum(args[0]) || typeof args[0] === 'string'; },
  '_np.set_printoptions'(ctx, args, kw) {
    const [precision, threshold, edgeitems, linewidth, suppress] = params('set_printoptions', args, kw, ['?precision', '?threshold', '?edgeitems', '?linewidth', '?suppress', '?nanstr', '?infstr', '?formatter', '?sign', '?floatmode', '?legacy']);
    const o = { ...(ctx.vm.npPrint ?? PRINT_DEFAULTS) };
    if (precision !== undefined && precision !== null) o.precision = Number(num(precision));
    if (threshold !== undefined && threshold !== null) o.threshold = Number(scalarNum(threshold));
    if (edgeitems !== undefined && edgeitems !== null) o.edgeitems = Number(num(edgeitems));
    if (linewidth !== undefined && linewidth !== null) o.linewidth = Number(num(linewidth));
    if (suppress !== undefined && suppress !== null) o.suppress = truthy(suppress);
    ctx.vm.npPrint = o;
    return null;
  },
  '_np.get_printoptions'(ctx) {
    const o = ctx.vm.npPrint ?? PRINT_DEFAULTS, d = new PyDict();
    for (const k of ['precision', 'threshold', 'edgeitems', 'linewidth']) d.set(k, o[k]);
    d.set('suppress', o.suppress);
    return d;
  },
  '_np.float64'(ctx, args) { return new PyFloat(args.length ? toNd(args[0]).data[0] : 0); },
  '_np.int64'(ctx, args) { const v = args.length ? toNd(args[0]).data[0] : 0; return toPy(castInt(v), 'int64'); },
  '_np.bool_'(ctx, args) { return args.length ? toNd(args[0]).data[0] !== 0 : false; },
  '_np._ufunc'(ctx, args) {
    // generic one-argument function: _np.ufunc(name, x)
    const name = args[0];
    return result(applyUnary(ctx, name, A(args[1], 'x')));
  },
  '_np._tofloats'(ctx, args) { return new PyList(toFloatList(args[0]).map((v) => new PyFloat(v))); },
  '_np._isarray'(ctx, args) { return isArr(args[0]); },
};

/** a with NaN replaced by v, and the count of the other values along the axis (numpy's _replace_nan). */
function nanParts(nd, axis, keepdims, v = 0) {
  needNumeric(nd, 'nan');
  const f = flat(nd).slice(), mask = new Float64Array(f.length);
  for (let i = 0; i < f.length; i++) if (Number.isNaN(f[i])) { f[i] = v; } else mask[i] = 1;
  const arr = new Nd(f, nd.shape.slice(), nd.dtype === 'float64' ? 'float64' : nd.dtype);
  const cnt = reduceAxis(new Nd(mask, nd.shape.slice(), 'int64'), axis, keepdims, sumFn, 'int64');
  return { arr, cnt };
}

function nanStat(ctx, nd, axis, kind, ddof = 0, keepdims = false) {
  const { arr, cnt } = nanParts(nd, axis, kind === 'mean' ? keepdims : true);
  const sum = reduceAxis(arr, axis, kind === 'mean' ? keepdims : true, sumFn, nd.dtype === 'float64' ? 'float64' : 'float64');
  let warned = false;
  for (let i = 0; i < sum.data.length; i++) { if (cnt.data[i] === 0 && !warned) { npWarn(ctx, 'Mean of empty slice'); warned = true; } sum.data[i] /= cnt.data[i]; }
  if (kind === 'mean') return sum;
  const dev = binop(ctx, '-', arr.dtype === 'float64' ? arr : astype(null, arr, 'float64'), sum);
  const src = flat(nd);
  for (let i = 0; i < dev.data.length; i++) { const d = Number.isNaN(src[i]) ? 0 : dev.data[i]; dev.data[i] = d * d; }
  const v = reduceAxis(dev, axis, keepdims, sumFn, 'float64');
  const counts = keepdims ? flat(cnt) : axis === null || axis === undefined ? [flat(cnt)[0]] : flat(cnt);
  for (let i = 0; i < v.data.length; i++) { const dof = counts[i] - ddof; if (dof <= 0) npWarn(ctx, 'Degrees of freedom <= 0 for slice.'); v.data[i] /= Math.max(dof, 0); if (kind === 'std') v.data[i] = Math.sqrt(v.data[i]); }
  return v;
}

function nanMinMax(ctx, nd, axis, isMax) {
  let allNan = false;
  const r = reduceAxis(nd, axis, false, (a, lo, n) => {
    let best = NaN;
    for (let i = 0; i < n; i++) { const v = a[lo + i]; if (!Number.isNaN(v) && (Number.isNaN(best) || (isMax ? v > best : v < best))) best = v; }
    if (Number.isNaN(best)) allNan = true;
    return best;
  }, nd.dtype, isMax ? 'fmax' : 'fmin');
  if (allNan) npWarn(ctx, 'All-NaN slice encountered');
  return r;
}

function eyeNd(n) { const d = new Float64Array(n * n); for (let i = 0; i < n; i++) d[i * n + i] = 1; return new Nd(d, [n, n], 'float64'); }

function closeTo(x, y, rt, at, en) {
  if (Number.isNaN(x) || Number.isNaN(y)) return en && Number.isNaN(x) && Number.isNaN(y);
  if (x === y) return true;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) <= at + rt * Math.abs(y);
}

function covRows(x, y) {
  const X = needNumeric(A(x), 'cov');
  const rows = X.ndim === 1 ? [Array.from(flat(X))] : iterNd(X).map((r) => toFloatList(r));
  if (y !== undefined && y !== null) { const Y = A(y); if (Y.ndim === 1) rows.push(Array.from(flat(Y))); else for (const r of iterNd(Y)) rows.push(toFloatList(r)); }
  return rows;
}
/** Covariance matrix like numpy.cov (ddof 1): mean subtracted, then X·Xᵀ / (n-1). */
function covMatrix(rows) {
  const k = rows.length, n = rows[0].length;
  const centered = rows.map((r) => { const m = pairwiseSum(r, 0, n) / n; return r.map((v) => v - m); });
  const out = new Array(k * k);
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { let s = 0; for (let t = 0; t < n; t++) s += centered[i][t] * centered[j][t]; out[i * k + j] = s / (n - 1); }
  return out;
}

for (const name of Object.keys(UNARY)) {
  NP_NATIVES[`_np.${name}`] = (ctx, args, kw) => {
    const [x] = params(name, args, kw, ['x', '?out']);
    return result(applyUnary(ctx, name, A(x, 'x')));
  };
}

// ---------- ndarray methods ----------

const self = (args) => args[0].nd;
const bin = (op, reflected = false) => (ctx, args) => {
  const o = operand(args[1]);
  if (!o) return NOT_IMPLEMENTED;
  const r = reflected ? binop(ctx, op, o, self(args)) : binop(ctx, op, self(args), o);
  return wrap(r);
};
const inplace = (op) => (ctx, args) => {
  const a = self(args), o = operand(args[1]);
  if (!o) return NOT_IMPLEMENTED;
  const bs = broadcastShapes(a.shape, o.shape);
  if (!bs) throw npErr('ValueError', `operands could not be broadcast together with shapes ${shapeErr(a.shape)} ${shapeErr(o.shape)} ${shapeErr(a.shape)} `, 'npBroadcast');
  const r = binop(ctx, op, a, o);
  if (DT_RANK[r.dtype] > DT_RANK[a.dtype]) {
    throw npErr('UFuncTypeError', `Cannot cast ufunc '${UFUNC_NAME[op]}' output from dtype('${r.dtype}') to dtype('${a.dtype}') with casting rule 'same_kind'`, 'npInplaceCast', { from: r.dtype, to: a.dtype });
  }
  if (r.shape.length !== a.shape.length || r.shape.some((s, i) => s !== a.shape[i])) throw npErr('ValueError', `non-broadcastable output operand with shape ${shapeErr(a.shape)} doesn't match the broadcast shape ${shapeErr(r.shape)}`, 'npBroadcast');
  setIndex(ctx, a, new PySlice(null, null, null), wrap(r));
  return args[0];
};
const cmp = (op) => (ctx, args) => {
  const o = operand(args[1]);
  if (!o) return op === '==' ? false : op === '!=' ? true : NOT_IMPLEMENTED;
  return wrap(binop(ctx, op, self(args), o));
};

/** A method that forwards to a module function with the array as first argument. */
const viaModule = (name) => (ctx, args, kw) => NP_NATIVES[`_np.${name}`](ctx, args, kw);

const ND_METHODS = {
  __repr__: (ctx, args) => reprNd(ctx.vm, self(args)),
  __str__: (ctx, args) => strNd(ctx.vm, self(args)),
  __len__: (ctx, args) => { const a = self(args); if (!a.ndim) throw npErr('TypeError', 'len() of unsized object'); return a.shape[0]; },
  __iter__: (ctx, args) => new PyIterator(new PyList(iterNd(self(args))), 0, 'iterator'),
  __bool__: (ctx, args) => {
    const a = self(args);
    if (a.size === 1) return a.data[a.ndim ? flatIndex0(a) : a.offset] !== 0;
    if (a.size === 0) throw npErr('ValueError', 'The truth value of an empty array is ambiguous. Use `array.size > 0` to check that an array is not empty.', 'npTruthEmpty');
    throw npErr('ValueError', 'The truth value of an array with more than one element is ambiguous. Use a.any() or a.all()', 'npTruth');
  },
  __contains__: (ctx, args) => { const a = self(args); const r = binop(ctx, '==', a, toNd(args[1])); return r.data.some((v) => v !== 0); },
  __getitem__: (ctx, args) => result(getIndex(self(args), args[1])),
  __setitem__: (ctx, args) => { setIndex(ctx, self(args), args[1], args[2]); return null; },
  __neg__: (ctx, args) => wrap(applyUnary(ctx, 'negative', self(args))),
  __pos__: (ctx, args) => wrap(copyNd(self(args))),
  __abs__: (ctx, args) => wrap(applyUnary(ctx, 'absolute', self(args))),
  __invert__: (ctx, args) => {
    const a = self(args);
    if (a.dtype === 'float64') throw npErr('TypeError', "ufunc 'invert' not supported for the input types, and the inputs could not be safely coerced to any supported types according to the casting rule ''safe''", 'npUfuncType');
    return wrap(unaryMap(ctx, a, a.dtype === 'bool' ? (x) => (x ? 0 : 1) : (x) => -x - 1, 'same', 'invert'));
  },
  __matmul__: (ctx, args) => { const o = operand(args[1]); return o ? result(matmul(ctx, self(args), o)) : NOT_IMPLEMENTED; },
  __rmatmul__: (ctx, args) => { const o = operand(args[1]); return o ? result(matmul(ctx, o, self(args))) : NOT_IMPLEMENTED; },
  __imatmul__: (ctx, args) => { const o = operand(args[1]); return o ? wrap(matmul(ctx, self(args), o)) : NOT_IMPLEMENTED; },
  __eq__: cmp('=='), __ne__: cmp('!='), __lt__: cmp('<'), __le__: cmp('<='), __gt__: cmp('>'), __ge__: cmp('>='),
  __copy__: (ctx, args) => wrap(copyNd(self(args))),
  __deepcopy__: (ctx, args) => wrap(copyNd(self(args))),
  __format__: (ctx, args) => {
    const a = self(args), spec = args[1];
    if (!spec) return strNd(ctx.vm, a);
    if (a.ndim === 0) return ctx.vm.callSync(new PyBuiltin('format'), [toPy(a.data[a.offset], a.dtype), spec], null, ctx.task);
    throw npErr('TypeError', 'unsupported format string passed to numpy.ndarray.__format__', 'npFormat');
  },
  // methods
  reshape: (ctx, args) => { const a = self(args); return wrap(reshape(a, newShape(a, args.slice(1)))); },
  flatten: (ctx, args) => { const a = self(args); return wrap(new Nd(flat(a).slice(), [a.size], a.dtype)); },
  ravel: (ctx, args) => { const a = self(args); return wrap(reshape(a, [a.size])); },
  copy: (ctx, args) => wrap(copyNd(self(args))),
  tolist: (ctx, args) => tolist(self(args)),
  item: (ctx, args) => {
    const a = self(args);
    if (args.length === 2 && isInt(args[1])) {
      // one int: position in the flattened array
      const f = flat(a), i = Number(num(args[1]));
      if (i < -f.length || i >= f.length) throw npErr('IndexError', `index ${i} is out of bounds for size ${f.length}`, 'npBounds');
      return toPy(f[i < 0 ? i + f.length : i], a.dtype);
    }
    if (args.length > 1) return result(getIndex(a, args.length === 2 ? args[1] : T(args.slice(1))));
    if (a.size !== 1) throw npErr('ValueError', 'can only convert an array of size 1 to a Python scalar', 'npItem');
    return toPy(flat(a)[0], a.dtype);
  },
  astype: (ctx, args, kw) => { const [, dt] = params('astype', args, kw, ['self', 'dtype', '?order', '?casting', '?subok', '?copy']); return wrap(astype(ctx, self(args), resolveDtype(dt))); },
  fill: (ctx, args) => { setIndex(ctx, self(args), new PySlice(null, null, null), args[1]); return null; },
  transpose: (ctx, args) => { const a = self(args); const ax = args.length > 2 ? args.slice(1) : args[1] ? iterItemsArr(args[1]) : null; return wrap(transpose(a, ax ? ax.map((x) => normAxis(x, a.ndim)) : null)); },
  sort: (ctx, args, kw) => {
    const [, axis] = params('sort', args, kw, ['self', '?axis', '?kind']);
    const a = self(args);
    setIndex(ctx, a, new PySlice(null, null, null), wrap(sortAlong(a, axis === undefined ? -1 : axisArg(axis), false)));
    return null;
  },
  argsort: viaModule('argsort'),
  sum: viaModule('sum'), prod: viaModule('prod'), mean: viaModule('mean'), min: viaModule('min'), max: viaModule('max'),
  std: viaModule('std'), var: viaModule('var'), argmin: viaModule('argmin'), argmax: viaModule('argmax'),
  cumsum: viaModule('cumsum'), cumprod: viaModule('cumprod'), any: viaModule('any'), all: viaModule('all'),
  ptp: viaModule('ptp'), clip: viaModule('clip'), dot: viaModule('dot'), nonzero: viaModule('nonzero'), squeeze: viaModule('squeeze'),
  trace: viaModule('trace'), diagonal: viaModule('diag'),
  round: viaModule('round'),
  __init__: (ctx, args, kw) => {
    const [inst, shape, dt] = params('ndarray', args, kw, ['self', 'shape', '?dtype']);
    inst.nd = filled(shapeArg(shape), 0, resolveDtype(dt) ?? 'float64');
    return null;
  },
};
function iterItemsArr(v) { return v instanceof PyTuple || v instanceof PyList ? v.items : [v]; }
function flatIndex0(a) { return a.offset; }

for (const [op, n] of Object.entries({ '+': 'add', '-': 'sub', '*': 'mul', '/': 'truediv', '//': 'floordiv', '%': 'mod', '**': 'pow', '&': 'and', '|': 'or', '^': 'xor', '<<': 'lshift', '>>': 'rshift' })) {
  ND_METHODS[`__${n}__`] = bin(op);
  ND_METHODS[`__r${n}__`] = bin(op, true);
  ND_METHODS[`__i${n}__`] = inplace(op);
}

const ND_PROPS = {
  shape: (ctx, args) => shapeTuple(self(args).shape),
  size: (ctx, args) => self(args).size,
  ndim: (ctx, args) => self(args).ndim,
  dtype: (ctx, args) => dtypeObj(self(args).dtype),
  T: (ctx, args) => wrap(transpose(self(args))),
  flat: (ctx, args) => new PyIterator(new PyList(Array.from(flat(self(args)), (v) => toPy(v, self(args).dtype))), 0, 'numpy.flatiter'),
  itemsize: () => 8,
  nbytes: (ctx, args) => self(args).size * 8,
};

for (const [name, f] of Object.entries(ND_METHODS)) {
  NP_NATIVES[`_np.nd.${name}`] = f;
  NDARRAY.dict.set(name, new PyBuiltin(`_np.nd.${name}`));
}
for (const [name, f] of Object.entries(ND_PROPS)) {
  NP_NATIVES[`_np.ndp.${name}`] = f;
  NDARRAY.dict.set(name, new PyProperty(new PyBuiltin(`_np.ndp.${name}`)));
}
NDARRAY.dict.set('__hash__', null);

// dtype objects: print as float64, repr dtype('float64'), compare with strings and types
const DTYPE_METHODS = {
  __repr__: (ctx, args) => `dtype('${args[0].dt}')`,
  __str__: (ctx, args) => args[0].dt,
  __eq__: (ctx, args) => { try { return resolveDtype(args[1]) === args[0].dt; } catch { return false; } },
  __ne__: (ctx, args) => { try { return resolveDtype(args[1]) !== args[0].dt; } catch { return true; } },
  __hash__: (ctx, args) => ({ bool: 1, int64: 2, float64: 3 })[args[0].dt] ?? 100 + strLen(args[0].dt),
};
for (const [name, f] of Object.entries(DTYPE_METHODS)) {
  NP_NATIVES[`_np.dtype.${name}`] = f;
  DTYPE.dict.set(name, new PyBuiltin(`_np.dtype.${name}`));
}
NP_NATIVES['_np.dtypep.name'] = (ctx, args) => args[0].dt;
NP_NATIVES['_np.dtypep.kind'] = (ctx, args) => ({ bool: 'b', int64: 'i', float64: 'f' })[args[0].dt] ?? 'U';
DTYPE.dict.set('name', new PyProperty(new PyBuiltin('_np.dtypep.name')));
DTYPE.dict.set('kind', new PyProperty(new PyBuiltin('_np.dtypep.kind')));
NP_NATIVES['_np.dtype.__init__'] = (ctx, args) => { args[0].dt = resolveDtype(args[1]); return null; };
DTYPE.dict.set('__init__', new PyBuiltin('_np.dtype.__init__'));

/** Names of the module _np (functions and the two classes). */
export const NP_NAMES = [
  ...Object.keys(NP_NATIVES).filter((n) => /^_np\.[a-z_0-9]+$/i.test(n)).map((n) => n.slice(4)),
  'ndarray', 'dtype', ...Object.keys(NP_EXCEPTIONS).map((k) => `_${k}`),
];
// the exception classes are '_'-names in _np, so `from numpy import *` does not shadow Python's own (MemoryError)
export const NP_CONSTS = { ndarray: NDARRAY, dtype: DTYPE, ...Object.fromEntries(Object.entries(NP_EXCEPTIONS).map(([k, v]) => [`_${k}`, v])) };

// random numbers live in nprandom.js; they need wrap/toNd from here
export { array2string };
