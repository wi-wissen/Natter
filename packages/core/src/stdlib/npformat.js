// Printing of numpy arrays like numpy 2.x (numpy/_core/arrayprint.py): str() and repr(), float digits
// (floatmode 'maxprec', precision 8), exponent mode, padding, line wrapping at 75 characters and
// summarising of large arrays ("..." after `threshold` elements, `edgeitems` at each end).

import { toFixedExact, reprStr } from '../values.js';

/** Default print options (np.set_printoptions changes a copy per VM). */
export const PRINT_DEFAULTS = Object.freeze({ precision: 8, threshold: 1000, edgeitems: 3, linewidth: 75, suppress: false });

/** round-half-even(|x| * 10^k) as a BigInt, exact (k may be negative). */
function scaledRound(x, k) {
  if (k >= 0) return BigInt(toFixedExact(Math.abs(x), k).replace('.', ''));
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, Math.abs(x));
  const hi = dv.getUint32(0), lo = dv.getUint32(4);
  const expBits = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e;
  if (expBits === 0) e = -1074; else { mant |= 1n << 52n; e = expBits - 1075; }
  let n = mant, d = 10n ** BigInt(-k); // rules-ok: BigInt
  if (e >= 0) n <<= BigInt(e); else d <<= BigInt(-e);
  let q = n / d;
  const r2 = (n % d) * 2n;
  if (r2 > d || (r2 === d && (q & 1n) === 1n)) q += 1n;
  return q;
}

/** Shortest round-trip digits of |x| (x finite, not 0): [digits, exponent of the first digit]. */
function shortest(x) {
  const m = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(Math.abs(x).toExponential());
  return [m[1] + (m[2] ?? ''), Number(m[3])];
}

/**
 * Dragon4 positional ('unique' digits, at most `precision` after the point), as int and fraction part.
 * trim '.': no trailing zeros, the point stays ("1."); minDigits pads the fraction with zeros.
 */
function positional(x, precision, minDigits = 0) {
  const neg = x < 0 || Object.is(x, -0);
  let intPart, frac;
  if (x === 0) { intPart = '0'; frac = ''; } else {
    const [digits, e] = shortest(x);
    const fracLen = Math.max(0, digits.length - 1 - e);
    if (fracLen <= precision) {
      if (e >= 0) { intPart = digits.slice(0, e + 1).padEnd(e + 1, '0'); frac = digits.slice(e + 1); } else { intPart = '0'; frac = '0'.repeat(-e - 1) + digits; }
    } else {
      const s = toFixedExact(Math.abs(x), precision);
      [intPart, frac] = s.split('.');
      frac = (frac ?? '').replace(/0+$/, '');
    }
  }
  if (frac.length < minDigits) frac = frac.padEnd(minDigits, '0');
  return [(neg ? '-' : '') + intPart, frac];
}

/** Dragon4 scientific: [mantissa int part with sign, fraction digits, exponent as number]. */
function scientific(x, precision, minDigits = 0) {
  const neg = x < 0 || Object.is(x, -0);
  let digits, e;
  if (x === 0) { digits = '0'; e = 0; } else {
    [digits, e] = shortest(x);
    if (digits.length - 1 > precision) {
      let q = scaledRound(x, precision - e);
      if (q >= 10n ** BigInt(precision + 1)) { e += 1; q = scaledRound(x, precision - e); } // rules-ok: BigInt
      digits = q.toString().replace(/0+$/, '') || '0';
    }
  }
  let frac = digits.slice(1);
  if (frac.length < minDigits) frac = frac.padEnd(minDigits, '0');
  return [(neg ? '-' : '') + digits[0], frac, e];
}

const expText = (e, size) => (e < 0 ? '-' : '+') + String(Math.abs(e)).padStart(size, '0');

