import { describe, it, expect } from 'vitest';
import { ROOT, NAME_RE, MAX_FILE, MAX_PACK, packDirs, readPack, svgProblems, svgSize, fileSize, join, readdirSync, readFileSync, existsSync } from '../assets.js';

describe('svgProblems', () => {
  const ok = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8"><rect width="8" height="8"/></svg>';
  it('accepts a plain svg', () => expect(svgProblems(ok)).toEqual([]));
  it('rejects scripts, images, text, external urls, animation', () => {
    expect(svgProblems(ok.replace('<rect', '<script>x</script><rect'))).toContain('forbidden element <script>');
    expect(svgProblems(ok.replace('<rect', '<image href="a.png"/><rect')).length).toBeGreaterThan(0);
    expect(svgProblems(ok.replace('<rect', '<text>a</text><rect'))).toContain('<text> must be converted to paths');
    expect(svgProblems(ok.replace('<rect', '<style>@import url(https://x.y/a.css);</style><rect'))).toContain('external url');
    expect(svgProblems(ok.replace('<rect width="8" height="8"/>', '<rect><animate attributeName="x"/></rect>'))).toContain('animation is not allowed');
    expect(svgProblems(ok, { animated: true })).toEqual([]);
  });
  it('rejects broken structure and sizes', () => {
    expect(svgProblems(ok.replace('</svg>', ''))).toContain('unclosed <svg>');
    expect(svgProblems(ok.replace('width="8" height="8" ', ''))).toContain('width and height must be integers');
    expect(svgProblems(ok.replace('viewBox="0 0 8 8"', 'viewBox="0 0 9 8"'))).toContain('viewBox does not match width/height');
  });
});

const dirs = packDirs();
const allNames = new Map();

describe('asset packs', () => {
  it('there is at least one pack', () => expect(dirs.length).toBeGreaterThan(0));

  for (const dir of dirs) {
    describe(dir, () => {
      const pack = readPack(dir);
      const files = readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.svg'));

      it('pack.json is complete', () => {
        expect(pack.pack).toBe(dir);
        expect(pack.title?.de).toBeTruthy();
        expect(pack.title?.en).toBeTruthy();
        expect(pack.assets.length).toBeGreaterThan(0);
      });
      it('every svg is listed and every entry exists', () => {
        expect(pack.assets.map((a) => a.file).sort()).toEqual(files.sort());
      });
      it('pack size is within the limit', () => {
        expect(files.reduce((n, f) => n + fileSize(join(ROOT, dir, f)), 0)).toBeLessThanOrEqual(MAX_PACK);
      });
      for (const a of pack.assets) {
        it(`${a.name}: entry and svg are valid`, () => {
          expect(a.name, 'name').toMatch(NAME_RE);
          expect(a.file).toBe(`${a.name}.svg`);
          expect(a.de, 'de').toBeTruthy();
          expect(a.en, 'en').toBeTruthy();
          expect(Array.isArray(a.tags)).toBe(true);
          const p = join(ROOT, dir, a.file);
          expect(existsSync(p)).toBe(true);
          expect(fileSize(p)).toBeLessThanOrEqual(MAX_FILE);
          const text = readFileSync(p, 'utf8');
          expect(svgProblems(text, { animated: !!a.animated })).toEqual([]);
          const [w, h] = svgSize(text);
          expect(w).toBeGreaterThan(0);
          expect(h).toBeGreaterThan(0);
          expect(w * h).toBeLessThanOrEqual(800 * 600);
          if (allNames.has(a.name)) throw new Error(`name ${a.name} is in ${allNames.get(a.name)} and ${dir}`);
          allNames.set(a.name, dir);
        });
      }
    });
  }
});

describe('book assets', () => {
  it('the three images of the book exist under their German names', () => {
    const names = new Set();
    for (const d of dirs) for (const a of readPack(d).assets) names.add(a.name);
    // checked as soon as the book pack exists
    if (dirs.includes('book')) for (const n of ['ente', 'kueken', 'boot']) expect(names.has(n), n).toBe(true);
  });
  it('the boat is 120 px wide as the book says', () => {
    if (!dirs.includes('book')) return;
    const a = readPack('book').assets.find((x) => x.name === 'boot');
    expect(svgSize(readFileSync(join(ROOT, 'book', a.file), 'utf8'))[0]).toBe(120);
  });
});
