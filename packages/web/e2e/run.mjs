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
/** Colours of the 3 x 3 device pixels around turtle coordinates (lines may fall between two pixels). */
async function turtlePixels(page, x, y) {
  const [cx, cy] = await page.evaluate(([x, y]) => window.demo.turtle.toClient(x, y), [x, y]);
  const k = await page.evaluate(() => { const c = window.demo.turtle.canvas; return c.clientWidth / c.width; });
  const out = [];
  for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) out.push(await pixel(page, 'turtle', cx + dx * k, cy + dy * k));
  return out;
}
/** Colour at turtle coordinates: the one of the neighbourhood closest to `want`. */
async function turtlePixel(page, x, y, want = [0, 0, 0]) {
  const all = await turtlePixels(page, x, y);
  const d = (c) => c.reduce((s, v, i) => s + Math.abs(v - want[i]), 0);
  return all.sort((a, b) => d(a) - d(b))[0];
}
const near = (c, want, tol = 40) => c.every((v, i) => Math.abs(v - want[i]) <= tol);
const at = async (page, x, y, want, tol) => near(await turtlePixel(page, x, y, want), want, tol);

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
    for (const [x, y] of [[75, 0], [150, 75], [75, 150], [0, 75]]) assert(await at(page, x, y, blue), `royalblue line at ${x},${y}: ${await turtlePixel(page, x, y, blue)}`);
    assert((await turtlePixels(page, 75, 75)).every((c) => near(c, [255, 255, 255], 5)), 'inside the square stays white');
    const hidpi = await page.evaluate(() => { const c = window.demo.turtle.canvas; return c.width / c.clientWidth; });
    assert(Math.abs(hidpi - (await page.evaluate(() => devicePixelRatio))) < 0.05, 'canvas resolution follows devicePixelRatio');
  }],
  ['turtle fill, dot and text', async ({ page }) => {
    await start(page, 'fill');
    await finished(page);
    await frame(page);
    assertEq(await state(page), 'done', 'state');
    assert(await at(page, 20, -5, [255, 215, 0]), 'gold star spike');
    assert(await at(page, 100, -30, [255, 255, 255], 5), 'centre of the star stays empty (even-odd like Tk)');
    assert(await at(page, -120, -100, [135, 206, 235]), 'skyblue circle');
    assert(await at(page, -120, -160, [220, 20, 60]), 'crimson dot');
    await page.screenshot({ path: join(OUT, 'desktop-turtle-fill.png') });
  }],
  ['turtle spiral at speed 0 (screenshot)', async ({ page }) => {
    await start(page, 'spiral');
    await finished(page);
    await frame(page);
    assertEq(await state(page), 'done', 'state');
    assert(await at(page, -300, 300, [0, 0, 0], 10), 'black background');
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
    const reds = [];
    for (const dx of [-8, -4, 0, 4, 8]) for (const dy of [-8, -4, 0, 4, 8]) reds.push(await pixel(page, 'kara', cx + dx, cy + dy));
    assert(reds.filter((c) => c[0] > 200 && c[1] < 100).length >= 5, 'red ladybug on its cell');
    await page.screenshot({ path: join(OUT, 'desktop-kara.png') });
  }],
  ['kara pushes the mushroom onto the berry', async ({ page }) => {
    await start(page, 'kara-mushroom');
    await finished(page);
    await frame(page);
    assertEq(await state(page), 'done', 'state');
    const [cx, cy] = await page.evaluate(() => window.demo.kara.cellCenter(7, 1));
    const sc = await page.evaluate(() => window.demo.kara.stage.scale);
    const c = await pixel(page, 'kara', cx + 4 * sc, cy - 8 * sc);
    assert(c[0] > 190 && c[1] > 100 && c[1] < 160 && c[2] < 80, 'orange cap of kara_mushroom_berry: ' + c);
    const b = await pixel(page, 'kara', cx - 10 * sc, cy + 12 * sc);
    assert(b[2] > b[0] + 30, 'blueberry under the mushroom: ' + b);
  }],
  ['kara draws the library images (grass, tree, Kara by direction)', async ({ page }) => {
    await start(page, 'kara-tree');
    await finished(page);
    await frame(page);
    assertEq(await page.evaluate(() => window.demo.kara.canvas.dataset.karaStyle), 'images', 'data-kara-style');
    assertEq(await page.evaluate(() => window.demo.kara.info.images), 'ready', 'info.images');
    const sc = await page.evaluate(() => window.demo.kara.stage.scale);
    // an empty cell: grass green of kara_grass (151, 211, 104), not the pale shapes meadow
    const [gx, gy] = await page.evaluate(() => window.demo.kara.cellCenter(6, 2));
    const g = await pixel(page, 'kara', gx, gy - 14 * sc);
    assert(near(g, [151, 211, 104], 25), 'grass of the image: ' + g);
    // a tree: the green crown of kara_tree
    const [tx, ty] = await page.evaluate(() => window.demo.kara.cellCenter(0, 0));
    const t = await pixel(page, 'kara', tx, ty - 4 * sc);
    assert(t[1] > t[0] + 30 && t[1] < 200, 'tree crown: ' + t);
    // Kara looks down at the end (kara_down): the black head is below the centre
    const [kx, ky] = await page.evaluate(() => window.demo.kara.cellCenter(4, 3));
    const head = await pixel(page, 'kara', kx - 17 * sc, ky);
    assert(head[0] < 90 && head[1] < 90, 'black head on the left (kara_left): ' + head);
    const tail = await pixel(page, 'kara', kx + 12 * sc, ky - 6 * sc);
    assert(tail[0] > 150 && tail[1] < 90, 'red wings on the right: ' + tail);
  }],
  ['kara sokoban: two mushrooms pushed onto the berries (screenshots while pushing)', async ({ page }) => {
    await start(page, 'kara-sokoban');
    await page.waitForFunction(() => window.demo.kara.info.kara.x === 3, null, { timeout: 15000 });
    await page.waitForTimeout(120);
    await page.screenshot({ path: join(OUT, 'desktop-kara-push.png') });
    await finished(page);
    await frame(page);
    assertEq(await state(page), 'done', 'state');
    assert((await output(page)).includes('Beide Pilze'), 'output');
    const sc = await page.evaluate(() => window.demo.kara.stage.scale);
    for (const [x, y] of [[6, 1], [4, 4]]) {
      const [cx, cy] = await page.evaluate(([x, y]) => window.demo.kara.cellCenter(x, y), [x, y]);
      const c = await pixel(page, 'kara', cx + 4 * sc, cy - 8 * sc);
      assert(c[0] > 190 && c[1] > 100 && c[2] < 80, `mushroom on the berry at ${x},${y}: ` + c);
    }
    await page.screenshot({ path: join(OUT, 'desktop-kara-sokoban.png') });
  }],
  ['kara images scale to tiny and large worlds', async ({ page }) => {
    const rows = Array.from({ length: 20 }, (_, y) => Array.from({ length: 30 }, (_, x) => (x === 0 || y === 0 || x === 29 || y === 19 ? '#' : ' ')));
    rows[1][1] = '@';
    for (const [x, y, ch] of [[8, 4, '.'], [12, 6, '$'], [20, 10, '*'], [5, 14, '#'], [6, 14, '#'], [24, 3, '.'], [15, 15, '$'], [16, 15, '.']]) rows[y][x] = ch;
    const big = rows.map((r) => r.join('')).join('\n');
    await start(page, `world("""\n${big}\n""")\nmove()\nmove()\nturnRight()\nmove()\n`);
    await finished(page);
    await frame(page);
    assertEq(await state(page), 'done', 'state: ' + (await output(page)));
    assertEq(JSON.stringify(await page.evaluate(() => window.demo.kara.info.size)), '[30,20]', 'size');
    await page.screenshot({ path: join(OUT, 'desktop-kara-big.png') });
    await start(page, 'world("""\n@. \n $ \n  #\n""")\nmove()\nputBerry() if not onBerry() else None\nturnRight()\n');
    await finished(page);
    await frame(page);
    assertEq(await state(page), 'done', 'state small: ' + (await output(page)));
    await page.screenshot({ path: join(OUT, 'desktop-kara-small.png') });
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
    // kara_bump: the yellow stars above the head (towards the tree on the right)
    const [cx, cy] = await page.evaluate(() => window.demo.kara.cellCenter(3, 1));
    const sc = await page.evaluate(() => window.demo.kara.stage.scale);
    let star = false;
    for (let dx = 4; dx <= 22 && !star; dx += 2) for (let dy = -22; dy <= -10 && !star; dy += 2) {
      const c = await pixel(page, 'kara', cx + dx * sc, cy + dy * sc);
      star = c[0] > 200 && c[1] > 170 && c[2] < 120;
    }
    assert(star, 'yellow stars of kara_bump');
    await page.screenshot({ path: join(OUT, 'desktop-kara-crash.png') });
  }],
  ['kara falls back to shapes when the images are missing', async ({ browser, base }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(base + '?kara=shapes&example=kara-tree');
    await p.waitForFunction(() => window.demo);
    await p.click('#run');
    await finished(p);
    await frame(p);
    assertEq(await p.evaluate(() => document.body.dataset.state), 'done', 'state');
    assertEq(await p.evaluate(() => window.demo.kara.canvas.dataset.karaStyle), 'shapes', 'data-kara-style');
    assertEq(await p.evaluate(() => window.demo.kara.info.images), 'failed', 'info.images');
    const [cx, cy] = await p.evaluate(() => window.demo.kara.cellCenter(4, 3));
    const reds = [];
    for (const dx of [-8, -4, 0, 4, 8]) for (const dy of [-8, -4, 0, 4, 8]) reds.push(await pixel(p, 'kara', cx + dx, cy + dy));
    assert(reds.filter((c) => c[0] > 200 && c[1] < 100).length >= 5, 'red ladybug drawn with shapes: ' + JSON.stringify(reds));
    const [gx, gy] = await p.evaluate(() => window.demo.kara.cellCenter(6, 2));
    const g = await pixel(p, 'kara', gx, gy);
    assert(near(g, [234, 244, 220], 12) || near(g, [227, 240, 210], 12), 'pale meadow of the shapes: ' + g);
    await p.screenshot({ path: join(OUT, 'desktop-kara-shapes.png') });
    await ctx.close();
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
    assert(/sume/.test(text) && /Meintest du/.test(text), 'message with suggestion: ' + text);
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
    const timerDelay = await page.evaluate(() => new Promise((res) => { const t0 = performance.now(); setTimeout(() => res(performance.now() - t0), 0); }));
    assert(timerDelay < 150, `page timers still fire during the loop: ${timerDelay} ms`);
    const t0 = Date.now();
    await page.locator('#code').click();
    await page.keyboard.type('# x');
    assert(Date.now() - t0 < 2000, 'typing works while the loop runs');
    const steps = await page.evaluate(() => window.demo.runner.vm.steps);
    await page.click('#stop');
    await finished(page, 2000);
    assertEq(await state(page), 'stopped', 'stopped');
    assert(steps > 1e5, 'the loop ran: ' + steps);
    assert((await output(page)).includes('Programm gestoppt'), 'stop message');
  }],
  ['real clock and sleep', async ({ page }) => {
    await start(page, 'import time\nt = time.time()\nprint(t > 1.7e9)\ntime.sleep(0.3)\nd = time.time() - t\nprint(0.25 < d < 1.5)\n');
    await finished(page);
    assertEq(await output(page), 'True\nTrue\n', 'output');
  }],
  ['requests: same origin works, missing CORS gives the CORS error', async ({ page, port, otherPort }) => {
    await start(page, `import requests\nr = requests.get("http://127.0.0.1:${port}/api/hello")\nprint(r.status_code, r.json()["greeting"])\n`);
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
    assertEq(JSON.stringify(changes.at(-1)), '["a.txt","hi"]', 'fsChanged');
    assert((await output(page)).includes('von vorher'), 'files option');
  }],
  ['editor: Python highlighting stays aligned, typing, Tab and undo work', async ({ page }) => {
    await page.evaluate(() => window.demo.load('kara-sokoban'));
    await frame(page);
    const spans = await page.evaluate(() => Object.fromEntries(['kw', 'str', 'com', 'bi', 'def', 'num'].map((k) => [k, [...document.querySelectorAll('#hl .hl-' + k)].map((e) => e.textContent)])));
    assert(['def', 'for', 'in'].every((k) => spans.kw.includes(k)), 'keywords: ' + spans.kw);
    assert(spans.str.some((s) => s.startsWith('"""')) && spans.str.includes('"Beide Pilze liegen auf den Beeren!"'), 'strings: ' + spans.str);
    assert(spans.com.some((s) => s.startsWith('# Schiebe')), 'comments: ' + spans.com);
    assert(spans.bi.includes('print') && spans.bi.includes('range') && spans.def.includes('schritte') && spans.num.includes('4'), 'builtins, def, numbers');
    // same box, same font metrics: the coloured text lies exactly under the transparent textarea text
    const m = await page.evaluate(() => {
      const c = document.getElementById('code'), h = document.getElementById('hl');
      const cs = getComputedStyle(c), hs = getComputedStyle(h), rc = c.getBoundingClientRect(), rh = h.getBoundingClientRect();
      return { font: [cs.font, hs.font], pad: [cs.padding, hs.padding], dx: rc.left - rh.left, dy: rc.top - rh.top, sh: [c.scrollHeight, h.scrollHeight] };
    });
    assertEq(m.font[0], m.font[1], 'font');
    assertEq(m.pad[0], m.pad[1], 'padding');
    assert(Math.abs(m.dx) < 0.5 && Math.abs(m.dy) < 0.5, 'same position: ' + JSON.stringify(m));
    assert(Math.abs(m.sh[0] - m.sh[1]) <= 2, 'same text height: ' + m.sh);
    await page.evaluate(() => { window.demo.setCode('# Zeile\n'.repeat(80) + 'print("Ende")'); document.getElementById('code').scrollTop = 1e6; });
    await frame(page);
    const sc = await page.evaluate(() => [document.getElementById('code').scrollTop, document.getElementById('hl').scrollTop]);
    assert(sc[0] > 0 && sc[0] === sc[1], 'scroll in step: ' + sc);
    // typing, Tab, undo
    await page.evaluate(() => window.demo.setCode('x = 1\n'));
    await page.click('#code');
    await page.keyboard.press('Control+End');
    await page.keyboard.type('if x:\n');
    await page.keyboard.press('Tab');
    await page.keyboard.type('print("neu")  # Kommentar');
    await frame(page);
    assertEq(await page.inputValue('#code'), 'x = 1\nif x:\n    print("neu")  # Kommentar', 'typed text');
    const hl = await page.evaluate(() => [document.getElementById('hl').textContent, [...document.querySelectorAll('#hl .hl-com, #hl .hl-str, #hl .hl-kw')].map((e) => e.textContent)]);
    assert(hl[0].startsWith(await page.inputValue('#code')), 'overlay text follows typing');
    assert(['if', '"neu"', '# Kommentar'].every((t) => hl[1].includes(t)), 'typed code is highlighted: ' + hl[1]);
    await page.screenshot({ path: join(OUT, 'desktop-editor-typed.png'), clip: { x: 0, y: 0, width: 720, height: 200 } });
    for (let i = 0; i < 40 && (await page.inputValue('#code')).includes('print'); i++) await page.keyboard.press('Control+z');
    const undone = await page.inputValue('#code');
    assert(!undone.includes('print') && undone.startsWith('x = 1'), 'undo works: ' + JSON.stringify(undone));
  }],
  ['console: placeholder instead of an empty box, compact until there is output', async ({ page }) => {
    for (const id of ['kara-sokoban', 'square', 'forms-counter', 'pgz-pond']) {
      await page.evaluate((id) => { window.demo.load(id); window.demo.con.clear(); }, id);
      await frame(page);
      const g = await page.evaluate(() => {
        const out = document.querySelector('#console .nw-out');
        return { ph: getComputedStyle(out, '::before').content, con: document.getElementById('console').getBoundingClientRect().height, stage: document.getElementById('stage').getBoundingClientRect().height };
      });
      assertEq(g.ph, '"Ausgabe erscheint hier"', id + ' placeholder');
      assert(g.con < 100 && g.stage > 650, `${id}: compact console, big stage: ${JSON.stringify(g)}`);
    }
    await start(page, 'kara-sokoban');
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, 'desktop-kara-running.png') });
    await finished(page);
    await frame(page);
    assertEq(await page.evaluate(() => getComputedStyle(document.querySelector('#console .nw-out'), '::before').content), 'none', 'placeholder gone with output');
    await page.screenshot({ path: join(OUT, 'desktop-kara-done.png') });
    await page.evaluate(() => window.demo.load('input'));
    await frame(page);
    const alone = await page.evaluate(() => document.getElementById('console').getBoundingClientRect().height);
    assert(alone > 600, 'without a stage the console fills the column: ' + alone);
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
    const pc = await p.evaluate(() => [document.getElementById('console').getBoundingClientRect().height, getComputedStyle(document.querySelector('#console .nw-out'), '::before').content]);
    assert(pc[0] < 100 && pc[1] === '"Ausgabe erscheint hier"', 'no empty box on the phone: ' + pc);
    assert((await p.locator('#hl .hl-kw').count()) > 0, 'highlighting on the phone');
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
    assertEq(await p.evaluate(() => window.demo.kara.canvas.dataset.karaStyle), 'images', 'images on the phone');
    const kfit = await p.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, r: window.demo.kara.canvas.getBoundingClientRect().right, k: window.demo.kara.canvas.width / window.demo.kara.canvas.clientWidth }));
    assert(kfit.sw <= 412 && kfit.r <= 412, 'kara fits the phone: ' + JSON.stringify(kfit));
    assert(Math.abs(kfit.k - 2.625) < 0.05, 'kara crisp on the phone: ' + kfit.k);
    await p.screenshot({ path: join(OUT, 'phone-kara.png'), fullPage: true });
    await p.evaluate(() => window.demo.load('kara-sokoban'));
    await p.click('#run');
    await finished(p);
    await frame(p);
    await p.locator('#kara').screenshot({ path: join(OUT, 'phone-kara-sokoban.png') });
    await p.evaluate(() => window.demo.load('kara-crash'));
    await p.click('#run');
    await finished(p);
    await p.waitForTimeout(500);
    await p.locator('#kara').screenshot({ path: join(OUT, 'phone-kara-crash.png') });
    await ctx.close();
  }],
];

await runTests(tests, setup);
