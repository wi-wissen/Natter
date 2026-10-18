// Pure helpers of the Pygame Zero host (no DOM): fixed-step timing, key codes of pygame 2 / SDL2, rounding, text layout
// like ptext, the tone envelope, and which asset names a program uses.

/**
 * Fixed time step with an accumulator: real time goes in, a whole number of game frames comes out. Small jitter of
 * the display (16.4 or 17 ms instead of 16.67) does not make frames double or drop, a long pause (tab in the
 * background, a slow frame) does not make the game race to catch up.
 * @param {{ step?: number, maxSteps?: number, maxElapsed?: number, slack?: number }} [opts]  times in ms
 */
export function createStepper(opts = {}) {
  const step = opts.step ?? 1000 / 60;
  const maxSteps = opts.maxSteps ?? 4;
  const maxElapsed = opts.maxElapsed ?? 250;
  const slack = opts.slack ?? Math.min(2, step / 8);
  let acc = 0;
  return {
    step,
    /** Add real time (ms); returns how many frames to run now. */
    advance(ms) {
      acc += Math.min(Math.max(0, ms || 0), maxElapsed);
      let n = Math.floor((acc + slack) / step);
      if (n > maxSteps) { n = maxSteps; acc = 0; } else acc -= n * step;
      return n;
    },
    /** Forget time that is not used yet (after a pause or a slow frame). */
    reset() { acc = 0; },
    get pending() { return acc; },
  };
}

