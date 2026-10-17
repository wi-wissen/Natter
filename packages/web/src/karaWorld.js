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
