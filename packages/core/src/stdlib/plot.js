// _plot: the native part of matplotlib.pyplot. Figures and axes keep their artists here (per VM); show() turns each
// figure into an SVG string (deterministic: the same program gives the same bytes) and hands it to the host.
//
// Layout and look follow matplotlib's default style (rcParams of matplotlib 3.x): 6.4×4.8 inch at 100 dpi,
// subplot margins 0.125/0.9/0.11/0.88, colour cycle C0…C9 (separate cycles for lines and for patches/scatter),
// 5 % margins, AutoLocator (MaxNLocator with steps 1, 2, 2.5, 5, 10) and ScalarFormatter (offset, 1eN, unicode
// minus), legend 'best', DejaVu Sans metrics for text widths. Not pixel-identical, but ticks, labels, limits,
// colours and positions are those of matplotlib.

import { PyFloat, PyList, PyTuple, PyDict, PyInstance, PyClass, PyBuiltin, PyProperty, OBJECT, Suspend, isInt, isNum, num, truthy, typeName, iterItems, percentFormat } from '../values.js';
import { params } from '../args.js';
import { toFixedExact, formatValue } from '../values.js';
import * as M from '../libm.js';
import { isArr, flat, toNd, npErr, wrap, Nd, histogram } from './numpy.js';

// ---------- constants of the default style ----------

const PT = 100 / 72; // px per point at 100 dpi (scaled by dpi/100 for other dpi)
const CYCLE = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'];
const BASE_COLORS = { b: '#0000ff', g: '#008000', r: '#ff0000', c: '#00bfbf', m: '#bf00bf', y: '#bfbf00', k: '#000000', w: '#ffffff' };
// CSS4 colour names (as in matplotlib.colors.CSS4_COLORS)
const CSS = new Map('aliceblue:f0f8ff,antiquewhite:faebd7,aqua:00ffff,aquamarine:7fffd4,azure:f0ffff,beige:f5f5dc,bisque:ffe4c4,black:000000,blanchedalmond:ffebcd,blue:0000ff,blueviolet:8a2be2,brown:a52a2a,burlywood:deb887,cadetblue:5f9ea0,chartreuse:7fff00,chocolate:d2691e,coral:ff7f50,cornflowerblue:6495ed,cornsilk:fff8dc,crimson:dc143c,cyan:00ffff,darkblue:00008b,darkcyan:008b8b,darkgoldenrod:b8860b,darkgray:a9a9a9,darkgreen:006400,darkgrey:a9a9a9,darkkhaki:bdb76b,darkmagenta:8b008b,darkolivegreen:556b2f,darkorange:ff8c00,darkorchid:9932cc,darkred:8b0000,darksalmon:e9967a,darkseagreen:8fbc8f,darkslateblue:483d8b,darkslategray:2f4f4f,darkslategrey:2f4f4f,darkturquoise:00ced1,darkviolet:9400d3,deeppink:ff1493,deepskyblue:00bfff,dimgray:696969,dimgrey:696969,dodgerblue:1e90ff,firebrick:b22222,floralwhite:fffaf0,forestgreen:228b22,fuchsia:ff00ff,gainsboro:dcdcdc,ghostwhite:f8f8ff,gold:ffd700,goldenrod:daa520,gray:808080,green:008000,greenyellow:adff2f,grey:808080,honeydew:f0fff0,hotpink:ff69b4,indianred:cd5c5c,indigo:4b0082,ivory:fffff0,khaki:f0e68c,lavender:e6e6fa,lavenderblush:fff0f5,lawngreen:7cfc00,lemonchiffon:fffacd,lightblue:add8e6,lightcoral:f08080,lightcyan:e0ffff,lightgoldenrodyellow:fafad2,lightgray:d3d3d3,lightgreen:90ee90,lightgrey:d3d3d3,lightpink:ffb6c1,lightsalmon:ffa07a,lightseagreen:20b2aa,lightskyblue:87cefa,lightslategray:778899,lightslategrey:778899,lightsteelblue:b0c4de,lightyellow:ffffe0,lime:00ff00,limegreen:32cd32,linen:faf0e6,magenta:ff00ff,maroon:800000,mediumaquamarine:66cdaa,mediumblue:0000cd,mediumorchid:ba55d3,mediumpurple:9370db,mediumseagreen:3cb371,mediumslateblue:7b68ee,mediumspringgreen:00fa9a,mediumturquoise:48d1cc,mediumvioletred:c71585,midnightblue:191970,mintcream:f5fffa,mistyrose:ffe4e1,moccasin:ffe4b5,navajowhite:ffdead,navy:000080,oldlace:fdf5e6,olive:808000,olivedrab:6b8e23,orange:ffa500,orangered:ff4500,orchid:da70d6,palegoldenrod:eee8aa,palegreen:98fb98,paleturquoise:afeeee,palevioletred:db7093,papayawhip:ffefd5,peachpuff:ffdab9,peru:cd853f,pink:ffc0cb,plum:dda0dd,powderblue:b0e0e6,purple:800080,rebeccapurple:663399,red:ff0000,rosybrown:bc8f8f,royalblue:4169e1,saddlebrown:8b4513,salmon:fa8072,sandybrown:f4a460,seagreen:2e8b57,seashell:fff5ee,sienna:a0522d,silver:c0c0c0,skyblue:87ceeb,slateblue:6a5acd,slategray:708090,slategrey:708090,snow:fffafa,springgreen:00ff7f,steelblue:4682b4,tan:d2b48c,teal:008080,thistle:d8bfd8,tomato:ff6347,turquoise:40e0d0,violet:ee82ee,wheat:f5deb3,white:ffffff,whitesmoke:f5f5f5,yellow:ffff00,yellowgreen:9acd32'.split(',').map((e) => { const [k, v] = e.split(':'); return [k, `#${v}`]; }));
const TAB = { blue: 0, orange: 1, green: 2, red: 3, purple: 4, brown: 5, pink: 6, gray: 7, grey: 7, olive: 8, cyan: 9 };
const MARKERS = new Set(['.', ',', 'o', 'v', '^', '<', '>', '1', '2', '3', '4', '8', 's', 'p', 'P', '*', 'h', 'H', '+', 'x', 'X', 'D', 'd', '|', '_']);
const LINESTYLES = { '-': '-', '--': '--', '-.': '-.', ':': ':', solid: '-', dashed: '--', dashdot: '-.', dotted: ':', None: '', none: '', '': '', ' ': '' };
const DASHES = { '--': [3.7, 1.6], '-.': [6.4, 1.6, 1, 1.6], ':': [1, 1.65] };

// DejaVu Sans advance widths (1/1000 em) for text measuring
const FONT_CHARS = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~äöüÄÖÜß°−²³µ€…–·×÷±≈≤≥αβγδπσμΔΣΩ";
const FONT_W = [318, 401, 460, 838, 636, 950, 780, 275, 390, 390, 500, 838, 318, 361, 318, 337, 636, 636, 636, 636, 636, 636, 636, 636, 636, 636, 337, 337, 838, 838, 838, 531, 1000, 684, 686, 698, 770, 632, 575, 775, 752, 295, 295, 656, 557, 863, 748, 787, 603, 787, 695, 635, 611, 732, 684, 989, 685, 611, 685, 390, 337, 390, 838, 500, 500, 613, 635, 550, 635, 615, 352, 635, 634, 278, 278, 579, 278, 974, 634, 612, 635, 635, 411, 521, 392, 634, 592, 818, 592, 592, 525, 636, 337, 636, 838, 613, 612, 634, 684, 787, 732, 630, 500, 838, 401, 401, 636, 636, 1000, 500, 318, 838, 838, 838, 838, 838, 838, 659, 638, 592, 612, 602, 634, 636, 684, 632, 764];
const ADV = new Map([...FONT_CHARS].map((c, i) => [c, FONT_W[i]]));
/** Width of a text in px (font size in px). */
export function textWidth(s, size) {
  let w = 0;
  for (const c of String(s)) w += ADV.get(c) ?? 620;
  return (w / 1000) * size;
}
const ASC = 0.7915, DESC = 0.2085; // top of the text box → baseline, baseline → bottom (in em, from matplotlib's layout)

// ---------- small maths helpers (deterministic) ----------

const log10 = (x) => M.log10(x);
const pow10 = (k) => M.pow(10, k);
/** Python's divmod for floats (CPython's float_divmod; a // b is not Math.floor(a / b)). */
function pyDivmod(x, y) {
  let mod = x % y;
  let div = (x - mod) / y;
  if (mod) { if ((y < 0) !== (mod < 0)) { mod += y; div -= 1; } } else mod = y < 0 ? -0 : 0;
  let fl;
  if (div) { fl = Math.floor(div); if (div - fl > 0.5) fl += 1; } else fl = x / y < 0 ? -0 : 0;
  return [fl, mod];
}
const floorDiv = (a, b) => pyDivmod(a, b)[0];

/** matplotlib.transforms.nonsingular */
function nonsingular(vmin, vmax, expander = 0.001, tiny = 1e-15) {
  if (!Number.isFinite(vmin) || !Number.isFinite(vmax)) return [-expander, expander];
  let swapped = false;
  if (vmax < vmin) { [vmin, vmax] = [vmax, vmin]; swapped = true; }
  const maxabs = Math.max(Math.abs(vmin), Math.abs(vmax));
  if (maxabs < (1e6 / tiny) * 2.2250738585072014e-308) { vmin = -expander; vmax = expander; } else if (vmax - vmin <= maxabs * tiny) {
    if (vmax === 0 && vmin === 0) { vmin = -expander; vmax = expander; } else { vmin -= expander * Math.abs(vmin); vmax += expander * Math.abs(vmax); }
  }
  return swapped ? [vmax, vmin] : [vmin, vmax];
}

/** matplotlib.ticker.scale_range */
function scaleRange(vmin, vmax, n) {
  const dv = Math.abs(vmax - vmin);
  const meanv = (vmax + vmin) / 2;
  let offset = 0;
  if (!(Math.abs(meanv) / dv < 100)) offset = Math.sign(meanv) * pow10(Math.floor(log10(Math.abs(meanv))));
  const scale = pow10(Math.floor(log10(dv / n)));
  return [scale, offset];
}

/** MaxNLocator(nbins, steps=[1, 2, 2.5, 5, 10]).tick_values (AutoLocator) */
export function maxNLocator(vmin, vmax, nbins, integer = false) {
  [vmin, vmax] = nonsingular(vmin, vmax, 1e-13, 1e-14);
  const [scale, offset] = scaleRange(vmin, vmax, nbins);
  const _vmin = vmin - offset, _vmax = vmax - offset;
  let steps = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20].map((s) => s * scale);
  if (integer) steps = steps.filter((s) => s < 1 || Math.abs(s - Math.round(s)) < 0.001);
  const raw = (_vmax - _vmin) / nbins;
  let istep = steps.findIndex((s) => s >= raw);
  if (istep < 0) istep = steps.length - 1;
  let ticks = [];
  for (let k = istep; k >= 0; k--) {
    let step = steps[k];
    if (integer && Math.floor(_vmax) - Math.ceil(_vmin) >= 2 - 1) step = Math.max(1, step);
    const bestVmin = floorDiv(_vmin, step) * step;
    const off = Math.abs(offset);
    const closeto = (ms, edge) => {
      let tol = 1e-10;
      if (off > 0) { tol = Math.max(1e-10, pow10(log10(off / step) - 12)); tol = Math.min(0.4999, tol); }
      return Math.abs(ms - edge) < tol;
    };
    const le = (x) => { const [d, m] = pyDivmod(x, step); return closeto(m / step, 1) ? d + 1 : d; };
    const ge = (x) => { const [d, m] = pyDivmod(x, step); return closeto(m / step, 0) ? d : d + 1; };
    const low = le(_vmin - bestVmin), high = ge(_vmax - bestVmin);
    ticks = [];
    for (let i = low; i <= high; i++) ticks.push(i * step + bestVmin);
    const nticks = ticks.filter((t) => t <= _vmax && t >= _vmin).length;
    if (nticks >= 2) break;
  }
  return ticks.map((t) => t + offset);
}

/** Python's '%1.Nf' % x */
const fixed = (x, n) => toFixedExact(x, Math.min(n, 100));
const minus = (s) => s.replace(/-/g, '−');

/** numpy round(x, d) (multiply, round half even, divide) */
function npRound(x, d) {
  const f = pow10(d);
  const y = x * f, fl = Math.floor(y), r = y - fl;
  const k = r > 0.5 ? fl + 1 : r < 0.5 ? fl : (fl % 2 === 0 ? fl : fl + 1);
  return k / f;
}

