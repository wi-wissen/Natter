import { describe, it, expect } from 'vitest';
import { ROOT, NAME_RE, MAX_FILE, MAX_PACK, MAX_PNG, MAX_PNG_PACK, pngInfo, packDirs, readPack, svgProblems, svgSize, fileSize, join, readdirSync, readFileSync, existsSync } from '../assets.js';

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
      const png = pack.format === 'png';
      const files = readdirSync(join(ROOT, dir)).filter((f) => f.endsWith(png ? '.png' : '.svg'));

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
        expect(files.reduce((n, f) => n + fileSize(join(ROOT, dir, f)), 0)).toBeLessThanOrEqual(png ? MAX_PNG_PACK : MAX_PACK);
      });
      for (const a of pack.assets) {
        it(`${a.name}: entry and svg are valid`, () => {
          expect(a.name, 'name').toMatch(NAME_RE);
          expect(a.file).toBe(`${a.name}.${png ? 'png' : 'svg'}`);
          expect(a.de, 'de').toBeTruthy();
          expect(a.en, 'en').toBeTruthy();
          expect(Array.isArray(a.tags)).toBe(true);
          const p = join(ROOT, dir, a.file);
          expect(existsSync(p)).toBe(true);
          if (png) {
            expect(fileSize(p)).toBeLessThanOrEqual(MAX_PNG);
            const info = pngInfo(readFileSync(p));
            expect(info, 'a PNG file').not.toBeNull();
            expect(info.width).toBeGreaterThan(0);
            expect(Math.max(info.width, info.height)).toBeLessThanOrEqual(1024);
            // everything except backgrounds has transparent surroundings
            if (!a.tags.includes('background')) expect(info.hasAlpha, 'alpha channel').toBe(true);
          } else {
            expect(fileSize(p)).toBeLessThanOrEqual(MAX_FILE);
            const text = readFileSync(p, 'utf8');
            expect(svgProblems(text, { animated: !!a.animated })).toEqual([]);
            const [w, h] = svgSize(text);
            expect(w).toBeGreaterThan(0);
            expect(h).toBeGreaterThan(0);
            expect(w * h).toBeLessThanOrEqual(800 * 600);
          }
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

describe('sounds', () => {
  const dir = join(ROOT, 'sounds');
  const list = JSON.parse(readFileSync(join(dir, 'sounds.json'), 'utf8'));
  it('every wav is listed and every entry exists', () => {
    expect(list.sounds.map((s) => s.file).sort()).toEqual(readdirSync(dir).filter((f) => f.endsWith('.wav')).sort());
  });
  it('the book sound exists', () => expect(list.sounds.some((s) => s.name === 'platsch')).toBe(true));
  for (const s of list.sounds) {
    it(`${s.name}: mono 16 bit wav, short, described`, () => {
      expect(s.name).toMatch(NAME_RE);
      expect(s.de && s.en).toBeTruthy();
      const b = readFileSync(join(dir, s.file));
      expect(b.toString('latin1', 0, 4)).toBe('RIFF');
      expect(b.toString('latin1', 8, 12)).toBe('WAVE');
      expect(b.readUInt16LE(22)).toBe(1); // channels
      expect(b.readUInt16LE(34)).toBe(16); // bits
      expect(b.length).toBeLessThan(64 * 1024);
      expect(b.length).toBeGreaterThan(1000);
    });
  }
});
