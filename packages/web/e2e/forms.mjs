// Browser tests of the guizero renderer and the plot viewer on the demo page (Chromium, headless):
// node packages/web/e2e/forms.mjs [name filter ...]   (needs npm run web:build). Screenshots land in e2e/out/.
import { loadPlaywright, chromiumPath, serve, runTests, assert, assertEq, OUT } from './lib.mjs';
import { join } from 'node:path';

const { chromium } = await loadPlaywright();

async function setup() {
  const { server, port } = await serve();
  const browser = await chromium.launch({ executablePath: await chromiumPath() });
  const base = `http://127.0.0.1:${port}/demo/index.html`;
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  page.on('pageerror', (e) => console.log('     page error:', e.message));
  await page.goto(base);
  await page.waitForFunction(() => window.demo);
  return { browser, page, base, async close() { await browser.close(); server.close(); } };
}

async function start(page, what) {
  await page.evaluate((w) => { if (/\n/.test(w)) window.demo.setCode(w); else window.demo.load(w); }, what);
  await page.click('#run');
}
const waiting = (page) => page.waitForFunction(() => document.body.dataset.state === 'waiting' && window.demo.forms.info.waiting, null, { timeout: 20000 });
const finished = (page, timeout = 20000) => page.waitForFunction(() => ['done', 'error', 'stopped'].includes(document.body.dataset.state), null, { timeout });
const output = (page) => page.evaluate(() => window.demo.con.text);
const box = (page, sel) => page.locator(sel).boundingBox();
const W = (id) => `#forms [data-nwf-id="${id}"]`;
const stop = async (page) => { if (await page.evaluate(() => !['done', 'error', 'stopped'].includes(document.body.dataset.state))) { await page.click('#stop'); await finished(page); } };

