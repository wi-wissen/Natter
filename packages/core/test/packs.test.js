import { describe, it, expect } from 'vitest';
import { PYMODULES } from '../src/pymodules.js';
import { PACKS, packsFor, packOf, loadPyModules, runToEnd } from '../src/browser.js';

describe('loading modules on demand', () => {
  it('finds the packs a program needs', () => {
    expect(packsFor('import re\nimport numpy as np\nx = 1\n').sort()).toEqual(['numpy', 'stdlib']);
    expect(packsFor('from matplotlib import pyplot as plt\n')).toEqual(expect.arrayContaining(['pyplot', 'numpy']));
    expect(packsFor('import numpy.random\nimport os.path\n').sort()).toEqual(['numpy', 'stdlib']);
    expect(packsFor('def f():\n    import guizero\n')).toEqual(expect.arrayContaining(['guizero']));
    expect(packsFor('with open("a.txt") as f:\n    pass\n')).toEqual(['stdlib']);
    expect(packsFor('print("import re")\n')).toEqual([]);
    expect(packsFor('x = 1\n', { pgzero: true })).toEqual(['pgzero']);
    expect(packOf('numpy.linalg')).toBe('numpy');
    expect(packOf('nothing')).toBeUndefined();
  });

  it('a module is not there until its pack is loaded, then it works', async () => {
    expect(Object.keys(PYMODULES)).toEqual([]);
    const src = 'import datetime\nprint(datetime.date(2024, 2, 29).weekday())\n';
    expect(runToEnd(src).error?.kind).toBe('ModuleNotFoundError');
    await loadPyModules(src);
    expect(runToEnd(src).output).toBe('3\n');
    expect(PYMODULES.numpy).toBeUndefined();
  });

  it('loading a pack also loads the packs its modules import', async () => {
    const { loadPacks } = await import('../src/browser.js');
    await loadPacks(['guizero']);
    expect(PYMODULES.os).toBeDefined();
    expect(PYMODULES.guizero).toBeDefined();
  });

  it('the table of the packs matches what they register', async () => {
    const { loadPacks } = await import('../src/browser.js');
    await loadPacks(Object.keys(PACKS));
    const all = Object.values(PACKS).flat().sort();
    expect(Object.keys(PYMODULES).sort()).toEqual(all);
    const r = runToEnd('import numpy as np\nimport matplotlib.pyplot as plt\nprint(np.arange(3).sum())\n');
    expect(r.output).toBe('3\n');
  });
});
