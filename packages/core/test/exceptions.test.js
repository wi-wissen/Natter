// try / except / finally / raise: behaviour beyond "same output as CPython" (errors, limits, interplay with the VM).

import { describe, it, expect } from 'vitest';
import { runToEnd, scriptErrorText, compile, VM } from '../src/index.js';

const errOf = (src) => runToEnd(src).error;
const out = (src) => { const r = runToEnd(src); expect(r.error).toBeNull(); return r.output; };

describe('raise', () => {
  it('an uncaught exception ends the program with its Python name and message', () => {
    const e = errOf('class MyError(Exception):\n    pass\nraise MyError("kaputt")');
    expect(e).toMatchObject({ kind: 'MyError', code: 'err.script.raised', params: { message: 'kaputt' }, line: 3 });
    expect(scriptErrorText(e, { lang: 'en' })).toEqual({ title: 'MyError in line 3', text: 'kaputt' });
  });

  it('raising something that is not an exception is a TypeError', () => {
    expect(errOf('raise 5')).toMatchObject({ kind: 'TypeError', params: { what: 'raiseType' } });
    expect(errOf('raise object()')).toMatchObject({ kind: 'TypeError' });
  });

  it('a bare raise outside an except block is a RuntimeError', () => {
    expect(errOf('raise')).toMatchObject({ kind: 'TypeError', params: { what: 'noActiveException' } });
  });

  it('the traceback of an error that is caught and raised again keeps the first place', () => {
    const e = errOf('def f():\n    1 / 0\ndef g():\n    try:\n        f()\n    except ZeroDivisionError:\n        raise\ng()');
    expect(e.line).toBe(2);
    expect(e.traceback.map((t) => t.name)).toEqual(['<module>', 'g', 'f']);
  });
});

describe('except', () => {
  it('catching something that is not an exception class is a TypeError', () => {
    expect(errOf('try:\n    1 / 0\nexcept 5:\n    pass')).toMatchObject({ kind: 'TypeError', params: { what: 'catchType' } });
  });

  it('a bare except must be the last handler', () => {
    expect(errOf('try:\n    pass\nexcept:\n    pass\nexcept ValueError:\n    pass')).toMatchObject({ code: 'err.script.badExcept', params: { what: 'order' } });
  });

  it('try needs except or finally', () => {
    expect(errOf('try:\n    pass\nx = 1')).toMatchObject({ code: 'err.script.expected', params: { what: 'exceptOrFinally' } });
  });

  it('the name of the exception is gone after the handler', () => {
    expect(errOf('try:\n    1 / 0\nexcept ZeroDivisionError as e:\n    pass\nprint(e)')).toMatchObject({ kind: 'NameError' });
  });

  it('errors from the interpreter and from Python code are caught the same way', () => {
    expect(out('try:\n    [][1]\nexcept LookupError as e:\n    print("lookup", e)\ntry:\n    raise IndexError("mine")\nexcept LookupError as e:\n    print("lookup", e)')).toBe('lookup list index out of range\nlookup mine\n');
  });

  it('exceptions thrown inside callbacks (sorted key, __eq__, __iter__) reach the surrounding try', () => {
    const src = [
      'def key(x):', '    raise ValueError("in key")',
      'try:', '    sorted([2, 1], key=key)', 'except ValueError as e:', '    print(e)',
      'class A:', '    def __eq__(self, o):', '        raise RuntimeError("in eq")', '    def __hash__(self):', '        return 1',
      'try:', '    {A(): 1}[A()]', 'except RuntimeError as e:', '    print(e)',
    ].join('\n');
    expect(out(src)).toBe('in key\nin eq\n');
  });

  it('an endless loop inside try/except is still stopped by the budget', () => {
    const r = runToEnd('try:\n    while True:\n        pass\nexcept Exception:\n    print("caught")', { budget: 5000 });
    expect(r.output).toBe('');
    expect(r.error).toMatchObject({ code: 'err.script.tooLong' });
  });

  it('a RecursionError can be caught and the program goes on', () => {
    expect(out('def f():\n    f()\ntry:\n    f()\nexcept RecursionError:\n    print("deep")\nprint("after")')).toBe('deep\nafter\n');
  });
});

describe('finally', () => {
  it('runs on return, break, continue and when an exception passes', () => {
    const src = [
      'log = []',
      'def f():', '    try:', '        return 1', '    finally:', '        log.append("f")',
      'f()',
      'for i in range(3):', '    try:', '        if i == 0:', '            continue', '        if i == 2:', '            break', '    finally:', '        log.append("loop" + str(i))',
      'try:', '    try:', '        1 / 0', '    finally:', '        log.append("fin")', 'except ZeroDivisionError:', '    log.append("caught")',
      'print(log)',
    ].join('\n');
    expect(out(src)).toBe("['f', 'loop0', 'loop1', 'loop2', 'fin', 'caught']\n");
  });

  it('a return in finally replaces an exception', () => {
    expect(out('def f():\n    try:\n        1 / 0\n    finally:\n        return "swallowed"\nprint(f())')).toBe('swallowed\n');
  });

  it('break in a finally that runs because of an exception keeps the loop intact', () => {
    expect(out('for i in range(3):\n    try:\n        1 / 0\n    finally:\n        break\nprint("done", i)')).toBe('done 0\n');
  });

  it('a variable assigned in a handler is visible afterwards', () => {
    expect(out('try:\n    1 / 0\nexcept ZeroDivisionError:\n    reason = "zero"\nprint(reason)')).toBe('zero\n');
  });
});

describe('debugger', () => {
  it('stops at lines inside try, except and finally', () => {
    const prog = compile('try:\n    x = 1 / 0\nexcept ZeroDivisionError:\n    y = 2\nfinally:\n    z = 3\n');
    const vm = new VM(prog, {});
    const task = vm.start(null, {});
    vm.debugCommand(task, 'into');
    const lines = [];
    for (let i = 0; i < 20 && task.state !== 'done'; i++) {
      vm.run(task, 1000);
      if (task.state === 'paused') { lines.push(vm.lineOf(task)); vm.debugCommand(task, 'into'); }
    }
    expect(lines).toEqual(expect.arrayContaining([2, 3, 4, 6]));
    expect(task.state).toBe('done');
  });
});
