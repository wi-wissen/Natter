// Pure helpers of the guizero renderer (no DOM): pack rules of guizero, Tk defaults and colours, key names, image sizes,
// the event queue. Tested in Node (packages/web/test/forms.test.js).

/** Tk's default background (what guizero reports when nothing was set) by widget kind. */
export const TK_DEFAULT_BG = { textbox: '#ffffff', listbox: '#ffffff' };
export const TK_GRAY = '#d9d9d9';
export const TK_TEXT = '#000000';

/** Kinds whose width/height are characters/lines (as in guizero), others are pixels. */
export const CHAR_SIZED = new Set(['text', 'textbox', 'pushbutton', 'checkbox', 'radiobutton', 'combo']);

/** True when a colour is Tk's default for this kind: the page theme decides then (light/dark). */
export function isDefaultBg(kind, bg) {
  if (bg == null) return true;
  return bg.toLowerCase() === (TK_DEFAULT_BG[kind] ?? TK_GRAY);
}

/** Readable text colour (#000000 or #ffffff) on a background #rrggbb. */
export function contrastInk(bg) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(bg ?? '');
  if (!m) return TK_TEXT;
  const lin = (h) => { const c = parseInt(h, 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
  return L > 0.22 ? '#000000' : '#ffffff';
}

/**
 * How guizero packs a child in an "auto" container (guizero/base.py _pack_widget): side, fill and expand.
 * @param {{ align?: string|null }} item  layout entry
 * @param {{ width?: any, height?: any }} props
 * @returns {{ side: 'top'|'bottom'|'left'|'right', fillX: boolean, fillY: boolean, expand: boolean, horizontal: boolean }}
 */
export function packParams(item, props) {
  const fillX = props.width === 'fill', fillY = props.height === 'fill';
  const side = ['top', 'bottom', 'left', 'right'].includes(item.align) ? item.align : null;
  let expand = fillX && fillY;
  if (!side && fillY && !fillX) expand = true;
  if ((side === 'top' || side === 'bottom') && fillY) expand = true;
  if ((side === 'left' || side === 'right') && fillX) expand = true;
  const s = side ?? 'top';
  return { side: s, fillX, fillY, expand, horizontal: s === 'left' || s === 'right' };
}

/** CSS placement of a grid child: [col, row, colspan, rowspan] and align (Tk sticky N/S/W/E, else centred). */
export function gridPlacement(item, props = {}) {
  const [c, r, cs = 1, rs = 1] = item.grid ?? [0, 0];
  const a = item.align;
  return {
    gridColumn: `${c + 1} / span ${cs}`,
    gridRow: `${r + 1} / span ${rs}`,
    justifySelf: props.width === 'fill' ? 'stretch' : a === 'left' ? 'start' : a === 'right' ? 'end' : 'center',
    alignSelf: props.height === 'fill' ? 'stretch' : a === 'top' ? 'start' : a === 'bottom' ? 'end' : 'center',
  };
}

const KEYSYMS = {
  ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', ' ': 'space', Enter: 'Return', Escape: 'Escape',
  Backspace: 'BackSpace', Tab: 'Tab', Delete: 'Delete', Shift: 'Shift_L', Control: 'Control_L', Alt: 'Alt_L', Meta: 'Meta_L',
  AltGraph: 'ISO_Level3_Shift', CapsLock: 'Caps_Lock', Home: 'Home', End: 'End', PageUp: 'Prior', PageDown: 'Next', Insert: 'Insert',
  '.': 'period', ',': 'comma', '-': 'minus', '+': 'plus', '*': 'asterisk', '/': 'slash', '\\': 'backslash', '#': 'numbersign',
  '!': 'exclam', '?': 'question', ':': 'colon', ';': 'semicolon', '=': 'equal', '(': 'parenleft', ')': 'parenright',
  '[': 'bracketleft', ']': 'bracketright', '{': 'braceleft', '}': 'braceright', '<': 'less', '>': 'greater', '"': 'quotedbl',
  "'": 'apostrophe', '&': 'ampersand', '%': 'percent', '$': 'dollar', '@': 'at', '_': 'underscore', '^': 'asciicircum',
  '~': 'asciitilde', '|': 'bar', '`': 'grave', ä: 'adiaeresis', ö: 'odiaeresis', ü: 'udiaeresis', Ä: 'Adiaeresis',
  Ö: 'Odiaeresis', Ü: 'Udiaeresis', ß: 'ssharp', '€': 'EuroSign', '§': 'section', '°': 'degree',
};
const CHARS = { Enter: '\r', Backspace: '\b', Tab: '\t', Escape: '\x1b', Delete: '\x7f' };

/** Tk keysym and char of a KeyboardEvent.key (Tk: char "" for keys without text, e.g. arrows and Shift). */
export function tkKey(key) {
  const keysym = KEYSYMS[key] ?? key;
  const char = CHARS[key] ?? ([...key].length === 1 ? key : '');
  return { keysym, char };
}

/** Width and height of an image from its first bytes (PNG, GIF, JPEG, BMP, WebP) or SVG text; null if unknown. */
export function imageSize(bytes) {
  const b = bytes;
  const u16 = (i) => (b[i] << 8) | b[i + 1], u16le = (i) => b[i] | (b[i + 1] << 8);
  const u32 = (i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { width: u32(16), height: u32(20) };
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { width: u16le(6), height: u16le(8) };
  if (b.length > 26 && b[0] === 0x42 && b[1] === 0x4d) return { width: u16le(18) | (u16le(20) << 16), height: Math.abs((u16le(22) | (u16le(24) << 16)) << 0) };
  if (b.length > 30 && b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === 'VP8X') return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (chunk === 'VP8 ') return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    if (chunk === 'VP8L') { const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: u16(i + 7), height: u16(i + 5) };
      i += 2 + u16(i + 2);
    }
  }
  return null;
}

