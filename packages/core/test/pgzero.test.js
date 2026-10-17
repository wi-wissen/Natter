// Pygame Zero modules: golden data of the real pygame/pgzero (data/pgzero-golden.json, scripts/gen-pgzero-golden.py),
// the commands that drawing and sounds send to the host, the frame driver and the pgzhelper-style Actor extensions.
// The matrix cases in cases/pgz_*.py compare Rect, ZRect, Actor, animate and clock with pgzero line by line.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPgz, pgzVM, finish, frame, runFrames } from './pgzHost.js';
import { pgzStart, toPy, toHost } from '../src/stdlib/pgzero.js';
import { PyTuple, PyFloat } from '../src/index.js';

const golden = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'data', 'pgzero-golden.json'), 'utf8'));

/** Run a program; it must not fail. */
function run(src, opts) {
  const r = runPgz(src, opts);
  if (r.error) throw new Error(JSON.stringify(r.error));
  return r;
}

const lines = (r) => r.output.trimEnd().split('\n');

describe('golden data from pygame', () => {
  it('colour table: every name of pygame.colordict.THECOLORS', () => {
    const names = Object.keys(golden.colors);
    const r = run(`from pgzero_color import THECOLORS, rgba\nnames = ${JSON.stringify(names)}\nprint(len(THECOLORS))\nfor n in names:\n    print(list(rgba(n)))`);
    const out = lines(r);
    expect(Number(out[0])).toBe(names.length);
    expect(out.slice(1)).toEqual(names.map((n) => JSON.stringify(golden.colors[n]).replace(/,/g, ', ')));
  });

  it('Color() parses names, hex strings, ints and tuples like pygame.Color', () => {
    const src = `from pgzero_color import Color\ncases = ${JSON.stringify(golden.colorInputs.map(([a]) => a))}\nfor args in cases:\n    try:\n        print(list(Color(*args)))\n    except Exception as e:\n        print(type(e).__name__ + ": " + str(e))`;
    expect(lines(run(src))).toEqual(golden.colorInputs.map(([, want]) => (typeof want === 'string' ? want : JSON.stringify(want).replace(/,/g, ', '))));
  });

  it('keys, keymods and mouse have the codes of pgzero.constants', () => {
    const r = run(`from pgzero_keys import keys, keymods, mouse\nfor e, d in ((keys, ${JSON.stringify(golden.keys)}), (keymods, ${JSON.stringify(golden.keymods)}), (mouse, ${JSON.stringify(golden.mouse)})):\n    print(all(getattr(e, k) == v and e[k] == v for k, v in d.items()), len(d))`);
    expect(lines(r)).toEqual([`True ${Object.keys(golden.keys).length}`, `True ${Object.keys(golden.keymods).length}`, 'True 5']);
  });

  it('size of rotated images like pygame.transform.rotate', () => {
    const data = golden.rotations.map(([w, h, a]) => [w, h, a]);
    const r = run(`from pgzero_actor import rotated_size\nfor w, h, a in ${JSON.stringify(data)}:\n    print(*rotated_size(w, h, a))`);
    expect(lines(r)).toEqual(golden.rotations.map(([, , , s]) => s.join(' ')));
  });

  it('Rect.fit and Rect.scale_by in single precision like pygame', () => {
    const data = golden.rects.map(([a, b, , fx, fy]) => [a, b, fx, fy]);
    const r = run(`for a, b, fx, fy in ${JSON.stringify(data)}:\n    print(list(Rect(a).fit(b)), list(Rect(a).scale_by(fx, fy)))`, { game: true });
    expect(lines(r)).toEqual(golden.rects.map(([, , fit, , , sc]) => `${JSON.stringify(fit).replace(/,/g, ', ')} ${JSON.stringify(sc).replace(/,/g, ', ')}`));
  });
});

