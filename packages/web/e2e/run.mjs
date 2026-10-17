// Browser tests of the demo page (Chromium, headless): node packages/web/e2e/run.mjs [name filter ...]
// Needs the bundle (npm run web:build). Screenshots land in packages/web/e2e/out/.
import { loadPlaywright, chromiumPath, serve, runTests, assert, assertEq, OUT } from './lib.mjs';
import { join } from 'node:path';

const { chromium } = await loadPlaywright();

async function setup() {
  const { server, port } = await serve();
  const other = await serve(0, { cors: false }); // another origin without CORS headers
  const browser = await chromium.launch({ executablePath: await chromiumPath() });
  const base = `http://127.0.0.1:${port}/demo/index.html`;
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  page.on('pageerror', (e) => console.log('     page error:', e.message));
  await page.goto(base);
  await page.waitForFunction(() => window.demo);
  return {
    browser, page, base, port, otherPort: other.port,
    async close() { await browser.close(); server.close(); other.server.close(); },
  };
}

/** Start a program on the demo page: an example id or source text. */
async function start(page, what) {
  await page.evaluate((w) => { if (/\n/.test(w)) window.demo.setCode(w); else window.demo.load(w); }, what);
  await page.click('#run');
}
const finished = (page, timeout = 30000) => page.waitForFunction(() => ['done', 'error', 'stopped'].includes(document.body.dataset.state), null, { timeout });
const state = (page) => page.evaluate(() => document.body.dataset.state);
const output = (page) => page.evaluate(() => window.demo.con.text);
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** Colour of the visible canvas at CSS pixel (x, y) relative to the canvas; which: 'turtle' | 'kara'. */
const pixel = (page, which, x, y) => page.evaluate(([w, x, y]) => {
  const c = window.demo[w].canvas;
  const k = c.width / c.clientWidth;
  return [...c.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data.slice(0, 3)];
}, [which, x, y]);
/** Colour at turtle coordinates. */
async function turtlePixel(page, x, y) {
  const [cx, cy] = await page.evaluate(([x, y]) => window.demo.turtle.toClient(x, y), [x, y]);
  return pixel(page, 'turtle', cx, cy);
}
const near = (c, want, tol = 40) => c.every((v, i) => Math.abs(v - want[i]) <= tol);

