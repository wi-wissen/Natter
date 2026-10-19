// Renders the social preview images (1200 x 630) for the site: docs/og.png, docs/reference/og.png, docs/sprites/og.png.
// Needs Playwright with Chromium (PLAYWRIGHT_DIR, default /opt/node-tools/node_modules/; PW_CHROMIUM for the binary).
//   node scripts/build-og.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.env.PLAYWRIGHT_DIR ?? '/opt/node-tools/node_modules/';
const { chromium } = createRequire(dir.endsWith('/') ? dir : dir + '/')('playwright');
const snake = readFileSync(join(root, 'docs/natter.svg'), 'utf8').replace(/<title>.*?<\/title>/s, '').replace(/ width="\d+" height="\d+"/, '');

const pages = [
  { out: 'docs/og.png', kicker: 'Python interpreter for the browser', title: 'Natter, a small Python for the classroom', line: 'Loads fast. Built-in debugger. An endless loop never freezes the page.', url: 'natter.wi7.net' },
  { out: 'docs/reference/og.png', kicker: 'Command reference', title: 'Everything Natter can do', line: 'Language, standard library, turtle, Kara, Pygame Zero, forms, numpy and plots, each with a runnable example.', url: 'natter.wi7.net/reference' },
  { out: 'docs/sprites/og.png', kicker: 'Images and sounds', title: 'About 900 sprites for your games', line: 'Flat emoji style, sorted by game type, free to use. Names, previews and sounds for Pygame Zero.', url: 'natter.wi7.net/sprites' },
];

const html = (p) => `<!doctype html><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: #ebf1dd; color: #0d2b17; position: relative; overflow: hidden;
    font: 400 30px/1.4 system-ui, "Segoe UI", Roboto, Arial, sans-serif;
    background-image: linear-gradient(rgb(13 43 23 / .06) 1px, transparent 1px), linear-gradient(90deg, rgb(13 43 23 / .06) 1px, transparent 1px); background-size: 40px 40px; }
  .band { position: absolute; left: 0; right: 0; bottom: 0; height: 56px; background: #3cb84e; border-top: 6px solid #0d2b17; }
  .text { position: absolute; left: 72px; top: 76px; width: 690px; }
  .kicker { display: inline-block; background: #cdf29a; font: 700 22px ui-monospace, "DejaVu Sans Mono", monospace; letter-spacing: .06em; text-transform: uppercase; padding: 6px 14px; }
  h1 { font: 800 70px/1.08 ui-monospace, "DejaVu Sans Mono", monospace; margin: 26px 0 24px; letter-spacing: -.02em; }
  p { color: #3e5446; font-size: 29px; }
  .url { position: absolute; left: 72px; bottom: 84px; font: 700 26px ui-monospace, "DejaVu Sans Mono", monospace; color: #1b7531; }
  svg { position: absolute; right: 64px; top: 96px; width: 400px; height: 400px; }
  .shadow { position: absolute; right: 64px; top: 100px; width: 400px; height: 400px; }
</style>
<div class="text"><span class="kicker">${p.kicker}</span><h1>${p.title}</h1><p>${p.line}</p></div>
<div class="url">${p.url}</div>
${snake}
<div class="band"></div>`;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const p of pages) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html(p));
  writeFileSync(join(root, p.out), await page.screenshot({ type: 'png' }));
  console.log('wrote', p.out);
  await page.close();
}
await browser.close();