/** Formatter for float values (numpy FloatingFormat, floatmode 'maxprec'). */
function floatFormatter(values, opts) {
  let precision = opts.precision;
  const finite = values.filter((v) => Number.isFinite(v));
  let expFormat = false;
  const absNZ = finite.filter((v) => v !== 0).map(Math.abs);
  if (absNZ.length) {
    let max = absNZ[0], min = absNZ[0];
    for (const v of absNZ) { if (v > max) max = v; if (v < min) min = v; }
    if (max >= 1e8 || (!opts.suppress && (min < 0.0001 || max / min > 1000))) expFormat = true;
  }
  let padLeft = 0, padRight = 0, expSize = -1, minDigits = 0;
  if (finite.length === 0) {
    padLeft = 0; padRight = 0;
  } else if (expFormat) {
    const parts = finite.map((v) => scientific(v, precision));
    expSize = Math.max(...parts.map((p) => String(Math.abs(p[2])).padStart(2, '0').length));
    precision = Math.max(...parts.map((p) => p[1].length));
    minDigits = precision;
    padLeft = Math.max(...parts.map((p) => p[0].length));
    padRight = expSize + 2 + precision;
  } else {
    const parts = finite.map((v) => positional(v, precision));
    padLeft = Math.max(...parts.map((p) => p[0].length));
    padRight = Math.max(...parts.map((p) => p[1].length));
  }
  if (finite.length !== values.length) {
    const neginf = values.some((v) => v === -Infinity) ? 1 : 0;
    const offset = padRight + 1;
    padLeft = Math.max(padLeft, 3 - offset, 3 + neginf - offset);
  }
  return (x) => {
    if (!Number.isFinite(x)) {
      const r = Number.isNaN(x) ? 'nan' : x < 0 ? '-inf' : 'inf';
      return r.padStart(padLeft + padRight + 1);
    }
    if (expFormat) {
      const [i, f, e] = scientific(x, precision, minDigits);
      return `${i.padStart(padLeft)}.${f}e${expText(e, expSize)}`;
    }
    const [i, f] = positional(x, precision, minDigits);
    return `${i.padStart(padLeft)}.${f.padEnd(padRight)}`;
  };
}

/** Formatter for one element type. @param {number[]} values the (summarised) data */
function formatterFor(values, dtype, opts, zeroD) {
  if (dtype.startsWith('<U')) return (x) => reprStr(x);
  if (dtype === 'bool') return (x) => (x ? (zeroD ? 'True' : ' True') : 'False');
  if (dtype === 'int64') {
    if (!values.length) return (x) => String(x);
    let max = values[0], min = values[0];
    for (const v of values) { if (v > max) max = v; if (v < min) min = v; }
    const w = Math.max(intText(max).length, intText(min).length);
    return (x) => intText(x).padStart(w);
  }
  return floatFormatter(values, opts);
}

const intText = (v) => (Number.isSafeInteger(v) ? String(v === 0 ? 0 : v) : BigInt(v).toString());

/** Text of a single number like numpy's str() of a scalar (for 0-d arrays). */
export function scalarText(v, dtype) {
  if (dtype.startsWith('<U')) return v;
  if (dtype === 'bool') return v ? 'True' : 'False';
  if (dtype === 'int64') return intText(v);
  return null;
}

function extendLine(s, line, word, width, nextPrefix) {
  let wrap = line.length + word.length > width;
  if (line.length <= nextPrefix.length) wrap = false;
  if (wrap) { s += line.replace(/\s+$/, '') + '\n'; line = nextPrefix; }
  return [s, line + word];
}

/**
 * numpy's _formatArray.
 * @param {(idx: number[]) => number} get value at a full index
 * @param {number[]} shape
 */
