// Classes: behaviour that is not just "same output as CPython" (errors, hooks, limits).

import { describe, it, expect } from 'vitest';
import { runToEnd, scriptErrorText } from '../src/index.js';
import { de, en } from '../src/messages.js';

const errOf = (src) => runToEnd(src).error;
const out = (src) => { const r = runToEnd(src); expect(r.error).toBeNull(); return r.output; };

describe('classes', () => {
  it('creates instances with attributes and methods', () => {
    expect(out('class A:\n    def __init__(self, n):\n        self.n = n\n    def double(self):\n        return self.n * 2\nprint(A(4).double())')).toBe('8\n');
  });

  it('a class without __init__ takes no arguments', () => {
    expect(errOf('class A:\n    pass\nA(1)')).toMatchObject({ kind: 'TypeError', params: { what: 'noArgsClass', name: 'A' } });
  });

  it('__init__ must return None', () => {
    expect(errOf('class A:\n    def __init__(self):\n        return 5\nA()')).toMatchObject({ kind: 'TypeError', params: { what: 'initReturn' } });
  });

  it('unknown attribute suggests a similar name', () => {
    const e = errOf('class A:\n    def __init__(self):\n        self.health = 3\na = A()\nprint(a.helth)');
    expect(e).toMatchObject({ kind: 'AttributeError', params: { type: 'A', name: 'helth', suggestion: 'health' } });
    expect(scriptErrorText(e, { lang: 'en' }).text).toContain('Did you mean “health”?');
  });

  it('class attributes can be read through the class and the instance', () => {
    expect(out('class A:\n    x = 5\n    y = x + 1\nprint(A.x, A.y, A().x)')).toBe('5 6 5\n');
  });

  it('methods of a class do not see names of the class body (as in Python)', () => {
    expect(errOf('class A:\n    k = 3\n    def f(self):\n        return k\nA().f()')).toMatchObject({ kind: 'NameError' });
  });

  it('methods see variables of an enclosing function', () => {
    expect(out('def make(n):\n    class A:\n        def f(self):\n            return n\n    return A()\nprint(make(7).f())')).toBe('7\n');
  });

  it('a class with __eq__ but no __hash__ is unhashable', () => {
    expect(errOf('class A:\n    def __eq__(self, o):\n        return True\nd = {A(): 1}')).toMatchObject({ kind: 'TypeError' });
  });

  it('super() outside a method is an error', () => {
    expect(errOf('super()')).toMatchObject({ kind: 'TypeError' });
  });

  it('derived classes of built-in types are reported as unsupported', () => {
    expect(errOf('class L(list):\n    pass')).toMatchObject({ code: 'err.script.notSupported', params: { feature: 'subclassBuiltin' } });
  });

  it('endless recursion in a method ends in a RecursionError', () => {
    expect(errOf('class A:\n    def f(self):\n        return self.f()\nA().f()')).toMatchObject({ kind: 'RecursionError' });
  });

  it('a user __repr__ is used inside containers and by the debugger', () => {
    expect(out('class A:\n    def __repr__(self):\n        return "<A>"\nprint([A(), A()], {"k": A()})')).toBe('[<A>, <A>] {\'k\': <A>}\n');
  });

  it('a property without a setter cannot be assigned', () => {
    const e = errOf('class A:\n    @property\n    def x(self):\n        return 1\nA().x = 2');
    expect(e).toMatchObject({ kind: 'AttributeError', params: { what: 'noSetter', name: 'x' } });
  });
});

describe('messages', () => {
  it('German and English have the same keys', () => {
    expect(Object.keys(en).filter((k) => !(k in de))).toEqual([]);
    expect(Object.keys(de).filter((k) => !(k in en))).toEqual([]);
  });
});