const tests = [
  ['counter: PushButton and Text, clicks change the DOM', async ({ page }) => {
    await start(page, 'forms-counter');
    await waiting(page);
    const text = page.locator('#forms .nwf-text').first();
    assertEq(await text.innerText(), '0', 'start value');
    const plus = page.getByRole('button', { name: '+' });
    await plus.click();
    await plus.click();
    await page.waitForFunction(() => document.querySelector('#forms .nwf-text').textContent === '2');
    await page.getByRole('button', { name: '−' }).click();
    await page.waitForFunction(() => document.querySelector('#forms .nwf-text').textContent === '1');
    const t = await text.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    assert(t > 50, 'size=40 is big text: ' + t);
    // the two buttons of the Box sit side by side (align="left"), the reset button below and centred
    const [a, b, c] = [await box(page, W(4)), await box(page, W(5)), await box(page, W(6))];
    assert(Math.abs(a.y - b.y) < 1 && b.x > a.x + a.width - 1, 'side by side: ' + JSON.stringify([a, b]));
    const win = await box(page, '#forms .nwf-body');
    assert(c.y >= a.y + a.height - 1 && Math.abs(c.x + c.width / 2 - (win.x + win.width / 2)) < 2, 'reset button centred below');
    assertEq(Math.round(win.width), 300, 'window width from App(width=300)');
    await page.screenshot({ path: join(OUT, 'desktop-forms-counter.png') });
    await page.click('#forms .nwf-close');
    await finished(page);
    assertEq(await page.evaluate(() => document.body.dataset.state), 'done', 'closing the app window ends display()');
    assertEq(await page.locator('#forms .nwf-win').count(), 0, 'window removed');
  }],
  ['form: TextBox, ComboBox, CheckBox, Slider send their values', async ({ page }) => {
    await start(page, `from guizero import App, TextBox, Combo, CheckBox, Slider, PushButton
app = App(title="Form")
name = TextBox(app, width=15)
farbe = Combo(app, options=["rot", "grün", "blau"], selected="grün")
ok = CheckBox(app, text="Einverstanden")
alter = Slider(app, start=0, end=100)
name.when_key_released = lambda e: print("key", repr(e.key), name.value) if e.key == "\\r" else None
PushButton(app, text="Senden", command=lambda: print(name.value, farbe.value, ok.value, alter.value))
app.display()
`);
    await waiting(page);
    assertEq(await page.locator(W(3)).evaluate((e) => e.value), 'grün', 'combo selected');
    await page.locator(W(2)).click();
    await page.keyboard.type('Ada');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.demo.con.text.includes("key '\\r' Ada"));
    await page.locator(W(3)).selectOption('blau');
    await page.getByLabel('Einverstanden').check();
    await page.locator(`${W(5)} input`).fill('70');
    await page.waitForFunction(() => document.querySelector('#forms [data-nwf-id="5"] output').textContent === '70');
    await page.getByRole('button', { name: 'Senden' }).click();
    await page.waitForFunction(() => window.demo.con.text.includes('Ada blau 1 70'));
    const w15 = await box(page, W(2));
    assert(w15.width > 100 && w15.width < 200, 'width=15 characters: ' + w15.width);
    await stop(page);
  }],
  ['grid layout: cells line up, spans, columns grow with their content', async ({ page }) => {
    await start(page, `from guizero import App, Text, PushButton
app = App(layout="grid")
a = Text(app, text="A", grid=[0, 0])
b = Text(app, text="B", grid=[1, 0])
c = Text(app, text="a much longer cell", grid=[0, 1])
d = PushButton(app, text="D", grid=[1, 1])
e = Text(app, text="spans two", grid=[0, 2, 2, 1], bg="yellow")
f = Text(app, text="L", grid=[0, 3], align="left")
def grow():
    b.value = "B is now much wider than before"
PushButton(app, text="grow", grid=[3, 0], command=grow)
app.display()
`);
    await waiting(page);
    const [A, B, C, D, E, F] = await Promise.all([2, 3, 4, 5, 6, 7].map((i) => box(page, W(i))));
    assert(Math.abs((A.x + A.width / 2) - (C.x + C.width / 2)) < 1, 'column 0 centred on one axis');
    assert(Math.abs((B.x + B.width / 2) - (D.x + D.width / 2)) < 1, 'column 1 centred on one axis');
    assert(B.x >= C.x + C.width - 1, 'column 1 starts after the widest cell of column 0');
    assert(Math.abs((A.y + A.height / 2) - (B.y + B.height / 2)) < 1, 'row 0 aligned');
    assert(E.y >= D.y + D.height - 1 && Math.abs((E.x + E.width / 2) - (C.x + (D.x + D.width - C.x) / 2)) < 3, 'span centred over both columns');
    assert(Math.abs(F.x - C.x) < 1, 'align=left sticks to the cell start');
    const grow = await box(page, W(8));
    await page.getByRole('button', { name: 'grow' }).click();
    await page.waitForFunction(() => document.querySelector('#forms [data-nwf-id="3"]').textContent.startsWith('B is now'));
    const [B2, D2, grow2] = [await box(page, W(3)), await box(page, W(5)), await box(page, W(8))];
    assert(B2.width > B.width + 50, 'cell grew');
    assert(Math.abs((B2.x + B2.width / 2) - (D2.x + D2.width / 2)) < 1, 'column still lines up after growing');
    assert(grow2.x > grow.x + 50, 'later columns move right');
    await page.screenshot({ path: join(OUT, 'desktop-forms-grid.png') });
    await stop(page);
  }],
  ['auto layout like pack: top, left, right, bottom, fill', async ({ page }) => {
    await start(page, `from guizero import App, Text, Box
app = App(width=400, height=300)
t = Text(app, text="top")
l = Text(app, text="left", align="left")
r = Text(app, text="right", align="right")
b = Text(app, text="bottom", align="bottom")
f = Box(app, width="fill", height="fill", border=1)
app.display()
`);
    await waiting(page);
    const win = await box(page, '#forms .nwf-body');
    const [T, L, R, B, F] = await Promise.all([2, 3, 4, 5, 6].map((i) => box(page, W(i))));
    assert(Math.abs(T.x + T.width / 2 - (win.x + win.width / 2)) < 2 && T.y - win.y < 8, 'top centred at the top');
    assert(L.x - win.x < 8 && Math.abs(L.y + L.height / 2 - (T.y + T.height + (win.y + win.height - T.y - T.height) / 2)) < 3, 'left: at the left, centred in the rest');
    assert(win.x + win.width - (R.x + R.width) < 8, 'right at the right');
    assert(win.y + win.height - (B.y + B.height) < 8 && B.x > L.x + L.width && B.x + B.width < R.x, 'bottom between left and right');
    assert(F.x >= L.x + L.width - 1 && F.x + F.width <= R.x + 1 && F.width > 200 && F.height > 150, 'fill takes the rest: ' + JSON.stringify(F));
    await stop(page);
  }],
  ['timer clock: repeat() updates on real time, after() ends', async ({ page }) => {
    await start(page, `from guizero import App, Text
app = App()
t = Text(app, text="0")
def tick():
    t.value = int(t.value) + 1
t.repeat(100, tick)
app.after(700, app.destroy)
app.display()
print("ticks", t.value)
`);
    await page.waitForFunction(() => Number(document.querySelector('#forms .nwf-text')?.textContent) >= 2);
    await finished(page, 10000);
    const n = Number((await output(page)).match(/ticks (\d+)/)?.[1]);
    assert(n >= 4 && n <= 7, 'about 6 ticks in 0.7 s: ' + n);
    await start(page, 'forms-clock');
    await waiting(page);
    await page.waitForFunction(() => /\d\d:\d\d:\d\d/.test(document.querySelector('#forms .nwf-text').textContent));
    assert(await page.evaluate(() => window.demo.forms.info.timers) >= 1, 'timers held by the host');
    await page.click('#stop');
    await finished(page);
    assertEq(await page.evaluate(() => window.demo.forms.info.timers), 0, 'timers cleared on stop');
  }],
  ['ListBox: click, keyboard, to-do list', async ({ page }) => {
    await start(page, 'forms-todo');
    await waiting(page);
    const list = page.getByRole('listbox');
    assertEq(await list.getByRole('option').count(), 2, 'two items');
    await page.locator('#forms input.nwf-input').fill('Einkaufen');
    await page.getByRole('button', { name: 'Hinzufügen' }).click();
    await page.waitForFunction(() => document.querySelectorAll('#forms [role=option]').length === 3);
    assertEq(await page.locator('#forms input.nwf-input').inputValue(), '', 'text box emptied');
    await list.getByRole('option', { name: 'Fahrrad flicken' }).click();
    await page.waitForFunction(() => document.querySelector('#forms [role=option][aria-selected=true]')?.textContent === 'Fahrrad flicken');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => document.querySelector('#forms [role=option][aria-selected=true]')?.textContent === 'Einkaufen');
    await page.getByRole('button', { name: 'Erledigt' }).click();
    await page.waitForFunction(() => document.querySelectorAll('#forms [role=option]').length === 2);
    assert((await page.locator('#forms').innerText()).includes('2 Aufgaben'), 'count text');
    const [lb, win] = [await box(page, '#forms [role=listbox]'), await box(page, '#forms .nwf-body')];
    assert(lb.width > win.width - 20 && lb.height > 150, 'width/height fill: ' + JSON.stringify(lb));
    await page.screenshot({ path: join(OUT, 'desktop-forms-todo.png') });
    await stop(page);
  }],
  ['dialogs: info, yesno, question, color in the page', async ({ page }) => {
    await start(page, `from guizero import App, info, yesno, question, select_color
app = App()
info("Hallo", "Eine Nachricht")
print("yes", yesno("Frage", "Weiter?"))
print("name", question("Name", "Wie heißt du?", initial_value="Ada"))
print("color", select_color("#ff0000"))
print("cancel", question("Name", "Nochmal?"))
`);
    await page.waitForSelector('.nwf-dialog[role=alertdialog]');
    assert((await page.locator('.nwf-dialog').innerText()).includes('Eine Nachricht'), 'text shown');
    await page.screenshot({ path: join(OUT, 'desktop-forms-dialog.png') });
    await page.getByRole('button', { name: 'OK' }).click();
    await page.getByRole('button', { name: 'Ja' }).click();
    await page.waitForSelector('.nwf-dialog input[type=text]');
    assertEq(await page.locator('.nwf-dialog input').inputValue(), 'Ada', 'initial value');
    await page.locator('.nwf-dialog input').fill('Grace');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.nwf-dialog input[type=color]');
    await page.getByRole('button', { name: 'OK' }).click();
    await page.waitForSelector('.nwf-dialog input[type=text]');
    await page.keyboard.press('Escape');
    await finished(page);
    assertEq((await output(page)).replace('Programm gestoppt.\n', ''), 'yes True\nname Grace\ncolor #ff0000\ncancel None\n', 'answers');
  }],
  ['two windows: panels on the desktop, close hides the Window, focus', async ({ page }) => {
    await start(page, `from guizero import App, Window, PushButton, Text, TextBox
app = App(title="Haupt", width=300, height=200)
w = Window(app, title="Zweites", width=250, height=150)
Text(w, text="im zweiten Fenster")
tb = TextBox(w)
PushButton(app, text="öffnen", command=w.show)
PushButton(app, text="fokus", command=tb.focus)
app.display()
`);
    await waiting(page);
    const wins = page.locator('#forms .nwf-win:not([hidden])');
    assertEq(await wins.count(), 2, 'both windows shown');
    const [a, b] = [await wins.nth(0).boundingBox(), await wins.nth(1).boundingBox()];
    assert(b.x > a.x && b.y > a.y, 'second window cascades');
    await page.screenshot({ path: join(OUT, 'desktop-forms-windows.png') });
    // drag the second window by its title bar
    const bar = await page.locator('#forms .nwf-win:not([hidden]) .nwf-titlebar').nth(1).boundingBox();
    await page.mouse.move(bar.x + 60, bar.y + 10);
    await page.mouse.down();
    await page.mouse.move(bar.x + 160, bar.y + 70, { steps: 4 });
    await page.mouse.up();
    const b2 = await wins.nth(1).boundingBox();
    assert(Math.abs(b2.x - b.x - 100) < 3 && Math.abs(b2.y - b.y - 60) < 3, 'dragged');
    await page.locator('#forms .nwf-win:not([hidden]) .nwf-close').nth(1).click();
    await page.waitForFunction(() => document.querySelectorAll('#forms .nwf-win:not([hidden])').length === 1);
    await page.getByRole('button', { name: 'öffnen' }).click();
    await page.waitForFunction(() => document.querySelectorAll('#forms .nwf-win:not([hidden])').length === 2);
    await page.locator('#forms .nwf-titlebar').first().click();
    await page.getByRole('button', { name: 'fokus' }).click();
    await page.waitForFunction(() => document.activeElement?.matches('#forms input.nwf-input'));
    await stop(page);
    assert(await page.evaluate(() => document.querySelector('#forms .nwf-root').classList.contains('nwf-ended')), 'stopped forms look inactive');
  }],
  ['drawing and waffle: mouse coordinates in widget pixels', async ({ page }) => {
    await start(page, `from guizero import App, Drawing, Waffle
app = App()
d = Drawing(app, width=200, height=100)
d.rectangle(0, 0, 50, 50, color="red")
d.when_clicked = lambda e: print("d", e.x, e.y)
def cell(x, y):
    print("w", x, y)
    w.set_pixel(x, y, "blue")
w = Waffle(app, width=3, height=2, command=cell)
app.display()
`);
    await waiting(page);
    const d = await box(page, W(2));
    await page.mouse.click(d.x + 120, d.y + 30);
    await page.waitForFunction(() => window.demo.con.text.includes('d '));
    assert(/d 12[01] (29|30|31)/.test(await output(page)), 'drawing coords: ' + await output(page));
    const w = await box(page, W(3));
    await page.mouse.click(w.x + 5 + 25 * 2 + 10, w.y + 5 + 25 + 10);
    await page.waitForFunction(() => window.demo.con.text.includes('w 2 1'));
    await page.waitForFunction(() => document.querySelectorAll('#forms .nwf-px')[5]?.getAttribute('fill') === '#0000ff');
    await stop(page);
  }],
  ['plot: sin/cos with numpy inline, save buttons, several figures', async ({ page }) => {
    await start(page, 'plot-sincos');
    await finished(page, 30000);
    assertEq(await page.evaluate(() => document.body.dataset.state), 'done', 'state');
    assertEq(await page.locator('#plot figure svg').count(), 1, 'one figure');
    const s = await box(page, '#plot figure svg');
    const area = await box(page, '#plot');
    assert(Math.abs(s.height / s.width - 0.75) < 0.02 && s.y + s.height <= area.y + area.height + 1 && s.width > 400, 'fits the area, 4:3: ' + JSON.stringify([s, area]));
    await page.getByRole('button', { name: 'Volle Breite' }).click();
    const big = await box(page, '#plot figure svg');
    assert(big.width > area.width - 40, 'full width: ' + big.width);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Als SVG speichern' }).click()]);
    assertEq(dl.suggestedFilename(), 'Abbildung 1.svg', 'svg download');
    const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Als PNG speichern' }).click()]);
    assertEq(png.suggestedFilename(), 'Abbildung 1.png', 'png download');
    await page.screenshot({ path: join(OUT, 'desktop-plot.png') });
    await start(page, 'plot-bars');
    await finished(page, 30000);
    assertEq(await page.locator('#plot figure').count(), 2, 'two figures stacked');
    assert((await page.locator('#plot .nwp-saved').innerText()).includes('groesse.png'), 'savefig listed');
    await start(page, 'import matplotlib.pyplot as plt\nplt.plot([1, 2, 3], [1, 4, 9])\n');
    await finished(page, 30000);
    assertEq(await page.locator('#plot figure').count(), 1, 'figure without show() appears at the end');
  }],
  ['dark mode: forms themed, plot paper or inverted (screenshots)', async ({ browser, base }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
    const p = await ctx.newPage();
    await p.goto(base + '?example=forms-grid');
    await p.waitForFunction(() => window.demo);
    await p.click('#run');
    await waiting(p);
    const bg = await p.locator('#forms .nwf-body').first().evaluate((e) => getComputedStyle(e).backgroundColor);
    assert(/rgb\((\d+), (\d+), (\d+)\)/.test(bg) && Number(bg.match(/\d+/)[0]) < 60, 'dark window: ' + bg);
    await p.screenshot({ path: join(OUT, 'dark-forms.png') });
    await p.click('#stop');
    await p.evaluate(() => window.demo.load('plot-sincos'));
    await p.click('#run');
    await finished(p, 30000);
    await p.screenshot({ path: join(OUT, 'dark-plot-paper.png') });
    await p.getByRole('button', { name: 'Abbildung für den Dunkelmodus umfärben' }).click();
    const f = await p.locator('#plot .nwp-paper').evaluate((e) => getComputedStyle(e).filter);
    assert(f.includes('invert'), 'inverted: ' + f);
    await p.screenshot({ path: join(OUT, 'dark-plot-invert.png') });
    await ctx.close();
  }],
  ['phone (Pixel 7): windows fill the width, tabs, 44 px targets, screenshots', async ({ browser, base }) => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(base + '?example=forms-temp');
    await p.waitForFunction(() => window.demo);
    await p.click('#run');
    await waiting(p);
    assertEq(await p.evaluate(() => window.demo.forms.info.mode), 'tabs', 'tabs mode');
    const [win, stage] = [await box(p, '#forms .nwf-win'), await box(p, '#forms')];
    assert(win.width > stage.width - 20, 'window fills the width');
    const btn = await box(p, '#forms .nwf-btn');
    assert(btn.height >= 43.5, 'touch target: ' + btn.height);
    assert(await p.evaluate(() => document.scrollingElement.scrollWidth <= 412), 'no horizontal overflow');
    await p.locator('#forms input.nwf-input').fill('100');
    await p.locator('#forms .nwf-btn').tap();
    await p.waitForFunction(() => document.querySelector('#forms').innerText.includes('212.0 °F'));
    await p.locator('#stage').screenshot({ path: join(OUT, 'phone-forms-temp.png') });
    await p.click('#stop');
    await p.evaluate(() => window.demo.load('forms-grid'));
    await p.click('#run');
    await waiting(p);
    await p.getByRole('button', { name: 'Datei' }).tap();
    await p.getByRole('menuitem', { name: 'Neues Fenster' }).tap();
    await p.waitForSelector('#forms .nwf-tabs:not([hidden]) [role=tab]');
    assertEq(await p.locator('#forms [role=tab]').count(), 2, 'two tabs');
    assertEq(await p.locator('#forms .nwf-win:not([hidden]) .nwf-title').innerText(), 'Waffel', 'the new window is in front');
    await p.locator('#stage').screenshot({ path: join(OUT, 'phone-forms-windows.png') });
    await p.locator('#forms [role=tab]').first().tap();
    assertEq(await p.locator('#forms .nwf-win:not([hidden]) .nwf-title').innerText(), 'Anmeldung', 'switched back');
    await p.locator('#stage').screenshot({ path: join(OUT, 'phone-forms-grid.png') });
    await p.click('#stop');
    await p.evaluate(() => window.demo.load('forms-quiz'));
    await p.click('#run');
    await waiting(p);
    await p.getByRole('radio', { name: '8' }).tap();
    await p.getByRole('button', { name: 'Antworten' }).tap();
    await p.waitForSelector('.nwf-dialog');
    await p.locator('#stage').screenshot({ path: join(OUT, 'phone-forms-dialog.png') });
    await p.getByRole('button', { name: 'OK' }).tap();
    await p.waitForFunction(() => document.querySelector('#forms').innerText.includes('Frage 2 von 3'));
    await p.click('#stop');
    await p.evaluate(() => window.demo.load('plot-sincos'));
    await p.click('#run');
    await finished(p, 30000);
    await p.locator('#stage').screenshot({ path: join(OUT, 'phone-plot.png') });
    await ctx.close();
  }],
];

await runTests(tests, setup);