/** Size of an SVG text from width/height or the viewBox. */
export function svgSize(text) {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!tag) return null;
  const attr = (n) => new RegExp(`\\s${n}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1];
  const num = (s) => (s && /^\s*[\d.]+\s*(px)?\s*$/.test(s) ? parseFloat(s) : NaN);
  let w = num(attr('width')), h = num(attr('height'));
  const vb = attr('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if ((!(w > 0) || !(h > 0)) && vb?.length === 4) {
    if (w > 0) h = (w * vb[3]) / vb[2];
    else if (h > 0) w = (h * vb[2]) / vb[3];
    else { w = vb[2]; h = vb[3]; }
  }
  return w > 0 && h > 0 ? { width: Math.round(w), height: Math.round(h) } : null;
}

/**
 * An image file of the project (text in vm.fs): a data: URL (base64) or SVG text. Returns { url, width, height } or null.
 * @param {string} text
 */
export function projectImage(text) {
  if (typeof text !== 'string') return null;
  const t = text.trimStart();
  if (t.startsWith('<svg') || (t.startsWith('<?xml') && t.includes('<svg'))) {
    const size = svgSize(t);
    return size && { url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(t), ...size };
  }
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(t);
  if (!m) return null;
  if (m[1] === 'image/svg+xml') {
    let svg;
    try { svg = m[2] ? atob(m[3].replace(/\s/g, '')) : decodeURIComponent(m[3]); } catch { return null; }
    const size = svgSize(svg);
    return size && { url: t, ...size };
  }
  if (!m[2]) return null;
  const b64 = m[3].replace(/\s/g, '');
  const n = Math.min(b64.length, 65536);
  let head;
  try { head = atob(b64.slice(0, n - (n % 4))); } catch { return null; }
  const bytes = new Uint8Array(head.length);
  for (let i = 0; i < head.length; i++) bytes[i] = head.charCodeAt(i);
  const size = imageSize(bytes);
  return size && { url: t, ...size };
}

/**
 * Queue of page events for the program. Raw events wait here until the program asks (forms-event wait); a waiting
 * program gets the next one at once. Motion events are coalesced (only the newest of a run is kept).
 */
export class EventQueue {
  constructor() {
    /** @type {any[][]} */
    this.items = [];
  }
  push(ev) {
    const last = this.items.at(-1);
    if (last && last[0] === 'mouse' && ev[0] === 'mouse' && last[1] === ev[1] && last[2] === ev[2] && (ev[2] === 'motion' || ev[2] === 'drag1')) {
      this.items[this.items.length - 1] = ev;
      return;
    }
    if (ev[0] === 'resize' && last && last[0] === 'resize' && last[1] === ev[1]) { this.items[this.items.length - 1] = ev; return; }
    this.items.push(ev);
  }
  shift() { return this.items.shift(); }
  get length() { return this.items.length; }
  clear() { this.items.length = 0; }
}