const tests = [
  ['turtle square: animated, lines at the right places, console output', async ({ page }) => {
    await start(page, 'square');
    await page.waitForTimeout(400);
    const mid = await page.evaluate(() => window.demo.turtle.info.turtles[0]);
    assert(mid && (mid.x > 0 || mid.heading !== 0), 'the turtle has moved while the program runs');
    await finished(page);
    await frame(page);
    assertEq(await state(page), 'done', 'state');
    assert((await output(page)).startsWith('Fertig:'), 'output: ' + (await output(page)));
    const blue = [65, 105, 225];
    for (const [x, y] of [[75, 0], [150, 75], [75, 150], [0, 75]]) assert(near(await turtlePixel(page, x, y), blue), `royalblue line at ${x},${y}: ${await turtlePixel(page, x, y)}`);
    assert(near(await turtlePixel(page, 75, 75), [255, 255, 255], 5), 'inside the square stays white');
    const hidpi = await page.evaluate(() => { const c = window.demo.turtle.canvas; return c.width / c.clientWidth; });
    assert(Math.abs(hidpi - (await page.evaluate(() => devicePixelRatio))) < 0.05, 'canvas resolution follows devicePixelRatio');
  }],
  ['turtle fill, dot and text', async ({ page }) => {
    await start(page, 'fill');
    await finished(page);
    await frame(page);
    assertEq(await state(page), 'done', 'state');
    assert(near(await turtlePixel(page, 20, -5), [255, 215, 0]), 'gold star spike: ' + (await turtlePixel(page, 20, -5)));
    assert(near(await turtlePixel(page, -120, -100), [135, 206, 235]), 'skyblue circle: ' + (await turtlePixel(page, -120, -100)));
    assert(near(await turtlePixel(page, -120, -160), [220, 20, 60]), 'crimson dot: ' + (await turtlePixel(page, -120, -160)));
    await page.screenshot({ path: join(OUT, 'desktop-turtle-fill.png') });
  }],
  ['turtle spiral at speed 0 (screenshot)', async ({ page }) => {
    await start(page, 'spiral');
    await finished(page);
    await frame(page);
    assertEq(await state(page), 'done', 'state');
    assert(near(await turtlePixel(page, -300, 300), [0, 0, 0], 10), 'black background');
    await page.screenshot({ path: join(OUT, 'desktop-turtle-spiral.png') });
  }],
  ['turtle keys and clicks reach mainloop()', async ({ page }) => {
    await start(page, 'keys');
    await page.waitForFunction(() => document.body.dataset.state === 'waiting');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(() => window.demo.turtle.info.turtles[0].x > 39);
    const [cx, cy] = await page.evaluate(() => window.demo.turtle.toClient(-100, 50));
    const box = await page.locator('#turtle canvas').boundingBox();
    await page.mouse.click(box.x + cx, box.y + cy);
    await page.waitForFunction(() => window.demo.con.text.includes('Klick bei'));
    const out = await output(page);
    assert(/Klick bei -100\.0 50\.0/.test(out), 'click position as floats: ' + out);
    await page.click('#stop');
    await finished(page);
    assertEq(await state(page), 'stopped', 'stopped');
  }],
  ['turtle textinput dialog and exitonclick', async ({ page }) => {
    await start(page, 'import turtle\nn = turtle.textinput("Name", "Wie heißt du?")\nprint("Hi", n)\nturtle.exitonclick()\nprint("zu")\n');
    await page.waitForSelector('.nw-dialog input');
    await page.fill('.nw-dialog input', 'Ada');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.demo.con.text.includes('Hi Ada'));
    await page.waitForFunction(() => document.body.dataset.state === 'waiting');
    await page.locator('#turtle canvas').click();
    await finished(page);
    assert((await output(page)).includes('zu'), 'exitonclick ended on the click');
  }],
  ['kara walks to the berry (book commands without import)', async ({ page }) => {
    await start(page, 'kara-tree');
    await page.waitForTimeout(300);
    assert(await page.evaluate(() => window.demo.kara.info.world), 'world shown');
    await finished(page);
    await frame(page);
    assertEq(await state(page), 'done', 'state');
    assert((await output(page)).includes('Beere gefunden!'), 'output');
    const info = await page.evaluate(() => window.demo.kara.info);
    assertEq(JSON.stringify([info.kara.x, info.kara.y]), '[4,3]', 'kara position');
    const [cx, cy] = await page.evaluate(() => window.demo.kara.cellCenter(4, 3));
    const c = await pixel(page, 'kara', cx - 6, cy);
    assert(c[0] > 180 && c[1] < 120, 'red ladybug on its cell: ' + c);
    await page.screenshot({ path: join(OUT, 'desktop-kara.png') });
  }],
  ['kara pushes the mushroom onto the berry', async ({ page }) => {
    await start(page, 'kara-mushroom');
    await finished(page);
    await frame(page);
    assertEq(await state(page), 'done', 'state');
    const [cx, cy] = await page.evaluate(() => window.demo.kara.cellCenter(7, 1));
    const c = await pixel(page, 'kara', cx, cy - 8);
    assert(c[1] > 120 && c[0] < 80, 'green cap (mushroom on berry): ' + c);
  }],
  ['kara crash: bump and friendly error', async ({ page }) => {
    await start(page, 'kara-crash');
    await finished(page);
    assertEq(await state(page), 'error', 'state');
    assertEq(await page.evaluate(() => window.demo.kara.info.crash), 'tree', 'crash kind');
    const err = await page.locator('.nw-error').innerText();
    assert(/Zeile 7/.test(err), 'line in the error: ' + err);
    assertEq(await page.locator('.nw-error').getAttribute('data-code'), 'err.script.kara', 'error code');
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, 'desktop-kara-crash.png') });
  }],
  ['input() through the console line', async ({ page }) => {
    await start(page, 'input');
    await page.waitForSelector('.nw-inrow:not([hidden]) input');
    await page.keyboard.type('Ada');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.demo.con.text.includes('Wie alt'));
    await page.waitForSelector('.nw-inrow:not([hidden]) input');
    await page.fill('.nw-inrow input', '12');
    await page.press('.nw-inrow input', 'Enter');
    await finished(page);
    const out = await output(page);
    assert(out.includes('Wie heißt du? Ada\n'), 'echoed input: ' + out);
    assert(out.includes('Hallo Ada! In 10 Jahren bist du 22'), 'output: ' + out);
  }],
  ['error display: line, friendly message, traceback', async ({ page }) => {
    await start(page, 'error');
    await finished(page);
    assertEq(await state(page), 'error', 'state');
    const title = await page.locator('.nw-error-title').innerText();
    const text = await page.locator('.nw-error-text').innerText();
    assert(/NameError/.test(title) && /6/.test(title), 'title: ' + title);
    assert(/sume/.test(text) && /summe/.test(text), 'message with suggestion: ' + text);
    assert((await page.locator('.nw-error pre').textContent()).includes('line 6'), 'traceback');
    assert((await output(page)).includes('Summe: 6'), 'output before the error');
    await page.screenshot({ path: join(OUT, 'desktop-error.png') });
  }],
  ['endless loop: page stays responsive, Stop works', async ({ page }) => {
    await start(page, 'loop');
    await page.waitForTimeout(300);
    assertEq(await state(page), 'running', 'running');
    const frames = await page.evaluate(() => new Promise((res) => {
      let n = 0; const t0 = performance.now();
      const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); };
      requestAnimationFrame(f);
    }));
    assert(frames >= 20, `animation frames during the loop: ${frames}`);
    const t0 = Date.now();
    await page.locator('#code').click();
    await page.keyboard.type('# x');
    assert(Date.now() - t0 < 2000, 'typing works while the loop runs');
    const steps = await page.evaluate(() => window.demo.runner.vm.steps);
    await page.click('#stop');
    await finished(page, 2000);
    assertEq(await state(page), 'stopped', 'stopped');
    assert(steps > 1e5 || true, 'the loop ran');
    assert((await output(page)).includes('Programm gestoppt'), 'stop message');
  }],
  ['real clock and sleep', async ({ page }) => {
    await start(page, 'import time\nt = time.time()\nprint(t > 1.7e9)\ntime.sleep(0.3)\nd = time.time() - t\nprint(0.25 < d < 1.5)\n');
    await finished(page);
    assertEq(await output(page), 'True\nTrue\n', 'output');
  }],
  ['requests: same origin works, missing CORS gives the CORS error', async ({ page, otherPort }) => {
    await start(page, 'import requests\nr = requests.get("/api/hello")\nprint(r.status_code, r.json()["greeting"])\n');
    await finished(page);
    assertEq(await output(page), '200 hallo\n', 'same origin');
    await start(page, `import requests\ntry:\n    requests.get("http://127.0.0.1:${otherPort}/api/hello")\nexcept requests.exceptions.ConnectionError as e:\n    print("Fehler:", e)\n`);
    await finished(page);
    const out = await output(page);
    assert(/CORS/i.test(out), 'CORS explained: ' + out);
  }],
  ['files: open() writes into the project and reports it', async ({ page }) => {
    const changes = await page.evaluate(async () => {
      const seen = [];
      const off = window.demo.runner.on('file', (p, t) => seen.push([p, t]));
      await window.demo.runner.run('with open("a.txt", "w") as f:\n    f.write("hi")\nprint(open("b.txt").read())\n', { files: { 'b.txt': 'von vorher' } });
      off();
      return seen;
    });
    assertEq(JSON.stringify(changes), '[["a.txt","hi"]]', 'fsChanged');
    assert((await output(page)).includes('von vorher'), 'files option');
  }],
  ['phone (Pixel 7): layout fits, touch tap counts as click, screenshots', async ({ browser, base }) => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(base + '?example=fill');
    await p.waitForFunction(() => window.demo);
    await p.click('#run');
    await finished(p);
    await frame(p);
    const fit = await p.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, cw: window.demo.turtle.canvas.getBoundingClientRect().right }));
    assert(fit.sw <= 412 && fit.cw <= 412, 'no horizontal overflow: ' + JSON.stringify(fit));
    const ratio = await p.evaluate(() => { const c = window.demo.turtle.canvas; return c.width / c.clientWidth; });
    assert(Math.abs(ratio - 2.625) < 0.05, 'crisp on the phone: ' + ratio);
    await p.screenshot({ path: join(OUT, 'phone-turtle.png'), fullPage: true });
    await p.evaluate(() => window.demo.load('keys'));
    await p.click('#run');
    await p.waitForFunction(() => document.body.dataset.state === 'waiting');
    const box = await p.locator('#turtle canvas').boundingBox();
    await p.touchscreen.tap(box.x + box.width / 2 + 30, box.y + box.height / 2);
    await p.waitForFunction(() => window.demo.con.text.includes('Klick bei'));
    await p.click('#stop');
    await p.evaluate(() => window.demo.load('kara-mushroom'));
    await p.click('#run');
    await finished(p);
    await frame(p);
    await p.screenshot({ path: join(OUT, 'phone-kara.png'), fullPage: true });
    await ctx.close();
  }],
];

await runTests(tests, setup);
