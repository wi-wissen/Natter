// Pure logic of the web host: coordinates, animation times, kara world, http results, and the runner (runs in Node:
// it only needs MessageChannel, setTimeout and performance).
import { describe, it, expect } from 'vitest';
import { makeView, moveSeconds, turnSeconds, angleDiff, shapePolygon, cssFont, keysym, fitScale } from '../src/turtleMath.js';
import { parseWorldText, mushroomsDone, turnDelta } from '../src/karaWorld.js';
import { doHttp } from '../src/http.js';
import { createRunner } from '../src/runner.js';
import { describeError } from '../src/errors.js';

describe('turtle maths', () => {
  it('maps turtle coordinates (origin centre, y up) to pixels and back', () => {
    const v = makeView(400, 300);
    expect(v.toPx(0, 0)).toEqual([200, 150]);
    expect(v.toPx(100, 50)).toEqual([300, 100]);
    expect(v.fromPx(300, 100)).toEqual([100, 50]);
    const w = makeView(400, 300, [0, 0, 10, 10]);
    expect(w.toPx(0, 0)).toEqual([0, 300]);
    expect(w.toPx(10, 10)).toEqual([400, 0]);
    expect(w.fromPx(200, 150)).toEqual([5, 5]);
  });
  it('animation times follow the speed; 0 means no animation', () => {
    expect(moveSeconds(100, 0)).toBe(0);
    expect(moveSeconds(100, 1)).toBeGreaterThan(moveSeconds(100, 3));
    expect(moveSeconds(100, 3)).toBeGreaterThan(moveSeconds(100, 10));
    expect(moveSeconds(100, 3)).toBeCloseTo(0.278, 2);
    expect(turnSeconds(90, 3)).toBeCloseTo(0.333, 2);
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(10, 350)).toBe(-20);
  });
  it('shapes point along the heading', () => {
    const [tip] = shapePolygon('arrow', 0, 0, 1, 0).slice(2);
    expect(tip[0]).toBeCloseTo(10);
    expect(tip[1]).toBeCloseTo(0);
    const up = shapePolygon('arrow', 0, 0, 0, -1)[2];
    expect(up[1]).toBeCloseTo(-10);
  });
  it('fonts, key names, fitting', () => {
    expect(cssFont(['Arial', 24, 'bold'])).toBe('bold 32px Arial, Arial, sans-serif');
    expect(cssFont(['Times New Roman', 12, 'italic'])).toBe('italic 16px "Times New Roman", Arial, sans-serif');
    expect(keysym('ArrowLeft')).toBe('Left');
    expect(keysym(' ')).toBe('space');
    expect(keysym('a')).toBe('a');
    expect(fitScale(480, 1000, 960, 810)).toBe(0.5);
    expect(fitScale(2000, 2000, 960, 810)).toBe(1);
    expect(fitScale(2000, 2000, 100, 100, { upscale: true, max: 1.5 })).toBe(1.5);
  });
});

describe('kara world', () => {
  it('reads the picture of the core', () => {
    const w = parseWorldText('####\n#@.#\n#$*#\n####');
    expect([w.width, w.height]).toEqual([4, 4]);
    expect(w.kara).toEqual({ x: 1, y: 1, dir: 0 });
    expect(w.cells[1][2].berry).toBe(true);
    expect(w.cells[2][2]).toEqual({ tree: false, berry: true, mushroom: true });
    expect(mushroomsDone(w)).toBe(false);
    w.cells[2][1].berry = true;
    expect(mushroomsDone(w)).toBe(true);
    expect(turnDelta(0, 1)).toBe(-90);
    expect(turnDelta(0, 3)).toBe(90);
  });
});

