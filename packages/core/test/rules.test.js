// Determinism rules for the core: no function whose result may differ between browsers, no clock, no unseeded random.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const FORBIDDEN = /\bMath\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|exp|expm1|log|log2|log10|log1p|pow|hypot|cbrt|random)\b|\bDate\b|\bperformance\.now\b/;

describe('core stays deterministic', () => {
  for (const f of readdirSync(src).filter((n) => n.endsWith('.js'))) {
    it(f, () => {
      const lines = readFileSync(join(src, f), 'utf8').split('\n');
      const hits = lines.map((l, i) => [i + 1, l]).filter(([, l]) => !/^\s*(\/\/|\/\*|\*)/.test(l) && FORBIDDEN.test(l));
      expect(hits).toEqual([]);
    });
  }
});