describe('drawing becomes commands for the host', () => {
  it('screen.fill, clear, blit and the draw functions convert their arguments like pygame', () => {
    const r = run(`screen.clear()
screen.fill("orange")
screen.fill((10, 20, 30), gcolor="#ff000080")
screen.blit("alien", (10.7, -3.2))
screen.blit(images.box, Rect(5, 6, 7, 8))
screen.draw.line((0.5, 1.5), (2.5, 3.6), "white")
screen.draw.line((0, 0), (5, 5), (1, 2, 3), 4)
screen.draw.circle((10, 10), 5.9, 0xff0000ff)
screen.draw.filled_circle((10.5, 11.5), 3, [9, 8, 7])
screen.draw.rect(Rect(1, 2, 3, 4), "red")
screen.draw.filled_rect(ZRect(1.5, 2.5, 3.9, 4.9), "green")
screen.draw.rect(ZRect(10, 10, 20, 10), "blue", 3)
screen.draw.polygon([(0, 0), (10.5, 0), (5, 8.5)], "yellow")
screen.draw.filled_polygon([(0, 0), (10, 0), (5, 8)], (1, 2, 3, 4))
print(screen.width, screen.height, screen.bounds(), screen)`, { game: true });
    expect(r.output).toBe('800 600 <ZRect (x: 0, y: 0, w: 800, h: 600)> <Screen width=800 height=600>\n');
    expect(r.cmds).toEqual([
      ['fill', [0, 0, 0, 255], null],
      ['fill', [255, 165, 0, 255], null],
      ['fill', [10, 20, 30, 255], [255, 0, 0, 128]],
      ['blit', 'alien', 10, -3],
      ['blit', 'box', 5, 6],
      ['line', 0, 2, 2, 4, [255, 255, 255, 255], 1],
      ['line', 0, 0, 5, 5, [1, 2, 3, 255], 4],
      ['circle', 10, 10, 5, [255, 0, 0, 255], 1],
      ['filled_circle', 10, 12, 3, [9, 8, 7, 255]],
      ['rect', 1, 2, 3, 4, [255, 0, 0, 255], 1],
      ['filled_rect', 1, 2, 3, 4, [0, 255, 0, 255]],
      ['filled_rect', 8, 8, 24, 4, [0, 0, 255, 255]],
      ['filled_rect', 8, 12, 4, 6, [0, 0, 255, 255]],
      ['filled_rect', 28, 12, 4, 6, [0, 0, 255, 255]],
      ['filled_rect', 8, 18, 24, 4, [0, 0, 255, 255]],
      ['polygon', [[0, 0], [10, 0], [5, 8]], [255, 255, 0, 255]],
      ['filled_polygon', [[0, 0], [10, 0], [5, 8]], [1, 2, 3, 4]],
    ]);
  });

  it('wrong arguments fail like in pgzero', () => {
    const r = run(`for f in (lambda: screen.draw.rect((1, 2, 3, 4), "red"), lambda: screen.draw.line((1, 2), (3, 4), "nocolor"),
          lambda: screen.draw.line((1, 2), (3, 4), (300, 0, 0)), lambda: screen.draw.line(5, (3, 4), "red"),
          lambda: screen.draw.circle(("a", 1), 3, "red"), lambda: screen.blit("nothing", (0, 0)),
          lambda: screen.draw.text("x"), lambda: screen.draw.text("x", (1, 1), colour="red")):
    try:
        f()
    except Exception as e:
        print(type(e).__name__ + ": " + str(e))`, { game: true });
    expect(lines(r)).toEqual([
      'TypeError: screen.draw.rect() requires a rect to draw',
      'ValueError: invalid color name',
      'ValueError: invalid color argument',
      'TypeError: Coordinate must be a tuple (not 5)',
      "TypeError: Coordinate values must be numbers (not ('a', 1))",
      `KeyError: "No image found like 'nothing'. Are you sure the image exists?"`,
      'ValueError: Unable to determine horizontal position',
      "TypeError: _ptext_draw() got an unexpected keyword argument 'colour'",
    ]);
  });

  it('text: the position and anchor are resolved like ptext, the host measures and renders', () => {
    const r = run(`screen.draw.text("Hi", (10, 20))
screen.draw.text("Mid", center=(400, 300), fontsize=60, color="orange", owidth=1.5)
screen.draw.text("R", topright=(790.5, 10), angle=47, alpha=0.4, align="right", shadow=(1, 1))
screen.draw.textbox("Box", Rect(10, 10, 200, 50), color=(1, 2, 3))`, { game: true });
    const [a, b, c, d] = r.cmds;
    expect(a.slice(0, 5)).toEqual(['text', 'Hi', 10, 20, 0]);
    expect(a[5]).toBe(0);
    expect(a[6]).toMatchObject({ fontsize: 24, color: [255, 255, 255, 255], angle: 0, alpha: 1, align: null });
    expect(b.slice(1, 6)).toEqual(['Mid', 400, 300, 0.5, 0.5]);
    expect(b[6]).toMatchObject({ fontsize: 60, color: [255, 165, 0, 255], owidth: 1.5, ocolor: [0, 0, 0, 255], align: 0.5 });
    expect(c.slice(1, 6)).toEqual(['R', 790.5, 10, 1, 0]);
    expect(c[6]).toMatchObject({ angle: 48, alpha: 0.375, align: 1, shadow: [1, 1], scolor: [0, 0, 0, 255] });
    expect(d.slice(0, 8)).toEqual(['textbox', 'Box', 10, 10, 200, 50, 0.5, 0.5]);
    expect(d[8]).toMatchObject({ color: [1, 2, 3, 255], fontsize: null, width: 200 });
  });

  it('Actor.draw sends image, top left corner (truncated like blit), size and transformations', () => {
    const r = run(`a = Actor("alien", (100.7, 50.2))
a.draw()
a.angle = 30
a.opacity = 1.7
a.draw()
a.scale = 0.5
a.flip_x = True
a.opacity = 0.25
a.draw()
print(a, a.opacity, a.scale, a.flip_x, a.flip_y, a.rect())
b = Actor(images.box, center=(5, 5))
print(b, b.image, b.size)`, { game: true });
    expect(r.output).toBe('<Actor \'alien\' pos=(100.7, 50.2)> 0.25 0.5 True False <ZRect (x: 74.91058083755676, y: 22.031415712957916, w: 51, h: 56)>\n<Actor \'box\' pos=(5.0, 5.0)> box (40, 30)\n');
    expect(r.cmds).toEqual([
      ['actor', 'alien', 67, 4, 66, 92, 0, 1, false, false, 1],
      ['actor', 'alien', 49, -6, 103, 112, 30, 1, false, false, 1],
      ['actor', 'alien', 74, 22, 51, 56, 30, 0.5, true, false, 0.25],
    ]);
  });
});

