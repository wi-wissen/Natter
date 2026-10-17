// guizero against the real library: the programs in data/guizero/*.py print getters, warnings, errors and the order of
// callbacks; *.out is what guizero 1.6 printed on CPython (scripts/gen-guizero-golden.sh, needs tkinter and Xvfb).
// Here they run headless: timers fire on the virtual clock, user events come from guisim.sim().

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runToEnd } from '../src/index.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'data', 'guizero');
const sim = readFileSync(join(dir, 'guisim.py'), 'utf8');
const programs = readdirSync(dir).filter((f) => f.endsWith('.py') && f !== 'guisim.py').sort();

describe('guizero matches guizero 1.6 on CPython', () => {
  for (const f of programs) {
    it(f, () => {
      const r = runToEnd(readFileSync(join(dir, f), 'utf8'), { budget: 5e8, host: { readModule: (n) => (n === 'guisim' ? sim : null) } });
      expect(r.error).toBeNull();
      expect(r.output).toBe(readFileSync(join(dir, f.replace(/\.py$/, '.out')), 'utf8'));
    });
  }
});
