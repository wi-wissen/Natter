// Pure helpers of the kara renderer: the world picture as cells, directions, layout.

/** Directions of the core: 0 right, 1 up, 2 left, 3 down. Angle on screen in degrees (clockwise, y down). */
export const DIR_ANGLE = [0, -90, 180, 90];

/**
 * Cells of a world picture (the text of the 'world' event; the same characters as world(...)).
 * @param {string} text
 * @returns {{ width: number, height: number, cells: { tree: boolean, berry: boolean, mushroom: boolean }[][], kara: { x: number, y: number, dir: number } }}
 */
export function parseWorldText(text) {
  const rows = String(text).replace(/^\n/, '').replace(/\n$/, '').split('\n');
  const height = rows.length;
  const width = Math.max(1, ...rows.map((r) => r.length));
  let kara = { x: 0, y: 0, dir: 0 };
  const cells = rows.map((r, y) => Array.from({ length: width }, (_, x) => {
    const ch = r[x] ?? ' ';
    if (ch === '@' || ch === '+') kara = { x, y, dir: 0 };
    return { tree: ch === '#', berry: ch === '.' || ch === '+' || ch === '*', mushroom: ch === '$' || ch === '*' };
  }));
  return { width, height, cells, kara };
}

/** Are all mushrooms on berries (and is there at least one)? The usual goal of the mushroom tasks. */
export function mushroomsDone(world) {
  let n = 0;
  for (const row of world.cells) for (const c of row) if (c.mushroom) { n++; if (!c.berry) return false; }
  return n > 0;
}

/** Turn angle from one direction to the next, the short way (+90 or -90 on screen). */
export function turnDelta(fromDir, toDir) {
  const d = ((toDir - fromDir) % 4 + 4) % 4;
  return d === 1 ? -90 : d === 3 ? 90 : d === 2 ? 180 : 0;
}

/** Images of the kara pack the renderer uses (names in packages/assets/kara/pack.json). The flower only decorates;
 * kara_rock is left out: on the meadow it looks like an obstacle. */
export const KARA_IMAGES = ['kara', 'kara_up', 'kara_left', 'kara_down', 'kara_berry', 'kara_bump', 'kara_blueberry', 'kara_tree',
  'kara_mushroom', 'kara_mushroom_berry', 'kara_grass', 'kara_flower'];
/** Images that may be missing (decoration); without one of the others the renderer draws its vector shapes. */
export const KARA_OPTIONAL = ['kara_flower'];

/**
 * URLs of the kara images in a catalog of the asset library ({ images: [{ name, file }] }) or a pack list
 * ({ assets: [{ name, file }] } of <pack>/pack.json, then `dir` is 'kara/'). The first entry of a name wins.
 * @param {any} catalog
 * @param {string} base  baseUrl of the library (ends with '/')
 * @param {string} [dir]  folder of the files relative to base
 * @returns {Record<string, string>}
 */
export function karaImageUrls(catalog, base, dir = '') {
  const want = new Set(KARA_IMAGES);
  const out = {};
  for (const a of [...(catalog?.images ?? []), ...(catalog?.assets ?? [])]) {
    if (!a?.name || !a?.file || !want.has(a.name) || out[a.name]) continue;
    out[a.name] = /^[a-z][a-z0-9+.-]*:|^\//i.test(a.file) ? a.file : base + dir + a.file;
  }
  return out;
}

/**
 * Which image shows Kara and how far it is turned (degrees, clockwise): the picture for the direction when she looks
 * straight, `kara` turned by the angle while she turns, `kara_berry`/`kara_bump` turned to her direction.
 * @param {{ angle: number, berry?: boolean, bump?: boolean }} s
 * @returns {{ name: string, rotate: number }}
 */
export function karaSprite({ angle, berry = false, bump = false }) {
  const a = ((Math.round(angle * 1000) / 1000) % 360 + 360) % 360;
  if (bump) return { name: 'kara_bump', rotate: a };
  if (berry) return { name: 'kara_berry', rotate: a };
  const straight = { 0: 'kara', 90: 'kara_down', 180: 'kara_left', 270: 'kara_up' }[a];
  return straight ? { name: straight, rotate: 0 } : { name: 'kara', rotate: a };
}

/**
 * Decoration of an empty meadow cell, the same for the same cell every time: null (most cells) or a small flower in
 * one corner. Only looks; the world does not know it.
 * @returns {null | { name: string, dx: number, dy: number }}  dx, dy: centre of the flower in cells from the cell's corner
 */
export function meadowDecor(x, y) {
  let h = (Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  if (h % 9 !== 0) return null;
  const corner = (h >>> 8) & 3;
  return { name: 'kara_flower', dx: corner & 1 ? 0.78 : 0.22, dy: corner & 2 ? 0.78 : 0.22 };
}