/** ScalarFormatter: labels for the ticks, plus the offset text ('1e6', '+1e3'). */
export function scalarFormat(locs, vmin, vmax) {
  if (!locs.length) return { labels: [], offsetText: '' };
  [vmin, vmax] = vmin <= vmax ? [vmin, vmax] : [vmax, vmin];
  const visible = locs.filter((l) => vmin <= l && l <= vmax);
  // offset
  let offset = 0;
  if (visible.length) {
    const lmin = Math.min(...visible), lmax = Math.max(...visible);
    if (!(lmin === lmax || (lmin <= 0 && 0 <= lmax))) {
      const [absMin, absMax] = [Math.abs(lmin), Math.abs(lmax)].sort((a, b) => a - b);
      const sign = lmin < 0 ? -1 : 1;
      const oomMax = Math.ceil(log10(absMax));
      let oom = oomMax;
      while (floorDiv(absMin, pow10(oom)) === floorDiv(absMax, pow10(oom))) oom -= 1;
      oom += 1;
      if ((absMax - absMin) / pow10(oom) <= 1e-2) {
        oom = oomMax;
        while (!(floorDiv(absMax, pow10(oom)) - floorDiv(absMin, pow10(oom)) > 1)) oom -= 1;
        oom += 1;
      }
      const n = 4 - 1;
      offset = floorDiv(absMax, pow10(oom)) >= pow10(n) ? sign * floorDiv(absMax, pow10(oom)) * pow10(oom) : 0;
    }
  }
  // order of magnitude
  let order = 0;
  const absVis = visible.map(Math.abs);
  if (absVis.length) {
    let oom;
    if (offset) oom = Math.floor(log10(vmax - vmin));
    else { const val = Math.max(...absVis); oom = val === 0 ? 0 : Math.floor(log10(val)); }
    if (oom <= -5 || oom >= 6) order = oom;
  }
  // format
  let ls = locs.length < 2 ? [...locs, vmin, vmax] : locs;
  ls = ls.map((l) => (l - offset) / pow10(order));
  let range = Math.max(...ls) - Math.min(...ls);
  if (range === 0) range = Math.max(...ls.map(Math.abs));
  if (range === 0) range = 1;
  if (locs.length < 2) ls = ls.slice(0, -2);
  const rangeOom = Math.floor(log10(range));
  let sig = Math.max(0, 3 - rangeOom);
  const thresh = 1e-3 * pow10(rangeOom);
  while (sig >= 0) {
    if (Math.max(...ls.map((l) => Math.abs(l - npRound(l, sig)))) < thresh) sig -= 1;
    else break;
  }
  sig += 1;
  const labels = locs.map((x) => {
    let xp = (x - offset) / pow10(order);
    if (Math.abs(xp) < 1e-8) xp = 0;
    return minus(fixed(xp, sig));
  });
  let offsetText = '';
  if (order || offset) {
    let off = '';
    if (offset) { off = formatData(offset); if (offset > 0) off = '+' + off; }
    offsetText = minus((order ? `1e${order}` : '') + off);
  }
  return { labels, offsetText };
}

/** ScalarFormatter.format_data: significand (10 digits) and exponent, e.g. 1e6, 1.00001e2, -2.5e-3. */
function formatData(v) {
  const e = Math.floor(log10(Math.abs(v)));
  const s = Number(toFixedExact(v / pow10(e), 10));
  const sig = Number.isInteger(s) ? String(s) : formatValue(new PyFloat(s), '1.10g');
  return e === 0 ? sig : `${sig}e${e}`;
}

// ---------- colours, styles ----------

