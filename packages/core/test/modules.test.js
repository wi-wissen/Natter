// Modules: a namespace of their own for every module written in Python (standard modules, files of a project).

import { describe, it, expect } from 'vitest';
import { compile, VM, scriptErrorText, formatTraceback, runToEnd } from '../src/index.js';

/** Run a program whose imports are served from `files` (name → source). */
function run(src, files = {}) {
  let output = '';
  const vm = new VM(compile(src), { host: { print: (t) => { output += t; }, readModule: (n) => files[n] ?? null } });
  const task = vm.start();
  vm.run(task, 1_000_000);
  return { output, error: task.state === 'error' ? task.error : null, vm };
}

describe('importing modules written in Python', () => {
  const files = {
    helpers: 'NAME = "helpers"\ncounter = 0\ndef bump():\n    global counter\n    counter += 1\n    return counter\nclass Box:\n    def __init__(self, v):\n        self.v = v\n    def show(self):\n        return NAME + ":" + str(self.v)\nprint("loading", __name__)',
    other: 'import helpers\ndef twice():\n    return helpers.bump() + helpers.bump()',
    broken: 'x = 1 / 0',
  };

  it('runs the module once and keeps its names apart from the program', () => {
    const r = run('import helpers\nimport helpers as h2\nNAME = "main"\nprint(helpers.NAME, NAME, h2 is helpers, __name__)', files);
    expect(r.error).toBeNull();
    expect(r.output).toBe('loading helpers\nhelpers main True __main__\n');
  });

  it('functions use the globals of their own module', () => {
    const r = run('from helpers import bump, Box\nbump()\nprint(bump(), Box(5).show())', files);
    expect(r.output).toBe('loading helpers\n2 helpers:5\n');
  });

  it('modules can import modules', () => {
    expect(run('import other\nprint(other.twice())', files).output).toBe('loading helpers\n3\n');
  });

  it('from module import * brings in the public names', () => {
    expect(run('from helpers import *\nprint(NAME, bump())', files).output).toBe('loading helpers\nhelpers 1\n');
  });

  it('an unknown module is a ModuleNotFoundError', () => {
    expect(run('import nothing', files).error).toMatchObject({ kind: 'ModuleNotFoundError', params: { name: 'nothing' } });
  });

  it('an error while a module runs reaches the importer, and the module can be imported again after fixing', () => {
    const r = run('try:\n    import broken\nexcept ZeroDivisionError:\n    print("failed")\ntry:\n    import broken\nexcept ZeroDivisionError:\n    print("failed again")', files);
    expect(r.output).toBe('failed\nfailed again\n');
  });

  it('a module name without import is a NameError that points at the missing import', () => {
    const r = run('print(math.sqrt(4))');
    expect(r.error).toMatchObject({ kind: 'NameError', params: { name: 'math', what: 'import' } });
    expect(scriptErrorText(r.error, { lang: 'en' }).text).toContain('Is “import math” missing');
  });
});

describe('files: code objects, errors and breakpoints know where code comes from', () => {
  /** Project as path → text; readModule answers like a host with { source, file, package }. */
  const project = {
    'tools.py': 'def half(x):\n    return x / 0\n',
    'pkg/__init__.py': 'from .inner import VALUE\n',
    'pkg/inner.py': 'from .. import nothing\n',
  };
  const host = (out) => ({
    print: (t) => { out.text += t; },
    readModule: (name, ctx) => {
      out.asked.push([name, ctx.from]);
      const base = name.split('.').join('/');
      if (project[`${base}.py`] !== undefined) return { source: project[`${base}.py`], file: `${base}.py` };
      if (project[`${base}/__init__.py`] !== undefined) return { source: project[`${base}/__init__.py`], file: `${base}/__init__.py`, package: true };
      return null;
    },
  });
  const runIn = (src, file = 'main.py') => {
    const out = { text: '', asked: [] };
    const vm = new VM(compile(src, { file }), { host: host(out) });
    const task = vm.start();
    vm.run(task, 1_000_000);
    return { out, vm, task, error: task.state === 'error' ? task.error : null };
  };

  it('every code object carries its file, the host learns the importing file', () => {
    const { vm, out } = runIn('import tools\n', 'app/main.py');
    expect(vm.codes.map((c) => c.file)).toEqual(['app/main.py', 'tools.py', 'tools.py']);
    expect(out.asked).toEqual([['tools', 'app/main.py']]);
    expect(vm.moduleCache.get('tools').ns.get('__file__')).toBe('tools.py');
  });

  it('a runtime error in a module names its file; the traceback goes through the import', () => {
    const { error } = runIn('import tools\n\ntools.half(3)\n');
    expect(error).toMatchObject({ kind: 'ZeroDivisionError', file: 'tools.py', line: 2 });
    expect(error.traceback).toEqual([{ name: '<module>', line: 3, file: 'main.py' }, { name: 'half', line: 2, file: 'tools.py' }]);
    expect(scriptErrorText(error, { lang: 'en' }).title).toBe('ZeroDivisionError in tools.py, line 2');
    expect(scriptErrorText({ ...error, file: 'main.py' }, { lang: 'en' }).title).toBe('ZeroDivisionError in line 2');
  });

  it('relative imports resolve against the package; going above the top is an ImportError', () => {
    const { error, out } = runIn('import pkg\n');
    expect(out.asked.map((a) => a[0])).toEqual(['pkg', 'pkg.inner']);
    expect(error).toMatchObject({ kind: 'ImportError', code: 'err.script.importRelative', file: 'pkg/inner.py', line: 1 });
    expect(formatTraceback(error, { files: project, source: 'import pkg\n' })).toBe([
      'Traceback (most recent call last):',
      '  File "main.py", line 1, in <module>', '    import pkg',
      '  File "pkg/__init__.py", line 1, in <module>', '    from .inner import VALUE',
      '  File "pkg/inner.py", line 1, in <module>', '    from .. import nothing',
      'ImportError: attempted relative import with no known parent package',
    ].join('\n'));
  });

  it('an error inside a standard module written in Python points at the line of the program', () => {
    const r = runToEnd('import statistics\n\nstatistics.mean([])\n');
    expect(r.error).toMatchObject({ kind: 'StatisticsError', line: 3 });
    expect(r.error.traceback.at(-1)).toMatchObject({ name: 'mean', file: 'statistics.py', lib: true });
  });

  it('breakpoints per file: the same line number in another file does not stop', () => {
    const vm = new VM(compile('import tools\nx = 1\ny = tools.half\n', { file: 'main.py' }), { host: host({ text: '', asked: [] }) });
    const task = vm.start(null, { bps: [], files: { 'tools.py': [2] } });
    // line 2 of main.py runs, line 2 of tools.py is never reached: no stop
    vm.run(task, 1_000_000);
    expect(task.state).toBe('done');
    const vm2 = new VM(compile('import tools\nx = 1\ntools.half(1)\n', { file: 'main.py' }), { host: host({ text: '', asked: [] }) });
    const t2 = vm2.start(null, { bps: [], files: { 'tools.py': [2] } });
    vm2.run(t2, 1_000_000);
    expect(t2.state).toBe('paused');
    expect(vm2.placeOf(t2)).toEqual({ file: 'tools.py', line: 2 });
    expect(vm2.inspect(t2).frames.map((f) => [f.name, f.file, f.line])).toEqual([['<module>', 'main.py', 3], ['half', 'tools.py', 2]]);
  });
});