describe('sounds, music and tone', () => {
  it('play commands and the state the program can ask for', () => {
    const r = run(`sounds.eep.play()
sounds.boom.play(2)
sounds.eep.set_volume(0.3)
print(sounds.eep.get_volume(), sounds.boom.get_length())
sounds.eep.stop()
print(music.is_playing("theme"))
music.play("theme")
music.set_volume(0.5)
print(music.is_playing("theme"), music.get_volume())
music.pause()
print(music.is_playing("theme"))
music.unpause()
music.fadeout(1.5)
music.play_once("intro")
music.queue("theme")
music.stop()
print(music.is_playing("theme"))
tone.play("A4", 0.5)
tone.play(261.63, 1)
t = tone.create("C#5", 0.25)
t.play()
try:
    music.play("nothing")
except KeyError as e:
    print(e)
try:
    sounds.nothing
except AttributeError as e:
    print(e)`, { game: true });
    expect(lines(r)).toEqual([
      '0.296875 1.2499773502349854', 'False', 'True 0.5', 'False', 'False',
      `"No music found like 'nothing'. Are you sure the music exists?"`,
      "No sound found like 'nothing'. Are you sure the sound exists?",
    ]);
    expect(r.cmds).toEqual([
      ['sound_play', 'eep', 0, 0, 0, 1], ['sound_play', 'boom', 2, 0, 0, 1], ['sound_volume', 'eep', 0.296875],
      ['sound_stop', 'eep'], ['music_play', 'theme', -1], ['music_volume', 0.5], ['music_pause'], ['music_unpause'],
      ['music_fadeout', 1500], ['music_play', 'intro', 0], ['music_queue', 'theme'], ['music_stop'],
      ['tone', 440, 11025, 1], ['tone', 261.63, 22050, 1], ['tone', 554.3652619537443, 5512, 1],
    ]);
  });
});

