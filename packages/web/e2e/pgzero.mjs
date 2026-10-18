// Browser tests of the Pygame Zero host on the demo page (Chromium, headless): node packages/web/e2e/pgzero.mjs [filter ...]
// Needs the bundle (npm run web:build). Screenshots land in packages/web/e2e/out/ (pgz-*.png).
import { loadPlaywright, chromiumPath, serve, runTests, assert, assertEq, OUT } from './lib.mjs';
import { join } from 'node:path';

const { chromium } = await loadPlaywright();

/** A fake AudioContext that records what is played (the real one needs a user gesture and a sound card). */
function audioSpy() {
  window.__audio = [];
  const log = (...a) => window.__audio.push(a);
  const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} });
  class Node { connect() {} disconnect() {} }
  window.AudioContext = class {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = new Node(); log('context'); }
    resume() { return Promise.resolve(); }
    suspend() { log('suspend'); return Promise.resolve(); }
    createGain() { const n = new Node(); n.gain = param(); return n; }
    createBufferSource() {
      const n = new Node();
      n.start = (t, off) => log('start', n.buffer?.duration > 0, n.loop);
      n.stop = () => {};
      return n;
    }
    createOscillator() { const n = new Node(); n.frequency = param(); n.start = () => log('tone', n.frequency.value, n.type); n.stop = () => {}; return n; }
  };
}

async function setup() {
  const { server, port } = await serve();
  const browser = await chromium.launch({ executablePath: await chromiumPath() });
  const base = `http://127.0.0.1:${port}/demo/index.html`;
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await desktop.addInitScript(audioSpy);
  const page = await desktop.newPage();
  page.on('pageerror', (e) => console.log('     page error:', e.message));
  await page.goto(base);
  await page.waitForFunction(() => window.demo?.pgz);
  return { browser, page, base, async close() { await browser.close(); server.close(); } };
}

const finished = (page, timeout = 30000) => page.waitForFunction(() => ['done', 'error', 'stopped'].includes(document.body.dataset.state), null, { timeout });
const state = (page) => page.evaluate(() => document.body.dataset.state);
const output = (page) => page.evaluate(() => window.demo.con.text);
const info = (page) => page.evaluate(() => window.demo.pgz.info);
const global = (page, name) => page.evaluate((n) => { const v = window.demo.runner.vm.globals.get(n); return typeof v === 'object' && v ? v.v ?? String(v) : v; }, name);
const px = (page, x, y) => page.evaluate(([x, y]) => window.demo.pgz.pixel(x, y), [x, y]);
const near = (c, want, tol = 40) => c.every((v, i) => Math.abs(v - want[i]) <= tol);

/** Start an example (id) or a program (source) and wait until the game runs some frames. */
async function game(page, what, frames = 3) {
  if (await page.evaluate(() => ['running', 'waiting'].includes(document.body.dataset.state))) { await page.click('#stop'); await finished(page); }
  await page.evaluate((w) => { if (/\n/.test(w)) window.demo.setCode(w); else window.demo.load(w); }, what);
  const runs = (await info(page)).runs;
  await page.click('#run');
  try {
    await page.waitForFunction(([r, n]) => window.demo.pgz.info.runs > r && window.demo.pgz.info.frames >= n, [runs, frames], { timeout: 20000 });
  } catch (e) {
    throw new Error(`game did not run: ${await state(page)} ${JSON.stringify(await info(page))} ${await output(page)}`);
  }
}
async function stop(page) {
  await page.click('#stop');
  await finished(page);
}
/** Click (or tap) at game coordinates. */
async function clickGame(page, x, y, tap = false) {
  const [cx, cy] = await page.evaluate(([x, y]) => window.demo.pgz.toClient(x + 0.5, y + 0.5), [x, y]);
  const box = await page.locator('#pgzero canvas').boundingBox();
  if (tap) await page.touchscreen.tap(box.x + cx, box.y + cy);
  else await page.mouse.click(box.x + cx, box.y + cy);
}

