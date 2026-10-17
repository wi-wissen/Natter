// matplotlib.pyplot subset: the layout facts in test/data/plot-golden.json (made with real matplotlib by
// scripts/gen-plot-golden.py) – axes boxes, view limits, visible ticks and their labels, offset texts, colours and
// the legend box – must come out the same in Natter. Runs without matplotlib.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runToEnd, VM, compile, renderOpenFigures } from '../src/index.js';

const data = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'data', 'plot-golden.json'), 'utf8'));

/** Differences between Natter's summary and matplotlib's (numbers: boxes ±0.6 px, everything else 1e-9 relative). */
function diff(path, a, b, out) {
  if (Array.isArray(b)) {
    if (!Array.isArray(a) || a.length !== b.length) { out.push(`${path}: natter ${JSON.stringify(a)} matplotlib ${JSON.stringify(b)}`); return; }
    b.forEach((x, i) => diff(`${path}[${i}]`, a[i], x, out));
  } else if (b && typeof b === 'object') {
    for (const k of Object.keys(b)) diff(`${path}.${k}`, a?.[k], b[k], out);
  } else if (typeof b === 'number') {
    const tol = /box|legend/.test(path) ? 0.6 : 1e-9 * Math.max(1, Math.abs(b));
    if (typeof a !== 'number' || Math.abs(a - b) > tol) out.push(`${path}: natter ${a} matplotlib ${b}`);
  } else if (a !== b) out.push(`${path}: natter ${JSON.stringify(a)} matplotlib ${JSON.stringify(b)}`);
}

describe(`pyplot layout matches matplotlib ${data.meta.matplotlib}`, () => {
  for (const c of data.cases) {
    it(c.name, () => {
      const r = runToEnd(`import numpy as np\nimport matplotlib.pyplot as plt\n${c.src}import _plot\nprint(_plot.summary())\n`, { budget: 1e9 });
      expect(r.error).toBeNull();
      const got = JSON.parse(r.output.trim().split('\n').pop());
      const out = [];
      diff('', got, c.figures, out);
      expect(out).toEqual([]);
    });
  }
});

describe('pyplot in Natter', () => {
  const prog = 'import matplotlib.pyplot as plt\nplt.plot([1, 2, 3], [1, 4, 9], label="a")\nplt.legend()\nplt.title("T")\nplt.show()\nprint("after")\n';

  it('plt.show() hands an SVG to the host and the program goes on', () => {
    const r = runToEnd(prog);
    expect(r.error).toBeNull();
    expect(r.output).toBe('after\n');
    expect(r.plots).toHaveLength(1);
    const p = r.plots[0];
    expect(p.kind).toBe('plot');
    expect([p.width, p.height]).toEqual([640, 480]);
    expect(p.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"')).toBe(true);
    expect(p.svg.endsWith('</svg>')).toBe(true);
    expect(p.svg).toContain('>T</text>');
  });

  it('the program waits with task.wait.kind "plot" until the host resumes it', () => {
    const vm = new VM(compile(prog), { host: { print() {} } });
    const task = vm.start();
    const r = vm.run(task, 1e8);
    expect(r.status).toBe('waiting');
    expect(task.wait.kind).toBe('plot');
    expect(task.wait.svg).toMatch(/^<svg/);
    vm.resume(task, null);
    expect(vm.run(task, 1e8).status).toBe('done');
  });

  it('is deterministic: the same program gives the same SVG bytes', () => {
    const a = runToEnd('import numpy as np\nimport matplotlib.pyplot as plt\nnp.random.seed(1)\nplt.hist(np.random.randn(200))\nplt.show()').plots[0].svg;
    const b = runToEnd('import numpy as np\nimport matplotlib.pyplot as plt\nnp.random.seed(1)\nplt.hist(np.random.randn(200))\nplt.show()').plots[0].svg;
    expect(a).toBe(b);
  });

  it('import forms, several figures, subplots grid indexing, savefig', () => {
    const r = runToEnd([
      'from matplotlib import pyplot as plt',
      'import matplotlib',
      'fig, axs = plt.subplots(2, 3, figsize=(9, 5))',
      'axs[1, 2].plot([1, 2])',
      'for ax in axs.flat:',
      '    ax.set_title("t")',
      'print(axs.shape, len(axs), len(fig.axes))',
      'plt.figure()',
      'plt.plot([0, 1])',
      'plt.savefig("bild.png")',
      'plt.show()',
      'plt.show()',
    ].join('\n'));
    expect(r.error).toBeNull();
    expect(r.output).toBe('(2, 3) 2 6\n');
    expect(r.plots.map((p) => [p.width, p.height, p.file ?? null])).toEqual([[640, 480, 'bild.png'], [900, 500, null], [640, 480, null]]);
  });

  it('figures left open can be rendered by the host at the end', () => {
    const r = runToEnd('import matplotlib.pyplot as plt\nplt.bar(["a", "b"], [1, 2])');
    expect(r.plots).toEqual([]);
    const open = renderOpenFigures(r.vm);
    expect(open).toHaveLength(1);
    expect(open[0].svg).toContain('<rect');
  });

  it('get_xticks and get_xlim give matplotlib values; hist returns counts and edges', () => {
    const r = runToEnd('import matplotlib.pyplot as plt\nplt.plot([0, 10], [0, 1])\nprint(plt.xlim(), list(plt.gca().get_xticks()))\nn, bins, p = plt.hist([1, 2, 2, 3])\nprint(n[:3], bins[:2])');
    expect(r.error).toBeNull();
    expect(r.output).toBe('(-0.5, 10.5) [-2.0, 0.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0]\n[1. 0. 0.] [1.  1.2]\n');
  });

  it('errors for the usual mistakes', () => {
    const r = runToEnd('import matplotlib.pyplot as plt\nplt.plot([1, 2, 3], [1, 2])');
    expect(r.error.kind).toBe('ValueError');
    expect(r.error.params.message).toBe('x and y must have same first dimension, but have shapes (3,) and (2,)');
    const c = runToEnd('import matplotlib.pyplot as plt\nplt.plot([1, 2], [1, 2], color="blau")');
    expect(c.error.kind).toBe('ValueError');
    const f = runToEnd('import matplotlib.pyplot as plt\nplt.plot([1, 2], "q")');
    expect(f.error.kind).toBe('ValueError');
  });
});
