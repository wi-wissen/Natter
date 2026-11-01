// Comparison with real Python: every program in packages/core/test/cases/*.py must produce exactly the
// output in our VM that CPython produced (*.out). New cases: create the file, `python3 -I -W ignore x.py > x.out`.
// If python3 is installed, it is additionally checked that the .out files still match CPython (a float may differ in
// its last place there: CPython's math functions come from the C library of the machine, see sameOutput).
// Cases whose first line is `# needs: pygame` use Pygame Zero: Natter runs them with the test host of pgzHost.js (and,
// with an x.frames file, frame by frame); CPython only checks them with a Python that has pgzero and pygame
// (NATTER_PGZ_PYTHON or python3). Their .out files come from scripts/gen-pgzero-golden.py.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runToEnd } from '../src/index.js';
import { runPgz, runFrames } from './pgzHost.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'cases');
const cases = readdirSync(dir).filter((f) => f.endsWith('.py')).sort();

/** Lines for input(): a file x.in next to x.py (also piped to CPython). */
const inputFile = (f) => { const p = join(dir, f.replace(/\.py$/, '.in')); return existsSync(p) ? readFileSync(p, 'utf8') : null; };
const inputsOf = (f) => { const t = inputFile(f); return t === null ? [] : t.replace(/\n$/, '').split('\n'); };

let python = null;
try { execFileSync('python3', ['--version']); python = 'python3'; } catch { /* without Python only against .out */ }

const needsPygame = (src) => src.startsWith('# needs: pygame');
const framesOf = (f) => { const p = join(dir, f.replace(/\.py$/, '.frames')); return existsSync(p) ? p : null; };
let pgzPython = process.env.NATTER_PGZ_PYTHON ?? null;
if (!pgzPython && python) {
  try { execFileSync(python, ['-c', 'import pgzero, pygame'], { stdio: 'ignore' }); pgzPython = python; } catch { /* no pgzero */ }
}
const PGZ_ENV = { ...process.env, SDL_VIDEODRIVER: 'dummy', SDL_AUDIODRIVER: 'dummy', PYGAME_HIDE_SUPPORT_PROMPT: '1' };
const FRAMES_SCRIPT = join(dir, '..', '..', '..', '..', 'scripts', 'pgzero-frames.py');

/** The 64-bit pattern of a float as a BigInt (neighbouring floats of one sign differ by 1). */
function floatBits(x) {
  const v = new DataView(new ArrayBuffer(8));
  v.setFloat64(0, x);
  return v.getBigInt64(0);
}

const NUMBER = /-?(?:\d+\.\d*|\.\d+|\d+)(?:e[-+]?\d+)?/g;

/**
 * Output of CPython compared with a .out file: equal, except that a float may differ in the last place (one unit,
 * the next float). The .out files keep what CPython 3.12 printed; the math functions of CPython come from the C
 * library of the machine, which may round acosh, atanh … one place differently (glibc of a newer runner).
 * Natter itself is still compared exactly (its own fdlibm).
 */
function sameOutput(got, want) {
  if (got === want) return true;
  const a = got.match(NUMBER) ?? [], b = want.match(NUMBER) ?? [];
  if (a.length !== b.length || got.replace(NUMBER, '#') !== want.replace(NUMBER, '#')) return false;
  return a.every((x, i) => {
    if (x === b[i]) return true;
    if (!/[.e]/.test(x) || !/[.e]/.test(b[i])) return false; // ints must be equal
    const d = floatBits(Number(x)) - floatBits(Number(b[i]));
    return d === 1n || d === -1n;
  });
}

/** Output of a case in our VM. */
function runCase(f, src) {
  if (!needsPygame(src)) return runToEnd(src, { inputs: inputsOf(f) });
  const frames = framesOf(f);
  return frames ? runFrames(src, JSON.parse(readFileSync(frames, 'utf8'))) : runPgz(src);
}

describe('Python subset matches CPython', () => {
  for (const f of cases) {
    it(f, () => {
      const src = readFileSync(join(dir, f), 'utf8');
      const expected = readFileSync(join(dir, f.replace(/\.py$/, '.out')), 'utf8');
      const r = runCase(f, src);
      expect(r.error).toBeNull();
      expect(r.output).toBe(expected);
    });
  }

  it('CPython comparison: a float may differ in its last place, nothing else', () => {
    expect(sameOutput('0.5493061443340549 x\n', '0.5493061443340548 x\n')).toBe(true);
    expect(sameOutput('1.3169578969248168', '1.3169578969248166')).toBe(true); // 1 ulp: …166 and …168 are neighbours
    expect(sameOutput('0.5493061443340547', '0.5493061443340549')).toBe(false); // 2 ulp
    expect(sameOutput('1.0 2', '1.0 3')).toBe(false);
    expect(sameOutput('1.0 a', '1.0 b')).toBe(false);
    expect(sameOutput('-0.5', '0.5')).toBe(false);
  });

  it.skipIf(!python)('.out files match CPython', () => {
    for (const f of cases) {
      const pygame = needsPygame(readFileSync(join(dir, f), 'utf8'));
      if (pygame && !pgzPython) continue;
      const frames = framesOf(f);
      const args = frames ? ['-I', '-W', 'ignore', FRAMES_SCRIPT, join(dir, f), frames] : ['-I', '-W', 'ignore', join(dir, f)];
      // in an empty folder of its own: programs that write files must not litter the repository
      const work = mkdtempSync(join(tmpdir(), 'natter-case-'));
      try {
        const out = execFileSync(pygame ? pgzPython : python, args, { encoding: 'utf8', input: inputFile(f) ?? '', cwd: work, env: pygame ? PGZ_ENV : process.env });
        const want = readFileSync(join(dir, f.replace(/\.py$/, '.out')), 'utf8');
        if (!sameOutput(out, want)) expect(out, f).toBe(want);
      } finally { rmSync(work, { recursive: true, force: true }); }
    }
  });
});
