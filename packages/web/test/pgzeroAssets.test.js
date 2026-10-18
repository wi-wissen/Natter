// The resources of the Pygame Zero host with the library catalog (packages/assets/catalog.json): one request for the
// list, then only the images a program names; project files win.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAssets, catalogEntries } from '../src/pgzeroAssets.js';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '../../assets');
const catalog = JSON.parse(readFileSync(join(ASSETS, 'catalog.json'), 'utf8'));
const BASE = 'https://example.org/lib/';

/** fetch over packages/assets, records the URLs. */
function fakeFetch() {
  const urls = [];
  const fn = async (url) => {
    urls.push(url);
    const path = String(url).startsWith(BASE) ? String(url).slice(BASE.length) : null;
    if (path === null) return { ok: false, status: 404 };
    let buf;
    try { buf = readFileSync(join(ASSETS, path)); } catch { return { ok: false, status: 404 }; }
    return {
      ok: true, status: 200,
      json: async () => JSON.parse(buf.toString('utf8')),
      blob: async () => new Blob([buf], { type: path.endsWith('.svg') ? 'image/svg+xml' : 'image/png' }),
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
    };
  };
  return { fn, urls };
}

// a stand-in for HTMLImageElement: decode() reads the size from the PNG header of the blob behind the object URL
const saved = {};
const blobs = new Map();
beforeAll(() => {
  saved.Image = globalThis.Image;
  saved.create = URL.createObjectURL;
  URL.createObjectURL = (b) => { const u = 'blob:test/' + blobs.size; blobs.set(u, b); return u; };
  globalThis.Image = class {
    async decode() {
      const b = new Uint8Array(await blobs.get(this.src).arrayBuffer());
      const v = new DataView(b.buffer, b.byteOffset);
      this.naturalWidth = v.getUint32(16); this.naturalHeight = v.getUint32(20);
    }
  };
});
afterAll(() => { globalThis.Image = saved.Image; URL.createObjectURL = saved.create; });

describe('library catalog in the Pygame Zero host', () => {
  it('catalogEntries: kinds, urls, pack filter', () => {
    const all = catalogEntries(catalog, BASE);
    expect(all.length).toBe(catalog.images.length + catalog.sounds.length);
    expect(all.find((a) => a.name === 'ente')).toEqual({ kind: 'images', name: 'ente', url: BASE + 'book/ente.png', pack: 'book' });
    expect(all.find((a) => a.name === 'platsch').kind).toBe('sounds');
    expect(catalogEntries(catalog, BASE, ['book']).every((a) => a.pack === 'book')).toBe(true);
  });

  it('one request for the catalog, then only the named images (book names work out of the box)', async () => {
    const f = fakeFetch();
    const assets = createAssets({ assets: { baseUrl: BASE, catalog: 'catalog.json' }, fetch: f.fn });
    const src = 'duck = Actor("ente")\nboats = [Actor("boot")]\nchick = Actor("kueken")\nheroine = 1\nrun = ["heroine_run_" + str(i) for i in range(1, 9)]\n';
    expect(await assets.prepare([src])).toEqual([]);
    expect(f.urls.filter((u) => u.endsWith('.json'))).toEqual([BASE + 'catalog.json']);
    const files = f.urls.filter((u) => !u.endsWith('.json')).map((u) => u.slice(BASE.length)).sort();
    expect(files).toEqual(['book/boot.png', 'book/ente.png', 'book/kueken.png',
      ...Array.from({ length: 8 }, (_, i) => `characters/heroine_run_${i + 1}.png`)].sort());
    expect(assets.resource('images', 'boot')).toEqual([120, catalog.images.find((a) => a.name === 'boot').h]);
    expect(assets.resource('images', 'heroine_idle_1')).toBe(null);
    expect(assets.describeMissing('images', 'heroine_idle_1')).toContain('nicht vorab geladen');
    expect(assets.describeMissing('images', 'ente_link')).toContain('Meintest du „ente_links“?');
    // a second run: no new request for the catalog or a loaded image
    f.urls.length = 0;
    await assets.prepare(['a = Actor("ente")\nb = Actor("sp_ship")\n']);
    expect(f.urls).toEqual([BASE + 'space/sp_ship.png']);
  });

  it('images.name and sounds.name count as named', async () => {
    const f = fakeFetch();
    const assets = createAssets({ assets: { baseUrl: BASE, catalog: 'catalog.json' }, fetch: f.fn });
    await assets.prepare(['def draw():\n    screen.blit(images.pf_grass_mid, (0, 0))\n    sounds.coin.play()\n']);
    expect(assets.resource('images', 'pf_grass_mid')).toEqual([64, 64]);
    expect(f.urls.map((u) => u.slice(BASE.length)).sort()).toEqual(['catalog.json', 'platformer/pf_grass_mid.png', 'sounds/coin.wav']);
  });

  it('a project file wins over the library and the library file is not fetched', async () => {
    const f = fakeFetch();
    const assets = createAssets({ assets: { baseUrl: BASE, catalog: 'catalog.json' }, fetch: f.fn });
    const png = readFileSync(join(ASSETS, 'book/frosch.png'));
    await assets.prepare(['a = Actor("ente")\nb = Actor("boot")\n'], { 'images/ente.png': new Uint8Array(png) });
    const frosch = catalog.images.find((a) => a.name === 'frosch');
    expect(assets.resource('images', 'ente')).toEqual([frosch.w, frosch.h]);
    expect(assets.image('ente').file).toBe('images/ente.png');
    expect(f.urls.some((u) => u.endsWith('/ente.png'))).toBe(false);
    expect(f.urls.some((u) => u.endsWith('/boot.png'))).toBe(true);
  });

  it('a catalog object needs no request; a missing catalog is tried again on the next run', async () => {
    const f = fakeFetch();
    const a1 = createAssets({ assets: { baseUrl: BASE, catalog }, fetch: f.fn });
    await a1.prepare(['x = Actor("frosch")\n']);
    expect(f.urls).toEqual([BASE + 'book/frosch.png']);
    const g = fakeFetch();
    const a2 = createAssets({ assets: { baseUrl: BASE, catalog: 'nope.json' }, fetch: g.fn });
    await a2.prepare(['x = Actor("frosch")\n']);
    await a2.prepare(['x = Actor("frosch")\n']);
    expect(g.urls).toEqual([BASE + 'nope.json', BASE + 'nope.json']);
  });
});

describe('hints for a missing library name', () => {
  it('suggests the name with its pack word', async () => {
    const f = fakeFetch();
    const assets = createAssets({ assets: { baseUrl: BASE, catalog: 'catalog.json' }, fetch: f.fn });
    await assets.prepare(['a = Actor("ufo")\n']);
    const t = assets.describeMissing('images', 'ufo');
    expect(t).toContain('in den 14 Paketen der Bibliothek');
    expect(t).toContain('Meintest du „sp_ufo“?');
  });
});
