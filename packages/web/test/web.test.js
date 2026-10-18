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
    const { karaGlobals } = await import('@natterjs/core');
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

  describe('projects with several files', () => {
    const project = {
      'main.py': 'import hilfen\nfrom spiel import regeln\nimport spiel.punkte as p\nprint(hilfen.doppelt(2), regeln.NAME, p.summe([1, 2]))\n',
      'hilfen.py': 'def doppelt(x):\n    return 2 * x\n',
      'spiel/__init__.py': 'TITEL = "Spiel"\n',
      'spiel/regeln.py': 'from . import punkte\nfrom .punkte import summe\nNAME = "Regeln " + str(summe([3]))\n',
      'spiel/punkte.py': 'def summe(xs):\n    total = 0\n    for x in xs:\n        total += x\n    return total\n',
      'kaputt.py': 'def f(:\n    pass\n',
      'fehler.py': 'def teile(a):\n    return 10 / a\n',
    };

    it('files serve import of own modules, packages and relative imports', async () => {
      const { runner, log } = collect();
      expect(await runner.run(project['main.py'], { files: project })).toBe('done');
      expect(log.errors).toEqual([]);
      expect(log.out).toBe('4 Regeln 3 3\n');
    });

    it('modules are found next to the program first, then at the top of the project', async () => {
      const { runner, log } = collect();
      const files = { 'a/main.py': 'import h\nprint(h.X)\n', 'a/h.py': 'X = "a"\n', 'h.py': 'X = "top"\n', 'b/main.py': 'import h\nprint(h.X)\n' };
      expect(await runner.run(files['a/main.py'], { files, file: 'a/main.py' })).toBe('done');
      expect(await runner.run(files['b/main.py'], { files, file: 'b/main.py' })).toBe('done');
      expect(log.out).toBe('a\ntop\n');
    });

    it('an error in an imported file names that file, with the call stack across files', async () => {
      const { runner, log } = collect();
      const src = 'import fehler\n\nprint(fehler.teile(0))\n';
      expect(await runner.run(src, { files: { ...project, 'main.py': src } })).toBe('error');
      const e = log.errors[0];
      expect(e).toMatchObject({ kind: 'ZeroDivisionError', file: 'fehler.py', line: 2 });
      expect(e.traceback).toEqual([{ name: '<module>', line: 3, file: 'main.py' }, { name: 'teile', line: 2, file: 'fehler.py' }]);
      const d = describeError(e, { lang: 'de', source: src, files: project });
      expect(d.title).toBe('ZeroDivisionError in fehler.py, Zeile 2');
      expect(d.file).toBe('fehler.py');
      expect(d.traceback).toContain('File "fehler.py", line 2, in teile\n    return 10 / a');
      expect(d.traceback).toContain('File "main.py", line 3, in <module>\n    print(fehler.teile(0))');
    });

    it('a syntax error in an imported file keeps the line of that file', async () => {
      const { runner, log } = collect();
      const src = 'x = 1\nimport kaputt\n';
      expect(await runner.run(src, { files: project })).toBe('error');
      expect(log.errors[0]).toMatchObject({ kind: 'SyntaxError', file: 'kaputt.py', line: 1 });
      expect(describeError(log.errors[0], { lang: 'en', source: src, files: project }).traceback).toMatch(/File "main.py", line 2, in <module>\n {4}import kaputt\n {2}File "kaputt.py", line 1\n {4}def f\(:/);
    });

    it('relative imports outside a package are an ImportError', async () => {
      const { runner, log } = collect();
      expect(await runner.run('from . import hilfen\n', { files: project })).toBe('error');
      expect(log.errors[0]).toMatchObject({ kind: 'ImportError', code: 'err.script.importRelative' });
    });

    it('the page can still serve modules itself (host.readModule wins)', async () => {
      const { runner, log } = collect({ host: { readModule: (name) => (name === 'hilfen' ? 'def doppelt(x):\n    return 0\n' : null) } });
      expect(await runner.run('import hilfen\nimport fehler\nprint(hilfen.doppelt(5), fehler.teile(5))\n', { files: project })).toBe('done');
      expect(log.out).toBe('0 2.0\n');
    });

    it('breakpoints per file stop in an imported file only', async () => {
      const { runner, log } = collect();
      const stops = [];
      runner.on('state', (s, info) => { if (s === 'paused') { stops.push(`${info.file}:${info.line}`); runner.continue(); } });
      const src = 'import spiel.punkte as p\nx = 2\nprint(p.summe([x, 3]))\n';
      // line 2 exists in both files: only spiel/punkte.py has the breakpoint
      expect(await runner.run(src, { files: project, breakpoints: { 'spiel/punkte.py': [2] } })).toBe('done');
      expect(stops).toEqual(['spiel/punkte.py:2']);
      expect(runner.inspect().frames).toEqual([]);
      expect(log.out).toBe('5\n');
    });

    it('setBreakpoints(file, lines) applies to a running program; the old form (lines of any file) still works', async () => {
      const { runner } = collect();
      const stops = [];
      let first = true;
      runner.on('state', (s, info) => {
        if (s !== 'paused') return;
        stops.push(`${info.file}:${info.line}`);
        if (first) {
          first = false;
          expect(runner.inspect().frames.map((f) => f.file)).toEqual(['main.py']);
          runner.setBreakpoints('main.py', []);
          runner.setBreakpoints('spiel/punkte.py', [5]);
        }
        runner.continue();
      });
      const src = 'import spiel.punkte as p\nx = 2\nprint(p.summe([x]))\n';
      expect(await runner.run(src, { files: project, breakpoints: { 'main.py': [2] } })).toBe('done');
      expect(stops).toEqual(['main.py:2', 'spiel/punkte.py:5']);
      expect(runner.breakpoints).toEqual({ 'spiel/punkte.py': [5] });
      runner.setBreakpoints({});
      stops.length = 0;
      expect(await runner.run(src, { files: project, breakpoints: [2] })).toBe('done');
      expect(stops).toEqual(['main.py:2', 'spiel/punkte.py:2']);
    });

    it('packs used only by an imported file are loaded, too', async () => {
      const { runner, log } = collect();
      const files = { 'main.py': 'import werkzeug\nprint(werkzeug.f())\n', 'werkzeug.py': 'import re\ndef f():\n    return re.sub("a", "b", "aa")\n' };
      expect(await runner.run(files['main.py'], { files })).toBe('done');
      expect(log.out).toBe('bb\n');
    });
  });

  it('file changes are reported', async () => {
    const { runner } = collect();
    const files = [];
    runner.on('file', (p, t) => files.push([p, t]));
    await runner.run('f = open("x.txt", "w")\nf.write("1")\nf.close()\n');
    expect(files.at(-1)).toEqual(['x.txt', '1']);
  });
});