function colorOf(c, fallback = CYCLE[0]) {
  if (c === undefined || c === null) return { color: fallback, alpha: 1 };
  if (c instanceof PyTuple || c instanceof PyList) {
    const v = c.items.map((x) => Number(num(x)));
    const h = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0');
    return { color: `#${h(v[0])}${h(v[1])}${h(v[2])}`, alpha: v.length > 3 ? v[3] : 1 };
  }
  if (typeof c !== 'string') throw npErr('ValueError', `${typeName(c)} is not a valid color value.`);
  const s = c.trim();
  if (/^C\d$/.test(s)) return { color: CYCLE[Number(s[1])], alpha: 1 };
  if (BASE_COLORS[s]) return { color: BASE_COLORS[s], alpha: 1 };
  if (/^tab:/.test(s) && TAB[s.slice(4)] !== undefined) return { color: CYCLE[TAB[s.slice(4)]], alpha: 1 };
  if (/^#[0-9a-fA-F]{8}$/.test(s)) return { color: s.slice(0, 7).toLowerCase(), alpha: parseInt(s.slice(7), 16) / 255 };
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return { color: s.toLowerCase(), alpha: 1 };
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return { color: '#' + [...s.slice(1)].map((x) => x + x).join('').toLowerCase(), alpha: 1 };
  if (/^(0(\.\d*)?|1(\.0*)?|\.\d+)$/.test(s)) { const g = Math.round(Number(s) * 255).toString(16).padStart(2, '0'); return { color: `#${g}${g}${g}`, alpha: 1 }; }
  if (CSS.has(s.toLowerCase())) return { color: CSS.get(s.toLowerCase()), alpha: 1 };
  throw npErr('ValueError', `'${s}' is not a valid color value.`, 'npColor');
}

/** Parse a format string like 'r--o' → { color, ls, marker }. */
function parseFmt(fmt) {
  const out = { color: null, ls: null, marker: null };
  let s = fmt;
  for (const ls of ['--', '-.', '-', ':']) if (s.includes(ls)) { out.ls = ls; s = s.replace(ls, ''); break; }
  const cm = /C\d/.exec(s);
  if (cm) { out.color = cm[0]; s = s.replace(cm[0], ''); }
  for (const ch of s) {
    if (BASE_COLORS[ch] && out.color === null) out.color = ch;
    else if (MARKERS.has(ch) && out.marker === null) out.marker = ch;
    else throw npErr('ValueError', `'${fmt}' is not a valid format string (unrecognized character '${ch}')`, 'npFmt');
  }
  if (out.marker && !out.ls) out.ls = '';
  return out;
}

// ---------- state ----------

/** Plot state of a VM: figures in creation order and the current one. */
function state(vm) {
  return (vm.plot ??= { figs: [], current: null, nextNum: 1 });
}

export const FIGURE = new PyClass('Figure', [OBJECT], new Map(), 'Figure');
export const AXES = new PyClass('Axes', [OBJECT], new Map(), 'Axes');
export const ARTIST = new PyClass('Artist', [OBJECT], new Map(), 'Artist');

function newFigure(vm, opts = {}) {
  const st = state(vm);
  const fig = new PyInstance(FIGURE);
  const [w, h] = opts.figsize ?? [6.4, 4.8];
  fig.f = { num: opts.num ?? st.nextNum++, w, h, dpi: opts.dpi ?? 100, axes: [], suptitle: null, current: null, inst: fig, adjust: { left: 0.125, right: 0.9, bottom: 0.11, top: 0.88, wspace: 0.2, hspace: 0.2 } };
  st.figs.push(fig);
  st.current = fig;
  return fig;
}

function currentFigure(vm) {
  const st = state(vm);
  return st.current ?? newFigure(vm);
}

function newAxes(fig, spec) {
  const ax = new PyInstance(AXES);
  ax.a = {
    fig, spec, artists: [], title: { center: '', left: '', right: '' }, xlabel: '', ylabel: '', xlim: [null, null], ylim: [null, null],
    xticks: null, yticks: null, legend: null, grid: { x: false, y: false, style: {} }, lineCycle: 0, patchCycle: 0,
    xcat: null, ycat: null, aspect: 'auto', axisOn: true, xrot: 0, yrot: 0, frameOn: true, inst: ax,
  };
  fig.f.axes.push(ax);
  fig.f.current = ax;
  return ax;
}

function currentAxes(vm) {
  const fig = currentFigure(vm);
  return fig.f.current ?? newAxes(fig, { rows: 1, cols: 1, index: 1 });
}

// ---------- argument helpers ----------

const fnum = (v, d = 0) => (v === undefined || v === null ? d : isNum(v) ? Number(num(v)) : Number(flat(toNd(v))[0]));
const strArg = (v, d = '') => (v === undefined || v === null ? d : typeof v === 'string' ? v : String(v instanceof PyFloat ? v.v : v));

/** Values for an axis: numbers, or strings (categorical axis: the categories become 0, 1, 2 …). */
function axisValues(ax, v, which) {
  if (v instanceof PyList || v instanceof PyTuple) {
    if (v.items.length && v.items.every((x) => typeof x === 'string')) {
      const key = which === 'x' ? 'xcat' : 'ycat';
      ax[key] ??= new Map();
      return Float64Array.from(v.items.map((s) => { if (!ax[key].has(s)) ax[key].set(s, ax[key].size); return ax[key].get(s); }));
    }
  }
  if (typeof v === 'string') return axisValues(ax, new PyList([v]), which);
  if (isArr(v) && v.nd.dtype.startsWith('<U')) return axisValues(ax, new PyList(Array.from(flat(v.nd))), which);
  try {
    return Float64Array.from(flat(isArr(v) ? v.nd : toNd(v)));
  } catch (e) {
    throw npErr('TypeError', `could not plot ${typeName(v)} values (numbers or texts are needed)`, 'npNotNumber', { type: typeName(v) });
  }
}

function lineStyleArg(v) {
  if (v === undefined || v === null) return null;
  const s = strArg(v);
  if (!(s in LINESTYLES)) throw npErr('ValueError', `'${s}' is not a valid value for ls; supported values are '-', '--', '-.', ':', 'None', ' ', '', 'solid', 'dashed', 'dashdot', 'dotted'`);
  return LINESTYLES[s];
}

const kwGet = (kw, ...names) => { for (const n of names) if (kw[n] !== undefined) return kw[n]; return undefined; };

/** Artist placeholder returned to Python (lines, bars …): get_color, set_label … work on the artist. */
function artistObj(art) { const o = new PyInstance(ARTIST); o.art = art; return o; }

// ---------- Axes methods ----------

function plotLines(ctx, ax, args, kw) {
  // split into groups: x, y, [fmt]
  const groups = [];
  let i = 0;
  while (i < args.length) {
    const a0 = args[i], a1 = args[i + 1], a2 = args[i + 2];
    if (a1 === undefined || typeof a1 === 'string') { groups.push({ x: null, y: a0, fmt: typeof a1 === 'string' ? a1 : null }); i += typeof a1 === 'string' ? 2 : 1; } else { groups.push({ x: a0, y: a1, fmt: typeof a2 === 'string' ? a2 : null }); i += typeof a2 === 'string' ? 3 : 2; }
  }
  const out = [];
  for (const g of groups) {
    const ynd = isArr(g.y) ? g.y.nd : null;
    const ycols = ynd && ynd.ndim === 2 ? Array.from({ length: ynd.shape[1] }, (_, c) => Float64Array.from({ length: ynd.shape[0] }, (_, r) => ynd.data[ynd.offset + r * ynd.strides[0] + c * ynd.strides[1]])) : [axisValues(ax, g.y, 'y')];
    for (const y of ycols) {
      const x = g.x === null ? Float64Array.from(y, (_, k) => k) : axisValues(ax, g.x, 'x');
      if (x.length !== y.length) throw npErr('ValueError', `x and y must have same first dimension, but have shapes (${x.length},) and (${y.length},)`, 'npPlotLength');
      const f = g.fmt ? parseFmt(g.fmt) : { color: null, ls: null, marker: null };
      const colorArg = kwGet(kw, 'color', 'c') ?? f.color;
      const color = colorArg ? colorOf(colorArg) : { color: CYCLE[ax.lineCycle++ % 10], alpha: 1 };
      const ls = lineStyleArg(kwGet(kw, 'linestyle', 'ls')) ?? f.ls ?? '-';
      const markerArg = kwGet(kw, 'marker');
      const marker = markerArg !== undefined && markerArg !== null ? strArg(markerArg) : f.marker;
      const art = {
        type: 'line', x, y, color: color.color, alpha: kw.alpha !== undefined && kw.alpha !== null ? fnum(kw.alpha) : color.alpha,
        lw: fnum(kwGet(kw, 'linewidth', 'lw'), 1.5), ls, marker: marker && marker !== 'None' && marker !== '' ? marker : null,
        ms: fnum(kwGet(kw, 'markersize', 'ms'), 6), mfc: kwGet(kw, 'markerfacecolor', 'mfc'), mec: kwGet(kw, 'markeredgecolor', 'mec'),
        mew: fnum(kwGet(kw, 'markeredgewidth', 'mew'), 1), label: kw.label !== undefined && kw.label !== null ? strArg(kw.label) : `_child${ax.artists.length}`, z: fnum(kw.zorder, 2),
      };
      ax.artists.push(art);
      out.push(artistObj(art));
    }
  }
  return new PyList(out);
}

function scatter(ctx, ax, args, kw) {
  const [x0, y0, s, c, marker, , , , alpha, linewidths, edgecolors] = params('scatter', args, kw.__pos ?? {}, ['x', 'y', '?s', '?c', '?marker', '?cmap', '?norm', '?vmin', '?alpha', '?linewidths', '?edgecolors']);
  const x = axisValues(ax, x0, 'x'), y = axisValues(ax, y0, 'y');
  if (x.length !== y.length) throw npErr('ValueError', 'x and y must be the same size', 'npPlotLength');
  const sizes = s === undefined || s === null ? [36] : isNum(s) ? [fnum(s)] : Array.from(flat(toNd(s)));
  const cv = c ?? kw.color;
  let colors;
  if (cv === undefined || cv === null) colors = [{ color: CYCLE[ax.patchCycle++ % 10], alpha: 1 }];
  else if ((cv instanceof PyList || cv instanceof PyTuple) && cv.items.length === x.length && cv.items.every((v) => typeof v === 'string' || v instanceof PyTuple)) colors = cv.items.map((v) => colorOf(v));
  else if ((isArr(cv) || cv instanceof PyList) && !(cv instanceof PyList && cv.items.length <= 4 && cv.items.every(isNum) && cv.items.length !== x.length)) colors = viridis(Array.from(flat(toNd(cv))));
  else colors = [colorOf(cv)];
  const art = {
    type: 'scatter', x, y, sizes, colors, marker: marker ? strArg(marker) : 'o', alpha: alpha !== undefined && alpha !== null ? fnum(alpha) : null,
    edge: edgecolors !== undefined && edgecolors !== null ? colorOf(edgecolors) : null, lw: fnum(linewidths, 1),
    label: kw.label !== undefined && kw.label !== null ? strArg(kw.label) : `_child${ax.artists.length}`, z: fnum(kw.zorder, 1),
  };
  ax.artists.push(art);
  return artistObj(art);
}

/** A few colours of the viridis colormap for numeric c= values (linear between 9 stops). */
function viridis(vals) {
  const stops = [[68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142], [31, 158, 137], [53, 183, 121], [109, 205, 89], [180, 222, 44], [253, 231, 37]];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return vals.map((v) => {
    const t = hi > lo ? (v - lo) / (hi - lo) : 0;
    const p = t * (stops.length - 1), k = Math.min(stops.length - 2, Math.floor(p)), f = p - k;
    const rgb = stops[k].map((a, j) => Math.round(a + (stops[k + 1][j] - a) * f));
    return { color: '#' + rgb.map((q) => q.toString(16).padStart(2, '0')).join(''), alpha: 1 };
  });
}

function bars(ctx, ax, horizontal, args, kw) {
  const names = horizontal ? ['y', 'width', '?height', '?left', '?align'] : ['x', 'height', '?width', '?bottom', '?align'];
  const [pos0, len0, thick0, base0, align] = params(horizontal ? 'barh' : 'bar', args, kw.__pos ?? {}, names);
  const pos = axisValues(ax, pos0, horizontal ? 'y' : 'x');
  const lens = Array.from(flat(toNd(len0)));
  const n = Math.max(pos.length, lens.length);
  const at = (arr, i) => (arr.length === 1 ? arr[0] : arr[i]);
  const thick = thick0 === undefined || thick0 === null ? [0.8] : Array.from(flat(toNd(thick0)));
  const base = base0 === undefined || base0 === null ? [0] : Array.from(flat(toNd(base0)));
  const cv = kw.color;
  const colorList = cv instanceof PyList || cv instanceof PyTuple ? (cv.items.every((v) => typeof v === 'string' || v instanceof PyTuple) ? cv.items.map((v) => colorOf(v)) : [colorOf(cv)]) : null;
  const one = colorList ? null : cv !== undefined && cv !== null ? colorOf(cv) : { color: CYCLE[ax.patchCycle++ % 10], alpha: 1 };
  const rects = [];
  for (let i = 0; i < n; i++) {
    const p = at(pos, i), l = at(lens, i), t = at(thick, i), b = at(base, i);
    const lo = strArg(align, 'center') === 'edge' ? p : p - t / 2;
    const r = horizontal ? { x0: b, x1: b + l, y0: lo, y1: lo + t } : { x0: lo, x1: lo + t, y0: b, y1: b + l };
    r.color = colorList ? colorList[i % colorList.length] : one;
    rects.push(r);
  }
  const ec = kw.edgecolor ?? kw.ec;
  const art = {
    type: 'bars', rects, horizontal, edge: ec !== undefined && ec !== null ? colorOf(ec) : null, lw: fnum(kwGet(kw, 'linewidth', 'lw'), ec ? 1 : 0),
    alpha: kw.alpha !== undefined && kw.alpha !== null ? fnum(kw.alpha) : null, label: kw.label !== undefined && kw.label !== null ? strArg(kw.label) : `_child${ax.artists.length}`,
    sticky: base.slice(), z: fnum(kw.zorder, 1), hatch: null,
  };
  ax.artists.push(art);
  const tl = kw.tick_label;
  if (tl !== undefined && tl !== null) {
    const labels = typeof tl === 'string' ? [tl] : iterItems(tl).map((v) => strArg(v));
    const key = horizontal ? 'yticks' : 'xticks';
    ax[key] = { locs: Array.from(pos), labels };
  }
  return new PyList(rects.map(() => artistObj(art)));
}

function hist(ctx, ax, args, kw) {
  const [x0, bins0, range0, density, weights, cumulative, bottom, histtype, align, orientation, rwidth] = params('hist', args, kw.__pos ?? {}, ['x', '?bins', '?range', '?density', '?weights', '?cumulative', '?bottom', '?histtype', '?align', '?orientation', '?rwidth']);
  // one data set or several (a list of lists / 2-D array: one per column)
  let datasets;
  if (x0 instanceof PyList && x0.items.length && x0.items.every((v) => v instanceof PyList || isArr(v))) datasets = x0.items.map((v) => toNd(v));
  else { const nd = isArr(x0) ? x0.nd : toNd(x0); datasets = nd.ndim === 2 ? Array.from({ length: nd.shape[1] }, (_, c) => new Nd(Float64Array.from({ length: nd.shape[0] }, (_, r) => nd.data[nd.offset + r * nd.strides[0] + c * nd.strides[1]]), [nd.shape[0]], 'float64')) : [nd]; }
  const rng = range0 === undefined || range0 === null ? null : Array.from(flat(toNd(range0)));
  let binsArg = bins0 === undefined || bins0 === null ? 10 : isInt(bins0) ? Number(num(bins0)) : Array.from(flat(toNd(bins0)));
  // common bin edges for all data sets (like matplotlib)
  let lo = Infinity, hi = -Infinity;
  for (const d of datasets) for (const v of flat(d)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const r = rng ?? (Number.isFinite(lo) ? [lo, hi] : null);
  const counts = datasets.map((d) => histogram(ctx, d, binsArg, r, weights === undefined || weights === null ? null : toNd(weights)));
  const edges = Array.from(counts[0].edges.data);
  const nx = datasets.length;
  const ns = counts.map((c) => {
    let v = Array.from(c.counts.data);
    if (truthy(density ?? false)) { const tot = v.reduce((a, b) => a + b, 0); v = v.map((k, i) => k / tot / (edges[i + 1] - edges[i])); }
    if (truthy(cumulative ?? false)) { let s = 0; v = v.map((k) => (s += k)); }
    return v;
  });
  const horizontal = strArg(orientation, 'vertical') === 'horizontal';
  const type = strArg(histtype, 'bar');
  const dr = Math.max(0, Math.min(1, fnum(rwidth, 1)));
  const cv = kw.color;
  const colors = cv instanceof PyList ? cv.items.map((v) => colorOf(v)) : null;
  const labels = kw.label instanceof PyList ? kw.label.items.map((v) => strArg(v)) : null;
  const patches = [];
  const bot = fnum(bottom, 0);
  ns.forEach((vals, k) => {
    const color = colors ? colors[k] : cv !== undefined && cv !== null && nx === 1 ? colorOf(cv) : { color: CYCLE[ax.patchCycle++ % 10], alpha: 1 };
    const label = labels ? labels[k] : kw.label !== undefined && kw.label !== null && k === 0 ? strArg(kw.label) : `_child${ax.artists.length}`;
    const rects = [];
    const stacked = false;
    for (let i = 0; i < vals.length; i++) {
      const w = edges[i + 1] - edges[i];
      const width = type === 'bar' ? (dr * w) / nx : dr * w;
      const boff = type === 'bar' ? -0.5 * dr * w * (1 - 1 / nx) + k * width : 0;
      let center = edges[i] + 0.5 * w + boff;
      if (strArg(align, 'mid') === 'left') center -= 0.5 * w; else if (strArg(align, 'mid') === 'right') center += 0.5 * w;
      const lo2 = center - width / 2;
      const rr = horizontal ? { x0: bot, x1: bot + vals[i], y0: lo2, y1: lo2 + width } : { x0: lo2, x1: lo2 + width, y0: bot, y1: bot + vals[i] };
      rr.color = color;
      rects.push(rr);
    }
    void stacked;
    const ec = kw.edgecolor ?? kw.ec;
    const art = type === 'step' || type === 'stepfilled'
      ? { type: 'step', edges, vals, base: bot, horizontal, color, filled: type === 'stepfilled', lw: fnum(kwGet(kw, 'linewidth', 'lw'), 1.5), alpha: kw.alpha !== undefined && kw.alpha !== null ? fnum(kw.alpha) : null, label, z: 1 }
      : { type: 'bars', rects, horizontal, edge: ec !== undefined && ec !== null ? colorOf(ec) : null, lw: fnum(kwGet(kw, 'linewidth', 'lw'), ec ? 1 : 0), alpha: kw.alpha !== undefined && kw.alpha !== null ? fnum(kw.alpha) : null, label, sticky: [bot], z: 1 };
    ax.artists.push(art);
    patches.push(new PyList(rects.map(() => artistObj(art))));
  });
  const nOut = nx === 1 ? wrap(new Nd(Float64Array.from(ns[0]), [ns[0].length], 'float64')) : new PyList(ns.map((v) => wrap(new Nd(Float64Array.from(v), [v.length], 'float64'))));
  return new PyTuple([nOut, wrap(new Nd(Float64Array.from(edges), [edges.length], 'float64')), nx === 1 ? patches[0] : new PyList(patches)]);
}

function pie(ctx, ax, args, kw) {
  const [x0, explode, labels, colors, autopct, pctdistance, , labeldistance, startangle, radius, counterclock] = params('pie', args, kw.__pos ?? {}, ['x', '?explode', '?labels', '?colors', '?autopct', '?pctdistance', '?shadow', '?labeldistance', '?startangle', '?radius', '?counterclock', '?wedgeprops', '?textprops']);
  const x = Array.from(flat(toNd(x0)));
  if (x.some((v) => v < 0)) throw npErr('ValueError', 'Wedge sizes \'x\' must be non negative values');
  const sum = x.reduce((a, b) => a + b, 0);
  const fr = sum > 1 ? x.map((v) => v / sum) : x;
  const ex = explode ? Array.from(flat(toNd(explode))) : x.map(() => 0);
  const lab = labels ? iterItems(labels).map((v) => strArg(v)) : null;
  const cols = colors ? iterItems(colors).map((v) => colorOf(v)) : null;
  const R = fnum(radius, 1);
  let theta = fnum(startangle, 0) / 360;
  const ccw = counterclock === undefined ? true : truthy(counterclock);
  const wedges = [];
  fr.forEach((f, i) => {
    const t1 = ccw ? theta + f : theta - f;
    const color = cols ? cols[i % cols.length] : { color: CYCLE[ax.patchCycle++ % 10], alpha: 1 };
    const mid = Math.PI * (theta + t1);
    const cx = ex[i] * cosT(mid), cy = ex[i] * sinT(mid);
    const w = { t0: Math.min(theta, t1) * 360, t1: Math.max(theta, t1) * 360, cx, cy, r: R, color, label: lab ? lab[i] : null, pct: null };
    if (lab) w.labelPos = [cx + R * fnum(labeldistance, 1.1) * cosT(mid), cy + R * fnum(labeldistance, 1.1) * sinT(mid), cosT(mid)];
    if (autopct !== undefined && autopct !== null) {
      const pct = 100 * f;
      const s = typeof autopct === 'string' ? percentFormat(autopct, new PyFloat(pct)) : ctx.vm.str(ctx.vm.callSync(autopct, [new PyFloat(pct)], null, ctx.task));
      w.pct = { text: s, x: cx + R * fnum(pctdistance, 0.6) * cosT(mid), y: cy + R * fnum(pctdistance, 0.6) * sinT(mid) };
    }
    wedges.push(w);
    theta = t1;
  });
  const art = { type: 'pie', wedges, z: 1, label: '_pie' };
  ax.artists.push(art);
  ax.aspect = 'equal';
  ax.frameOn = false;
  ax.xticks = { locs: [], labels: [] };
  ax.yticks = { locs: [], labels: [] };
  ax.xlim = [-1.25 * R, 1.25 * R];
  ax.ylim = [-1.25 * R, 1.25 * R];
  ax.pieLegend = wedges.map((w) => ({ label: w.label, color: w.color }));
  return new PyTuple([new PyList(wedges.map(() => artistObj(art))), new PyList([])]);
}
const cosT = (a) => M.cos(a);
const sinT = (a) => M.sin(a);

// ---------- layout ----------

/** Axes box in px: [x0, y0 (top), x1, y1 (bottom)]. */
function axesBox(fig, ax) {
  const f = fig.f, W = f.w * f.dpi, H = f.h * f.dpi;
  const { rows, cols, index } = ax.a.spec;
  const { left, right, bottom, top, wspace, hspace } = f.adjust;
  const totW = right - left, totH = top - bottom;
  const cellW = totW / (cols + wspace * (cols - 1)), sepW = wspace * cellW;
  const cellH = totH / (rows + hspace * (rows - 1)), sepH = hspace * cellH;
  const span = ax.a.spec.span ?? [index, index];
  const r0 = Math.floor((span[0] - 1) / cols), c0 = (span[0] - 1) % cols;
  const r1 = Math.floor((span[1] - 1) / cols), c1 = (span[1] - 1) % cols;
  const fx0 = left + Math.min(c0, c1) * (cellW + sepW), fx1 = left + Math.max(c0, c1) * (cellW + sepW) + cellW;
  const fyTop = top - Math.min(r0, r1) * (cellH + sepH), fyBot = top - Math.max(r0, r1) * (cellH + sepH) - cellH;
  return [fx0 * W, (1 - fyTop) * H, fx1 * W, (1 - fyBot) * H];
}

/** Data limits of the artists for one axis ('x' or 'y'), with sticky edges. */
function dataLimits(a, which) {
  let lo = Infinity, hi = -Infinity;
  const sticky = [];
  const add = (v) => { if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } };
  for (const art of a.artists) {
    if (art.type === 'line' || art.type === 'scatter') for (const v of which === 'x' ? art.x : art.y) add(v);
    else if (art.type === 'bars') {
      for (const r of art.rects) { add(which === 'x' ? r.x0 : r.y0); add(which === 'x' ? r.x1 : r.y1); }
      if (which === (art.horizontal ? 'x' : 'y')) sticky.push(...art.sticky);
    } else if (art.type === 'step') {
      const vals = [...art.vals, art.base];
      const pos = art.edges;
      for (const v of (which === 'x') !== art.horizontal ? pos : vals) add(v);
      if (which === (art.horizontal ? 'x' : 'y')) sticky.push(art.base);
    } else if (art.type === 'hline' && which === 'y') add(art.y);
    else if (art.type === 'vline' && which === 'x') add(art.x);
    else if (art.type === 'fill') { for (const v of which === 'x' ? art.x : [...art.y1, ...art.y2]) add(v); }
    else if (art.type === 'errorbar') { for (const v of which === 'x' ? art.xs : art.ys) add(v); }
  }
  return { lo, hi, sticky: sticky.sort((p, q) => p - q) };
}

function autoscale(a, which) {
  const set = which === 'x' ? a.xlim : a.ylim;
  let { lo, hi, sticky } = dataLimits(a, which);
  if (!Number.isFinite(lo)) { lo = 0; hi = 1; if (set[0] === null && set[1] === null) return [0, 1]; }
  let [x0, x1] = nonsingular(lo, hi, 0.05);
  const tol = 1e-5 * Math.abs(x1 - x0);
  const delta = (x1 - x0) * 0.05;
  const below = sticky.filter((s) => s < x0 + tol), above = sticky.filter((s) => s > x1 - tol);
  const b0 = below.length ? below[below.length - 1] : null, b1 = above.length ? above[0] : null;
  let v0 = x0 - delta, v1 = x1 + delta;
  if (b0 !== null) v0 = Math.max(v0, b0);
  if (b1 !== null) v1 = Math.min(v1, b1);
  [v0, v1] = nonsingular(v0, v1);
  return [set[0] ?? v0, set[1] ?? v1];
}

/** Ticks and labels of an axis: { locs, labels, offsetText }. */
function ticksFor(a, which, lim, lengthPx, dpi) {
  const fixedT = which === 'x' ? a.xticks : a.yticks;
  if (fixedT) {
    if (fixedT.labels) return { locs: fixedT.locs, labels: fixedT.labels, offsetText: '' };
    const f = scalarFormat(fixedT.locs, lim[0], lim[1]);
    return { locs: fixedT.locs, labels: f.labels, offsetText: f.offsetText };
  }
  const cat = which === 'x' ? a.xcat : a.ycat;
  if (cat) return { locs: [...cat.values()], labels: [...cat.keys()], offsetText: '' };
  const pts = (lengthPx / dpi) * 72;
  const space = Math.floor(pts / (10 * (which === 'x' ? 3 : 2)));
  const nbins = Math.max(1, Math.min(9, space));
  const locs = maxNLocator(Math.min(...lim), Math.max(...lim), nbins);
  const f = scalarFormat(locs, lim[0], lim[1]);
  return { locs, labels: f.labels, offsetText: f.offsetText };
}

/** Everything that is drawn for one axes, in px. */
function layoutAxes(fig, axInst) {
  const a = axInst.a, f = fig.f;
  const s = f.dpi / 100;
  let [bx0, by0, bx1, by1] = axesBox(fig, axInst);
  const xlim = autoscale(a, 'x'), ylim = autoscale(a, 'y');
  if (a.aspect === 'equal') {
    // shrink the box so that one unit is as long on both axes (adjustable 'box', anchor centre)
    const dx = Math.abs(xlim[1] - xlim[0]), dy = Math.abs(ylim[1] - ylim[0]);
    const w = bx1 - bx0, h = by1 - by0;
    if (dy / dx > h / w) { const nw = (h * dx) / dy; bx0 += (w - nw) / 2; bx1 = bx0 + nw; } else { const nh = (w * dy) / dx; by0 += (h - nh) / 2; by1 = by0 + nh; }
  }
  const box = [bx0, by0, bx1, by1];
  const X = (v) => bx0 + ((v - xlim[0]) / (xlim[1] - xlim[0])) * (bx1 - bx0);
  const Y = (v) => by1 - ((v - ylim[0]) / (ylim[1] - ylim[0])) * (by1 - by0);
  const xt = ticksFor(a, 'x', xlim, bx1 - bx0, f.dpi);
  const yt = ticksFor(a, 'y', ylim, by1 - by0, f.dpi);
  const inside = (v, lim) => { const lo = Math.min(...lim), hi = Math.max(...lim), eps = 1e-10 * (hi - lo); return v >= lo - eps && v <= hi + eps; };
  const xs = xt.locs.map((v, i) => ({ v, label: xt.labels[i] ?? '' })).filter((t) => inside(t.v, xlim));
  const ys = yt.locs.map((v, i) => ({ v, label: yt.labels[i] ?? '' })).filter((t) => inside(t.v, ylim));
  return { a, box, xlim, ylim, X, Y, xticks: xs, yticks: ys, xoffset: xt.offsetText, yoffset: yt.offsetText, s, allX: xt.locs, allY: yt.locs };
}

// ---------- SVG ----------

const r2 = (v) => { const k = Math.round(v * 100) / 100; return Object.is(k, -0) ? '0' : String(k); };
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function textSvg(x, y, text, { size, color = '#000000', anchor = 'start', rotate = 0, weight = null, alpha = 1 }) {
  const tr = rotate ? ` transform="rotate(${r2(-rotate)} ${r2(x)} ${r2(y)})"` : '';
  return `<text x="${r2(x)}" y="${r2(y)}" font-size="${r2(size)}" fill="${color}"${alpha !== 1 ? ` fill-opacity="${r2(alpha)}"` : ''}${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}${weight ? ` font-weight="${weight}"` : ''}${tr}>${esc(text)}</text>`;
}

function dashAttr(ls, lw) {
  const d = DASHES[ls];
  return d ? ` stroke-dasharray="${d.map((v) => r2(v * lw * PT)).join(',')}"` : '';
}

/** SVG path of a marker centred at 0,0 with size (diameter) d px. */
function markerPath(m, d) {
  const r = d / 2;
  switch (m) {
    case 'o': case '8': case 'h': case 'H': return null; // circle
    case '.': return null;
    case 's': return `M${r2(-r)},${r2(-r)}h${r2(d)}v${r2(d)}h${r2(-d)}z`;
    case '^': return `M0,${r2(-r)}L${r2(r)},${r2(r)}L${r2(-r)},${r2(r)}z`;
    case 'v': return `M0,${r2(r)}L${r2(r)},${r2(-r)}L${r2(-r)},${r2(-r)}z`;
    case '<': return `M${r2(-r)},0L${r2(r)},${r2(-r)}L${r2(r)},${r2(r)}z`;
    case '>': return `M${r2(r)},0L${r2(-r)},${r2(-r)}L${r2(-r)},${r2(r)}z`;
    case 'D': return `M0,${r2(-r * 0.71 * 1.414)}L${r2(r * 0.71 * 1.414)},0L0,${r2(r * 0.71 * 1.414)}L${r2(-r * 0.71 * 1.414)},0z`;
    case 'd': return `M0,${r2(-r)}L${r2(r * 0.6)},0L0,${r2(r)}L${r2(-r * 0.6)},0z`;
    case '+': case 'P': return `M${r2(-r)},0H${r2(r)}M0,${r2(-r)}V${r2(r)}`;
    case 'x': case 'X': return `M${r2(-r)},${r2(-r)}L${r2(r)},${r2(r)}M${r2(-r)},${r2(r)}L${r2(r)},${r2(-r)}`;
    case '|': return `M0,${r2(-r)}V${r2(r)}`;
    case '_': return `M${r2(-r)},0H${r2(r)}`;
    case '*': case 'p': {
      const n = m === '*' ? 5 : 5, pts = [];
      for (let k = 0; k < (m === '*' ? 2 * n : n); k++) {
        const rr = m === '*' ? (k % 2 ? r * 0.38 : r) : r;
        const ang = (Math.PI * 2 * k) / (m === '*' ? 2 * n : n) - Math.PI / 2;
        pts.push(`${r2(rr * cosT(ang))},${r2(rr * sinT(ang))}`);
      }
      return `M${pts.join('L')}z`;
    }
    default: return null;
  }
}

function drawMarkers(out, pts, m, sizePx, face, edge, ew, alpha) {
  const op = alpha !== null && alpha !== undefined && alpha !== 1 ? ` opacity="${r2(alpha)}"` : '';
  const open = m === '+' || m === 'x' || m === '|' || m === '_' || m === 'P' || m === 'X';
  const d = m === '.' ? sizePx * 0.5 : m === ',' ? 1 : sizePx;
  const path = markerPath(m, d);
  for (const [x, y] of pts) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (path === null) out.push(`<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(d / 2)}" fill="${face}" stroke="${edge}" stroke-width="${r2(ew)}"${op}/>`);
    else out.push(`<path d="${path}" transform="translate(${r2(x)} ${r2(y)})" fill="${open ? 'none' : face}" stroke="${open ? face : edge}" stroke-width="${r2(ew)}"${op}/>`);
  }
}

