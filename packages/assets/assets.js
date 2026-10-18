// Reads and checks the asset packs (used by the tests and by scripts/build-asset-catalog.mjs).
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const NAME_RE = /^[a-z][a-z0-9_]*$/;
export const MAX_FILE = 20 * 1024;
export const MAX_PACK = 200 * 1024;
export const MAX_PNG = 80 * 1024;
export const MAX_PNG_BACKGROUND = 300 * 1024;
export const MAX_PNG_PACK = 3 * 1024 * 1024;

/** Size and colour type of a PNG file (from its header), or null if it is not a PNG. */
export function pngInfo(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 33 || sig.some((b, i) => buf[i] !== b) || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colorType: buf[25], hasAlpha: buf[25] === 6 || buf[25] === 4 };
}

/** All pack folders (those with a pack.json). */
export const packDirs = () => readdirSync(ROOT).filter((d) => existsSync(join(ROOT, d, 'pack.json'))).sort();

export const readPack = (dir) => JSON.parse(readFileSync(join(ROOT, dir, 'pack.json'), 'utf8'));

/** Minimal well-formedness check of an SVG text: balanced tags, one root. Returns a list of problems. */
export function svgProblems(text, { animated = false } = {}) {
  const problems = [];
  const clean = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[\s\S]*?\?>/g, '');
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  const stack = [];
  let m, roots = 0, last = 0;
  while ((m = tagRe.exec(clean))) {
    const [, close, name, attrs, self] = m;
    if (stack.length === 0 && !close) roots++;
    if (close) {
      if (stack.pop() !== name) { problems.push(`unbalanced </${name}>`); break; }
    } else if (!self) stack.push(name);
    last = tagRe.lastIndex;
    if (/\b(href|src)\s*=\s*["'](?!#)/.test(attrs) && name !== 'a') problems.push(`external reference in <${name}>`);
    if (/^(script|image|foreignObject|iframe|use)$/.test(name) && name !== 'use') problems.push(`forbidden element <${name}>`);
  }
  if (stack.length) problems.push(`unclosed <${stack.pop()}>`);
  if (roots !== 1) problems.push(`expected 1 root element, found ${roots}`);
  if (clean.slice(last).trim()) problems.push('text after the root element');
  if (/@import|url\(\s*["']?https?:/i.test(clean)) problems.push('external url');
  if (/<text[\s>]/.test(clean)) problems.push('<text> must be converted to paths');
  if (!animated && /<animate|<set\b|animation\s*:|@keyframes/.test(clean)) problems.push('animation is not allowed');
  const root = /<svg\b([^>]*)>/.exec(clean);
  if (!root) problems.push('no <svg> root');
  else {
    const a = root[1];
    if (!/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(a)) problems.push('missing xmlns');
    const w = /\bwidth="(\d+)"/.exec(a), h = /\bheight="(\d+)"/.exec(a), vb = /viewBox="0 0 (\d+) (\d+)"/.exec(a);
    if (!w || !h) problems.push('width and height must be integers');
    if (!vb) problems.push('viewBox must be "0 0 W H"');
    if (w && h && vb && (w[1] !== vb[1] || h[1] !== vb[2])) problems.push('viewBox does not match width/height');
  }
  return problems;
}

/** Size of the SVG as [w, h]. */
export function svgSize(text) {
  const w = /<svg\b[^>]*\bwidth="(\d+)"/.exec(text), h = /<svg\b[^>]*\bheight="(\d+)"/.exec(text);
  return [Number(w?.[1]), Number(h?.[1])];
}

export const fileSize = (p) => statSync(p).size;
export { join, readdirSync, readFileSync, existsSync };

/** Length in seconds of a PCM WAV file (data bytes / bytes per second), rounded to milliseconds; null if unknown. */
export function wavSeconds(buf) {
  let i = 12, rate = 0, align = 0;
  while (i + 8 <= buf.length) {
    const id = buf.toString('latin1', i, i + 4), size = buf.readUInt32LE(i + 4);
    if (id === 'fmt ') { rate = buf.readUInt32LE(i + 12); align = buf.readUInt16LE(i + 20); }
    if (id === 'data' && rate && align) return Math.round((size / align / rate) * 1000) / 1000;
    i += 8 + size + (size & 1);
  }
  return null;
}

/**
 * Animation groups and image series from `_<n>` suffixes: names `<base>_<n>` with at least two numbers.
 * kind 'animation' when the descriptions speak of frames (they share one canvas), else 'series' (variants like dice_1..6).
 * @param {{ name: string, pack: string, en?: string }[]} images
 */
export function findGroups(images) {
  const by = new Map();
  for (const a of images) {
    const m = /^(.+)_(\d+)$/.exec(a.name);
    if (!m) continue;
    const key = a.pack + '/' + m[1];
    if (!by.has(key)) by.set(key, { name: m[1], pack: a.pack, items: [] });
    by.get(key).items.push({ n: Number(m[2]), a });
  }
  const groups = [];
  for (const g of by.values()) {
    if (g.items.length < 2) continue;
    g.items.sort((x, y) => x.n - y.n);
    const animation = g.items.some(({ a }) => /\bframes?\b/i.test(a.en ?? ''));
    groups.push({ name: g.name, pack: g.pack, kind: animation ? 'animation' : 'series', frames: g.items.map(({ a }) => a.name) });
  }
  return groups.sort((x, y) => (x.pack + '/' + x.name).localeCompare(y.pack + '/' + y.name));
}

/**
 * The catalog of the whole library (packages/assets/catalog.json): packs, images with their size, sounds with their
 * length, animation groups. Paths are relative to the folder of the catalog. Deterministic (sorted, no dates).
 */
export function buildCatalog(root = ROOT) {
  const packs = [], images = [], sounds = [];
  const dirs = readdirSync(root).filter((d) => existsSync(join(root, d, 'pack.json'))).sort();
  for (const dir of dirs) {
    const pack = JSON.parse(readFileSync(join(root, dir, 'pack.json'), 'utf8'));
    let bytes = 0;
    for (const a of pack.assets ?? []) {
      const p = join(root, dir, a.file);
      const buf = readFileSync(p);
      bytes += buf.length;
      let w, h;
      if (a.file.endsWith('.png')) ({ width: w, height: h } = pngInfo(buf));
      else [w, h] = svgSize(buf.toString('utf8'));
      images.push({ name: a.name, pack: dir, file: `${dir}/${a.file}`, w, h, bytes: buf.length, tags: a.tags ?? [], de: a.de ?? '', en: a.en ?? '' });
    }
    packs.push({ pack: dir, kind: 'images', title: pack.title, format: pack.format ?? (pack.assets?.[0]?.file.split('.').pop() ?? 'png'), count: pack.assets?.length ?? 0, bytes });
  }
  const sdir = join(root, 'sounds');
  if (existsSync(join(sdir, 'sounds.json'))) {
    const list = JSON.parse(readFileSync(join(sdir, 'sounds.json'), 'utf8'));
    let bytes = 0;
    for (const s of list.sounds ?? []) {
      const buf = readFileSync(join(sdir, s.file));
      bytes += buf.length;
      sounds.push({ name: s.name, pack: 'sounds', file: `sounds/${s.file}`, seconds: wavSeconds(buf), bytes: buf.length, tags: s.tags ?? [], de: s.de ?? '', en: s.en ?? '' });
    }
    packs.push({ pack: 'sounds', kind: 'sounds', title: list.title, format: 'wav', count: list.sounds?.length ?? 0, bytes });
  }
  return { version: 1, packs, images, sounds, groups: findGroups(images), gametypes: readGametypes(root) };
}

/**
 * The game types (packages/assets/gametypes.json): id, de, en, hint {de, en}, packs, starter (image names). The sprite
 * gallery (docs/sprites/) and CodeNatter are ordered by them. Empty when the file is missing.
 */
export function readGametypes(root = ROOT) {
  const file = join(root, 'gametypes.json');
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf8')).types.map(({ id, de, en, hint, packs, starter }) => ({ id, de, en, hint, packs, starter }));
}

/** Problems of the game types against the catalog (unknown packs or names, starter sets of the wrong size). */
export function gametypeProblems(catalog, { min = 8, max = 16 } = {}) {
  const problems = [];
  const packs = new Set(catalog.packs.filter((p) => p.kind === 'images').map((p) => p.pack));
  const packOf = new Map(catalog.images.map((a) => [a.name, a.pack]));
  const ids = new Set();
  const covered = new Set();
  for (const t of catalog.gametypes ?? []) {
    if (!NAME_RE.test(t.id ?? '')) problems.push(`bad id ${t.id}`);
    if (ids.has(t.id)) problems.push(`duplicate id ${t.id}`);
    ids.add(t.id);
    if (!t.de || !t.en || !t.hint?.de || !t.hint?.en) problems.push(`${t.id}: de, en and hint {de, en} are needed`);
    if (!t.packs?.length) problems.push(`${t.id}: no packs`);
    for (const p of t.packs ?? []) {
      if (!packs.has(p)) problems.push(`${t.id}: unknown pack ${p}`);
      covered.add(p);
    }
    const starter = t.starter ?? [];
    if (starter.length < min || starter.length > max) problems.push(`${t.id}: ${starter.length} starter images (${min} to ${max})`);
    if (new Set(starter).size !== starter.length) problems.push(`${t.id}: a starter image twice`);
    for (const n of starter) {
      if (!packOf.has(n)) problems.push(`${t.id}: unknown image ${n}`);
      else if (!t.packs?.includes(packOf.get(n))) problems.push(`${t.id}: ${n} is in pack ${packOf.get(n)}, not in the packs of the type`);
    }
  }
  for (const p of packs) if (!covered.has(p)) problems.push(`pack ${p} belongs to no game type`);
  return problems;
}

/** The catalog as text: one entry per line (small diffs, still compact). */
export function catalogText(catalog) {
  const list = (arr) => (arr.length ? '[\n' + arr.map((x) => '    ' + JSON.stringify(x)).join(',\n') + '\n  ]' : '[]');
  return '{\n' + Object.entries(catalog).map(([k, v]) => `  ${JSON.stringify(k)}: ${Array.isArray(v) ? list(v) : JSON.stringify(v)}`).join(',\n') + '\n}\n';
}
