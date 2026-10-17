import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runToEnd, formatTraceback } from '../src/index.js';

const PROGRAMS = [
  'def f(x):\n    return x + y\nf(1)\n',
  'x = [1, 2, 3]\nprint(x[5])\n',
  'def a():\n    b()\ndef b():\n    c()\ndef c():\n    return 1 / 0\na()\n',
  'class A:\n    def m(self):\n        raise ValueError("kaputt")\nA().m()\n',
  'print("hi")\nint("abc")\n',
  'd = {"a": 1}\nd["b"]\n',
  'raise RuntimeError\n',
  'import math\nmath.sqrt(-1)\n',
];

let python = null;
try { execFileSync('python3', ['--version']); python = 'python3'; } catch { /* without Python only the shape is checked */ }

describe('formatTraceback', () => {
  it('prints the call stack, the source lines and the Python message', () => {
    const src = 'def f(x):\n    return x + y\nf(1)\n';
    const r = runToEnd(src);
    expect(formatTraceback(r.error, { source: src })).toBe([
      'Traceback (most recent call last):',
      '  File "main.py", line 3, in <module>', '    f(1)',
      '  File "main.py", line 2, in f', '    return x + y',
      "NameError: name 'y' is not defined",
    ].join('\n'));
  });
  it.skipIf(!python)('matches CPython (apart from the caret lines)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'natter-tb-'));
    try {
      for (const src of PROGRAMS) {
        const file = join(dir, 'main.py');
        writeFileSync(file, src);
        let err = '';
        try { execFileSync(python, ['-I', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { err = e.stderr; }
        const want = err.replace(new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), 'main.py').split('\n').filter((l) => !/^\s*[~^]+\s*$/.test(l)).join('\n').trim();
        const r = runToEnd(src);
        expect(formatTraceback(r.error, { source: src }), src).toBe(want);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
