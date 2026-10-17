// Comparison with real Python: every program in packages/core/test/cases/*.py must produce exactly the
// output in our VM that CPython produced (*.out). New cases: create the file, `python3 -I -W ignore x.py > x.out`.
// If python3 is installed, it is additionally checked that the .out files still match CPython.
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
        expect(out, f).toBe(readFileSync(join(dir, f.replace(/\.py$/, '.out')), 'utf8'));
      } finally { rmSync(work, { recursive: true, force: true }); }
    }
  });
});