/** Polyline path with gaps at NaN. */
function polyPath(pts) {
  let d = '', pen = false;
  for (const [x, y] of pts) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${r2(x)},${r2(y)}`;
    pen = true;
  }
  return d;
}

const LEGEND_LOCS = { best: 0, 'upper right': 1, 'upper left': 2, 'lower left': 3, 'lower right': 4, right: 5, 'center left': 6, 'center right': 7, 'lower center': 8, 'upper center': 9, center: 10 };

/** Legend entries: artists with a label not starting with '_'. */
function legendEntries(a) {
  if (a.legend?.labels) {
    const arts = a.artists.filter((x) => x.type !== 'pie' && x.type !== 'text' && x.type !== 'annotate');
    return a.legend.labels.map((l, i) => ({ label: l, art: arts[i] ?? null })).filter((e) => e.art);
  }
  if (a.pieLegend && !a.artists.some((x) => x.type !== 'pie' && x.label && !x.label.startsWith('_'))) return a.pieLegend.filter((w) => w.label).map((w) => ({ label: w.label, art: { type: 'bars', rects: [{ color: w.color }], edge: null } }));
  return a.artists.filter((x) => x.label && !x.label.startsWith('_') && x.type !== 'text' && x.type !== 'annotate').map((x) => ({ label: x.label, art: x }));
}

/** Position of the legend box (matplotlib's _get_anchored_bbox and 'best' search). */
function legendBox(L, w, h, loc) {
  const [x0, y0, x1, y1] = L.box;
  const pad = 0.5 * 10 * PT * L.s;
  const at = (code) => {
    const c = { 1: 'NE', 2: 'NW', 3: 'SW', 4: 'SE', 5: 'E', 6: 'W', 7: 'E', 8: 'S', 9: 'N', 10: 'C' }[code];
    const left = x0 + pad, right = x1 - pad - w, cx = (x0 + x1) / 2 - w / 2;
    const top = y0 + pad, bottom = y1 - pad - h, cy = (y0 + y1) / 2 - h / 2;
    const x = c.includes('W') ? left : c.includes('E') ? right : cx;
    const y = c.includes('N') ? top : c.includes('S') ? bottom : cy;
    return [x, y];
  };
  if (loc !== 0) return at(loc);
  // 'best': fewest data points inside and lines crossing the box
  const verts = [], segs = [];
  for (const art of L.a.artists) {
    if (art.type === 'line') {
      const pts = [];
      for (let i = 0; i < art.x.length; i++) pts.push([L.X(art.x[i]), L.Y(art.y[i])]);
      verts.push(...pts);
      segs.push(pts);
    } else if (art.type === 'scatter') for (let i = 0; i < art.x.length; i++) verts.push([L.X(art.x[i]), L.Y(art.y[i])]);
  }
  const rects = [];
  for (const art of L.a.artists) if (art.type === 'bars') for (const r of art.rects) rects.push([L.X(Math.min(r.x0, r.x1)), L.Y(Math.max(r.y0, r.y1)), L.X(Math.max(r.x0, r.x1)), L.Y(Math.min(r.y0, r.y1))]);
  let best = null, bestBad = Infinity;
  for (let code = 1; code <= 10; code++) {
    const [lx, ly] = at(code);
    const bx0 = lx, by0 = ly, bx1 = lx + w, by1 = ly + h;
    let bad = 0;
    for (const [x, y] of verts) if (x > bx0 && x < bx1 && y > by0 && y < by1) bad++;
    for (const [rx0, ry0, rx1, ry1] of rects) if (rx0 < bx1 && rx1 > bx0 && ry0 < by1 && ry1 > by0) bad++;
    for (const pts of segs) if (crossesBox(pts, bx0, by0, bx1, by1)) bad++;
    if (bad === 0) return [lx, ly];
    if (bad < bestBad) { bestBad = bad; best = [lx, ly]; }
  }
  return best;
}

function crossesBox(pts, x0, y0, x1, y1) {
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    if (!Number.isFinite(ax + ay + bx + by)) continue;
    // Liang–Barsky clipping: does the segment touch the rectangle?
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay;
    let ok = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (p === 0) { if (q < 0) { ok = false; break; } } else {
        const t = q / p;
        if (p < 0) { if (t > t1) { ok = false; break; } if (t > t0) t0 = t; } else { if (t < t0) { ok = false; break; } if (t < t1) t1 = t; }
      }
    }
    if (ok) return true;
  }
  return false;
}

/** The SVG of one figure. */
export function figureSvg(fig, svgId = 'f') {
  const f = fig.f, W = Math.round(f.w * f.dpi), H = Math.round(f.h * f.dpi);
  const s = f.dpi / 100;
  const fs = 10 * PT * s; // 10 pt in px
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="DejaVu Sans, Bitstream Vera Sans, Verdana, Arial, Helvetica, sans-serif">`);
  out.push(`<rect width="${W}" height="${H}" fill="${f.facecolor ?? '#ffffff'}"/>`);
  f.axes.forEach((axInst, k) => {
    const L = layoutAxes(fig, axInst);
    const a = L.a;
    const [x0, y0, x1, y1] = L.box;
    const clip = `${svgId}-c${k}`;
    out.push(`<defs><clipPath id="${clip}"><rect x="${r2(x0)}" y="${r2(y0)}" width="${r2(x1 - x0)}" height="${r2(y1 - y0)}"/></clipPath></defs>`);
    if (a.frameOn && a.axisOn) out.push(`<rect x="${r2(x0)}" y="${r2(y0)}" width="${r2(x1 - x0)}" height="${r2(y1 - y0)}" fill="#ffffff"/>`);
    // grid
    if (a.axisOn && (a.grid.x || a.grid.y)) {
      const g = a.grid.style;
      const gc = g.color ? colorOf(g.color) : { color: '#b0b0b0', alpha: 1 };
      const glw = (g.lw ?? 0.8) * PT * s;
      const att = ` stroke="${gc.color}" stroke-width="${r2(glw)}"${dashAttr(g.ls ?? '-', g.lw ?? 0.8)}${(g.alpha ?? gc.alpha) !== 1 ? ` stroke-opacity="${r2(g.alpha ?? gc.alpha)}"` : ''}`;
      if (a.grid.x) for (const t of L.xticks) out.push(`<path d="M${r2(L.X(t.v))},${r2(y0)}V${r2(y1)}"${att}/>`);
      if (a.grid.y) for (const t of L.yticks) out.push(`<path d="M${r2(x0)},${r2(L.Y(t.v))}H${r2(x1)}"${att}/>`);
    }
    // artists, by zorder (stable)
    const order = a.artists.map((art, i) => [art, i]).sort((p, q) => (p[0].z ?? 2) - (q[0].z ?? 2) || p[1] - q[1]).map((p) => p[0]);
    out.push(`<g clip-path="url(#${clip})">`);
    for (const art of order) if (art.type !== 'pie') drawArtist(out, art, L, s, fs);
    out.push('</g>');
    for (const art of order) if (art.type === 'pie') drawArtist(out, art, L, s, fs);
    // texts and annotations are not clipped
    for (const art of order) if (art.type === 'text' || art.type === 'annotate') drawText(out, art, L, s, fs);
    if (a.axisOn) drawAxisDecor(out, L, s, fs);
    // title
    const ts = a.titleStyle ?? { size: 12, color: '#000000', weight: null };
    const tsize = ts.size * PT * s;
    const tpad = 6 * PT * s;
    const tst = { size: tsize, color: ts.color, weight: ts.weight };
    if (a.title.center) out.push(textSvg((x0 + x1) / 2, y0 - tpad, a.title.center, { ...tst, anchor: 'middle' }));
    if (a.title.left) out.push(textSvg(x0, y0 - tpad, a.title.left, tst));
    if (a.title.right) out.push(textSvg(x1, y0 - tpad, a.title.right, { ...tst, anchor: 'end' }));
    if (a.legend) drawLegend(out, L, s, fs);
  });
  if (f.suptitle) out.push(textSvg(W / 2, 0.02 * H + ASC * 12 * PT * s, f.suptitle, { size: 12 * PT * s, anchor: 'middle' }));
  out.push('</svg>');
  return out.join('\n');
}