const SHAPES = `import pgzrun
WIDTH = 400
HEIGHT = 300
TITLE = "Formen"

a = Actor("testbild", (100, 200))
a.angle = 90
b = Actor("testbild", (300, 200))
b.flip_x = True
c = Actor("testbild", (300, 60))
c.scale = 2
c.opacity = 0.5

def draw():
    screen.fill((255, 255, 255))
    screen.draw.filled_rect(Rect(10, 10, 50, 30), (255, 0, 0))
    screen.draw.rect(Rect(70, 10, 50, 30), (0, 0, 255))
    screen.draw.filled_circle((160, 30), 20, (0, 160, 0))
    screen.draw.circle((220, 30), 20, (0, 0, 0), 3)
    screen.draw.line((10, 60), (120, 60), (255, 0, 255), 3)
    screen.draw.filled_polygon([(10, 80), (60, 80), (35, 120)], (255, 160, 0))
    screen.draw.text("Hallo", topleft=(10, 250), fontsize=60, color=(0, 0, 0))
    a.draw()
    b.draw()
    c.draw()

pgzrun.go()
`;

/** A 40 x 20 test image: left half red, right half blue. */
const addTestImage = (page) => page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 40; c.height = 20;
  const g = c.getContext('2d');
  g.fillStyle = '#f00'; g.fillRect(0, 0, 20, 20);
  g.fillStyle = '#00f'; g.fillRect(20, 0, 20, 20);
  window.demo.pgz.addImage('testbild', c);
});

