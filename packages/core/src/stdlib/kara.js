// kara: the ladybug on a grid world (as in the book: move, turnLeft, treeFront, onBerry, world(""" … """)).
// The state lives in the VM (vm.kara). Every change is reported to the host as host.kara(event, args, task);
// the host's return value is the number of seconds to wait (animation). Without a host nothing waits.

import { Suspend } from '../values.js';
import { err, params, needStr } from '../args.js';

/** Directions: 0 right, 1 up, 2 left, 3 down (counterclockwise like turning left). */
const DX = [1, 0, -1, 0], DY = [0, -1, 0, 1];
export const KARA_CHARS = { '#': 'tree', '.': 'berry', '$': 'mushroom', '*': 'mushroomBerry', '@': 'kara', '+': 'karaBerry', ' ': 'empty' };

/** Parse the picture of a world; rows may be of different length (missing cells are empty). */
export function parseWorld(text) {
  const rows = text.replace(/^\n/, '').replace(/\n$/, '').split('\n');
  const height = rows.length;
  const width = Math.max(1, ...rows.map((r) => r.length));
  const tree = [], berry = [], mushroom = [];
  let kara = null;
  for (let y = 0; y < height; y++) {
    tree.push([]); berry.push([]); mushroom.push([]);
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x] ?? ' ';
      if (!(ch in KARA_CHARS)) throw err('kara', { what: 'badChar', char: ch, x: x + 1, y: y + 1 });
      tree[y][x] = ch === '#';
      berry[y][x] = ch === '.' || ch === '+' || ch === '*';
      mushroom[y][x] = ch === '$' || ch === '*';
      if (ch === '@' || ch === '+') {
        if (kara) throw err('kara', { what: 'twoKaras' });
        kara = { x, y, dir: 0 };
      }
    }
  }
  if (!kara) throw err('kara', { what: 'noKara' });
  return { width, height, tree, berry, mushroom, kara };
}

/** The picture of the current state (the same characters as in world()). */
export function worldText(w) {
  const out = [];
  for (let y = 0; y < w.height; y++) {
    let line = '';
    for (let x = 0; x < w.width; x++) {
      const k = w.kara.x === x && w.kara.y === y;
      line += w.tree[y][x] ? '#' : k ? (w.berry[y][x] ? '+' : '@') : w.mushroom[y][x] ? (w.berry[y][x] ? '*' : '$') : w.berry[y][x] ? '.' : ' ';
    }
    out.push(line);
  }
  return out.join('\n');
}

const world = (vm) => {
  if (!vm.kara) throw err('kara', { what: 'noWorld' });
  return vm.kara;
};
const blocked = (w, x, y) => x < 0 || y < 0 || x >= w.width || y >= w.height || w.tree[y][x];
const wait = (ctx, event, ...args) => {
  const s = ctx.vm.host.kara?.(event, args, ctx.task);
  return typeof s === 'number' && s > 0 ? new Suspend({ kind: 'sleep', seconds: s }) : null;
};
const noArgs = (name, args, kw) => params(name, args, kw, []);

export const KARA_NATIVES = {
  'kara.world'(ctx, args, kw) {
    const [text] = params('world', args, kw, ['text']);
    ctx.vm.kara = parseWorld(needStr(text, 'text'));
    return wait(ctx, 'world', worldText(ctx.vm.kara));
  },
  'kara.move'(ctx, args, kw) {
    noArgs('move', args, kw);
    const w = world(ctx.vm);
    const { x, y, dir } = w.kara;
    const nx = x + DX[dir], ny = y + DY[dir];
    if (nx < 0 || ny < 0 || nx >= w.width || ny >= w.height) { wait(ctx, 'crash', 'edge'); throw err('kara', { what: 'edge' }); }
    if (w.tree[ny][nx]) { wait(ctx, 'crash', 'tree'); throw err('kara', { what: 'tree' }); }
    if (w.mushroom[ny][nx]) {
      const mx = nx + DX[dir], my = ny + DY[dir];
      if (blocked(w, mx, my) || w.mushroom[my][mx]) { wait(ctx, 'crash', 'mushroom'); throw err('kara', { what: 'mushroom' }); }
      w.mushroom[ny][nx] = false;
      w.mushroom[my][mx] = true;
      w.kara.x = nx; w.kara.y = ny;
      return wait(ctx, 'push', nx, ny, mx, my, dir);
    }
    w.kara.x = nx; w.kara.y = ny;
    return wait(ctx, 'move', nx, ny, dir);
  },
  'kara.turnLeft'(ctx, args, kw) { noArgs('turnLeft', args, kw); const w = world(ctx.vm); w.kara.dir = (w.kara.dir + 1) % 4; return wait(ctx, 'turn', w.kara.dir, 'left'); },
  'kara.turnRight'(ctx, args, kw) { noArgs('turnRight', args, kw); const w = world(ctx.vm); w.kara.dir = (w.kara.dir + 3) % 4; return wait(ctx, 'turn', w.kara.dir, 'right'); },
  'kara.putBerry'(ctx, args, kw) {
    noArgs('putBerry', args, kw);
    const w = world(ctx.vm);
    const { x, y } = w.kara;
    if (w.berry[y][x]) { wait(ctx, 'crash', 'berryThere'); throw err('kara', { what: 'berryThere' }); }
    w.berry[y][x] = true;
    return wait(ctx, 'put', x, y);
  },
  'kara.removeBerry'(ctx, args, kw) {
    noArgs('removeBerry', args, kw);
    const w = world(ctx.vm);
    const { x, y } = w.kara;
    if (!w.berry[y][x]) { wait(ctx, 'crash', 'noBerry'); throw err('kara', { what: 'noBerry' }); }
    w.berry[y][x] = false;
    return wait(ctx, 'remove', x, y);
  },
  'kara.onBerry'(ctx, args, kw) { noArgs('onBerry', args, kw); const w = world(ctx.vm); return w.berry[w.kara.y][w.kara.x]; },
  'kara.treeFront'(ctx, args, kw) { noArgs('treeFront', args, kw); const w = world(ctx.vm); const d = w.kara.dir; return blocked(w, w.kara.x + DX[d], w.kara.y + DY[d]); },
  'kara.treeLeft'(ctx, args, kw) { noArgs('treeLeft', args, kw); const w = world(ctx.vm); const d = (w.kara.dir + 1) % 4; return blocked(w, w.kara.x + DX[d], w.kara.y + DY[d]); },
  'kara.treeRight'(ctx, args, kw) { noArgs('treeRight', args, kw); const w = world(ctx.vm); const d = (w.kara.dir + 3) % 4; return blocked(w, w.kara.x + DX[d], w.kara.y + DY[d]); },
  'kara.mushroomFront'(ctx, args, kw) {
    noArgs('mushroomFront', args, kw);
    const w = world(ctx.vm); const d = w.kara.dir;
    const x = w.kara.x + DX[d], y = w.kara.y + DY[d];
    return !blocked(w, x, y) && w.mushroom[y][x];
  },
};
export const KARA_NAMES = ['world', 'move', 'turnLeft', 'turnRight', 'putBerry', 'removeBerry', 'onBerry', 'treeFront', 'treeLeft', 'treeRight', 'mushroomFront'];