function drawArtist(out, art, L, s, fs) {
  const { X, Y } = L;
  const [x0, y0, x1, y1] = L.box;
  const op = (al) => (al !== null && al !== undefined && al !== 1 ? ` opacity="${r2(al)}"` : '');
  switch (art.type) {
    case 'line': {
      const pts = Array.from(art.x, (x, i) => [X(x), Y(art.y[i])]);
      const lw = art.lw * PT * s;
      if (art.ls) out.push(`<path d="${polyPath(pts)}" fill="none" stroke="${art.color}" stroke-width="${r2(lw)}" stroke-linejoin="round" stroke-linecap="${art.ls === '-' ? 'square' : 'butt'}"${dashAttr(art.ls, art.lw)}${op(art.alpha)}/>`);
      if (art.marker) {
        const face = art.mfc !== undefined && art.mfc !== null ? colorOf(art.mfc).color : art.color;
        const edge = art.mec !== undefined && art.mec !== null ? colorOf(art.mec).color : art.color;
        drawMarkers(out, pts, art.marker, art.ms * PT * s, face, edge, art.mew * PT * s, art.alpha);
      }
      break;
    }
    case 'scatter': {
      for (let i = 0; i < art.x.length; i++) {
        const c = art.colors[art.colors.length === 1 ? 0 : i % art.colors.length];
        const area = art.sizes[art.sizes.length === 1 ? 0 : i % art.sizes.length];
        const d = Math.sqrt(area) * PT * s;
        const edge = art.edge ? art.edge.color : c.color;
        drawMarkers(out, [[X(art.x[i]), Y(art.y[i])]], art.marker, d, c.color, edge, art.lw * PT * s, art.alpha ?? (c.alpha !== 1 ? c.alpha : null));
      }
      break;
    }
    case 'bars': {
      for (const r of art.rects) {
        const rx0 = X(Math.min(r.x0, r.x1)), rx1 = X(Math.max(r.x0, r.x1)), ry0 = Y(Math.max(r.y0, r.y1)), ry1 = Y(Math.min(r.y0, r.y1));
        const al = art.alpha ?? (r.color.alpha !== 1 ? r.color.alpha : null);
        const stroke = art.edge && art.lw > 0 ? ` stroke="${art.edge.color}" stroke-width="${r2(art.lw * PT * s)}"` : '';
        out.push(`<rect x="${r2(rx0)}" y="${r2(ry0)}" width="${r2(rx1 - rx0)}" height="${r2(ry1 - ry0)}" fill="${r.color.color}"${stroke}${op(al)}/>`);
      }
      break;
    }
    case 'step': {
      const pts = [];
      const P = (p, v) => (art.horizontal ? [X(v), Y(p)] : [X(p), Y(v)]);
      pts.push(P(art.edges[0], art.base));
      art.vals.forEach((v, i) => { pts.push(P(art.edges[i], v)); pts.push(P(art.edges[i + 1], v)); });
      pts.push(P(art.edges[art.edges.length - 1], art.base));
      if (art.filled) out.push(`<path d="${polyPath(pts)}z" fill="${art.color.color}"${op(art.alpha)}/>`);
      else out.push(`<path d="${polyPath(pts)}" fill="none" stroke="${art.color.color}" stroke-width="${r2(art.lw * PT * s)}"${op(art.alpha)}/>`);
      break;
    }
    case 'hline': case 'vline': {
      const lw = art.lw * PT * s;
      const d = art.type === 'hline' ? `M${r2(x0 + art.min * (x1 - x0))},${r2(Y(art.y))}H${r2(x0 + art.max * (x1 - x0))}` : `M${r2(X(art.x))},${r2(y1 - art.min * (y1 - y0))}V${r2(y1 - art.max * (y1 - y0))}`;
      out.push(`<path d="${d}" stroke="${art.color}" stroke-width="${r2(lw)}"${dashAttr(art.ls, art.lw)}${op(art.alpha)}/>`);
      break;
    }
    case 'fill': {
      const top = Array.from(art.x, (x, i) => [X(x), Y(art.y1[i])]);
      const bot = Array.from(art.x, (x, i) => [X(x), Y(art.y2[i])]).reverse();
      out.push(`<path d="${polyPath([...top, ...bot])}z" fill="${art.color.color}"${op(art.alpha ?? (art.color.alpha !== 1 ? art.color.alpha : null))}/>`);
      break;
    }
    case 'errorbar': {
      const lw = 1.5 * PT * s, cap = art.capsize * PT * s / 2;
      for (const e of art.bars) {
        const [ax, ay, bx, by] = [X(e[0]), Y(e[1]), X(e[2]), Y(e[3])];
        out.push(`<path d="M${r2(ax)},${r2(ay)}L${r2(bx)},${r2(by)}" stroke="${art.color}" stroke-width="${r2(lw)}"/>`);
        if (cap > 0) {
          if (ax === bx) out.push(`<path d="M${r2(ax - cap)},${r2(ay)}H${r2(ax + cap)}M${r2(bx - cap)},${r2(by)}H${r2(bx + cap)}" stroke="${art.color}" stroke-width="${r2(lw)}"/>`);
          else out.push(`<path d="M${r2(ax)},${r2(ay - cap)}V${r2(ay + cap)}M${r2(bx)},${r2(by - cap)}V${r2(by + cap)}" stroke="${art.color}" stroke-width="${r2(lw)}"/>`);
        }
      }
      break;
    }
    case 'pie': {
      const cxp = (x0 + x1) / 2, cyp = (y0 + y1) / 2;
      const unit = (x1 - x0) / (L.xlim[1] - L.xlim[0]);
      for (const w of art.wedges) {
        const cx = X(w.cx), cy = Y(w.cy), R = w.r * unit;
        void cxp; void cyp;
        const a0 = (w.t0 * Math.PI) / 180, a1 = (w.t1 * Math.PI) / 180;
        if (w.t1 - w.t0 >= 360 - 1e-9) out.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(R)}" fill="${w.color.color}"/>`);
        else if (w.t1 - w.t0 > 0) {
          const large = w.t1 - w.t0 > 180 ? 1 : 0;
          out.push(`<path d="M${r2(cx)},${r2(cy)}L${r2(cx + R * cosT(a0))},${r2(cy - R * sinT(a0))}A${r2(R)},${r2(R)} 0 ${large} 0 ${r2(cx + R * cosT(a1))},${r2(cy - R * sinT(a1))}z" fill="${w.color.color}"/>`);
        }
      }
      // labels outside (left/right aligned), percentages inside (centred), vertically centred
      for (const w of art.wedges) {
        if (w.labelPos) out.push(textSvg(X(w.labelPos[0]), Y(w.labelPos[1]) + (ASC - 0.5) * fs, w.label, { size: fs, anchor: w.labelPos[0] > 0 ? 'start' : 'end' }));
        if (w.pct) out.push(textSvg(X(w.pct.x), Y(w.pct.y) + (ASC - 0.5) * fs, w.pct.text, { size: fs, anchor: 'middle' }));
      }
      break;
    }
    default: break;
  }
}

