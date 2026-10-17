// Pure helpers of the turtle renderer (no DOM): coordinates, animation times, shapes, fonts, key names.

/**
 * Mapping of turtle coordinates (origin in the middle, y up) to canvas pixels of a logical W x H screen.
 * @param {number} W @param {number} H
 * @param {null | [number, number, number, number]} world  setworldcoordinates(llx, lly, urx, ury) or null
 */
export function makeView(W, H, world = null) {
  if (world) {
    const [llx, lly, urx, ury] = world;
    const sx = W / (urx - llx || 1), sy = H / (ury - lly || 1);
    return {
      toPx: (x, y) => [(x - llx) * sx, (ury - y) * sy],
      fromPx: (px, py) => [px / sx + llx, ury - py / sy],
    };
  }
  return {
    toPx: (x, y) => [W / 2 + x, H / 2 - y],
    fromPx: (px, py) => [px - W / 2, H / 2 - py],
  };
}

/** Steps per second of the animation (CPython moves 3*1.1^s*s pixels per step and draws about 30 steps per second). */
const HOPS_PER_SECOND = 30;

/** Seconds a move of `dist` pixels takes at turtle speed 1 … 10 (0: no animation). */
export function moveSeconds(dist, speed) {
  if (!speed || !dist) return 0;
  const perHop = 3 * 1.1 ** speed * speed;
  return Math.min(10, Math.abs(dist) / (perHop * HOPS_PER_SECOND));
}

/** Seconds a turn of `deg` degrees takes (CPython: 3*speed degrees per step). */
export function turnSeconds(deg, speed) {
  if (!speed || !deg) return 0;
  return Math.min(5, Math.abs(deg) / (3 * speed * HOPS_PER_SECOND));
}

/** Shortest signed difference b - a in degrees (-180 … 180). */
export function angleDiff(a, b) {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

/** Polygons of the built-in shapes as in CPython's turtle (shape space: +y points forward). */
export const SHAPES = {
  arrow: [[-10, 0], [10, 0], [0, 10]],
  turtle: [[0, 16], [-2, 14], [-1, 10], [-4, 7], [-7, 9], [-9, 8], [-6, 5], [-7, 1], [-5, -3], [-8, -6], [-6, -8], [-4, -5], [0, -7], [4, -5], [6, -8], [8, -6], [5, -3], [7, 1], [6, 5], [9, 8], [7, 9], [4, 7], [1, 10], [2, 14]],
  circle: Array.from({ length: 20 }, (_, i) => [10 * Math.cos((i * Math.PI) / 10), 10 * Math.sin((i * Math.PI) / 10)]),
  square: [[10, -10], [10, 10], [-10, 10], [-10, -10]],
  triangle: [[10, -5.77], [0, 11.55], [-10, -5.77]],
  classic: [[0, 0], [-5, -9], [0, -7], [5, -9]],
};

/**
 * Pixel polygon of a shape at pixel position (px, py), pointing along the pixel direction (dx, dy) (unit vector).
 * stretch: [stretch_wid, stretch_len].
 */
export function shapePolygon(name, px, py, dx, dy, stretch = [1, 1]) {
  const poly = SHAPES[name] ?? SHAPES.classic;
  const [sw, sl] = stretch;
  // forward = (dx, dy); right-hand side in pixel space = (-dy, dx)
  return poly.map(([sx, sy]) => [px + sy * sl * dx - sx * sw * dy, py + sy * sl * dy + sx * sw * dx]);
}

/** Pixel direction of a turtle heading (degrees, counterclockwise from east) for a view. */
export function headingDir(view, x, y, heading) {
  const r = (heading * Math.PI) / 180;
  const [ax, ay] = view.toPx(x, y);
  const [bx, by] = view.toPx(x + Math.cos(r), y + Math.sin(r));
  const l = Math.hypot(bx - ax, by - ay) || 1;
  return [(bx - ax) / l, (by - ay) / l];
}

/** CSS font of turtle.write(font=(family, size, style)); Tk sizes are points (4/3 pixels). */
export function cssFont(font) {
  const [family = 'Arial', size = 8, style = 'normal'] = Array.isArray(font) ? font : [];
  const s = String(style).toLowerCase();
  const px = Math.max(1, Math.round(Math.abs(Number(size) || 8) * 4 / 3));
  const fam = /[\s,]/.test(String(family)) ? `"${family}"` : String(family);
  return `${s.includes('italic') ? 'italic ' : ''}${s.includes('bold') ? 'bold ' : ''}${px}px ${fam}, Arial, sans-serif`;
}

const KEYSYMS = {
  ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', ' ': 'space', Enter: 'Return', Escape: 'Escape',
  Backspace: 'BackSpace', Tab: 'Tab', Delete: 'Delete', Shift: 'Shift_L', Control: 'Control_L', Alt: 'Alt_L', Home: 'Home', End: 'End',
  PageUp: 'Prior', PageDown: 'Next', Insert: 'Insert',
};

/** Tk key name (what onkey(fun, "Left") expects) of a KeyboardEvent.key. */
export function keysym(key) {
  if (KEYSYMS[key]) return KEYSYMS[key];
  if (/^F\d{1,2}$/.test(key)) return key;
  return key;
}

/**
 * Scale that fits a W x H screen into the available area.
 * @param {number} availW @param {number} availH (Infinity: only the width counts)
 * @param {{ upscale?: boolean, max?: number }} [opts]  upscale: may grow beyond 1:1 (up to max)
 */
export function fitScale(availW, availH, W, H, opts = {}) {
  let s = Math.min(availW / W, availH / H);
  s = Math.min(opts.max ?? (opts.upscale ? Infinity : 1), s);
  return s > 0 && Number.isFinite(s) ? s : 1;
}