const tests = [
  ['duck pond (book, start): water, shore, arrow keys move the duck', async ({ page }) => {
    await game(page, 'pgz-pond-start');
    assert(near(await px(page, 400, 300), [74, 144, 180], 3), 'water ' + (await px(page, 400, 300)));
    assert(near(await px(page, 5, 5), [110, 170, 90], 3), 'shore');
    assert(near(await px(page, 400, 565), [255, 255, 255], 3), 'white duck at its start');
    const s = await info(page);
    assertEq(JSON.stringify(s.size), '[800,600]', 'window size');
    await page.keyboard.down('ArrowLeft');
    await page.waitForFunction(() => window.demo.runner.vm.globals.get('duck_x') <= 300, null, { timeout: 5000 });
    await page.keyboard.up('ArrowLeft');
    await page.waitForTimeout(100);
    const x = await global(page, 'duck_x');
    await page.waitForTimeout(200);
    assertEq(await global(page, 'duck_x'), x, 'the duck stops when the key is released');
    assert(near(await px(page, x, 565), [255, 255, 255], 3), 'the duck is drawn at its new place');
    const hidpi = await page.evaluate(() => { const c = window.demo.pgz.canvas; return c.width / c.clientWidth; });
    assert(Math.abs(hidpi - (await page.evaluate(() => devicePixelRatio))) < 0.05, 'crisp: canvas follows devicePixelRatio');
    await stop(page);
    assertEq(await state(page), 'stopped', 'Stop works');
    assert(!(await info(page)).running, 'loop ended');
  }],
  ['runs at 60 frames per second with a fixed dt', async ({ page }) => {
    await game(page, 'import pgzrun\nn = []\ndef update(dt):\n    n.append(dt)\npgzrun.go()\n');
    const f0 = (await info(page)).frames;
    await page.waitForTimeout(1000);
    const f1 = (await info(page)).frames;
    assert(f1 - f0 >= 45 && f1 - f0 <= 66, `frames in one second: ${f1 - f0}`);
    const dts = await page.evaluate(() => [...new Set(window.demo.runner.vm.globals.get('n').items.map((v) => v.v))]);
    assertEq(dts.length, 1, 'one dt');
    assert(Math.abs(dts[0] - 1 / 60) < 1e-12, 'dt = 1/60');
    await stop(page);
  }],
  ['drawing: rects, circles, lines, polygons, text, actors with rotation, flip, scale, opacity', async ({ page }) => {
    await addTestImage(page);
    await game(page, SHAPES);
    assertEq((await info(page)).title, 'Formen', 'TITLE');
    assertEq(await page.locator('.nw-pgz-title').innerText(), 'Formen', 'title bar');
    const want = [
      [[30, 25], [255, 0, 0], 'filled rect'], [[70, 25], [0, 0, 255], 'rect outline (left edge)'], [[95, 25], [255, 255, 255], 'inside of the outline'],
      [[160, 30], [0, 160, 0], 'filled circle'], [[220, 30], [255, 255, 255], 'circle ring is hollow'], [[201, 30], [0, 0, 0], 'circle ring'],
      [[60, 60], [255, 0, 255], 'line'], [[35, 90], [255, 160, 0], 'polygon'],
      [[100, 190], [0, 0, 255], 'rotated 90° counterclockwise: right half (blue) on top'], [[100, 210], [255, 0, 0], 'rotated: red below'],
      [[290, 200], [0, 0, 255], 'flip_x: blue on the left'], [[310, 200], [255, 0, 0], 'flip_x: red on the right'],
      [[270, 60], [255, 128, 128], 'scale 2 and opacity 0.5: pink, wide'], [[330, 60], [128, 128, 255], 'scaled: light blue right'],
    ];
    for (const [[x, y], c, what] of want) { const got = await px(page, x, y); assert(near(got, c, 30), `${what} at ${x},${y}: ${got}`); }
    const dark = await page.evaluate(() => { let n = 0; for (let x = 10; x < 160; x++) for (let y = 252; y < 290; y++) { const p = window.demo.pgz.pixel(x, y); if (p[0] < 80) n++; } return n; });
    assert(dark > 300, 'text drawn: ' + dark);
    await page.screenshot({ path: join(OUT, 'pgz-desktop-shapes.png') });
    await stop(page);
  }],
  ['keyboard and mouse reach the hooks (keys, unicode, positions, buttons)', async ({ page }) => {
    await game(page, `import pgzrun
WIDTH = 200
HEIGHT = 100
def on_key_down(key, mod, unicode):
    print("down", key == keys.SPACE, key == keys.A, repr(unicode), mod & keymods.SHIFT != 0)
def on_key_up(key):
    print("up", key == keys.SPACE)
def on_mouse_down(pos, button):
    print("click", pos, button)
def on_mouse_up(pos, button):
    print("release", pos, button)
pgzrun.go()
`);
    await page.keyboard.press('Space');
    await page.keyboard.press('Shift+KeyA');
    await clickGame(page, 50, 20);
    await page.mouse.click(0, 0); // outside: no event
    await page.waitForFunction(() => window.demo.con.text.includes('release'));
    const out = await output(page);
    assert(out.includes("down True False ' ' False\nup True\n"), 'space: ' + out);
    assert(out.includes("down False False '' True\ndown False True 'A' True\nup False\nup False\n"), 'shift (a key of its own), then A: ' + out);
    assert(/click \((49|50|51), (19|20|21)\) 1\nrelease \(\d+, \d+\) 1/.test(out), 'mouse: ' + out);
    await stop(page);
  }],
  ['animate and clock: tween values over single frames', async ({ page }) => {
    await addTestImage(page);
    await game(page, `import pgzrun
a = Actor("testbild", (0, 50))
animate(a, tween="linear", duration=1, x=60)
b = Actor("testbild", (0, 80))
animate(b, tween="accelerate", duration=1, x=100)
t = []
clock.schedule_interval(lambda: t.append(1), 0.5)
def update():
    pass
pgzrun.go()
`, 1);
    await page.evaluate(() => window.demo.pgz.pause());
    const n0 = (await info(page)).frames;
    await page.evaluate((n) => window.demo.pgz.step(35 - n), n0);
    const read = () => page.evaluate(() => ({ frames: window.demo.pgz.info.frames, t: window.demo.runner.vm.globals.get('t').items.length }));
    let r = await read();
    assertEq(r.frames, 35, 'frames');
    assertEq(r.t, 1, 'clock fired once after 0.58 s');
    await page.evaluate(() => window.demo.pgz.step(30));
    r = await read();
    assertEq(r.t, 2, 'clock fired twice after 1.08 s');
    await page.waitForTimeout(200);
    assertEq((await read()).frames, 65, 'no frames while paused');
    await page.evaluate(() => window.demo.pgz.resume());
    await stop(page);
  }],
  ['actor positions after half an animation (Python reads them)', async ({ page }) => {
    await addTestImage(page);
    await game(page, `import pgzrun
a = Actor("testbild", (0, 50))
animate(a, tween="linear", duration=1, x=60)
b = Actor("testbild", (0, 80))
animate(b, tween="accelerate", duration=1, x=100)
frame = 0
def update():
    global frame
    frame += 1
    if frame == 30:
        print("half", round(a.x, 3), round(b.x, 3))
pgzrun.go()
`, 1);
    await page.waitForFunction(() => window.demo.con.text.includes('half'), null, { timeout: 5000 });
    assertEq((await output(page)).trim(), 'half 30.0 25.0', 'linear 30, accelerate 0.5² × 100');
    await stop(page);
  }],
  ['endless loop in update: page stays responsive, "too long" error with the line', async ({ page }) => {
    await game(page, 'pgz-loop', 0);
    const frames = await page.evaluate(() => new Promise((res) => {
      let n = 0; const t0 = performance.now();
      const f = () => { n++; if (performance.now() - t0 < 500) requestAnimationFrame(f); else res(n); };
      requestAnimationFrame(f);
    }));
    assert(frames >= 10, 'page animation frames during the loop: ' + frames);
    await finished(page, 30000);
    assertEq(await state(page), 'error', 'state');
    assertEq(await page.locator('.nw-error').getAttribute('data-code'), 'err.script.tooLong', 'error code');
    const title = await page.locator('.nw-error-title').innerText();
    assert(/Zeile (7|8)/.test(title), 'line: ' + title);
  }],
  ['missing image: friendly message names the file and where it was looked for', async ({ page }) => {
    await page.evaluate(() => window.demo.setCode('import pgzrun\nufo = Actor("ufo")\npgzrun.go()\n'));
    await page.click('#run');
    await finished(page);
    assertEq(await state(page), 'error', 'state');
    const out = await output(page);
    assert(/Bild „ufo“ nicht gefunden/.test(out) && out.includes('images/ufo.png') && out.includes('Paketen der Bibliothek') && out.includes('Meintest du „sp_ufo“?'), 'hint: ' + out);
    const text = await page.locator('.nw-error').innerText();
    assert(/ufo/.test(text), 'error: ' + text);
  }],
  ['sound: hint until the first click, then sounds and tones play (AudioContext spy)', async ({ page }) => {
    await game(page, `import pgzrun
def on_key_down(key):
    if key == keys.C:
        sounds.coin.play()
    if key == keys.T:
        tone.play("A4", 0.2)
def draw():
    screen.fill("black")
pgzrun.go()
`);
    await page.evaluate(() => { window.__audio.length = 0; });
    // the AudioContext of an earlier test may still exist: a fresh plugin state is what the hint needs
    const had = (await info(page)).audio.unlocked;
    if (!had) {
      await page.evaluate(() => window.demo.pgz.canvas.blur());
      await page.evaluate(() => document.activeElement?.blur());
    }
    await page.keyboard.press('c');
    await page.keyboard.press('t');
    await page.waitForFunction(() => window.__audio.some((a) => a[0] === 'tone'), null, { timeout: 5000 });
    const log = await page.evaluate(() => window.__audio);
    assert(log.some((a) => a[0] === 'start' && a[1] === true), 'coin played: ' + JSON.stringify(log));
    assert(log.some((a) => a[0] === 'tone' && Math.abs(a[1] - 440) < 0.01 && a[2] === 'sine'), 'tone A4: ' + JSON.stringify(log));
    assert(!(await info(page)).hint, 'hint gone after the first key');
    await page.click('.nw-pgz-mute');
    assert((await info(page)).audio.muted, 'mute button');
    await page.click('.nw-pgz-mute');
    await stop(page);
  }],
  ['sound hint shows before the first interaction (fresh page)', async ({ browser, base }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(audioSpy);
    const p = await ctx.newPage();
    await p.goto(base);
    await p.waitForFunction(() => window.demo?.pgz);
    await p.evaluate(() => { window.demo.setCode('import pgzrun\ndef update():\n    if not music.is_playing() and not done:\n        sounds.coin.play()\ndone = False\npgzrun.go()\n'); window.demo.run(); });
    await p.waitForSelector('.nw-pgz-hint:not([hidden])', { timeout: 10000 });
    assert(!(await p.evaluate(() => window.demo.pgz.info.audio.unlocked)), 'locked before a gesture');
    await p.click('.nw-pgz-hint');
    await p.waitForFunction(() => window.__audio.some((a) => a[0] === 'start'));
    assert(await p.locator('.nw-pgz-hint').isHidden(), 'hint hidden after the click');
    await ctx.close();
  }],
  ['pause while the tab is hidden', async ({ page }) => {
    await game(page, 'pgz-pong');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    const f0 = (await info(page)).frames;
    await page.waitForTimeout(300);
    assertEq((await info(page)).frames, f0, 'no frames while hidden');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(300);
    const f1 = (await info(page)).frames;
    assert(f1 > f0 && f1 - f0 < 30, `going on without racing: ${f1 - f0}`);
    await stop(page);
  }],
  ['screenshots of every example (desktop)', async ({ page }) => {
    for (const id of ['pgz-pond', 'pgz-jump', 'pgz-pong', 'pgz-tween', 'pgz-piano']) {
      await game(page, id, 20);
      if (id === 'pgz-jump') { await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.press('Space'); await page.waitForTimeout(150); await page.keyboard.up('ArrowRight'); }
      if (id === 'pgz-tween') { await clickGame(page, 450, 300); await page.waitForTimeout(600); }
      if (id === 'pgz-pond') {
        await page.keyboard.down('ArrowUp'); await page.waitForTimeout(250); await page.keyboard.up('ArrowUp');
        assert(await page.evaluate(() => window.demo.runner.vm.globals.get('duck')) !== undefined, 'duck');
      }
      assertEq(await state(page), 'waiting', `${id} runs (${await output(page)})`);
      await page.screenshot({ path: join(OUT, `pgz-desktop-${id.slice(4)}.png`) });
      await stop(page);
    }
  }],
  ['phone (Pixel 7): game fits, on-screen buttons move the heroine, tap acts as a click, screenshots', async ({ browser, base }) => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
    await ctx.addInitScript(audioSpy);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('     page error:', e.message));
    await p.goto(base + '?example=pgz-jump');
    await p.waitForFunction(() => window.demo?.pgz);
    await p.click('#run');
    await p.waitForFunction(() => window.demo.pgz.info.frames > 10, null, { timeout: 20000 });
    const fit = await p.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, r: window.demo.pgz.canvas.getBoundingClientRect().right, ratio: window.demo.pgz.canvas.width / window.demo.pgz.canvas.clientWidth }));
    assert(fit.sw <= 412 && fit.r <= 412, 'no horizontal overflow: ' + JSON.stringify(fit));
    assert(Math.abs(fit.ratio - 2.625) < 0.05, 'crisp on the phone: ' + fit.ratio);
    assert((await p.evaluate(() => window.demo.pgz.info.controls)), 'on-screen buttons shown on a touch screen');
    const heroX = () => p.evaluate(() => { const v = window.demo.runner.vm.globals.get('hero').dict.get('_rect').dict.get('x'); return typeof v === 'number' ? v : v.v; });
    const x0 = await heroX();
    const right = await p.locator('.nw-pgz-pad [data-key="right"]').boundingBox();
    const cdp = await ctx.newCDPSession(p);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    await touch('touchStart', [{ x: right.x + right.width / 2, y: right.y + right.height / 2, id: 1 }]);
    await p.waitForTimeout(600);
    await p.screenshot({ path: join(OUT, 'pgz-phone-jump.png'), fullPage: true });
    await touch('touchEnd', []);
    const x1 = await heroX();
    assert(x1 > x0 + 40, `the right button moved the heroine: ${x0} → ${x1}`);
    await p.click('#stop');
    // tap = left mouse button
    await p.evaluate(() => window.demo.load('pgz-tween'));
    const runs = await p.evaluate(() => window.demo.pgz.info.runs);
    await p.click('#run');
    await p.waitForFunction((r) => window.demo.pgz.info.runs > r && window.demo.pgz.info.frames > 5, runs);
    await clickGame(p, 100, 100, true);
    await p.waitForFunction(() => window.demo.runner.vm.globals.get('which') === 1, null, { timeout: 5000 });
    await p.waitForTimeout(800);
    await p.screenshot({ path: join(OUT, 'pgz-phone-tween.png'), fullPage: true });
    await p.click('#stop');
    for (const id of ['pgz-pond', 'pgz-pong']) {
      await p.evaluate((i) => window.demo.load(i), id);
      const runs = await p.evaluate(() => window.demo.pgz.info.runs);
      await p.click('#run');
      await p.waitForFunction((r) => window.demo.pgz.info.runs > r && window.demo.pgz.info.frames > 20, runs, { timeout: 20000 });
      assert(await p.evaluate(() => window.demo.pgz.info.controls), `buttons shown for ${id}: ${JSON.stringify(await p.evaluate(() => [window.demo.pgz.info, window.demo.pgz.controls, matchMedia('(pointer: coarse)').matches]))}`);
      await p.screenshot({ path: join(OUT, `pgz-phone-${id.slice(4)}.png`), fullPage: true });
      await p.click('#stop');
    }
    await ctx.close();
  }],
];

await runTests(tests, setup);
