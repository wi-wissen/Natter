import { describe, it, expect } from 'vitest';
import { runToEnd, karaGlobals } from '../src/index.js';
import { parseWorld, worldText } from '../src/stdlib/kara.js';

const run = (src, opts = {}) => runToEnd(src, { globals: karaGlobals(), ...opts });
const finalWorld = (r) => worldText(r.vm.kara);
const Q = '"""';

describe('kara', () => {
  const W = `world(${Q}#####\n#@  #\n#####${Q})\n`;
  it('parses and prints a world', () => {
    const text = '######\n#@ $.#\n#. *##\n######';
    const w = parseWorld(text);
    expect(worldText(w)).toBe(text);
    expect(w.kara).toEqual({ x: 1, y: 1, dir: 0 });
    expect(worldText(parseWorld('###\n#+#\n###'))).toBe('###\n#+#\n###');
  });
  it('moves, turns and walks around a tree', () => {
    const r = run(`world(${Q}#######\n#@#   #\n#     #\n#######${Q})\nturnRight()\nmove()\nturnLeft()\nmove()\nmove()\nturnLeft()\nmove()\nturnRight()\nwhile not treeFront():\n    move()\nprint(treeFront(), onBerry())\n`);
    expect(r.error).toBeNull();
    expect(r.output).toBe('True False\n');
    expect(finalWorld(r)).toBe('#######\n# #  @#\n#     #\n#######');
  });
  it('sensors left and right, berries', () => {
    const r = run(`world(${Q}####\n#@.#\n####${Q})\nprint(treeLeft(), treeRight(), treeFront(), onBerry())\nmove()\nprint(onBerry(), treeFront())\nremoveBerry()\nprint(onBerry())\nputBerry()\nprint(onBerry())\n`);
    expect(r.output).toBe('True True False False\nTrue True\nFalse\nTrue\n');
  });
  it('pushes a mushroom, and stops when it cannot', () => {
    const r = run(`world(${Q}######\n#@$  #\n######${Q})\nmove()\nmove()\nprint(mushroomFront())\n`);
    expect(r.error).toBeNull();
    expect(finalWorld(r)).toBe('######\n#  @$#\n######');
    expect(r.output).toBe('True\n');
    const bad = run(`world(${Q}#####\n#@$$#\n#####${Q})\nmove()\n`);
    expect(bad.error.code).toBe('err.script.kara');
    expect(bad.error.params.what).toBe('mushroom');
  });
  it('bumping into a tree is an error that can be caught', () => {
    const r = run(`world(${Q}###\n#@#\n###${Q})\ntry:\n    move()\nexcept RuntimeError:\n    print("ouch")\nmove()\n`);
    expect(r.output).toBe('ouch\n');
    expect(r.error.params.what).toBe('tree');
  });
  it('works as a module too, and complains without a world', () => {
    const r = runToEnd(`import kara\nkara.world(${Q}##\n#@\n##${Q})\nkara.turnLeft()\nprint(kara.treeFront())\n`);
    expect(r.output).toBe('True\n');
    const e = runToEnd('from kara import *\nmove()\n');
    expect(e.error.params.what).toBe('noWorld');
  });
  it('reports every change to the host and waits as long as it says', () => {
    const events = [];
    const host = { kara: (kind, args) => { events.push([kind, ...args]); return kind === 'world' ? 0 : 0.25; } };
    const r = run(`${W}move()\nturnLeft()\n`, { host });
    expect(events.map((e) => e[0])).toEqual(['world', 'move', 'turn']);
    expect(events[1]).toEqual(['move', 2, 1, 0]);
    expect(r.vm.virtualMs).toBe(500);
  });
  it('rejects broken worlds', () => {
    expect(run(`world(${Q}##\n#?\n${Q})\n`).error.params.what).toBe('badChar');
    expect(run(`world(${Q}##\n##\n${Q})\n`).error.params.what).toBe('noKara');
    expect(run(`world(${Q}@@${Q})\n`).error.params.what).toBe('twoKaras');
  });
});
