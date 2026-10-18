import { describe, it, expect } from 'vitest';
import { ROOT, buildCatalog, catalogText, findGroups, join, readFileSync, existsSync } from '../assets.js';

describe('catalog.json', () => {
  const catalog = buildCatalog();
  it('the checked-in catalog is current (npm run assets:catalog)', () => {
    const file = join(ROOT, 'catalog.json');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(catalogText(catalog));
  });
  it('lists every pack, image and sound with size and texts', () => {
    expect(catalog.packs.map((p) => p.pack)).toContain('book');
    expect(catalog.packs.find((p) => p.pack === 'sounds').kind).toBe('sounds');
    const ente = catalog.images.find((a) => a.name === 'ente');
    expect(ente).toMatchObject({ pack: 'book', file: 'book/ente.png' });
    expect(catalog.images.find((a) => a.name === 'boot').w).toBe(120);
    const turtle = catalog.images.find((a) => a.name === 'turtle');
    expect(turtle.file).toBe('turtle/turtle.svg');
    expect(turtle.w).toBeGreaterThan(0);
    for (const a of catalog.images) {
      expect(a.w * a.h, a.name).toBeGreaterThan(0);
      expect(a.de && a.en, a.name).toBeTruthy();
    }
    const platsch = catalog.sounds.find((s) => s.name === 'platsch');
    expect(platsch.file).toBe('sounds/platsch.wav');
    expect(platsch.seconds).toBeGreaterThan(0.05);
    expect(new Set(catalog.images.map((a) => a.name)).size).toBe(catalog.images.length);
  });
  it('finds the animation groups', () => {
    const run = catalog.groups.find((g) => g.name === 'heroine_run');
    expect(run).toMatchObject({ pack: 'characters', kind: 'animation' });
    expect(run.frames).toEqual(Array.from({ length: 8 }, (_, i) => `heroine_run_${i + 1}`));
    expect(catalog.groups.find((g) => g.name === 'dice').kind).toBe('series');
  });
});

describe('findGroups', () => {
  it('needs two numbered names, sorts by number, tells frames from variants', () => {
    const g = findGroups([
      { name: 'a_walk_10', pack: 'p', en: 'frame 10' }, { name: 'a_walk_2', pack: 'p', en: 'frame 2' },
      { name: 'b_1', pack: 'p', en: 'red' }, { name: 'b_2', pack: 'p', en: 'blue' }, { name: 'c_1', pack: 'p', en: 'x' }, { name: 'c', pack: 'p' },
    ]);
    expect(g).toEqual([
      { name: 'a_walk', pack: 'p', kind: 'animation', frames: ['a_walk_2', 'a_walk_10'] },
      { name: 'b', pack: 'p', kind: 'series', frames: ['b_1', 'b_2'] },
    ]);
  });
});