function formatArray(get, shape, fmt, lineWidth, nextLinePrefix, separator, edgeItems, summaryInsert) {
  const ndim = shape.length;
  const recurse = (index, hanging, width) => {
    const axis = index.length;
    const left = ndim - axis;
    if (left === 0) return fmt(get(index));
    const nextHanging = hanging + ' ';
    const nextWidth = width - 1;
    const n = shape[axis];
    const summary = summaryInsert && 2 * edgeItems < n;
    const leading = summary ? edgeItems : 0;
    const trailing = summary ? edgeItems : n;
    let s = '';
    if (left === 1) {
      const elemWidth = width - Math.max(separator.replace(/\s+$/, '').length, 1);
      let line = hanging;
      for (let i = 0; i < leading; i++) {
        [s, line] = extendLine(s, line, recurse([...index, i], nextHanging, nextWidth), elemWidth, hanging);
        line += separator;
      }
      if (summary) { [s, line] = extendLine(s, line, summaryInsert, elemWidth, hanging); line += separator; }
      for (let i = trailing; i > 1; i--) {
        [s, line] = extendLine(s, line, recurse([...index, n - i], nextHanging, nextWidth), elemWidth, hanging);
        line += separator;
      }
      [s, line] = extendLine(s, line, recurse([...index, n - 1], nextHanging, nextWidth), elemWidth, hanging);
      s += line;
    } else {
      const lineSep = separator.replace(/\s+$/, '') + '\n'.repeat(left - 1);
      for (let i = 0; i < leading; i++) s += hanging + recurse([...index, i], nextHanging, nextWidth) + lineSep;
      if (summary) s += hanging + summaryInsert + lineSep;
      for (let i = trailing; i > 1; i--) s += hanging + recurse([...index, n - i], nextHanging, nextWidth) + lineSep;
      s += hanging + recurse([...index, n - 1], nextHanging, nextWidth);
    }
    return '[' + s.slice(hanging.length) + ']';
  };
  return recurse([], nextLinePrefix, lineWidth);
}

/** Indices kept when summarising one axis of length n. */
function edgeIndices(n, edge, summary) {
  if (!summary || n <= 2 * edge) return Array.from({ length: n }, (_, i) => i);
  return [...Array.from({ length: edge }, (_, i) => i), ...Array.from({ length: edge }, (_, i) => n - edge + i)];
}

/**
 * numpy.array2string.
 * @param {{ shape: number[], dtype: string, size: number }} a
 * @param {(idx: number[]) => number} get
 */
export function array2string(a, get, opts, separator, prefix, suffix = '') {
  const summary = a.size > opts.threshold;
  // the values that decide the format: all, or only the edges of a summarised array
  const values = [];
  const collect = (index) => {
    if (index.length === a.shape.length) { values.push(get(index)); return; }
    for (const i of edgeIndices(a.shape[index.length], opts.edgeitems, summary)) collect([...index, i]);
  };
  if (a.size) collect([]);
  const fmt = formatterFor(values, a.dtype, opts, a.shape.length === 0);
  if (a.shape.length === 0) return fmt(get([]));
  if (a.size === 0) return '[]';
  return formatArray(get, a.shape, fmt, opts.linewidth - suffix.length, ' ' + ' '.repeat(prefix.length), separator, opts.edgeitems, summary ? '...' : '');
}

const shapeText = (shape) => (shape.length === 1 ? `(${shape[0]},)` : `(${shape.join(', ')})`);

/** repr() of an array: array([1, 2, 3]), with shape=/dtype= where numpy adds them. */
export function arrayRepr(a, get, opts) {
  const prefix = 'array(';
  const body = array2string(a, get, opts, ', ', prefix, ')');
  const extras = [];
  if ((a.size === 0 && !(a.shape.length === 1 && a.shape[0] === 0)) || a.size > opts.threshold) extras.push(`shape=${shapeText(a.shape)}`);
  if (a.dtype.startsWith('<U')) extras.push(`dtype='${a.dtype}'`);
  else if (a.size === 0) extras.push(`dtype=${a.dtype}`);
  if (!extras.length) return prefix + body + ')';
  const arrStr = prefix + body + ',';
  const extraStr = extras.join(', ') + ')';
  const lastLine = arrStr.length - (arrStr.lastIndexOf('\n') + 1);
  const spacer = lastLine + extraStr.length + 1 > opts.linewidth ? '\n' + ' '.repeat(prefix.length) : ' ';
  return arrStr + spacer + extraStr;
}

/** str() of an array: [1 2 3]. */
export function arrayStr(a, get, opts) {
  if (a.shape.length === 0) {
    const t = scalarText(get([]), a.dtype);
    return t ?? null; // floats: the caller prints the Python float
  }
  return array2string(a, get, opts, ' ', '');
}

export { shapeText };