describe('frame driver', () => {
  const game = (src) => {
    const { vm, out } = pgzVM(src, { game: true });
    const err = finish(vm, vm.start());
    if (err) throw new Error(JSON.stringify(err));
    return { vm, out, step: (events = [], dt = 0.02) => frame(vm, out, events, dt) };
  };

  it('keyboard state, handlers with any subset of their parameters, update with and without dt', () => {
    const g = game(`def update():
    print("update", keyboard.left, keyboard[keys.A], keyboard.lshift)
def on_key_down(key):
    print("down", key)
def on_mouse_down(button, pos):
    print("mouse", button, pos)
def draw():
    print("draw")`);
    expect(g.step([['key_down', 1073741904, 0, '']]).drawn).toBe(true);
    g.step([['key_down', 97, 1, 'A'], ['mouse_down', [3, 4], 1]]);
    g.step([['key_up', 1073741904, 0]]);
    expect(g.out.output).toBe('down 1073741904\nupdate True False False\ndraw\ndown 97\nmouse 1 (3, 4)\nupdate True True False\ndraw\nupdate False True False\ndraw\n');
    expect(g.out.cmds[0]).toEqual(['window', 800, 600, 'Pygame Zero Game']);
  });

  it('music_end updates music.is_playing and calls on_music_end; unknown key codes skip the hook but count as pressed', () => {
    const g = game(`music.play_once("intro")
music.queue("theme")
def on_music_end():
    print("end", music.is_playing("x"))
def on_key_down(key):
    print("key", key)
def update():
    print(keyboard[1073742106], keyboard.LEFT, keyboard.K_a, keyboard.k_0)`);
    g.step([['music_end']]);
    g.step([['music_end'], ['key_down', 1073742106, 0, ''], ['key_down', 97, 0, 'a'], ['key_down', 48, 0, '0']]);
    expect(g.out.output).toBe('end True\nFalse False False False\nend False\nkey 97\nkey 48\nTrue False True True\n');
  });

  it('a changed WIDTH, HEIGHT or TITLE becomes a window command', () => {
    const g = game('WIDTH = 100\nHEIGHT = 80\ndef update():\n    global WIDTH, TITLE\n    WIDTH = 200\n    TITLE = "Two"\n');
    expect(g.step().cmds).toEqual([['window', 100, 80, 'Pygame Zero Game'], ['window', 200, 80, 'Two']]);
    expect(g.step().cmds).toEqual([]);
  });

  it('quit returns None, Ctrl+Q ends the program with SystemExit, draw(x) and wrong hook parameters are errors', () => {
    let g = game('def draw():\n    pass');
    const t = g.step([['quit']]);
    expect(t.drawn).toBe(false);
    expect(t.exited).toBe(false);
    expect(g.step([['key_down', 113, 64, 'q']])).toMatchObject({ exited: true, error: null });
    g = game('def update():\n    exit()');
    expect(g.step()).toMatchObject({ exited: true, error: null });
    g = game('def draw(screen):\n    pass');
    expect(g.step().error).toMatchObject({ kind: 'TypeError' });
    g = game('def on_mouse_down(position):\n    pass');
    const e = g.step().error;
    expect(e.kind).toBe('InvalidParameter');
    expect(g.out.output).toBe('');
    g = game('def on_key_down(k):\n    pass');
    expect(g.step().error.kind).toBe('InvalidParameter');
  });

  it('import pgzrun and go(): the main program waits (kind "pgzero") while the host runs frames', () => {
    const { vm, out } = pgzVM('import pgzrun\nprint(Actor("box"), screen)\ndef draw():\n    print("draw")\npgzrun.go()\nprint("after")');
    const main = vm.start();
    expect(finish(vm, main)).toBeNull();
    expect(main.state).toBe('waiting');
    expect(main.wait).toEqual({ kind: 'pgzero' });
    expect(finish(vm, pgzStart(vm))).toBeNull();
    frame(vm, out);
    vm.resume(main, null);
    finish(vm, main);
    expect(out.output).toBe("<Actor 'box' pos=(20.0, 15.0)> <Screen width=800 height=600>\ndraw\nafter\n");
  });

  it('from pgzero_builtins import * works without game mode', () => {
    const r = run('from pgzero_builtins import *\nprint(Rect(1, 2, 3, 4), keys.SPACE, mouse.RIGHT)');
    expect(r.output).toBe('<rect(1, 2, 3, 4)> 32 3\n');
  });

  it('values between host and Python', () => {
    expect(toPy([1, 2.5, 'a', [true, null], { x: -0 }])).toEqual(new PyTuple([1, new PyFloat(2.5), 'a', new PyTuple([true, null]), toPy({ x: -0 })]));
    expect(toHost(toPy([1, 2.5, ['b']]))).toEqual([1, 2.5, ['b']]);
  });
});

