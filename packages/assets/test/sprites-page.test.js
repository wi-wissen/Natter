// The sprite gallery (docs/sprites/index.html) is generated from catalog.json and gametypes.json by
// scripts/build-sprites.mjs. These tests keep it honest: every shown name exists, every image is shown, the usage
// example runs in Natter's Pygame Zero, and the checked-in page is the one the generator writes now.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSprites, OUT_FILE, ASSETS_BASE, USAGE_CODE, USAGE_NAMES } from '../../../scripts/build-sprites.mjs';
import { VM, compile } from '../../core/src/index.js';
import { PGZ_NATIVES, PGZ_BUILTIN_NAMES, pgzHostModules, installPgzero, pgzStart, pgzFrame } from '../../core/src/stdlib/pgzero.js';

const ROOT = join(import.meta.dirname, '..');
const catalog = JSON.parse(readFileSync(join(ROOT, 'catalog.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const built = buildSprites();
const { problems } = built;
const html = built.html.replace(/<wbr>/g, '');
const images = new Map(catalog.images.map((a) => [a.name, a]));

describe('sprite gallery', () => {
  it('matches the asset library (no problems)', () => {
    expect(problems).toEqual([]);
  });

  it('loads the files from the npm package of the current version', () => {
    expect(ASSETS_BASE).toBe(`https://cdn.jsdelivr.net/npm/@natterjs/assets@${pkg.version}/`);
    const srcs = [...html.matchAll(/<img src="([^"]+)"[^>]*loading="lazy"/g)].map((m) => m[1]);
    expect(srcs.length).toBeGreaterThan(500);
    for (const s of srcs) expect(s.startsWith(ASSETS_BASE), s).toBe(true);
    expect(html).toContain('<link rel="canonical" href="https://natter.wi7.net/sprites/">');
  });

  it('lists only names from catalog.json, with their real file and size', () => {
    const bad = [];
    for (const m of html.matchAll(/<li class="t[^"]*"[^>]*?(?: data-fr="([^"]*)")?><button type="button" class="pv"><img src="([^"]+)"[^>]*><\/button><button[^>]*>([^<]+)<\/button><span class="sz">(\d+)×(\d+)/g)) {
      const [, fr, src, name, w, h] = m;
      const a = images.get(name);
      if (!a) { bad.push(`${name}: not in catalog`); continue; }
      if (src !== ASSETS_BASE + a.file) bad.push(`${name}: file ${src}`);
      if (+w !== a.w || +h !== a.h) bad.push(`${name}: size ${w}×${h}`);
      for (const f of fr ? fr.split(' ') : []) if (!images.has(f)) bad.push(`${name}: frame ${f} not in catalog`);
    }
    for (const m of html.matchAll(/data-n="([^"]+)"/g)) if (!catalog.sounds.some((s) => s.name === m[1])) bad.push(`sound ${m[1]}`);
    expect(bad).toEqual([]);
  });

  it('shows every image (alone or as a frame of an animation tile) and every sound', () => {
    const shown = new Set();
    for (const m of html.matchAll(/<li class="t[^"]*"[^>]*?(?: data-fr="([^"]*)")?><button type="button" class="pv">.*?class="nm"[^>]*>([^<]+)</g)) {
      shown.add(m[2]);
      for (const f of m[1] ? m[1].split(' ') : []) shown.add(f);
    }
    expect(catalog.images.filter((a) => !shown.has(a.name)).map((a) => a.name)).toEqual([]);
    for (const s of catalog.sounds) expect(html).toContain(`data-n="${s.name}"`);
  });

  it('runs the usage example with the names it shows', () => {
    for (const n of USAGE_NAMES.images) expect(images.has(n), n).toBe(true);
    for (const n of USAGE_NAMES.sounds) expect(catalog.sounds.some((s) => s.name === n), n).toBe(true);
    const size = Object.fromEntries(catalog.images.map((i) => [i.name, [i.w, i.h]]));
    let output = '';
    const vm = new VM(compile(USAGE_CODE, { known: PGZ_BUILTIN_NAMES }), {
      natives: PGZ_NATIVES, seed: 1,
      host: {
        ...pgzHostModules(), print: (t) => { output += t; }, printErr: () => {},
        pgz: { resource: (kind, n) => (kind === 'images' ? size[n] ?? null : kind === 'sounds' ? (catalog.sounds.some((s) => s.name === n) ? 1 : null) : null), cmd: () => {} },
      },
    });
    installPgzero(vm);
    const run = (task) => { vm.run(task, 5_000_000); return task.state === 'error' ? task.error : null; };
    expect(run(vm.start())).toBe(null);
    expect(run(pgzStart(vm))).toBe(null);
    expect(run(pgzFrame(vm, [['mouse_down', [100, 100], 1]], 1 / 60))).toBe(null);
    expect(output.trim()).toBe(String(images.get('ente').w));
  });

  it('docs/sprites/index.html is current (run: npm run sprites)', () => {
    const current = readFileSync(OUT_FILE, 'utf8') === built.html;
    expect(current, 'docs/sprites/index.html is stale: run npm run sprites').toBe(true);
  });
});
