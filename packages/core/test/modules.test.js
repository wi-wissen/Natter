// Modules: a namespace of their own for every module written in Python (standard modules, files of a project).

import { describe, it, expect } from 'vitest';
import { compile, VM, scriptErrorText } from '../src/index.js';

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
