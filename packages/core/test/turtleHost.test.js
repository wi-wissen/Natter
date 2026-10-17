// What a browser host needs from the turtle module: turtleEvent as a public export, exitonclick ends on a click.
import { describe, it, expect } from 'vitest';
import { compile, VM, turtleEvent } from '../src/index.js';

describe('turtle host interface', () => {
  it('exitonclick() ends the event loop on the first click', () => {
    let out = '';
    const vm = new VM(compile('import turtle\nturtle.forward(10)\nturtle.exitonclick()\nprint("closed")\n'), { host: { print: (t) => { out += t; } } });
    const task = vm.start();
    vm.run(task, 1e6);
    expect(task.wait.kind).toBe('turtle-event');
    vm.resume(task, turtleEvent(vm, 'key', 'a'));
    vm.run(task, 1e6);
    expect(task.wait?.kind).toBe('turtle-event');
    vm.resume(task, turtleEvent(vm, 'click', 3.5, -2));
    vm.run(task, 1e6);
    expect(task.state).toBe('done');
    expect(out).toBe('closed\n');
  });

  it('mainloop() keeps running after a click with a handler', () => {
    let out = '';
    const vm = new VM(compile('import turtle\nturtle.onscreenclick(lambda x, y: print(x, y))\nturtle.mainloop()\n'), { host: { print: (t) => { out += t; } } });
    const task = vm.start();
    vm.run(task, 1e6);
    vm.resume(task, turtleEvent(vm, 'click', 3.5, -2));
    vm.run(task, 1e6);
    expect(task.wait?.kind).toBe('turtle-event');
    expect(out).toBe('3.5 -2\n');
  });
});
