// Language core: error messages, debugger, waiting, budget, saving mid-run, determinism.

import { describe, it, expect } from 'vitest';
import {
  compile, runToEnd, VM, Suspend, highlightRanges, PyBuiltin, PyHost, sourceHash,
} from '../src/index.js';

/** VM with output buffer and a waiting function wait(n) (host counts ticks). */
function makeVm(src, extra = {}) {
  const out = [];
  const known = ['wait', ...(extra.known ?? [])];
  const prog = compile(src, { known });
  const opts = {
    host: { print: (t) => out.push(t), ...(extra.host ?? {}) },
    natives: { wait: (ctx, args) => new Suspend({ kind: 'ticks', n: args[0] }), ...(extra.natives ?? {}) },
    globals: { wait: new PyBuiltin('wait'), ...(extra.globals ?? {}) },
    seed: 7,
  };
  const vm = new VM(prog, opts);
  return { vm, out, prog, opts };
}

const errOf = (src) => runToEnd(src).error;

describe('Error messages', () => {
  it('an unknown name is an error when its line runs, with a suggestion', () => {
    const e = errOf('wood = 5\nprint(wod)');
    expect(e.code).toBe('err.script.nameUnbound');
    expect(e.kind).toBe('NameError');
    expect(e.params).toMatchObject({ name: 'wod', suggestion: 'wood' });
    expect(e.line).toBe(2);
    expect(compile('wood = 5\nprint(wod)').warnings[0]).toMatchObject({ code: 'err.script.nameUnknown', params: { suggestion: 'wood' } });
    expect(() => compile('print(wod)', { strictNames: true })).toThrow();
  });

  it('an unknown name in a branch that does not run is no error', () => {
    expect(runToEnd('if False:\n    print(wod)\nprint(1)').output).toBe('1\n');
  });

  it('swapped letters are recognised', () => {
    expect(errOf('def turn_left():\n    pass\ntrun_left()').params.suggestion).toBe('turn_left');
  });

  it('syntax errors with line', () => {
    expect(errOf('if x == 1\n    pass')).toMatchObject({ code: 'err.script.expected', line: 1 });
    expect(errOf('x = (1, 2')).toMatchObject({ code: 'err.script.unclosed', line: 1 });
    expect(errOf('print("hello)')).toMatchObject({ code: 'err.script.unterminatedString' });
    expect(errOf('for i in range(3):\nprint(i)')).toMatchObject({ code: 'err.script.expectedIndent', kind: 'IndentationError', line: 2 });
    expect(errOf('x = 1\n  y = 2')).toMatchObject({ code: 'err.script.indent' });
    expect(errOf('if True:\n    a = 1\n  b = 2')).toMatchObject({ code: 'err.script.unindent', line: 3 });
    expect(errOf('if True:\n\tx = 1\n        y = 2')).toMatchObject({ kind: 'TabError' });
  });

  it('missing language features report themselves in a friendly way', () => {
    expect(errOf('class A(list):\n    pass')).toMatchObject({ code: 'err.script.notSupported', params: { feature: 'subclassBuiltin' } });
    expect(errOf('async def f():\n    pass')).toMatchObject({ params: { feature: 'async' } });
  });

  it('runtime errors with Python names and call stack', () => {
    const e = errOf('def f(x):\n    return 10 / x\nprint(f(2))\nprint(f(0))');
    expect(e).toMatchObject({ code: 'err.script.zeroDivision', kind: 'ZeroDivisionError', line: 2 });
    expect(e.traceback.map((t) => t.name)).toEqual(['<module>', 'f']);
    expect(e.traceback[0].line).toBe(4);
    expect(errOf('xs = [1]\nxs[3]')).toMatchObject({ kind: 'IndexError', line: 2 });
    expect(errOf('d = {}\nd["wood"]')).toMatchObject({ kind: 'KeyError', params: { key: "'wood'" } });
    expect(errOf('"a" + 1')).toMatchObject({ kind: 'TypeError', params: { op: '+', a: 'str', b: 'int' } });
    expect(errOf('int("abc")')).toMatchObject({ kind: 'ValueError' });
    expect(errOf('"x".uper()')).toMatchObject({ kind: 'AttributeError', params: { suggestion: 'upper' } });
    expect(errOf('def f():\n    return f()\nf()')).toMatchObject({ kind: 'RecursionError' });
    expect(errOf('def f():\n    print(y)\n    y = 1\nf()')).toMatchObject({ kind: 'UnboundLocalError' });
    expect(errOf('assert 1 == 2, "broken"')).toMatchObject({ kind: 'AssertionError', params: { message: 'broken' } });
    expect(errOf('a, b = [1, 2, 3]')).toMatchObject({ kind: 'ValueError', code: 'err.script.unpack' });
    expect(errOf('def f(a):\n    pass\nf(1, 2)')).toMatchObject({ code: 'err.script.argCount' });
    expect(errOf('def f(a):\n    pass\nf(b=2)')).toMatchObject({ code: 'err.script.argUnexpected' });
    expect(errOf('import os')).toMatchObject({ kind: 'ModuleNotFoundError' });
  });

  it('break outside a loop, return outside a function', () => {
    expect(errOf('break')).toMatchObject({ code: 'err.script.outsideLoop' });
    expect(errOf('return 1')).toMatchObject({ code: 'err.script.outsideFunction' });
  });
});

