import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runToEnd } from '../src/index.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'data');
const run = (src, opts) => runToEnd(src, { budget: 5e8, ...opts });

describe('turtle', () => {
  it('movement maths gives the numbers of CPython turtle (golden from python3.12)', () => {
    // sin and cos of glibc are not correctly rounded in about one case in a thousand, and a 1 ulp difference
    // accumulates over 300 random moves, so the numbers are compared with a small tolerance instead of exactly
    const r = run(readFileSync(join(dir, 'turtle_nav.py'), 'utf8'));
    expect(r.error).toBeNull();
    const got = r.output.split('\n'), want = readFileSync(join(dir, 'turtle_nav.out'), 'utf8').split('\n');
    const num = /-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g;
    const close = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)) || Math.abs(Math.abs(a - b) - 360) < 1e-6 || Math.abs(Math.abs(a - b) - 400) < 1e-6;
    const bad = [];
    expect(got.length).toBe(want.length);
    for (let i = 0; i < want.length; i++) {
      const wt = want[i].replace(num, '#'), gt = got[i].replace(num, '#');
      const wn = want[i].match(num) ?? [], gn = got[i].match(num) ?? [];
      if (wt !== gt || wn.length !== gn.length || wn.some((x, k) => !close(Number(x), Number(gn[k])))) bad.push(`line ${i + 1}: expected ${want[i]} got ${got[i]}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('sends drawing commands to the host and waits for the time it returns', () => {
    const cmds = [];
    const host = { turtle: (kind, args) => { cmds.push([kind, ...args]); return kind === 'move' ? 0.5 : 0; } };
    const r = runToEnd('import turtle\nt = turtle.Turtle()\nt.color("red", "#00ff00")\nt.begin_fill()\nfor i in range(3):\n    t.forward(10)\n    t.left(120)\nt.end_fill()\nt.write("hi", align="center")\n', { host });
    expect(r.error).toBeNull();
    const kinds = cmds.map((c) => c[0]);
    expect(kinds.filter((k) => k === 'move')).toHaveLength(3);
    expect(kinds).toContain('fill');
    expect(cmds.find((c) => c[0] === 'fill')[3]).toBe('#00ff00');
    expect(cmds.find((c) => c[0] === 'write')[4]).toBe('hi');
    expect(r.vm.virtualMs).toBe(1500); // three moves of half a second each
  });

  it('bad colours and shapes raise TurtleGraphicsError', () => {
    const r = run('import turtle\ntry:\n    turtle.color("nocolor")\nexcept turtle.TurtleGraphicsError as e:\n    print(e)\ntry:\n    turtle.shape("nope")\nexcept turtle.TurtleGraphicsError as e:\n    print(e)\n');
    expect(r.output).toBe('bad color string: nocolor\nThere is no shape named nope\n');
  });

  it('module functions work without an explicit Turtle', () => {
    const r = run('from turtle import *\nforward(50)\nright(90)\nforward(50)\nprint(pos(), heading(), isdown())\npenup()\nprint(isdown())\n');
    expect(r.output).toBe('(50.00,-50.00) 270.0\nTrue\nFalse\n'.replace('270.0\nTrue', '270.0 True'));
  });
});

describe('turtle events', () => {
  it('key handlers run when the host sends a key, and timers fire', async () => {
    const { turtleEvent } = await import('../src/stdlib/turtle.js');
    const src = 'import turtle\ndef up():\n    print("up")\nturtle.onkeypress(up, "Up")\nturtle.listen()\nturtle.ontimer(lambda: print("tick"), 100)\nturtle.mainloop()\nprint("end")\n';
    const { compile } = await import('../src/index.js');
    const { VM } = await import('../src/vm.js');
    let out = '';
    const vm = new VM(compile(src), { host: { print: (t) => { out += t; } } });
    const task = vm.start();
    vm.run(task, 1e6);
    expect(task.wait.kind).toBe('turtle-event');
    vm.resume(task, turtleEvent(vm, 'key', 'Up'));
    vm.run(task, 1e6);
    vm.resume(task, turtleEvent(vm, 'timer', task.wait.timers[0].id));
    vm.run(task, 1e6);
    vm.resume(task, null);
    vm.run(task, 1e6);
    expect(out).toBe('up\ntick\nend\n');
  });
});