/** Python's round(): halves go to the even neighbour. */
export function roundHalfEven(x) {
  const f = Math.floor(x), d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

// ---------- keys ----------

const K = 1073741824; // SDLK_SCANCODE_MASK: keys without a character
/** KeyboardEvent.code → pygame 2 key code for keys without a printable character (and the keypad). */
export const SPECIAL_KEYS = {
  ArrowLeft: K + 80, ArrowRight: K + 79, ArrowUp: K + 82, ArrowDown: K + 81,
  Enter: 13, Escape: 27, Backspace: 8, Tab: 9, Space: 32, Delete: 127,
  Insert: K + 73, Home: K + 74, End: K + 77, PageUp: K + 75, PageDown: K + 78,
  ShiftLeft: K + 225, ShiftRight: K + 229, ControlLeft: K + 224, ControlRight: K + 228,
  AltLeft: K + 226, AltRight: K + 230, MetaLeft: K + 227, MetaRight: K + 231, OSLeft: K + 227, OSRight: K + 231,
  CapsLock: K + 57, NumLock: K + 83, ScrollLock: K + 71, Pause: K + 72, PrintScreen: K + 70, ContextMenu: K + 101,
  Numpad0: K + 98, Numpad1: K + 89, Numpad2: K + 90, Numpad3: K + 91, Numpad4: K + 92, Numpad5: K + 93,
  Numpad6: K + 94, Numpad7: K + 95, Numpad8: K + 96, Numpad9: K + 97, NumpadDecimal: K + 99, NumpadDivide: K + 84,
  NumpadMultiply: K + 85, NumpadSubtract: K + 86, NumpadAdd: K + 87, NumpadEnter: K + 88, NumpadEqual: K + 103,
};
for (let i = 1; i <= 12; i++) SPECIAL_KEYS['F' + i] = K + 57 + i;
for (let i = 13; i <= 15; i++) SPECIAL_KEYS['F' + i] = K + 91 + i;

/** Characters of the punctuation keys without Shift (US layout), for key codes while Shift is held. */
const UNSHIFTED = { Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
  Backquote: '`', Comma: ',', Period: '.', Slash: '/', IntlBackslash: '<' };
/** The `unicode` field of pygame for keys whose text is a control character. */
const CONTROL_TEXT = { Enter: '\r', NumpadEnter: '\r', Tab: '\t', Backspace: '\b', Escape: '\x1b', Delete: '\x7f' };

/**
 * pygame key code and text of a key event (SDL keycodes: printable keys = their lowercase character as on the
 * keyboard layout, others with bit 30 set). Returns null for keys that have neither (e.g. 'Unidentified').
 * @param {{ key: string, code: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} e
 * @returns {{ key: number, unicode: string } | null}
 */
export function pgzKey(e) {
  const code = e.code ?? '';
  const text = e.key?.length === 1 && !e.ctrlKey && !e.metaKey ? e.key : CONTROL_TEXT[code] ?? '';
  if (code in SPECIAL_KEYS && !(code === 'Space')) return { key: SPECIAL_KEYS[code], unicode: text };
  if (code === 'Space' || e.key === ' ') return { key: 32, unicode: ' ' };
  let ch = '';
  if (/^Key[A-Z]$/.test(code)) ch = /^[a-zA-Z]$/.test(e.key) ? e.key.toLowerCase() : code[3].toLowerCase();
  else if (/^Digit\d$/.test(code)) ch = code[5];
  else if (e.shiftKey && UNSHIFTED[code]) ch = UNSHIFTED[code];
  else if (e.key?.length === 1) ch = e.key.toLowerCase();
  else if (UNSHIFTED[code]) ch = UNSHIFTED[code];
  else if (e.key === 'Enter') return { key: 13, unicode: '\r' };
  else if (e.key === 'Escape') return { key: 27, unicode: '\x1b' };
  else if (e.key === 'Backspace') return { key: 8, unicode: '\b' };
  else if (e.key?.startsWith('Arrow')) return pgzKey({ ...e, code: e.key });
  if (!ch) return null;
  return { key: ch.codePointAt(0), unicode: text };
}

/** Bits of keymods for the modifier keys that are down (by KeyboardEvent.code) and the lock states. */
export function pgzMods(down, locks = {}) {
  let m = 0;
  if (down.has('ShiftLeft')) m |= 1;
  if (down.has('ShiftRight')) m |= 2;
  if (down.has('ControlLeft')) m |= 64;
  if (down.has('ControlRight')) m |= 128;
  if (down.has('AltLeft')) m |= 256;
  if (down.has('AltRight')) m |= 512;
  if (down.has('MetaLeft') || down.has('OSLeft')) m |= 1024;
  if (down.has('MetaRight') || down.has('OSRight')) m |= 2048;
  if (locks.num) m |= 4096;
  if (locks.caps) m |= 8192;
  return m;
}

/** Keys of the on-screen controls (names → pygame key codes). */
export const PAD_KEYS = { left: SPECIAL_KEYS.ArrowLeft, right: SPECIAL_KEYS.ArrowRight, up: SPECIAL_KEYS.ArrowUp, down: SPECIAL_KEYS.ArrowDown, space: 32 };

/** pygame mouse button of a pointer event button (0 left, 1 middle, 2 right). */
export const mouseButton = (b) => (b === 0 ? 1 : b === 1 ? 2 : b === 2 ? 3 : 0);

/** Pressed buttons (left, middle, right) as 0/1 from PointerEvent.buttons. */
export const mouseButtons = (bits) => [bits & 1 ? 1 : 0, bits & 4 ? 1 : 0, bits & 2 ? 1 : 0];

// ---------- colours, geometry ----------

/** CSS colour of a pygame colour [r, g, b, a]; the screen has no alpha channel, so drawing ignores a. */
export const cssColor = (c, alpha = false) => (alpha && c[3] !== undefined && c[3] < 255 ? `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})` : `rgb(${c[0]},${c[1]},${c[2]})`);

/** Size of the bounding box of a w x h image rotated by `deg` degrees (like pygame.transform.rotate, rounded up). */
export function rotatedSize(w, h, deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  return [Math.ceil(w * c + h * s - 1e-9), Math.ceil(w * s + h * c - 1e-9)];
}

// ---------- text (ptext) ----------

/** Font size in CSS pixels: pygame scales its default font by 0.6875, files and system fonts not. */
export function fontPixels(opts) {
  const size = opts.fontsize ?? 24;
  return opts.fontname || opts.sysfontname ? size : Math.max(1, Math.floor(size * 0.6875));
}

/** CSS font of the text options; `families` maps a font file name to a loaded font family. */
export function fontCss(opts, px = fontPixels(opts), families = {}) {
  let family, bold = !!opts.bold;
  if (opts.fontname) family = families[opts.fontname] ? `"${families[opts.fontname]}", sans-serif` : 'sans-serif';
  else if (opts.sysfontname) family = String(opts.sysfontname).split(',').map((f) => `"${f.trim()}"`).join(', ') + ', sans-serif';
  else { family = 'FreeSans, "Liberation Sans", Arial, Helvetica, sans-serif'; bold = true; } // freesansbold.ttf
  return `${opts.italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${px}px ${family}`;
}

/**
 * Wrap text like ptext: paragraphs at '\n', then words into lines of at most `width` pixels (null: no wrapping).
 * @param {string} text @param {number|null} width @param {(s: string) => number} measure @param {boolean} [strip]
 */
export function wrapLines(text, width, measure, strip = true) {
  const out = [];
  for (const para of String(text).replace(/\t/g, '    ').split('\n')) {
    if (width == null) { out.push(strip ? para.replace(/\s+$/, '') : para); continue; }
    const words = para.split(/(\s+)/);
    let line = '';
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w === '') continue;
      const next = line + w;
      if (line && !/^\s+$/.test(w) && measure(next.replace(/\s+$/, '')) > width) {
        out.push(strip ? line.replace(/\s+$/, '') : line);
        line = w;
      } else line = next;
    }
    out.push(strip ? line.replace(/\s+$/, '') : line);
  }
  return out;
}

/**
 * Size of a text block like ptext: lines, the width of the widest line, height = (n - 1) * linesize * lineheight
 * + font height, plus outline and shadow.
 * @param {string} text
 * @param {any} opts  text options of the bridge (fontsize, width, widthem, lineheight, strip, owidth, shadow)
 * @param {{ measure: (s: string) => number, height: number, px: number }} font  measured with the CSS font
 */
