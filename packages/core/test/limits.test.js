// Limits that must be the same on every device: call depth (also through map/sorted callbacks),
// nesting of data, exact powers of ten. A device's JS stack must never decide where a program fails.

import { describe, it, expect } from 'vitest';
import { runToEnd, compile, VM, PyBuiltin } from '../src/index.js';

const FLOOD = (n) => `
size = ${n}
def ice(x, y, seen):
    if x < 0 or y < 0 or x >= size or y >= size or (x, y) in seen:
        return 0
    seen[(x, y)] = True
    return 1 + ice(x + 1, y, seen) + ice(x - 1, y, seen) + ice(x, y + 1, seen) + ice(x, y - 1, seen)
print(ice(0, 0, {}))
`;

describe('call depth', () => {
  it('a flood fill on 31×31 tiles fits (as in CPython)', () => {
    const r = runToEnd(FLOOD(31));
    expect(r.error).toBeNull();
    expect(r.output.trim()).toBe('961');
  });

  it('32×32 is too deep: RecursionError names the function, the call stack is shortened', () => {
    const e = runToEnd(FLOOD(32)).error;
    expect(e).toMatchObject({ code: 'err.script.recursion', kind: 'RecursionError', params: { what: 'self', name: 'ice', max: 1000 } });
    expect(e.traceback.length).toBeLessThanOrEqual(14);
    expect(e.traceback.some((t) => t.skipped > 0 || t.repeat > 1)).toBe(true);
  });

  it('recursion through sorted(key=…) and map() ends in a RecursionError, not an internal error', () => {
    for (const src of ['def f(x):\n    return sorted([1], key=f)\nf(1)', 'def f(x):\n    return list(map(f, [x]))\nf(1)']) {
      const e = runToEnd(src).error;
      expect(e.kind, src).toBe('RecursionError');
      expect(['callbacks', 'self', 'depth']).toContain(e.params.what);
    }
  });

  it('the debugger shows calls with simple arguments and shortens deep stacks', () => {
    const prog = compile('def f(n, xs):\n    if n == 0:\n        pause()\n        return 0\n    return f(n - 1, xs)\nf(20, [1])', { known: ['pause'] });
    let seen = null;
    const vm = new VM(prog, { natives: { pause: (ctx) => { seen = ctx.vm.inspect(ctx.task); return null; } }, globals: { pause: new PyBuiltin('pause') } });
    vm.run(vm.start());
    expect(seen.frames.length).toBe(11);
    expect(seen.frames[1]).toMatchObject({ name: 'f', args: '20, …' });
    expect(seen.frames[2]).toMatchObject({ skipped: 12 }); // 22 frames: module + f(20) … f(0)
    expect(seen.frames.at(-1)).toMatchObject({ name: 'f', args: '0, …' });
  });
});

describe('nested data', () => {
  const deep = 'x = []\nfor i in range(5000):\n    x = [x]\n';
  it('printing or comparing very deep lists is a RecursionError', () => {
    expect(runToEnd(`${deep}print(x)`).error).toMatchObject({ kind: 'RecursionError', params: { what: 'nested' } });
    expect(runToEnd(`${deep}y = x\nprint(x == [y])`).error).toMatchObject({ kind: 'RecursionError', params: { what: 'nested' } });
  });
});

describe('exact numbers', () => {
  it('negative powers, round with negative digits and math.hypot behave as in CPython', () => {
    expect(runToEnd('print(2 ** -60)\nprint(10 ** -3)\nprint(round(123456, -3), round(2.5e30, -25), round(1234.5678, -2))\nimport math\nprint(math.hypot(3, 4), math.dist((0, 0), (6, 8)))').output)
      .toBe('8.673617379884035e-19\n0.001\n123000 2.5e+30 1200.0\n5.0 10.0\n');
  });
});