function drawText(out, art, L, s, fs) {
  const size = (art.fontsize ?? 10) * PT * s;
  if (art.type === 'annotate' && art.arrow) {
    const [ax, ay] = [L.X(art.xytext[0]), L.Y(art.xytext[1])], [bx, by] = [L.X(art.xy[0]), L.Y(art.xy[1])];
    const len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)) || 1;
    const ux = (bx - ax) / len, uy = (by - ay) / len, hl = 10 * s, hw = 4 * s;
    const sx = ax + ux * size * 0.6, sy = ay + uy * size * 0.6;
    out.push(`<path d="M${r2(sx)},${r2(sy)}L${r2(bx)},${r2(by)}" stroke="${art.arrowColor}" stroke-width="${r2(1 * PT * s)}"/>`);
    out.push(`<path d="M${r2(bx)},${r2(by)}L${r2(bx - ux * hl - uy * hw)},${r2(by - uy * hl + ux * hw)}L${r2(bx - ux * hl + uy * hw)},${r2(by - uy * hl - ux * hw)}z" fill="${art.arrowColor}"/>`);
  }
  const [px, py] = art.type === 'annotate' ? [L.X(art.xytext[0]), L.Y(art.xytext[1])] : art.transform === 'axes' ? [L.box[0] + art.x * (L.box[2] - L.box[0]), L.box[3] - art.y * (L.box[3] - L.box[1])] : [L.X(art.x), L.Y(art.y)];
  const anchor = { left: 'start', center: 'middle', right: 'end' }[art.ha ?? 'left'] ?? 'start';
  const va = art.va ?? 'baseline';
  const lines = String(art.s).split('\n');
  const lh = size * 1.2;
  const total = (lines.length - 1) * lh;
  let by = va === 'top' ? py + ASC * size : va === 'center' ? py - total / 2 + (ASC - 0.5) * size : va === 'bottom' ? py - total - DESC * size : py - total;
  for (const ln of lines) { out.push(textSvg(px, by, ln, { size, color: art.color ?? '#000000', anchor, rotate: art.rotation ?? 0 })); by += lh; }
}

function drawAxisDecor(out, L, s, fs) {
  const [x0, y0, x1, y1] = L.box;
  const a = L.a;
  const tl = 3.5 * PT * s, pad = 3.5 * PT * s, lw = 0.8 * PT * s;
  if (a.frameOn) out.push(`<rect x="${r2(x0)}" y="${r2(y0)}" width="${r2(x1 - x0)}" height="${r2(y1 - y0)}" fill="none" stroke="#000000" stroke-width="${r2(lw)}" stroke-linejoin="miter" stroke-linecap="square"/>`);
  // x ticks
  let xLabelBottom = y1;
  for (const t of L.xticks) {
    const x = L.X(t.v);
    out.push(`<path d="M${r2(x)},${r2(y1)}V${r2(y1 + tl)}" stroke="#000000" stroke-width="${r2(lw)}"/>`);
    if (t.label !== '') {
      const top = y1 + tl + pad;
      if (a.xrot) {
        const anchor = a.xha === 'right' ? 'end' : a.xha === 'left' ? 'start' : 'middle';
        out.push(textSvg(x, top + ASC * fs, t.label, { size: fs, anchor, rotate: a.xrot }));
        xLabelBottom = Math.max(xLabelBottom, top + textWidth(t.label, fs) * Math.abs(sinT((a.xrot * Math.PI) / 180)) + fs);
      } else {
        out.push(textSvg(x, top + ASC * fs, t.label, { size: fs, anchor: 'middle' }));
        xLabelBottom = Math.max(xLabelBottom, top + fs);
      }
    }
  }
  if (!L.xticks.length) xLabelBottom = y1;
  // y ticks
  let yLabelLeft = x0;
  for (const t of L.yticks) {
    const y = L.Y(t.v);
    out.push(`<path d="M${r2(x0)},${r2(y)}H${r2(x0 - tl)}" stroke="#000000" stroke-width="${r2(lw)}"/>`);
    if (t.label !== '') {
      const right = x0 - tl - pad;
      out.push(textSvg(right, y + (ASC / 2) * fs, t.label, { size: fs, anchor: 'end', rotate: a.yrot }));
      yLabelLeft = Math.min(yLabelLeft, right - textWidth(t.label, fs));
    }
  }
  // offset texts ('1e6', '+1e3')
  if (L.xoffset) out.push(textSvg(x1, xLabelBottom + ASC * fs, L.xoffset, { size: fs, anchor: 'end' }));
  if (L.yoffset) out.push(textSvg(x0, y0 - 0.3 * fs, L.yoffset, { size: fs }));
  // axis labels
  const lpad = 4 * PT * s;
  if (a.xlabel) {
    const st = a.xlabelStyle ?? { size: 10, color: '#000000' }, xs = st.size * PT * s;
    out.push(textSvg((x0 + x1) / 2, (L.xticks.length ? xLabelBottom : y1 + tl + pad) + lpad + ASC * xs, a.xlabel, { size: xs, color: st.color, anchor: 'middle' }));
  }
  if (a.ylabel) {
    const st = a.ylabelStyle ?? { size: 10, color: '#000000' }, ys = st.size * PT * s;
    const xr = (L.yticks.length ? yLabelLeft : x0 - tl - pad) - lpad - DESC * ys;
    out.push(textSvg(xr, (y0 + y1) / 2, a.ylabel, { size: ys, color: st.color, anchor: 'middle', rotate: 90 }));
  }
}

/** Size and position of the legend: { entries, size, w, h, x, y, rows, colW … } or null. */
function legendGeometry(L) {
  const a = L.a, s = L.s;
  const entries = legendEntries(a);
  if (!entries.length) return null;
  const size = (a.legend.fontsize ?? 10) * PT * s;
  const pad = 0.4 * size, hl = 2 * size, htp = 0.8 * size, ls = 0.5 * size;
  const ncol = Math.max(1, a.legend.ncol ?? 1);
  const rows = Math.ceil(entries.length / ncol);
  const colW = [];
  for (let c = 0; c < ncol; c++) colW.push(Math.max(0, ...entries.filter((_, i) => Math.floor(i / rows) === c).map((e) => textWidth(e.label, size))));
  const colSpace = 2 * size;
  const titleH = a.legend.title ? size * 1.0 + ls : 0;
  const w = 2 * pad + colW.reduce((p, cw) => p + hl + htp + cw, 0) + (ncol - 1) * colSpace;
  const h = 2 * pad + titleH + rows * size + (rows - 1) * ls;
  const [x, y] = legendBox(L, w, h, a.legend.loc);
  return { entries, size, pad, hl, htp, ls, rows, colW, colSpace, titleH, w, h, x, y };
}

function drawLegend(out, L, s, fs) {
  const a = L.a;
  const G = legendGeometry(L);
  if (!G) return;
  const { entries, size, pad, hl, htp, ls, rows, colW, colSpace, titleH, w, h } = G;
  const lx = G.x, ly = G.y;
  if (a.legend.frameon !== false) out.push(`<rect x="${r2(lx)}" y="${r2(ly)}" width="${r2(w)}" height="${r2(h)}" rx="${r2(0.2 * size)}" fill="#ffffff" fill-opacity="0.8" stroke="#cccccc" stroke-width="${r2(1 * PT * s)}"/>`);
  if (a.legend.title) out.push(textSvg(lx + w / 2, ly + pad + ASC * size, a.legend.title, { size, anchor: 'middle' }));
  entries.forEach((e, i) => {
    const c = Math.floor(i / rows), r = i % rows;
    const cx = lx + pad + colW.slice(0, c).reduce((p, cw) => p + hl + htp + cw + colSpace, 0);
    const top = ly + pad + titleH + r * (size + ls);
    const mid = top + size * 0.5 - 0.1 * size;
    const art = e.art;
    if (art.type === 'line') {
      if (art.ls) out.push(`<path d="M${r2(cx)},${r2(mid)}H${r2(cx + hl)}" stroke="${art.color}" stroke-width="${r2(art.lw * PT * s)}"${dashAttr(art.ls, art.lw)}${art.alpha !== 1 ? ` opacity="${r2(art.alpha)}"` : ''}/>`);
      if (art.marker) drawMarkers(out, [[cx + hl / 2, mid]], art.marker, art.ms * PT * s, art.mfc ? colorOf(art.mfc).color : art.color, art.mec ? colorOf(art.mec).color : art.color, art.mew * PT * s, art.alpha);
    } else if (art.type === 'scatter') {
      const c0 = art.colors[0];
      drawMarkers(out, [[cx + hl / 2, mid]], art.marker, Math.sqrt(art.sizes[0]) * PT * s, c0.color, art.edge ? art.edge.color : c0.color, art.lw * PT * s, art.alpha);
    } else if (art.type === 'hline' || art.type === 'vline') {
      out.push(`<path d="M${r2(cx)},${r2(mid)}H${r2(cx + hl)}" stroke="${art.color}" stroke-width="${r2(art.lw * PT * s)}"${dashAttr(art.ls, art.lw)}/>`);
    } else {
      const col = art.type === 'bars' ? art.rects[0]?.color ?? { color: CYCLE[0] } : art.color ?? { color: CYCLE[0] };
      const hh = 0.7 * size;
      out.push(`<rect x="${r2(cx)}" y="${r2(mid - hh / 2)}" width="${r2(hl)}" height="${r2(hh)}" fill="${col.color ?? col}"${art.alpha ? ` opacity="${r2(art.alpha)}"` : ''}/>`);
    }
    out.push(textSvg(cx + hl + htp, top + ASC * size, e.label, { size }));
  });
}

// ---------- natives ----------

const self = (args) => args[0];
const A = (args) => self(args).a;

/** Split kwargs into the ones a params() list knows and the style ones (kw.__pos holds the first). */
function withPos(kw, names) {
  const pos = {}, rest = {};
  for (const k of Object.keys(kw)) (names.includes(k) ? pos : rest)[k] = kw[k];
  rest.__pos = pos;
  return rest;
}

function limitsArg(args, kw, lo, hi) {
  // set_xlim(a, b), set_xlim((a, b)), set_xlim(left=a), xlim(right=b)
  let a = args[0], b = args[1];
  if ((a instanceof PyTuple || a instanceof PyList) && b === undefined) [a, b] = a.items;
  if (kw[lo] !== undefined) a = kw[lo];
  if (kw[hi] !== undefined) b = kw[hi];
  return [a === undefined || a === null ? null : fnum(a), b === undefined || b === null ? null : fnum(b)];
}

function ticksArg(ax, which, ticks, labels) {
  const key = which === 'x' ? 'xticks' : 'yticks';
  if (ticks === undefined || ticks === null) {
    if (labels !== undefined && labels !== null) { const cur = ax[key]?.locs ?? currentTickLocs(ax, which); ax[key] = { locs: cur, labels: iterItems(labels).map((v) => strArg(v)) }; }
    return;
  }
  const locs = Array.from(axisValues(ax, ticks, which));
  ax[key] = { locs, labels: labels === undefined || labels === null ? null : iterItems(labels).map((v) => strArg(v)) };
}

function currentTickLocs(a, which) {
  const fig = a.fig;
  const L = layoutAxes(fig, a.inst);
  return which === 'x' ? L.allX : L.allY;
}

const floats = (arr) => wrap(new Nd(Float64Array.from(arr), [arr.length], 'float64'));

