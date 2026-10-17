// numpy subset: the programs in test/data/numpy-golden.json (made with real numpy by scripts/gen-numpy-golden.py)
// must print the same in Natter. Natter returns Python numbers where numpy returns numpy scalars, so numpy's
// reprs np.float64(x), np.int64(x), np.True_ are compared as x, True. Cases marked `approx` (LAPACK, BLAS) compare
// numbers with a relative tolerance. Runs without numpy installed.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runToEnd, scriptErrorText } from '../src/index.js';
import { pyMessage } from '../src/pymessages.js';

const data = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'data', 'numpy-golden.json'), 'utf8'));

/** numpy scalar reprs → the Python numbers Natter returns. */
const normalize = (s) => s.replace(/np\.(?:float64|int64|bool|intp)\(([^()]*)\)/g, '$1').replace(/np\.True_/g, 'True').replace(/np\.False_/g, 'False');

function run(src) {
  const r = runToEnd(src, { budget: 1e9 });
  let out = r.output;
  if (r.error) out += `${r.error.kind}: ${pyMessage(r.error)}\n`;
  const warnings = [...new Set((r.errors.match(/RuntimeWarning: (.*)/g) ?? []).map((x) => x.slice('RuntimeWarning: '.length)))].sort();
  return { out, warnings, r };
}

/** Same text, numbers equal within a relative tolerance. */
function approxEqual(a, b, tol = 1e-9) {
  const num = /-?\d+\.?\d*(?:e[+-]?\d+)?/g;
  if (a.replace(num, '#').replace(/\s+/g, ' ') !== b.replace(num, '#').replace(/\s+/g, ' ')) return false;
  const x = a.match(num) ?? [], y = b.match(num) ?? [];
  return x.every((v, i) => Math.abs(Number(v) - Number(y[i])) <= tol * Math.max(1, Math.abs(Number(y[i]))));
}

describe(`numpy subset matches numpy ${data.meta.numpy}`, () => {
  for (const c of data.cases) {
    it(c.name, () => {
      const { out, warnings } = run(c.src);
      const want = normalize(c.out);
      if (c.approx) expect(approxEqual(out, want), `${out}\n---\n${want}`).toBe(true);
      else expect(out).toBe(want);
      expect(warnings).toEqual([...new Set(c.warnings)].sort());
    });
  }
});

describe('numpy in Natter', () => {
  const out = (src) => { const r = runToEnd(src, { budget: 1e9 }); if (r.error) throw new Error(JSON.stringify(r.error)); return r.output; };

  it('import forms: import numpy as np, submodules, from-imports', () => {
    expect(out('import numpy as np\nprint(np.arange(3))')).toBe('[0 1 2]\n');
    expect(out('import numpy\nprint(numpy.zeros(2))')).toBe('[0. 0.]\n');
    expect(out('import numpy.random as npr\nnpr.seed(1)\nprint(npr.randint(10))')).toBe('5\n');
    expect(out('import numpy.random\nnumpy.random.seed(1)\nprint(numpy.random.randint(10))')).toBe('5\n');
    expect(out('from numpy import array, mean\nprint(mean(array([1, 2])))')).toBe('1.5\n');
    expect(out('from numpy.random import seed, rand\nseed(0)\nprint(rand())')).toBe('0.5488135039273248\n');
    expect(out('from numpy import random\nrandom.seed(0)\nprint(random.rand())')).toBe('0.5488135039273248\n');
    expect(out('from numpy import *\nprint(sqrt(array([4.0])), pi)')).toBe('[2.] 3.141592653589793\n');
  });

  it('import a.b as c also works for os.path, and unknown submodules fail', () => {
    expect(out('import os.path\nprint(os.path.join("a", "b"))')).toBe('a/b\n');
    expect(out('import os.path as p\nprint(p.join("a", "b"))')).toBe('a/b\n');
    const r = runToEnd('import numpy.nothing');
    expect(r.error.kind).toBe('ModuleNotFoundError');
  });

  it('the @ operator and comparison results of classes', () => {
    expect(out('class M:\n    def __matmul__(self, o): return "mm"\n    def __lt__(self, o): return [1]\nprint(M() @ 1, M() < 2)')).toBe('mm [1]\n');
    const r = runToEnd('print(2 @ 3)');
    expect(r.error.kind).toBe('TypeError');
    expect(out('import numpy as np\na = np.eye(2)\na @= np.array([[1, 2], [3, 4]])\nprint(a)')).toBe('[[1. 2.]\n [3. 4.]]\n');
  });

  it('friendly errors in German and English', () => {
    const r = runToEnd('import numpy as np\na = np.array([1, 2, 3])\nb = a + np.array([1, 2])');
    expect(r.error.kind).toBe('ValueError');
    expect(r.error.line).toBe(3);
    expect(scriptErrorText(r.error, { lang: 'de' }).text).toMatch(/^Die Formen der Arrays passen nicht zusammen \(operands could not be broadcast together with shapes \(3,\) \(2,\)\)/);
    expect(scriptErrorText(r.error, { lang: 'en' }).text).toMatch(/^The shapes of the arrays do not fit together/);
    const t = runToEnd('import numpy as np\na = np.arange(5)\nif a > 2:\n    pass');
    expect(scriptErrorText(t.error, { lang: 'de' }).text).toMatch(/a\.any\(\)/);
    const s = runToEnd('import numpy as np\ntry:\n    np.array([1, 2]) + "x"\nexcept TypeError as e:\n    print(type(e).__name__)');
    expect(s.output).toBe('UFuncTypeError\n');
    const n = runToEnd('import numpy as np\nnp.array([1, None])');
    expect(scriptErrorText(n.error, { lang: 'en' }).text).toBe('In Natter, numpy only works with numbers (int, float, bool), not with NoneType.');
    const e = runToEnd('import numpy as np\ntry:\n    np.arange(3).sum(axis=2)\nexcept IndexError as x:\n    print("caught", x)');
    expect(e.output).toBe('caught axis 2 is out of bounds for array of dimension 1\n');
  });

  it('warnings go to stderr once per line, with the line of the program', () => {
    const r = runToEnd('import numpy as np\nfor i in range(3):\n    x = np.array([1.0]) / 0\ny = np.log(np.array([0.0]))');
    expect(r.errors).toBe('line 3: RuntimeWarning: divide by zero encountered in divide\nline 4: RuntimeWarning: divide by zero encountered in log\n');
  });

  it('unseeded random numbers follow the seed of the VM', () => {
    const a = runToEnd('import numpy as np\nprint(np.random.rand(), np.random.default_rng().random())', { seed: 5 }).output;
    const b = runToEnd('import numpy as np\nprint(np.random.rand(), np.random.default_rng().random())', { seed: 5 }).output;
    const c = runToEnd('import numpy as np\nprint(np.random.rand(), np.random.default_rng().random())', { seed: 6 }).output;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('views share data, copies do not', () => {
    expect(out('import numpy as np\na = np.arange(6).reshape(2, 3)\nr = a[1]\nr[0] = 99\nt = a.T\nt[0, 0] = -1\nc = a.copy()\nc[:] = 0\nprint(a)')).toBe('[[-1  1  2]\n [99  4  5]]\n');
  });

  it('is fast enough: arange/sum of a million elements', () => {
    const t0 = performance.now();
    expect(out('import numpy as np\na = np.arange(1000000)\nprint(a.sum(), (a * 0.5).mean(), np.sqrt(a).max())')).toBe('499999500000 249999.75 999.999499999875\n');
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