describe('kara images', async () => {
  const { karaImageUrls, karaSprite, meadowDecor, KARA_IMAGES } = await import('../src/karaWorld.js');
  it('finds the kara images in the catalog and in pack.json', () => {
    const cat = { images: [{ name: 'kara', file: 'kara/kara.png' }, { name: 'kara', file: 'other.png' }, { name: 'ente', file: 'animals/ente.png' }, { name: 'kara_rock', file: 'kara/kara_rock.png' }, { name: 'kara_tree', file: '/abs/tree.png' }] };
    expect(karaImageUrls(cat, 'https://x/lib/')).toEqual({ kara: 'https://x/lib/kara/kara.png', kara_tree: '/abs/tree.png' });
    expect(karaImageUrls({ assets: [{ name: 'kara_grass', file: 'kara_grass.png' }] }, '/a/', 'kara/')).toEqual({ kara_grass: '/a/kara/kara_grass.png' });
    expect(KARA_IMAGES).toContain('kara_mushroom_berry');
  });
  it('picks the picture for the direction, turns kara while turning', () => {
    expect(karaSprite({ angle: 0 })).toEqual({ name: 'kara', rotate: 0 });
    expect(karaSprite({ angle: -90 })).toEqual({ name: 'kara_up', rotate: 0 });
    expect(karaSprite({ angle: 180 })).toEqual({ name: 'kara_left', rotate: 0 });
    expect(karaSprite({ angle: 450 })).toEqual({ name: 'kara_down', rotate: 0 });
    expect(karaSprite({ angle: -45 })).toEqual({ name: 'kara', rotate: 315 });
    expect(karaSprite({ angle: 90, berry: true })).toEqual({ name: 'kara_berry', rotate: 90 });
    expect(karaSprite({ angle: 180, berry: true, bump: true })).toEqual({ name: 'kara_bump', rotate: 180 });
  });
  it('decorates few cells, always the same ones', () => {
    let n = 0;
    for (let y = 0; y < 20; y++) for (let x = 0; x < 30; x++) {
      const d = meadowDecor(x, y);
      expect(d).toEqual(meadowDecor(x, y));
      if (d) { n++; expect(d.name).toBe('kara_flower'); expect(d.dx > 0 && d.dx < 1 && d.dy > 0 && d.dy < 1).toBe(true); }
    }
    expect(n).toBeGreaterThan(20);
    expect(n).toBeLessThan(120);
  });
});