const AXES_METHODS = {
  plot: (ctx, args, kw) => plotLines(ctx, A(args), args.slice(1), kw),
  scatter: (ctx, args, kw) => scatter(ctx, A(args), args.slice(1), withPos(kw, ['x', 'y', 's', 'c', 'marker', 'cmap', 'norm', 'vmin', 'alpha', 'linewidths', 'edgecolors'])),
  bar: (ctx, args, kw) => bars(ctx, A(args), false, args.slice(1), withPos(kw, ['x', 'height', 'width', 'bottom', 'align'])),
  barh: (ctx, args, kw) => bars(ctx, A(args), true, args.slice(1), withPos(kw, ['y', 'width', 'height', 'left', 'align'])),
  hist: (ctx, args, kw) => hist(ctx, A(args), args.slice(1), withPos(kw, ['x', 'bins', 'range', 'density', 'weights', 'cumulative', 'bottom', 'histtype', 'align', 'orientation', 'rwidth'])),
  pie: (ctx, args, kw) => pie(ctx, A(args), args.slice(1), withPos(kw, ['x', 'explode', 'labels', 'colors', 'autopct', 'pctdistance', 'shadow', 'labeldistance', 'startangle', 'radius', 'counterclock', 'wedgeprops', 'textprops'])),
  axhline: (ctx, args, kw) => {
    const a = A(args), c = colorOf(kwGet(kw, 'color', 'c') ?? null, '#000000');
    const art = { type: 'hline', y: fnum(args[1] ?? kw.y, 0), min: fnum(args[2] ?? kw.xmin, 0), max: fnum(args[3] ?? kw.xmax, 1), color: kwGet(kw, 'color', 'c') ? c.color : CYCLE[a.lineCycle++ % 10], lw: fnum(kwGet(kw, 'linewidth', 'lw'), 1.5), ls: lineStyleArg(kwGet(kw, 'linestyle', 'ls')) ?? '-', alpha: kw.alpha ? fnum(kw.alpha) : null, label: kw.label ? strArg(kw.label) : '_hline', z: fnum(kw.zorder, 2) };
    a.artists.push(art);
    return artistObj(art);
  },
  axvline: (ctx, args, kw) => {
    const a = A(args), c = colorOf(kwGet(kw, 'color', 'c') ?? null, '#000000');
    const art = { type: 'vline', x: fnum(args[1] ?? kw.x, 0), min: fnum(args[2] ?? kw.ymin, 0), max: fnum(args[3] ?? kw.ymax, 1), color: kwGet(kw, 'color', 'c') ? c.color : CYCLE[a.lineCycle++ % 10], lw: fnum(kwGet(kw, 'linewidth', 'lw'), 1.5), ls: lineStyleArg(kwGet(kw, 'linestyle', 'ls')) ?? '-', alpha: kw.alpha ? fnum(kw.alpha) : null, label: kw.label ? strArg(kw.label) : '_vline', z: fnum(kw.zorder, 2) };
    a.artists.push(art);
    return artistObj(art);
  },
  fill_between: (ctx, args, kw) => {
    const a = A(args);
    const [x0, y10, y20] = [args[1] ?? kw.x, args[2] ?? kw.y1, args[3] ?? kw.y2];
    const x = axisValues(a, x0, 'x');
    const y1 = Array.from(flat(toNd(y10)));
    const y2 = y20 === undefined || y20 === null ? [0] : Array.from(flat(toNd(y20)));
    const at = (arr) => x.map((_, i) => (arr.length === 1 ? arr[0] : arr[i]));
    const cv = kwGet(kw, 'color', 'facecolor', 'fc');
    const art = { type: 'fill', x, y1: Float64Array.from(at(y1)), y2: Float64Array.from(at(y2)), color: cv ? colorOf(cv) : { color: CYCLE[a.patchCycle++ % 10], alpha: 1 }, alpha: kw.alpha !== undefined && kw.alpha !== null ? fnum(kw.alpha) : null, label: kw.label ? strArg(kw.label) : '_fill', z: 1 };
    a.artists.push(art);
    return artistObj(art);
  },
  errorbar: (ctx, args, kw) => {
    const a = A(args);
    const x = axisValues(a, args[1] ?? kw.x, 'x'), y = axisValues(a, args[2] ?? kw.y, 'y');
    const ye = kw.yerr ?? args[3], xe = kw.xerr ?? args[4];
    const spread = (e) => (e === undefined || e === null ? null : Array.from(flat(toNd(e))));
    const yv = spread(ye), xv = spread(xe);
    const style = { ...kw };
    delete style.yerr; delete style.xerr; delete style.capsize; delete style.ecolor; delete style.fmt;
    const fmt = kw.fmt !== undefined ? strArg(kw.fmt) : '';
    const lines = fmt === 'none' ? null : plotLines(ctx, a, fmt ? [wrap(new Nd(x, [x.length], 'float64')), wrap(new Nd(y, [y.length], 'float64')), fmt] : [wrap(new Nd(x, [x.length], 'float64')), wrap(new Nd(y, [y.length], 'float64'))], style);
    const color = kw.ecolor ? colorOf(kw.ecolor).color : lines ? lines.items[0].art.color : CYCLE[a.lineCycle++ % 10];
    const barsList = [], xs = [], ys = [];
    for (let i = 0; i < x.length; i++) {
      if (yv) { const e = yv.length === 1 ? yv[0] : yv[i]; barsList.push([x[i], y[i] - e, x[i], y[i] + e]); ys.push(y[i] - e, y[i] + e); }
      if (xv) { const e = xv.length === 1 ? xv[0] : xv[i]; barsList.push([x[i] - e, y[i], x[i] + e, y[i]]); xs.push(x[i] - e, x[i] + e); }
    }
    const art = { type: 'errorbar', bars: barsList, color, capsize: fnum(kw.capsize, 0), xs, ys, z: 2, label: '_errorbar' };
    a.artists.push(art);
    return artistObj(art);
  },
  text: (ctx, args, kw) => {
    const a = A(args);
    const art = { type: 'text', x: fnum(args[1] ?? kw.x), y: fnum(args[2] ?? kw.y), s: strArg(args[3] ?? kw.s), fontsize: kwGet(kw, 'fontsize', 'size') !== undefined ? fontSize(kwGet(kw, 'fontsize', 'size')) : 10, color: kw.color ? colorOf(kw.color).color : '#000000', ha: kwGet(kw, 'ha', 'horizontalalignment') ? strArg(kwGet(kw, 'ha', 'horizontalalignment')) : 'left', va: kwGet(kw, 'va', 'verticalalignment') ? strArg(kwGet(kw, 'va', 'verticalalignment')) : 'baseline', rotation: fnum(kw.rotation, 0), transform: kw.transform === 'axes' || (kw.transform instanceof PyInstance && kw.transform.cls === AXES) ? 'axes' : 'data', z: 3 };
    a.artists.push(art);
    return artistObj(art);
  },
  annotate: (ctx, args, kw) => {
    const a = A(args);
    const s = strArg(args[1] ?? kw.text);
    const xy = Array.from(flat(toNd(args[2] ?? kw.xy)));
    const xt = kw.xytext ?? args[3];
    const xytext = xt === undefined || xt === null ? xy : Array.from(flat(toNd(xt)));
    const ap = kw.arrowprops;
    let arrowColor = '#000000';
    if (ap instanceof PyDict) { const c = ap.get('color') ?? ap.get('facecolor') ?? ap.get('fc'); if (c !== undefined) arrowColor = colorOf(c).color; }
    const art = { type: 'annotate', s, xy, xytext, arrow: ap !== undefined && ap !== null, arrowColor, fontsize: kwGet(kw, 'fontsize', 'size') !== undefined ? fontSize(kwGet(kw, 'fontsize', 'size')) : 10, color: kw.color ? colorOf(kw.color).color : '#000000', ha: kwGet(kw, 'ha', 'horizontalalignment') ? strArg(kwGet(kw, 'ha', 'horizontalalignment')) : 'left', va: kwGet(kw, 'va', 'verticalalignment') ? strArg(kwGet(kw, 'va', 'verticalalignment')) : 'baseline', z: 3 };
    a.artists.push(art);
    return artistObj(art);
  },
  set_title: (ctx, args, kw) => {
    const a = A(args);
    const loc = strArg(kw.loc, 'center');
    a.title[loc] = strArg(args[1] ?? kw.label);
    a.titleStyle = { size: kwGet(kw, 'fontsize', 'size') !== undefined ? fontSize(kwGet(kw, 'fontsize', 'size')) : 12, color: kw.color ? colorOf(kw.color).color : '#000000', weight: kw.fontweight ? strArg(kw.fontweight) : null };
    return null;
  },
  get_title: (ctx, args, kw) => A(args).title[strArg(kw.loc ?? args[1], 'center')],
  set_xlabel: (ctx, args, kw) => { const a = A(args); a.xlabel = strArg(args[1] ?? kw.xlabel); a.xlabelStyle = labelStyle(kw); return null; },
  set_ylabel: (ctx, args, kw) => { const a = A(args); a.ylabel = strArg(args[1] ?? kw.ylabel); a.ylabelStyle = labelStyle(kw); return null; },
  get_xlabel: (ctx, args) => A(args).xlabel,
  get_ylabel: (ctx, args) => A(args).ylabel,
  set_xlim: (ctx, args, kw) => { const a = A(args); const [lo, hi] = limitsArg(args.slice(1), kw, 'left', 'right'); const cur = autoscale(a, 'x'); a.xlim = [lo ?? cur[0], hi ?? cur[1]]; return new PyTuple(a.xlim.map((v) => new PyFloat(v))); },
  set_ylim: (ctx, args, kw) => { const a = A(args); const [lo, hi] = limitsArg(args.slice(1), kw, 'bottom', 'top'); const cur = autoscale(a, 'y'); a.ylim = [lo ?? cur[0], hi ?? cur[1]]; return new PyTuple(a.ylim.map((v) => new PyFloat(v))); },
  get_xlim: (ctx, args) => new PyTuple(autoscale(A(args), 'x').map((v) => new PyFloat(v))),
  get_ylim: (ctx, args) => new PyTuple(autoscale(A(args), 'y').map((v) => new PyFloat(v))),
  set_xticks: (ctx, args, kw) => { ticksArg(A(args), 'x', args[1] ?? kw.ticks, args[2] ?? kw.labels); return null; },
  set_yticks: (ctx, args, kw) => { ticksArg(A(args), 'y', args[1] ?? kw.ticks, args[2] ?? kw.labels); return null; },
  set_xticklabels: (ctx, args, kw) => { ticksArg(A(args), 'x', null, args[1] ?? kw.labels); if (kw.rotation !== undefined) A(args).xrot = fnum(kw.rotation); return null; },
  set_yticklabels: (ctx, args, kw) => { ticksArg(A(args), 'y', null, args[1] ?? kw.labels); return null; },
  get_xticks: (ctx, args) => floats(currentTickLocs(A(args), 'x')),
  get_yticks: (ctx, args) => floats(currentTickLocs(A(args), 'y')),
  legend: (ctx, args, kw) => {
    const a = A(args);
    const locArg = kw.loc;
    let loc = 0;
    if (locArg !== undefined && locArg !== null) {
      if (isInt(locArg)) loc = Number(num(locArg));
      else { const l = strArg(locArg); if (!(l in LEGEND_LOCS)) throw npErr('ValueError', `'${l}' is not a valid value for loc; supported values are ${Object.keys(LEGEND_LOCS).map((k) => `'${k}'`).join(', ')}`, 'npLegendLoc'); loc = LEGEND_LOCS[l]; }
    }
    const labels = args[1] !== undefined ? iterItems(args[1]).map((v) => strArg(v)) : kw.labels ? iterItems(kw.labels).map((v) => strArg(v)) : null;
    a.legend = { loc, labels, fontsize: kw.fontsize !== undefined ? fontSize(kw.fontsize) : 10, title: kw.title ? strArg(kw.title) : null, ncol: fnum(kwGet(kw, 'ncol', 'ncols'), 1), frameon: kw.frameon === undefined ? true : truthy(kw.frameon) };
    if (!legendEntries(a).length) npWarnPlot(ctx, 'No artists with labels found to put in legend.  Note that artists whose label start with an underscore are ignored when legend() is called with no argument.');
    return null;
  },
  grid: (ctx, args, kw) => {
    const a = A(args);
    let on = args[1] === undefined || args[1] === null ? true : truthy(args[1]);
    if (kw.visible !== undefined) on = truthy(kw.visible);
    if (args[1] === undefined && kw.visible === undefined && Object.keys(kw).filter((k) => k !== 'axis' && k !== 'which').length === 0) on = !(a.grid.x || a.grid.y);
    const which = strArg(kw.axis, 'both');
    if (which !== 'y') a.grid.x = on;
    if (which !== 'x') a.grid.y = on;
    const st = a.grid.style;
    if (kwGet(kw, 'color', 'c') !== undefined) st.color = kwGet(kw, 'color', 'c');
    if (kwGet(kw, 'linestyle', 'ls') !== undefined) st.ls = lineStyleArg(kwGet(kw, 'linestyle', 'ls'));
    if (kwGet(kw, 'linewidth', 'lw') !== undefined) st.lw = fnum(kwGet(kw, 'linewidth', 'lw'));
    if (kw.alpha !== undefined) st.alpha = fnum(kw.alpha);
    return null;
  },
  set_aspect: (ctx, args) => { A(args).aspect = strArg(args[1]) === 'equal' || (isNum(args[1]) && fnum(args[1]) === 1) ? 'equal' : 'auto'; return null; },
  axis: (ctx, args, kw) => {
    const a = A(args), v = args[1];
    if (v === undefined) return new PyTuple([...autoscale(a, 'x'), ...autoscale(a, 'y')].map((x) => new PyFloat(x)));
    if (typeof v === 'string') {
      if (v === 'off') a.axisOn = false;
      else if (v === 'on') a.axisOn = true;
      else if (v === 'equal' || v === 'scaled' || v === 'square') a.aspect = 'equal';
      else if (v === 'tight') { const dx = dataLimits(a, 'x'), dy = dataLimits(a, 'y'); a.xlim = [dx.lo, dx.hi]; a.ylim = [dy.lo, dy.hi]; }
    } else if (v === false) a.axisOn = false;
    else if (v === true) a.axisOn = true;
    else { const lims = Array.from(flat(toNd(v))); a.xlim = [lims[0], lims[1]]; a.ylim = [lims[2], lims[3]]; }
    return null;
  },
  set_axis_off: (ctx, args) => { A(args).axisOn = false; return null; },
  set_axis_on: (ctx, args) => { A(args).axisOn = true; return null; },
  tick_params: (ctx, args, kw) => {
    const a = A(args), which = strArg(kw.axis, 'both');
    if (kw.rotation !== undefined || kw.labelrotation !== undefined) { const r = fnum(kw.rotation ?? kw.labelrotation); if (which !== 'y') a.xrot = r; if (which !== 'x') a.yrot = r; }
    return null;
  },
  cla: (ctx, args) => { const a = A(args); a.artists = []; a.lineCycle = 0; a.patchCycle = 0; a.legend = null; a.title = { center: '', left: '', right: '' }; a.xlabel = ''; a.ylabel = ''; a.xlim = [null, null]; a.ylim = [null, null]; a.xticks = null; a.yticks = null; a.xcat = null; a.ycat = null; return null; },
  set_facecolor: () => null,
  get_figure: (ctx, args) => A(args).fig,
  __repr__: (ctx, args) => {
    const a = A(args);
    return `<Axes: ${a.title.center ? `title={'center': '${a.title.center}'}, ` : ''}xlabel='${a.xlabel}', ylabel='${a.ylabel}'>`;
  },
};
AXES_METHODS.set = (ctx, args, kw) => {
  for (const [k, v] of Object.entries(kw)) {
    const m = AXES_METHODS[`set_${k}`];
    if (!m) throw npErr('AttributeError', `Axes.set() got an unexpected keyword argument '${k}'`);
    m(ctx, [args[0], v], {});
  }
  return null;
};

