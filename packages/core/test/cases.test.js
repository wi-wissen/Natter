// Comparison with real Python: every program in packages/core/test/cases/*.py must produce exactly the
// output in our VM that CPython produced (*.out). New cases: create the file, `python3 x.py > x.out`.
// If python3 is installed, it is additionally checked that the .out files still match CPython.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runToEnd } from '../src/index.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'cases');
const cases = readdirSync(dir).filter((f) => f.endsWith('.py')).sort();

let python = null;
try { execFileSync('python3', ['--version']); python = 'python3'; } catch { /* without Python only against .out */ }

describe('Python subset matches CPython', () => {
  for (const f of cases) {
    it(f, () => {
      const src = readFileSync(join(dir, f), 'utf8');
      const expected = readFileSync(join(dir, f.replace(/\.py$/, '.out')), 'utf8');
      const r = runToEnd(src);
      expect(r.error).toBeNull();
      expect(r.output).toBe(expected);
    });
  }

  it.skipIf(!python)('.out files match CPython', () => {
    for (const f of cases) {
      const out = execFileSync(python, [join(dir, f)], { encoding: 'utf8' });
      expect(out, f).toBe(readFileSync(join(dir, f.replace(/\.py$/, '.out')), 'utf8'));
    }
  });
});
