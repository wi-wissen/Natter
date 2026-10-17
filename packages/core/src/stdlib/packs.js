// Loading modules on demand (browser): the host asks which packs a program needs, loads them (one dynamic import each,
// so a bundler makes one chunk per pack) and only then creates the VM. Node and the tests use index.js, which has all packs.

/** Module names of each pack (a test checks this table against what the packs really register). */
export const PACKS = {
  stdlib: ['collections', 'functools', 'itertools', 'statistics', 'string', 'json', 'sys', 'time', '_calendar', 'datetime', 're', 'textwrap', 'pprint', 'turtle', '_fileio', 'os', 'posixpath', 'requests'],
  numpy: ['numpy', 'numpy.random', 'numpy.linalg'],
  pyplot: ['matplotlib', 'matplotlib.pyplot'],
  guizero: ['guizero'],
  pgzero: ['pgzero_rect', 'pgzero_color', 'pgzero_clock', 'pgzero_animation', 'pgzero_keys', 'pgzero_screen', 'pgzero_audio', 'pgzero_spellcheck', 'pgzero_actor', 'pgzero_builtins', 'pgzero_main', 'pgzrun'],
};
/** Packs a pack needs besides itself (checked against the real imports of the modules by a test; the loader also follows the imports of what it loads). */
const NEEDS = { pyplot: ['numpy'], pgzero: [], guizero: ['stdlib'] };
const LOADERS = {
  stdlib: () => import('./packs/stdlib.js'),
  numpy: () => import('./packs/numpy.js'),
  pyplot: () => import('./packs/pyplot.js'),
  guizero: () => import('./packs/guizero.js'),
  pgzero: () => import('./packs/pgzero.js'),
};
const loaded = new Map();
import { PYMODULES } from '../pymodules.js';

/** Packs that the Python source of a loaded pack imports (so loading guizero also brings the modules it uses). */
function importsOf(pack) {
  const found = new Set();
  for (const name of PACKS[pack]) for (const p of packsFor(PYMODULES[name] ?? '')) if (p !== pack) found.add(p);
  return [...found];
}

/** Pack that contains a module (dotted names count by their first part: numpy.random → numpy), or undefined. */
export function packOf(name) {
  for (const [pack, names] of Object.entries(PACKS)) if (names.includes(name) || names.includes(name.split('.')[0])) return pack;
  return undefined;
}

/**
 * Packs a program needs: its `import` lines, `open(` (files), and what Pygame Zero programs use without importing
 * (they may use Actor, keyboard ... without `import pgzrun`: pass `pgzero: true` for those).
 * @param {string} source @param {{ pgzero?: boolean }} [opts]
 * @returns {string[]} pack names
 */
export function packsFor(source, opts = {}) {
  const found = new Set();
  const add = (n) => { const p = packOf(n); if (p) found.add(p); };
  for (const m of source.matchAll(/^[ \t]*(?:from[ \t]+([\w.]+)[ \t]+import|import[ \t]+([\w., \t]+))/gm)) {
    if (m[1]) { add(m[1]); for (const part of source.slice(m.index, source.indexOf('\n', m.index) < 0 ? undefined : source.indexOf('\n', m.index)).replace(/^.*import/, '').split(',')) add(`${m[1]}.${part.trim().split(/\s/)[0]}`); } else for (const n of m[2].split(',')) add(n.trim().split(/\s/)[0]);
  }
  if (/\bopen\s*\(/.test(source)) found.add('stdlib');
  if (opts.pgzero) found.add('pgzero');
  for (const p of [...found]) for (const n of NEEDS[p] ?? []) found.add(n);
  return [...found];
}

/** Load packs by name; resolves when all are registered. */
export async function loadPacks(names) {
  const todo = [...names];
  const seen = new Set();
  while (todo.length) {
    const n = todo.pop();
    if (seen.has(n)) continue;
    seen.add(n);
    if (!LOADERS[n]) throw new Error(`unknown pack ${n}`);
    if (!loaded.has(n)) loaded.set(n, LOADERS[n]());
    await loaded.get(n);
    // what the loaded modules import themselves
    todo.push(...(NEEDS[n] ?? []), ...importsOf(n));
  }
}

/** Load what a program needs (see packsFor). Call before creating the VM. */
export const loadPyModules = (source, opts) => loadPacks(packsFor(source, opts));