const labelStyle = (kw) => ({ size: kwGet(kw, 'fontsize', 'size') !== undefined ? fontSize(kwGet(kw, 'fontsize', 'size')) : 10, color: kw.color ? colorOf(kw.color).color : '#000000' });

function fontSize(v) {
  if (typeof v === 'string') return { 'xx-small': 5.79, 'x-small': 6.94, small: 8.33, medium: 10, large: 12, 'x-large': 14.4, 'xx-large': 17.28 }[v] ?? 10;
  return fnum(v, 10);
}

function npWarnPlot(ctx, msg) {
  const vm = ctx.vm;
  vm.printErr(`UserWarning: ${msg}\n`, ctx.task);
}

function addSubplot(ctx, fig, args, kw) {
  let rows = 1, cols = 1, index = 1, span = null;
  if (args.length === 1 && isInt(args[0])) { const n = Number(num(args[0])); rows = Math.floor(n / 100); cols = Math.floor(n / 10) % 10; index = n % 10; } else if (args.length >= 3) {
    rows = Number(num(args[0])); cols = Number(num(args[1]));
    if (args[2] instanceof PyTuple) { const [p, q] = args[2].items.map((v) => Number(num(v))); index = p; span = [p, q]; } else index = Number(num(args[2]));
  }
  if (index < 1 || index > rows * cols) throw npErr('ValueError', `num must be an integer with 1 <= num <= ${rows * cols}, not ${index}`, 'npSubplot');
  // the same position again: that axes becomes current (like plt.subplot)
  const same = fig.f.axes.find((ax) => ax.a.spec.rows === rows && ax.a.spec.cols === cols && ax.a.spec.index === index && !span);
  if (same && kw.__reuse) { fig.f.current = same; return same; }
  const ax = newAxes(fig, { rows, cols, index, span });
  if (kw.title) ax.a.title.center = strArg(kw.title);
  if (kw.xlabel) ax.a.xlabel = strArg(kw.xlabel);
  if (kw.ylabel) ax.a.ylabel = strArg(kw.ylabel);
  return ax;
}

const FIGURE_METHODS = {
  add_subplot: (ctx, args, kw) => addSubplot(ctx, args[0], args.slice(1), kw),
  gca: (ctx, args) => { const f = args[0]; return f.f.current ?? newAxes(f, { rows: 1, cols: 1, index: 1 }); },
  suptitle: (ctx, args, kw) => { args[0].f.suptitle = strArg(args[1] ?? kw.t); return null; },
  tight_layout: () => null,
  subplots_adjust: (ctx, args, kw) => { const ad = args[0].f.adjust; for (const k of ['left', 'right', 'bottom', 'top', 'wspace', 'hspace']) if (kw[k] !== undefined && kw[k] !== null) ad[k] = fnum(kw[k]); return null; },
  set_size_inches: (ctx, args) => { const f = args[0].f; const v = args[2] === undefined ? Array.from(flat(toNd(args[1]))) : [fnum(args[1]), fnum(args[2])]; f.w = v[0]; f.h = v[1]; return null; },
  set_facecolor: (ctx, args) => { args[0].f.facecolor = colorOf(args[1]).color; return null; },
  get_axes: (ctx, args) => new PyList(args[0].f.axes.slice()),
  savefig: (ctx, args, kw) => {
    const [r] = renderOpenFigures({ plot: { figs: [args[0]] } }, false);
    const info = { kind: 'plot', svg: r.svg, width: r.width, height: r.height, file: strArg(args[1] ?? kw.fname) };
    (ctx.vm.plotsShown ??= []).push(info);
    return new Suspend(info);
  },
  show: (ctx, args) => {
    const [r] = renderOpenFigures({ plot: { figs: [args[0]] } }, false);
    const info = { kind: 'plot', svg: r.svg, width: r.width, height: r.height };
    (ctx.vm.plotsShown ??= []).push(info);
    return new Suspend(info);
  },
  __repr__: (ctx, args) => { const f = args[0].f; return `<Figure size ${Math.round(f.w * f.dpi)}x${Math.round(f.h * f.dpi)} with ${f.axes.length} Axes>`; },
};

const ARTIST_METHODS = {
  get_color: (ctx, args) => { const a = args[0].art; return a.color?.color ?? a.color ?? a.rects?.[0]?.color.color ?? null; },
  set_color: (ctx, args) => { const a = args[0].art; const c = colorOf(args[1]); if (a.type === 'bars') a.rects.forEach((r) => { r.color = c; }); else a.color = c.color; return null; },
  get_label: (ctx, args) => args[0].art.label ?? '',
  set_label: (ctx, args) => { args[0].art.label = strArg(args[1]); return null; },
  set_linewidth: (ctx, args) => { args[0].art.lw = fnum(args[1]); return null; },
  set_alpha: (ctx, args) => { args[0].art.alpha = fnum(args[1]); return null; },
  get_xdata: (ctx, args) => floats(Array.from(args[0].art.x ?? [])),
  get_ydata: (ctx, args) => floats(Array.from(args[0].art.y ?? [])),
  set_data: (ctx, args) => { const a = args[0].art; a.x = Float64Array.from(flat(toNd(args[1]))); a.y = Float64Array.from(flat(toNd(args[2]))); return null; },
  __repr__: (ctx, args) => { const a = args[0].art; return a.type === 'line' ? `Line2D(${a.label})` : `<${a.type} artist>`; },
};

/** SVG id prefix: a hash of the figure's content, so several plots on one page do not share clip ids. */
function contentId(svgBody) {
  let h = 0x811c9dc5;
  for (let i = 0; i < svgBody.length; i++) { h ^= svgBody.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `p${(h >>> 0).toString(36)}`;
}

/** The SVGs of all open figures (oldest first); with close, they are closed afterwards (plt.show()). */
export function renderOpenFigures(vm, close = true) {
  const st = state(vm);
  const out = st.figs.map((fig) => {
    const body = figureSvg(fig, 'x');
    const id = contentId(body);
    return { svg: body.replaceAll('id="x-c', `id="${id}-c`).replaceAll('url(#x-c', `url(#${id}-c`), width: Math.round(fig.f.w * fig.f.dpi), height: Math.round(fig.f.h * fig.f.dpi), num: fig.f.num };
  });
  if (close) { st.figs = []; st.current = null; }
  return out;
}

/** Layout facts of a figure for tests (limits, visible ticks and their labels, colours, legend position). */
function summary(fig) {
  return fig.f.axes.map((axInst) => {
    const L = layoutAxes(fig, axInst);
    const a = L.a;
    const G = a.legend ? legendGeometry(L) : null;
    const legend = G ? [G.x, G.y, G.x + G.w, G.y + G.h].map((v) => Math.round(v * 100) / 100) : null;
    return {
      box: L.box.map((v) => Math.round(v * 100) / 100), xlim: L.xlim, ylim: L.ylim,
      xticks: L.xticks.map((t) => t.v), xlabels: L.xticks.map((t) => t.label), yticks: L.yticks.map((t) => t.v), ylabels: L.yticks.map((t) => t.label),
      xoffset: L.xoffset, yoffset: L.yoffset,
      colors: a.artists.flatMap((art) => (art.type === 'line' || art.type === 'hline' || art.type === 'vline' ? [art.color] : art.type === 'scatter' ? [art.colors[0].color] : art.type === 'bars' ? [art.rects[0]?.color.color] : art.type === 'pie' ? art.wedges.map((w) => w.color.color) : [])),
      legend,
    };
  });
}

export const PLOT_NATIVES = {
  '_plot.figure'(ctx, args, kw) {
    const [num0, figsize, dpi, facecolor] = params('figure', args, kw, ['?num', '?figsize', '?dpi', '?facecolor', '?edgecolor', '?frameon', '?clear', '?layout', '?tight_layout', '?constrained_layout']);
    const st = state(ctx.vm);
    if (num0 !== undefined && num0 !== null) {
      const found = st.figs.find((f) => f.f.num === (isNum(num0) ? Number(num(num0)) : num0));
      if (found) { st.current = found; return found; }
    }
    const fs = figsize === undefined || figsize === null ? null : Array.from(flat(toNd(figsize)));
    if (fs && (fs.length !== 2 || fs.some((v) => !(v > 0)))) throw npErr('ValueError', `figure size must be positive finite not ${ctx.vm.repr(figsize)}`);
    const fig = newFigure(ctx.vm, { figsize: fs, dpi: dpi === undefined || dpi === null ? 100 : fnum(dpi), num: num0 === undefined || num0 === null ? undefined : isNum(num0) ? Number(num(num0)) : num0 });
    if (facecolor) fig.f.facecolor = colorOf(facecolor).color;
    return fig;
  },
  '_plot.gcf'(ctx) { return currentFigure(ctx.vm); },
  '_plot.gca'(ctx) { return currentAxes(ctx.vm); },
  '_plot.sca'(ctx, args) { const ax = args[0]; const st = state(ctx.vm); st.current = ax.a.fig; ax.a.fig.f.current = ax; return null; },
  '_plot.subplot'(ctx, args, kw) { return addSubplot(ctx, currentFigure(ctx.vm), args.length ? args : [1, 1, 1], { ...kw, __reuse: true }); },
  '_plot.close'(ctx, args) {
    const st = state(ctx.vm), v = args[0];
    if (v === 'all') { st.figs = []; st.current = null; return null; }
    const target = v === undefined || v === null ? st.current : v instanceof PyInstance ? v : st.figs.find((f) => f.f.num === (isNum(v) ? Number(num(v)) : v));
    st.figs = st.figs.filter((f) => f !== target);
    if (st.current === target) st.current = st.figs[st.figs.length - 1] ?? null;
    return null;
  },
  '_plot.clf'(ctx) { const fig = currentFigure(ctx.vm); fig.f.axes = []; fig.f.current = null; fig.f.suptitle = null; return null; },
  '_plot.render_all'(ctx) { return new PyList(renderOpenFigures(ctx.vm, true).map((r) => new PyTuple([r.svg, r.width, r.height]))); },
  '_plot.render'(ctx, args) { const fig = args[0] ?? currentFigure(ctx.vm); const [r] = renderOpenFigures({ plot: { figs: [fig] } }, false); return new PyTuple([r.svg, r.width, r.height]); },
  '_plot.display'(ctx, args, kw) {
    const [svg, width, height, file] = params('display', args, kw, ['svg', 'width', 'height', '?file']);
    const info = { kind: 'plot', svg, width: Number(num(width)), height: Number(num(height)), ...(file ? { file } : {}) };
    (ctx.vm.plotsShown ??= []).push(info);
    return new Suspend(info);
  },
  '_plot.summary'(ctx) { return JSON.stringify(state(ctx.vm).figs.map(summary)); },
  '_plot.fignums'(ctx) { return new PyList(state(ctx.vm).figs.map((f) => f.f.num)); },
};

for (const [name, f] of Object.entries(AXES_METHODS)) { PLOT_NATIVES[`_plot.Axes.${name}`] = f; AXES.dict.set(name, new PyBuiltin(`_plot.Axes.${name}`)); }
for (const [name, f] of Object.entries(FIGURE_METHODS)) { PLOT_NATIVES[`_plot.Figure.${name}`] = f; FIGURE.dict.set(name, new PyBuiltin(`_plot.Figure.${name}`)); }
for (const [name, f] of Object.entries(ARTIST_METHODS)) { PLOT_NATIVES[`_plot.Artist.${name}`] = f; ARTIST.dict.set(name, new PyBuiltin(`_plot.Artist.${name}`)); }
// fig.axes: the list of axes
PLOT_NATIVES['_plot.Figurep.axes'] = (ctx, args) => new PyList(args[0].f.axes.slice());
FIGURE.dict.set('axes', new PyProperty(new PyBuiltin('_plot.Figurep.axes')));

export const PLOT_NAMES = [...Object.keys(PLOT_NATIVES).filter((n) => /^_plot\.[a-z_]+$/.test(n)).map((n) => n.slice(6)), 'Figure', 'Axes'];
export const PLOT_CONSTS = { Figure: FIGURE, Axes: AXES };