describe('Actor extensions (as in pgzhelper)', () => {
  it('scale, flip, direction_to, move_towards, move_forward, images and next_image match pgzhelper', () => {
    const r = run(`a = Actor('alien', (100, 100))
print(a.width, a.height, a.pos, a.topleft)
a.scale = 0.5
print(a.width, a.height, a.pos, a.topleft)
a.angle = 30
print(a.width, a.height, a.pos, a.topleft)
a.scale = 1.5
print(a.width, a.height, a.pos, a.topleft)
b = Actor('box', (0, 0), anchor=('left', 'top'))
b.scale = 2
print(b.width, b.height, b.pos, b.topleft)
b.angle = 90
print(b.width, b.height, b.pos, b.topleft)
for t in [(100, 100), (200, 100), (100, 0), (0, 100), (100, 200), (150, 50), (99, 101)]:
    print(t, a.direction_to(t), a.distance_to(t))
c = Actor('box', (10, 10))
c.move_towards((20, 10), 3); print(c.pos)
c.move_towards((20, 10), 30); print(c.pos)
c.move_towards(90, 5); print(c.pos)
c.point_towards((0, 0)); print(c.angle, c.width, c.height, c.pos)
c.angle = 0
c.move_forward(10); print(c.pos)
c.angle = 45
c.move_forward(10); print(c.pos)
c.move_back(10); print(c.pos)
c.move_left(4); print(c.pos)
c.move_right(4); print(c.pos)
d = Actor('box', (50, 50))
d.images = ['box', 'alien', 'tall']
print(d.image, d.width, d.height, d.pos)
print(d.next_image(), d.image, d.width, d.height, d.pos)
print(d.next_image(), d.image, d.pos)
print(d.next_image(), d.image, d.pos)
print(d.sel_image(2), d.image, d.sel_image(7), d.sel_image('zzz'))`, { game: true });
    // output of the same program with pgzhelper.py (QuirkyCort/pgzhelper) on pgzero 1.2.1
    expect(r.output).toBe(`66 92 (100.0, 100.0) (67.0, 54.0)
33 46 (100.0, 100.0) (83.5, 77.0)
51 56 (100.0, 100.0) (74.21058083755676, 71.83141571295792)
154 169 (100.0, 100.0) (22.631742512670286, 15.494247138873732)
80 60 (0.0, 0.0) (0.0, 0.0)
60 80 (0.0, 0.0) (0.0, -80.0)
(100, 100) 360.0 0.0
(200, 100) 360.0 100.0
(100, 0) 90.0 100.0
(0, 100) 180.0 100.0
(100, 200) 270.0 100.0
(150, 50) 45.0 70.71067811865476
(99, 101) 225.0 1.4142135623730951
(13.0, 10.0)
(20.0, 10.000000000000002)
(20.0, 5.000000000000002)
165.96375653207352 46 38 (20.0, 5.000000000000002)
(30.0, 5.000000000000002)
(37.071067811865476, -2.0710678118654755)
(30.0, 5.0)
(27.17157287525381, 2.1715728752538084)
(30.0, 5.0)
box 40 30 (50.0, 50.0)
1 alien 66 92 (50.0, 50.0)
2 tall (50.0, 50.0)
0 box (50.0, 50.0)
True tall False False
`);
  });

  it('animate() switches images fps times per second of clock time', () => {
    const r = runFrames(`a = Actor("box", (10, 10))
a.images = ["box", "alien", "tall"]
a.fps = 10
def update():
    i = a.animate()
    if i >= 0:
        print(round(clock.clock.t, 3), i, a.image)`, Array.from({ length: 30 }, () => ({ dt: 0.025, events: [] })));
    expect(r.error).toBeNull();
    expect(r.output.replace(/--- frame \d+\n/g, '')).toBe('0.225 1 alien\n0.3 2 tall\n0.4 0 box\n0.5 1 alien\n0.6 2 tall\n0.7 0 box\n');
  });
});

describe('speed', () => {
  it('10000 Rect and Actor collisions per frame budget', () => {
    const src = `rects = [Rect(i * 37 % 120, i * 53 % 90, 20, 20) for i in range(100)]
r = Rect(40, 30, 50, 50)
hits = 0
for k in range(100):
    for o in rects:
        if r.colliderect(o):
            hits += 1
a = Actor("box", (60, 50))
actors = [Actor("box", (i * 37 % 120, i * 53 % 90)) for i in range(100)]
ahits = 0
for k in range(100):
    for o in actors:
        if a.colliderect(o):
            ahits += 1
print(hits, ahits)`;
    const t0 = performance.now();
    const r = run(src, { game: true });
    const ms = performance.now() - t0;
    console.log(`10000 Rect.colliderect + 10000 Actor.colliderect: ${ms.toFixed(0)} ms`);
    // the same counts computed here
    const hit = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ay < by + bh && ax + aw > bx && ay + ah > by;
    let hits = 0, ahits = 0;
    for (let i = 0; i < 100; i++) {
      if (hit(40, 30, 50, 50, (i * 37) % 120, (i * 53) % 90, 20, 20)) hits += 100;
      if (hit(40, 35, 40, 30, (i * 37) % 120 - 20, (i * 53) % 90 - 15, 40, 30)) ahits += 100;
    }
    expect(hits).toBeGreaterThan(0);
    expect(r.output).toBe(`${hits} ${ahits}\n`);
    expect(ms).toBeLessThan(5000);
  });
});