export function layoutText(text, opts, font) {
  const width = opts.width != null ? opts.width : opts.widthem != null ? opts.widthem * font.px : null;
  const lines = wrapLines(text, width, font.measure, opts.strip !== false);
  const widths = lines.map((l) => font.measure(l));
  const lineStep = Math.round(font.height * (opts.lineheight ?? 1));
  const textW = Math.ceil(Math.max(0, ...widths));
  const textH = (lines.length - 1) * lineStep + font.height;
  const opx = opts.owidth ? Math.ceil(opts.owidth * font.px / 24) : 0;
  const [sx, sy] = opts.shadow ? opts.shadow.map((v) => Math.ceil(v * font.px / 18)) : [0, 0];
  return {
    lines, widths, lineStep, opx, sx, sy, textW, textH,
    w: textW + 2 * opx + Math.abs(sx), h: textH + 2 * opx + Math.abs(sy),
  };
}

/** Largest font size (ptext units) at which the wrapped text fits into w x h (ptext's _fitsize, a binary search). */
export function fitFontSize(fits, lo = 1, hi = 256) {
  if (!fits(lo)) return lo;
  if (fits(hi)) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fits(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

// ---------- sound ----------

/** Envelope of tone.play as [seconds, gain] points (pgzero.tone: attack, decay, sustain, release over samples + 2000). */
export function toneEnvelope(samples, rate = 22050, decay = 2000) {
  const pts = samples < 1000
    ? [[0, 0], [samples * 0.1, 1], [samples, 0.9], [samples + decay, 0]]
    : [[0, 0], [350, 1], [1000, 0.7], [samples, 0.7], [samples + decay, 0]];
  return pts.map(([s, g]) => [s / rate, g]);
}

/** Length in seconds of a PCM WAV file, or null. */
export function wavSeconds(buf) {
  const v = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset ?? 0, buf.byteLength);
  const tag = (i) => String.fromCharCode(v.getUint8(i), v.getUint8(i + 1), v.getUint8(i + 2), v.getUint8(i + 3));
  if (v.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let i = 12, rate = 0, align = 0;
  while (i + 8 <= v.byteLength) {
    const id = tag(i), size = v.getUint32(i + 4, true);
    if (id === 'fmt ') { rate = v.getUint32(i + 12, true); align = v.getUint16(i + 20, true); }
    if (id === 'data') return rate && align ? size / align / rate : null;
    i += 8 + size + (size & 1);
  }
  return null;
}

// ---------- programs and assets ----------

/**
 * How a program wants to run: 'pgzrun' (it imports pgzrun and calls go()), 'game' (a Pygame Zero program without
 * the import, like `pgzrun spiel.py`), or null (not a game).
 */
export function pgzMode(source) {
  if (/^\s*(import\s+pgzrun\b|from\s+pgzrun\s+import\b)/m.test(source)) return 'pgzrun';
  if (/^\s*(import\s+turtle\b|from\s+turtle\s+import\b|import\s+guizero\b|from\s+guizero\s+import\b)/m.test(source)) return null;
  if (/^def\s+(draw|update)\s*\(/m.test(source)) return 'game';
  if (/^(WIDTH|HEIGHT)\s*=/m.test(source) && /\b(Actor|screen)\b/.test(source)) return 'game';
  return null;
}

/** A Python source split into the contents of its string literals ('…', "…", triple quotes, any prefix like f or r)
 * and its code without comments (strings kept). */
export function splitSource(source) {
  const strings = [];
  const s = String(source);
  let code = '', from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '#') {
      code += s.slice(from, i);
      const e = s.indexOf('\n', i);
      if (e < 0) { from = s.length; break; }
      from = i = e;
      continue;
    }
    if (c !== '"' && c !== "'") continue;
    const q = s.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
    let j = i + q.length;
    while (j < s.length && !s.startsWith(q, j) && !(q.length === 1 && s[j] === '\n')) j += s[j] === '\\' ? 2 : 1;
    strings.push(s.slice(i + q.length, j));
    i = j + q.length - 1;
  }
  return { strings, code: code + s.slice(from) };
}

/** Contents of the string literals of a Python source. */
export const stringLiterals = (source) => splitSource(source).strings;

/** Image and sound names of the asset packs that a program may use: the words of the source (names, also inside
 * strings, not in comments), and the names that start with a word of a string that ends in '_' or has five letters or more and is no
 * name itself ("heroine_run_" + str(i) loads all run frames; Actor("sp_ship") or a variable `heroine` load nothing more). */
export function usedNames(sources, names) {
  const words = new Set(), inStrings = new Set();
  const scan = (text, set) => { for (const m of String(text).toLowerCase().matchAll(/[a-z][a-z0-9_]*/g)) set.add(m[0]); };
  for (const s of sources) {
    const { strings, code } = splitSource(s);
    scan(code, words);
    for (const lit of strings) scan(lit, inStrings);
  }
  const known = new Set(names);
  const prefixes = [...inStrings].filter((w) => w.endsWith('_') || (w.length >= 5 && !known.has(w))).map((w) => (w.endsWith('_') ? w : w + '_'));
  return names.filter((n) => words.has(n) || prefixes.some((p) => n.startsWith(p)));
}
