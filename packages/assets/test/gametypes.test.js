import { describe, it, expect } from 'vitest';
import { buildCatalog, gametypeProblems } from '../assets.js';

describe('gametypes.json', () => {
  const catalog = buildCatalog();
  it('every type has 8 to 16 existing starter images from its packs, every pack has a type', () => {
    expect(catalog.gametypes.length).toBeGreaterThanOrEqual(10);
    expect(gametypeProblems(catalog)).toEqual([]);
  });
  it('the owner\'s picks: Kara with the blueberry, the duck of the book', () => {
    const book = catalog.gametypes.find((t) => t.id === 'book');
    expect(book.starter).toEqual(expect.arrayContaining(['ente', 'kueken', 'boot', 'kara', 'kara_blueberry', 'turtle']));
    expect(catalog.gametypes.find((t) => t.id === 'grid').packs).toEqual(expect.arrayContaining(['grid_action', 'grid_puzzle']));
  });
});

describe('gametypeProblems', () => {
  const base = {
    packs: [{ pack: 'a', kind: 'images' }, { pack: 'b', kind: 'images' }, { pack: 'sounds', kind: 'sounds' }],
    images: [{ name: 'x', pack: 'a' }, { name: 'y', pack: 'a' }, { name: 'z', pack: 'b' }],
  };
  const type = (o) => ({ id: 't', de: 'T', en: 'T', hint: { de: 'h', en: 'h' }, packs: ['a'], starter: ['x', 'y'], ...o });
  const check = (types) => gametypeProblems({ ...base, gametypes: types }, { min: 2, max: 3 });
  it('finds unknown names and packs, wrong sizes, names from other packs, uncovered packs', () => {
    expect(check([type(), type({ id: 'u', packs: ['b'], starter: ['z', 'z'] })])).toEqual(['u: a starter image twice']);
    expect(check([type({ starter: ['x', 'nope'] })])).toEqual(['t: unknown image nope', 'pack b belongs to no game type']);
    expect(check([type({ packs: ['a', 'b', 'c'], starter: ['x'] })])).toEqual(['t: unknown pack c', 't: 1 starter images (2 to 3)']);
    expect(check([type({ packs: ['b'], starter: ['x', 'z'] })])).toEqual(['t: x is in pack a, not in the packs of the type', 'pack a belongs to no game type']);
  });
});
