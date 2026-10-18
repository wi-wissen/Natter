// Pygame Zero host without a browser: fixed time step, key codes, text layout, tone envelope, asset names, and the
// frame driver with the real runner and VM (update/draw order, events, endless loops, exit, quit, animations).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createStepper, roundHalfEven, pgzKey, pgzMods, rotatedSize, wrapLines, layoutText, fitFontSize, toneEnvelope, wavSeconds,
  pgzMode, usedNames, fontPixels, fontCss, mouseButtons, SPECIAL_KEYS,
} from '../src/pgzeroMath.js';
import { createDriver, gameSource, installPgzero, systemExit, PGZ_BUILTIN_NAMES } from '../src/pgzeroDriver.js';
import { createRunner } from '../src/runner.js';
import { PGZ_BUILTIN_NAMES as CORE_NAMES } from '../../core/src/stdlib/pgzero.js';
import { testResource } from '../../core/test/pgzHost.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('fixed time step', () => {
  it('one frame per 60 Hz display frame, also with jitter', () => {
    const s = createStepper();
    let n = 0;
    for (let i = 0; i < 600; i++) { const k = s.advance(i % 2 ? 16.2 : 1000 / 30 - 16.2); expect(k).toBe(1); n += k; }
    expect(n).toBe(600);
  });
  it('120 Hz: every second display frame; 30 Hz: two frames', () => {
    const s = createStepper();
    const ks = Array.from({ length: 8 }, () => s.advance(1000 / 120));
    expect(ks.reduce((a, b) => a + b, 0)).toBe(4);
    const t = createStepper();
    expect([t.advance(1000 / 30), t.advance(1000 / 30)]).toEqual([2, 2]);
  });
  it('a long pause catches up at most a few frames and leaves no backlog', () => {
    const s = createStepper({ maxSteps: 4 });
    expect(s.advance(5000)).toBe(4);
    expect(s.advance(1000 / 60)).toBe(1);
    expect(s.pending).toBeLessThan(1000 / 60);
  });
});