describe('Budget and infinite loops', () => {
  it('infinite loop does not freeze but pauses at the budget', () => {
    const { vm } = makeVm('n = 0\nwhile True:\n    n += 1');
    const task = vm.start();
    const r = vm.run(task, 1000);
    expect(r.status).toBe('budget');
    expect(r.used).toBe(1000);
    const n1 = vm.globals.get('n');
    vm.run(task, 1000);
    expect(vm.globals.get('n')).toBeGreaterThan(n1);
  });

  it('runToEnd reports programs that are too long', () => {
    expect(runToEnd('while True:\n    pass', { budget: 5000 }).error.code).toBe('err.script.tooLong');
  });
});

describe('Waiting (suspend) and resuming', () => {
  it('task parks at wait() and receives the return value on resuming', () => {
    const { vm, out } = makeVm('print("a")\nr = wait(5)\nprint("b", r)');
    const task = vm.start();
    expect(vm.run(task).status).toBe('waiting');
    expect(task.wait).toEqual({ kind: 'ticks', n: 5 });
    expect(out.join('')).toBe('a\n');
    vm.resume(task, 42);
    expect(vm.run(task).status).toBe('done');
    expect(out.join('')).toBe('a\nb 42\n');
  });

  it('event handlers run as separate tasks', () => {
    const { vm, out } = makeVm('def on_x(n):\n    print("x", n)\n    wait(1)\n    print("y")');
    vm.run(vm.start());
    const h = vm.spawn(vm.globals.get('on_x'), [3]);
    expect(vm.run(h).status).toBe('waiting');
    vm.resume(h);
    vm.run(h);
    expect(out.join('')).toBe('x 3\ny\n');
  });

  it('wait in a synchronously called function is an error (e.g. sorted(key=…))', () => {
    const { vm } = makeVm('def k(x):\n    wait(1)\n    return x\nsorted([2, 1], key=k)');
    const t = vm.start();
    vm.run(t);
    expect(t.state).toBe('error');
    expect(t.error.params.what).toBe('waitInSync');
  });
});

describe('Debugger', () => {
  const src = [
    'def double(x):',       // 1
    '    y = x * 2',        // 2
    '    return y',         // 3
    'a = 1',                // 4
    'b = double(a)',        // 5
    'for i in range(2):',   // 6
    '    a += i',           // 7
    'print(a, b)',          // 8
  ].join('\n');

  const lines = (vm, task, cmd, n) => {
    const seen = [];
    for (let k = 0; k < n; k++) {
      vm.debugCommand(task, cmd);
      vm.run(task);
      if (task.state !== 'paused') break;
      seen.push(vm.lineOf(task));
    }
    return seen;
  };

  it('single step into visits every statement, also in functions', () => {
    const { vm } = makeVm(src);
    const task = vm.start(null, { mode: 'step', kind: 'into' });
    vm.run(task);
    expect(task.state).toBe('paused');
    expect(vm.lineOf(task)).toBe(1);
    expect(lines(vm, task, 'into', 20)).toEqual([4, 5, 2, 3, 6, 7, 6, 7, 6, 8]);
    expect(task.state).toBe('done');
  });

  it('step over skips function calls, step out leaves the function', () => {
    const { vm } = makeVm(src);
    const task = vm.start(null, { mode: 'step', kind: 'into' });
    vm.run(task);
    expect(lines(vm, task, 'over', 4)).toEqual([4, 5, 6, 7]);
    const t2 = makeVm(src).vm;
    const task2 = t2.start(null, { mode: 'step', kind: 'into' });
    t2.run(task2);
    expect(lines(t2, task2, 'into', 3)).toEqual([4, 5, 2]);
    expect(lines(t2, task2, 'out', 1)).toEqual([6]);
  });

  it('breakpoints and variable view', () => {
    const { vm } = makeVm(src);
    const task = vm.start(null, { mode: 'run', bps: [3, 8] });
    vm.run(task);
    expect(task.state).toBe('paused');
    expect(vm.lineOf(task)).toBe(3);
    const view = vm.inspect(task);
    expect(view.args).toEqual([{ name: 'x', type: 'int', value: '1' }]);
    expect(view.locals).toEqual([{ name: 'y', type: 'int', value: '2' }]);
    expect(view.globals.map((g) => g.name)).toEqual(['a']);
    expect(view.frames.map((f) => f.name)).toEqual(['<module>', 'double']);
    vm.debugCommand(task, 'continue');
    vm.run(task);
    expect(vm.lineOf(task)).toBe(8);
    expect(vm.inspect(task).globals).toContainEqual({ name: 'a', type: 'int', value: '2' });
    vm.debugCommand(task, 'continue');
    vm.run(task);
    expect(task.state).toBe('done');
  });
});

describe('Determinism and helpers', () => {
  it('random is repeatable per seed', () => {
    const src = 'import random\nprint([random.randint(1, 100) for _ in range(5)], random.random(), random.choice("abc"))';
    const a = runToEnd(src, { seed: 3 }).output, b = runToEnd(src, { seed: 3 }).output, c = runToEnd(src, { seed: 4 }).output;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('no sin/log in the math module (not the same everywhere)', () => {
    expect(errOf('import math\nmath.sin(1)')).toMatchObject({ kind: 'AttributeError' });
  });

  it('highlighting recognises keywords, strings, numbers, comments', () => {
    const r = highlightRanges('def f(x):\n    return "a" + 1  # hi');
    const cls = r.map((x) => x.cls);
    expect(cls).toEqual(['kw', 'def', 'kw', 'str', 'num', 'comment']);
  });

  it('source text hash', () => {
    expect(sourceHash('a = 1')).toBe(sourceHash('a = 1'));
    expect(sourceHash('a = 1')).not.toBe(sourceHash('a = 2'));
  });
});