describe('http', () => {
  const res = (status, text) => ({ status, statusText: '', url: 'https://x.org/a', text: async () => text, headers: new Map([['content-type', 'text/plain']]) });
  it('returns status, text and headers', async () => {
    const r = await doHttp({ method: 'GET', url: 'https://x.org/a' }, { fetch: async () => res(404, 'nope') });
    expect(r).toEqual({ status: 404, reason: 'Not Found', headers: { 'content-type': 'text/plain' }, text: 'nope', url: 'https://x.org/a' });
  });
  it('TypeError is CORS, other schemes are blocked, slow answers time out', async () => {
    expect((await doHttp({ url: 'https://x.org' }, { fetch: async () => { throw new TypeError('Failed to fetch'); } })).error).toBe('cors');
    expect((await doHttp({ url: 'file:///etc/passwd' }, { fetch: async () => res(200, '') })).error).toBe('blocked');
    const ctrl = new AbortController();
    const slow = (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    expect((await doHttp({ url: 'https://x.org', timeout: 0.05 }, { fetch: slow, signal: ctrl.signal, abort: () => ctrl.abort() })).error).toBe('timeout');
  });
});

describe('runner', () => {
  const collect = (opts = {}) => {
    const log = { out: '', states: [], errors: [] };
    const runner = createRunner({ timeScale: 0.01, ...opts });
    runner.on('output', (t) => { log.out += t; });
    runner.on('state', (s) => log.states.push(s));
    runner.on('error', (e) => log.errors.push(e));
    return { runner, log };
  };

  it('runs a program in slices and reports done', async () => {
    const { runner, log } = collect();
    const s = await runner.run('import time\nfor i in range(3):\n    print(i)\n    time.sleep(1)\nprint(time.time() > 1.6e9)\n');
    expect(s).toBe('done');
    expect(log.out).toBe('0\n1\n2\nTrue\n');
    expect(log.states[0]).toBe('running');
    expect(log.states.at(-1)).toBe('done');
  });

  it('input() takes queued and sent lines and echoes them', async () => {
    const { runner, log } = collect();
    runner.on('input', () => runner.sendInput('Bob'));
    const s = await runner.run('a = input("A? ")\nb = input("B? ")\nprint(a + b)\n', { inputs: ['Ann'] });
    expect(s).toBe('done');
    expect(log.out).toBe('A? Ann\nB? Bob\nAnnBob\n');
  });

  it('stops an endless loop', async () => {
    const { runner } = collect();
    const p = runner.run('while True:\n    pass\n');
    await new Promise((r) => setTimeout(r, 50));
    expect(runner.state).toBe('running');
    runner.stop();
    expect(await p).toBe('stopped');
  });

  it('reports errors (also syntax errors) with line and friendly text', async () => {
    const { runner, log } = collect();
    expect(await runner.run('x = 1\nprint(y)\n')).toBe('error');
    expect(log.errors[0].line).toBe(2);
    expect(describeError(log.errors[0], { lang: 'de' }).title).toBe('NameError in Zeile 2');
    expect(await runner.run('if True\n  pass\n')).toBe('error');
    expect(log.errors[1].kind).toBe('SyntaxError');
  });

  it('wait handlers: registered ones first, unknown kinds give a clear error', async () => {
    const { runner, log } = collect();
    const seen = [];
    runner.registerWait('sleep', (wait, ctx) => { seen.push(wait.seconds); ctx.resume(null); });
    expect(await runner.run('import time\ntime.sleep(5)\nprint("ok")\n')).toBe('done');
    expect(seen).toEqual([5]);
    expect(log.out).toBe('ok\n');
    const r2 = collect();
    expect(await r2.runner.run('import pgzrun\npgzrun.go()\n')).toBe('error');
    expect(r2.log.errors[0].params.message).toContain("'pgzero'");
  });

  it('host entries reach the VM and plugins get start and end', async () => {
    const { runner } = collect();
    const events = [];
    runner.use({ host: { kara: (kind, args) => { events.push(kind); return 0; } }, start: () => events.push('start'), end: (s) => events.push('end:' + s) });
    const { karaGlobals } = await import('@natter/core');
    expect(await runner.run('world("""\n#@ #\n""")\nmove()\n', { globals: karaGlobals() })).toBe('done');
    expect(events).toEqual(['start', 'world', 'move', 'end:done']);
  });

  it('debugger: breakpoint pauses, step and continue go on', async () => {
    const { runner, log } = collect();
    let paused = 0;
    runner.on('state', (s, info) => { if (s === 'paused') { paused++; if (paused === 1) { expect(info.line).toBe(2); runner.step('over'); } else runner.continue(); } });
    expect(await runner.run('a = 1\nb = 2\nprint(a + b)\n', { breakpoints: [2] })).toBe('done');
    expect(paused).toBe(2);
    expect(log.out).toBe('3\n');
  });

  it('file changes are reported', async () => {
    const { runner } = collect();
    const files = [];
    runner.on('file', (p, t) => files.push([p, t]));
    await runner.run('f = open("x.txt", "w")\nf.write("1")\nf.close()\n');
    expect(files.at(-1)).toEqual(['x.txt', '1']);
  });
});