describe('helpers', () => {
  it('rounds halves to even like Python', () => {
    expect([0.5, 1.5, 2.5, -0.5, -1.5, 2.4, 2.6].map((x) => roundHalfEven(x) + 0)).toEqual([0, 2, 2, 0, -2, 2, 3]);
  });
  it('maps keys to pygame 2 codes (layout-aware letters, digits under Shift, keypad, F keys)', () => {
    expect(pgzKey({ key: 'ArrowLeft', code: 'ArrowLeft' }).key).toBe(1073741904);
    expect(pgzKey({ key: 'ArrowUp', code: 'ArrowUp' }).key).toBe(1073741906);
    expect(pgzKey({ key: ' ', code: 'Space' })).toEqual({ key: 32, unicode: ' ' });
    expect(pgzKey({ key: 'z', code: 'KeyY' })).toEqual({ key: 122, unicode: 'z' }); // German layout
    expect(pgzKey({ key: 'A', code: 'KeyA', shiftKey: true })).toEqual({ key: 97, unicode: 'A' });
    expect(pgzKey({ key: '!', code: 'Digit1', shiftKey: true })).toEqual({ key: 49, unicode: '!' });
    expect(pgzKey({ key: 'Enter', code: 'Enter' })).toEqual({ key: 13, unicode: '\r' });
    expect(pgzKey({ key: '5', code: 'Numpad5' }).key).toBe(1073741917);
    expect(pgzKey({ key: 'F5', code: 'F5' }).key).toBe(1073741886);
    expect(SPECIAL_KEYS.F12).toBe(1073741893);
    expect(pgzKey({ key: 'ä', code: 'Quote' }).key).toBe(228);
    expect(pgzKey({ key: 'Unidentified', code: '' })).toBe(null);
    expect(pgzMods(new Set(['ShiftLeft', 'ControlRight']), { caps: true })).toBe(1 | 128 | 8192);
    expect(mouseButtons(1 | 2 | 4)).toEqual([1, 1, 1]);
    expect(mouseButtons(2)).toEqual([0, 0, 1]);
  });
  it('rotated image sizes', () => {
    expect(rotatedSize(10, 20, 90)).toEqual([20, 10]);
    expect(rotatedSize(10, 20, 0)).toEqual([10, 20]);
    expect(rotatedSize(10, 10, 45)).toEqual([15, 15]);
  });
  it('text: default font is scaled like pygame, wrapping and size like ptext', () => {
    expect(fontPixels({ fontsize: 24 })).toBe(16);
    expect(fontPixels({ fontsize: 24, fontname: 'x' })).toBe(24);
    expect(fontCss({ fontsize: 32 })).toMatch(/^bold 22px /);
    expect(fontCss({ fontsize: 20, sysfontname: 'Comic Sans MS', italic: true })).toBe('italic 20px "Comic Sans MS", sans-serif');
    const measure = (s) => s.length * 10;
    expect(wrapLines('one two three', 80, measure)).toEqual(['one two', 'three']);
    expect(wrapLines('a\nb  ', null, measure)).toEqual(['a', 'b']);
    const L = layoutText('ab\nabcd', { lineheight: 1.5 }, { measure, height: 20, px: 16 });
    expect([L.textW, L.textH, L.lineStep]).toEqual([40, 50, 30]);
    const O = layoutText('ab', { owidth: 1.5, shadow: [1, 1] }, { measure, height: 20, px: 24 });
    expect([O.opx, O.sx, O.w, O.h]).toEqual([2, 2, 26, 26]);
    expect(fitFontSize((s) => s <= 37)).toBe(37);
    expect(fitFontSize(() => false)).toBe(1);
  });
  it('tone envelope like pgzero.tone', () => {
    expect(toneEnvelope(500).map(([t, g]) => [Math.round(t * 22050), g])).toEqual([[0, 0], [50, 1], [500, 0.9], [2500, 0]]);
    expect(toneEnvelope(22050).map(([t, g]) => [Math.round(t * 22050), g])).toEqual([[0, 0], [350, 1], [1000, 0.7], [22050, 0.7], [24050, 0]]);
  });
  it('WAV length from the header', () => {
    const b = readFileSync(join(here, '../../assets/sounds/coin.wav'));
    const s = wavSeconds(new Uint8Array(b));
    expect(s).toBeGreaterThan(0.05);
    expect(s).toBeLessThan(3);
  });
  it('detects games and the asset names they use', () => {
    expect(pgzMode('import pgzrun\nWIDTH = 10\npgzrun.go()\n')).toBe('pgzrun');
    expect(pgzMode('WIDTH = 300\ndef draw():\n    screen.clear()\n')).toBe('game');
    expect(pgzMode('import turtle\ndef draw():\n    pass\n')).toBe(null);
    expect(pgzMode('print(1)\n')).toBe(null);
    const names = ['heroine_run_1', 'heroine_run_2', 'heroine_idle_1', 'coin', 'jump', 'enemy_walk_1', 'a_b'];
    expect(usedNames(['frames = ["heroine_run_" + str(i) for i in range(1, 3)]\nsounds.coin.play()\n'], names))
      .toEqual(['heroine_run_1', 'heroine_run_2', 'coin']);
    expect(usedNames(['a = Actor("enemy_walk_1")'], names)).toEqual(['enemy_walk_1']);
  });
  it('knows the same builtin names as the core', () => {
    expect(PGZ_BUILTIN_NAMES).toEqual(CORE_NAMES);
    const g = gameSource('x = 1\n', 'game');
    expect(g.source.startsWith('x = 1\n')).toBe(true);
    expect(Object.keys(g.globals)).toEqual(CORE_NAMES);
    expect(gameSource('x = 1\n', 'pgzrun')).toEqual({ source: 'x = 1\n', globals: {} });
  });
});

/**
 * Run a game headless with the real runner: frames[i] = events of frame i (a function gets the driver).
 * Returns the final state, output, error and the recorded commands.
 */
function play(src, { frames = 3, events = [], frameBudget, onFrame } = {}) {
  const mode = pgzMode(src);
  const g = gameSource(src, mode);
  const out = [], cmds = [];
  let error = null;
  const runner = createRunner({ onOutput: (t) => out.push(t), onError: (e) => { error = e; } });
  runner.use({
    host: { pgz: { resource: testResource, cmd: (n, a) => cmds.push([n, ...a]) } },
    waits: {
      pgzero(wait, ctx) {
        const d = createDriver(ctx.vm, {
          frameBudget,
          onEnd: (how, e) => (how === 'error' ? ctx.throwError(e) : how === 'exit' ? ctx.throwError(systemExit()) : ctx.resume(null)),
        });
        setTimeout(() => {
          for (let i = 0; i < frames && !d.ended; i++) {
            for (const ev of events[i] ?? []) d.push(ev);
            d.tick(0, 1);
            onFrame?.(i, out.join(''));
          }
          if (!d.ended) d.push(['quit']), d.tick(0, 1);
        }, 0);
      },
    },
    start(c) { if (mode === 'game') installPgzero(c.vm); },
  });
  return runner.run(g.source, { globals: g.globals, seed: 1 }).then((state) => ({ state, output: out.join(''), error, cmds }));
}

describe('frame driver', () => {
  it('fixed dt, update before draw, every frame', async () => {
    const r = await play('def update(dt):\n    print("u", round(dt, 6))\ndef draw():\n    print("d")\n', { frames: 2 });
    expect(r.output).toBe('u 0.016667\nd\nu 0.016667\nd\n');
    expect(r.state).toBe('done');
    expect(r.cmds[0]).toEqual(['window', 800, 600, 'Pygame Zero Game']);
  });
  it('import pgzrun: WIDTH/HEIGHT/TITLE, code after go() runs when the window closes', async () => {
    const r = await play('import pgzrun\nWIDTH = 300\nHEIGHT = 200\nTITLE = "Hi"\ndef draw():\n    screen.fill("red")\npgzrun.go()\nprint("closed")\n', { frames: 1 });
    expect(r.cmds[0]).toEqual(['window', 300, 200, 'Hi']);
    expect(r.cmds[1]).toEqual(['fill', [255, 0, 0, 255], null]);
    expect(r.output).toBe('closed\n');
  });
  it('key and mouse events reach the hooks and keyboard', async () => {
    const src = `def on_key_down(key, unicode):
    print("down", key == keys.LEFT, repr(unicode))
def on_mouse_down(pos, button):
    print("click", pos, button == mouse.LEFT)
def update():
    if keyboard.left:
        print("held")
`;
    const r = await play(src, { frames: 3, events: [[['key_down', 1073741904, 0, '']], [['mouse_down', [10, 20], 1]], [['key_up', 1073741904, 0]]] });
    expect(r.output).toBe("down True ''\nheld\nclick (10, 20) True\nheld\n");
  });
  it('an endless loop in update stops the game with "too long" and its line', async () => {
    const t0 = Date.now();
    const r = await play('n = 0\ndef update():\n    global n\n    while True:\n        n += 1\n', { frames: 2, frameBudget: 200000 });
    expect(r.state).toBe('error');
    expect(r.error.code).toBe('err.script.tooLong');
    expect([4, 5]).toContain(r.error.line);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
  it('an error in draw is reported with its line and traceback', async () => {
    const r = await play('def draw():\n    x = 1\n    print(y)\n', { frames: 2 });
    expect(r.state).toBe('error');
    expect(r.error.kind).toBe('NameError');
    expect(r.error.line).toBe(3);
    expect(r.error.traceback.at(-1)).toEqual({ name: 'draw', line: 3, file: 'main.py' });
  });
  it('exit() ends the whole program, code after go() does not run', async () => {
    const r = await play('import pgzrun\ndef update():\n    exit()\npgzrun.go()\nprint("after")\n', { frames: 3 });
    expect(r.state).toBe('done');
    expect(r.output).toBe('');
  });
  it('animations and the clock advance by the fixed dt', async () => {
    const src = `a = Actor("alien", (0, 0))
animate(a, tween="linear", duration=1, x=60)
ticks = []
def tick():
    ticks.append(1)
clock.schedule_interval(tick, 0.25)
def update():
    pass
def draw():
    print(round(a.x, 3), len(ticks))
`;
    const lines = [];
    await play(src, { frames: 31, onFrame: (i, out) => lines.push(out) });
    const out = lines.at(-1).trim().split('\n');
    expect(out[14]).toBe('15.0 0');
    expect(out[29]).toBe('30.0 1');
  });
});

describe('core error object of systemExit', () => {
  it('is a SystemExit', () => { expect(systemExit().kind).toBe('SystemExit'); });
});
