// Sprite gallery of the asset library (docs/sprites/index.html), generated from packages/assets: catalog.json (images,
// sizes, tags, descriptions, animation groups, sounds) and gametypes.json (game types with their starter sets).
// The page is plain HTML (crawlable, works without JavaScript); a small script adds search, game type filter, copying,
// animation previews, a detail view and sound playback. The images are not copied into docs/: every <img> points to
// the published npm package on jsDelivr (version from packages/assets/package.json). `?base=<url>` on the page loads
// them from somewhere else instead, e.g. a local server for packages/assets while the package is not on npm yet.
// A test (packages/assets/test/sprites-page.test.js) fails when the page is stale.
//
//   node scripts/build-sprites.mjs           write docs/sprites/index.html
//   node scripts/build-sprites.mjs --check   only check (exit code 1 when stale or broken)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_FILE = join(ROOT, 'docs', 'sprites', 'index.html');
const ASSETS = join(ROOT, 'packages', 'assets');
const read = (f) => JSON.parse(readFileSync(join(ASSETS, f), 'utf8'));
const PKG = read('package.json');

/** Where the page loads the images and sounds from (one place; `?base=` on the page overrides it). */
export const ASSETS_BASE = `https://cdn.jsdelivr.net/npm/${PKG.name}@${PKG.version}/`;
const SITE = 'https://natter.wi7.net/';
const REPO = 'https://github.com/wi-wissen/Natter';
/** Largest side of a thumbnail in a tile (CSS pixels); smaller images keep their natural size. */
const THUMB = 88;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const md = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');

/** The description of an animation without its "frame 1 of 8" part. */
const stripFrame = (t) => String(t ?? '').replace(/\s*\(frame \d+ of \d+\)/i, '').replace(/,\s*frame \d+ of \d+/i, '').trim();

/** Display size of a thumbnail: natural size, scaled down to fit THUMB × THUMB. */
function thumbSize(w, h) {
  const s = Math.min(1, THUMB / w, THUMB / h);
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

// ---------------------------------------------------------------- data

/**
 * Tiles: one per single image and one per animation group (its frames are not shown alone), in catalog order.
 * @returns {{ items: any[], byImage: Map<string, any>, catalog: any, types: any[], problems: string[] }}
 */
export function collectSprites() {
  const catalog = read('catalog.json');
  const gametypes = read('gametypes.json');
  const problems = [];
  const byName = new Map(catalog.images.map((a) => [a.name, a]));
  const inGroup = new Map();
  for (const g of catalog.groups ?? []) if (g.kind === 'animation') for (const f of g.frames) inGroup.set(f, g);
  const items = [];
  const byImage = new Map();
  const seen = new Set();
  for (const a of catalog.images) {
    const g = inGroup.get(a.name);
    if (g && seen.has(g)) continue;
    let item;
    if (g) {
      seen.add(g);
      const frames = g.frames.map((f) => byName.get(f));
      if (frames.some((f) => !f)) { problems.push(`animation ${g.name}: unknown frame`); continue; }
      item = { kind: 'animation', name: frames[0].name, group: g.name, pack: g.pack, images: frames, text: stripFrame(frames[0].en) };
    } else {
      item = { kind: 'image', name: a.name, pack: a.pack, images: [a], text: a.en ?? '' };
    }
    items.push(item);
    for (const i of item.images) byImage.set(i.name, item);
  }
  const packTitle = Object.fromEntries(catalog.packs.map((p) => [p.pack, p.title?.en ?? p.pack]));
  const morePackShown = new Map(); // pack → game type id whose "More from the packs" lists it
  const types = gametypes.types.map((t) => {
    const starter = [];
    for (const n of t.starter) {
      const i = byImage.get(n);
      if (!i) problems.push(`game type ${t.id}: starter image ${n} is not in catalog.json`);
      else if (!starter.includes(i)) starter.push(i);
    }
    const more = t.packs.map((p) => {
      if (morePackShown.has(p)) return { pack: p, title: packTitle[p] ?? p, seeType: morePackShown.get(p) };
      morePackShown.set(p, t.id);
      return { pack: p, title: packTitle[p] ?? p, items: items.filter((i) => i.pack === p && !starter.includes(i)) };
    });
    const count = catalog.images.filter((a) => t.packs.includes(a.pack)).length;
    return { id: t.id, title: t.en, hint: t.hint?.en ?? '', packs: t.packs, starter, more, count };
  });
  for (const i of items) if (!types.some((t) => t.starter.includes(i) || t.more.some((m) => m.items?.includes(i)))) problems.push(`${i.name} (${i.pack}) is in no game type`);
  return { items, byImage, catalog, types, problems };
}

// ---------------------------------------------------------------- rendering

/** One tile: preview button (details), name button (copy), size. */
function tile(item, base) {
  const a = item.images[0];
  const [w, h] = thumbSize(a.w, a.h);
  const anim = item.kind === 'animation';
  const attrs = [`data-p="${esc(item.pack)}"`, `data-g="${esc((a.tags ?? []).join(' '))}"`];
  if (anim) attrs.push(`data-fr="${esc(item.images.map((f) => f.name).join(' '))}"`);
  const size = `${a.w}×${a.h}${anim ? ` · ${item.images.length} frames` : ''}`;
  return `<li class="t${anim ? ' an' : ''}" ${attrs.join(' ')}><button type="button" class="pv"><img src="${esc(base + a.file)}" width="${w}" height="${h}" loading="lazy" decoding="async" alt="${esc(item.text)}"></button><button type="button" class="nm" title="Copy name">${esc(a.name).replace(/_/g, '_<wbr>')}</button><span class="sz">${size}</span></li>`;
}

const grid = (items, base) => `<ul class="tiles">${items.map((i) => tile(i, base)).join('')}</ul>`;

function renderType(t, i, types, base) {
  let h = `<section class="gt" id="${esc(t.id)}" data-title="${esc(`${t.id} ${t.title} ${t.hint}`.toLowerCase())}">
<p class="kicker">${String(i + 1).padStart(2, '0')} &middot; Game type</p>
<h2>${esc(t.title)}</h2>
<p class="hint">${esc(t.hint)} <span class="packs">${t.count} images in ${t.packs.map((p) => `<code>${esc(p)}</code>`).join(' ')}</span></p>
<h3 class="sub">Starter set</h3>
${grid(t.starter, base)}
<h3 class="sub more">More from the packs</h3>`;
  for (const m of t.more) {
    if (m.seeType) {
      const other = types.find((x) => x.id === m.seeType);
      h += `\n<p class="see">Pack <code>${esc(m.pack)}</code> (${esc(m.title)}): see <a href="#${esc(other.id)}">${esc(other.title)}</a>.</p>`;
    } else if (m.items.length) {
      h += `\n<h4 class="pk">${esc(m.title)} <code>${esc(m.pack)}</code></h4>\n${grid(m.items, base)}`;
    }
  }
  return h + '\n</section>';
}

function renderSounds(catalog, base) {
  return `<section class="gt" id="sounds" data-title="sounds sound audio">
<p class="kicker">${String(read('gametypes.json').types.length + 1).padStart(2, '0')} &middot; Sounds</p>
<h2>Sounds</h2>
<p class="hint">Short WAV effects. Play one with <code>sounds.coin.play()</code>, click a name to copy that line.</p>
<ul class="sounds">${catalog.sounds.map((s) => `<li class="snd" data-n="${esc(s.name)}" data-g="${esc((s.tags ?? []).join(' '))}"><button type="button" class="play" data-src="${esc(base + s.file)}" aria-label="Play ${esc(s.name)}"></button><button type="button" class="nm" title="Copy code" data-copy="sounds.${esc(s.name)}.play()">sounds.${esc(s.name)}.play()</button><span class="sd">${esc(s.en)} <span class="sz">${s.seconds} s</span></span></li>`).join('')}</ul>
</section>`;
}

/** How a name is used (shown in the header; the test runs it with the Pygame Zero module of Natter). */
export const USAGE_CODE = `# an image as a figure that moves
ente = Actor("ente", (200, 150))

def draw():
    screen.blit("teich_hintergrund", (0, 0))
    ente.draw()

def on_mouse_down():
    sounds.platsch.play()

print(images.ente.get_width())   # the image itself
`;

/** Tiny Python highlighter for USAGE_CODE (strings, comments, numbers, a few keywords and builtins). */
function highlight(code) {
  return code.replace(/("[^"\n]*")|(#[^\n]*)|\b(\d+)\b|\b(def|for|in|import|if|else|return)\b|\b(print)\b|([&<>])/g, (m, s, c, n, k, b, x) => {
    if (s) return `<span class="s">${esc(s)}</span>`;
    if (c) return `<span class="c">${esc(c)}</span>`;
    if (n) return `<span class="n">${n}</span>`;
    if (k) return `<span class="k">${k}</span>`;
    if (b) return `<span class="b">${b}</span>`;
    return esc(x);
  });
}

/** The names the usage example relies on (checked by the test). */
export const USAGE_NAMES = { images: ['ente', 'teich_hintergrund', 'heroine_run_1', 'heroine_run_8', 'kara', 'kara_tree', 'turtle'], sounds: ['platsch'] };

const SCRIPT = `
(function () {
  var root = document.documentElement, DEF = root.getAttribute('data-base'), base = DEF;
  var m = /[?&]base=([^&#]+)/.exec(location.search);
  if (m) {
    var b = decodeURIComponent(m[1]);
    if (/^(https?:\\/\\/|\\/)/.test(b)) {
      base = b.replace(/\\/?$/, '/');
      [].forEach.call(document.querySelectorAll('img[src^="' + DEF + '"]'), function (i) { i.src = base + i.getAttribute('src').slice(DEF.length); });
      [].forEach.call(document.querySelectorAll('[data-src]'), function (e) { e.setAttribute('data-src', base + e.getAttribute('data-src').slice(DEF.length)); });
    }
  }
  var still = window.matchMedia('(prefers-reduced-motion: reduce)');
  var $ = function (s, e) { return (e || document).querySelector(s); };
  var $$ = function (s, e) { return [].slice.call((e || document).querySelectorAll(s)); };
  var tiles = $$('.t, .snd'), sections = $$('.gt');
  tiles.forEach(function (t) {
    var img = $('img', t), name = t.getAttribute('data-n') || $('.nm', t).textContent;
    t.n = name;
    t.q = (' ' + name.replace(/_/g, ' ') + ' ' + name + ' ' + (img ? img.alt : $('.sd', t).textContent) + ' ' + (t.getAttribute('data-g') || '') + ' ' + (t.getAttribute('data-p') || '') + ' ').toLowerCase();
  });

  // ---- copy with a short note
  var toast = $('#toast'), toastTimer;
  function note(text) { toast.textContent = text; toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.hidden = true; }, 1600); }
  function copy(text) {
    function done() { note('Copied: ' + text); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    function fallback() {
      var a = document.createElement('textarea'); a.value = text; a.setAttribute('readonly', ''); a.style.position = 'fixed'; a.style.opacity = '0';
      document.body.appendChild(a); a.select();
      try { document.execCommand('copy'); done(); } catch (e) { note(text); }
      a.remove();
    }
  }

  // ---- animation: frames of a tile, played while the pointer or focus is on it
  function frameSrc(img, name) { return img.getAttribute('src').replace(/[^\\/]+(\\.\\w+)$/, name + '$1'); }
  function frames(t) { return (t.getAttribute('data-fr') || '').split(' ').filter(Boolean); }
  function play(img, names, fps) {
    var first = img.getAttribute('src'), i = 0;
    var timer = setInterval(function () { i = (i + 1) % names.length; img.src = frameSrc(img, names[i]); }, 1000 / fps);
    return function () { clearInterval(timer); img.src = first; };
  }
  $$('.t.an').forEach(function (t) {
    var stop = null;
    function on() { if (!stop && !still.matches) stop = play($('img', t), frames(t), 8); }
    function off() { if (stop) { stop(); stop = null; } }
    t.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') on(); });
    t.addEventListener('pointerleave', off);
    t.addEventListener('focusin', function (e) { if (e.target.matches(':focus-visible')) on(); });
    t.addEventListener('focusout', off);
  });

  // ---- detail view
  var dlg = $('#detail'), stopDetail = null;
  function snippet(t, names) {
    var n = t.n, g = t.getAttribute('data-g') || '';
    if (names.length > 1) {
      var mm = /^(.*_)(\\d+)$/.exec(names[0]), run = mm && names.every(function (x, i) { return x === mm[1] + (+mm[2] + i); });
      var list = run ? '["' + mm[1] + '" + str(i) for i in range(' + mm[2] + ', ' + (+mm[2] + names.length) + ')]' : '[' + names.map(function (x) { return '"' + x + '"'; }).join(', ') + ']';
      return 'frames = ' + list + '\\nfigure = Actor(frames[0], (200, 150))\\n\\n# in update(), with a counter n:\\nfigure.image = frames[n // 6 % len(frames)]';
    }
    if (/(^| )background( |$)/.test(g)) return 'def draw():\\n    screen.blit("' + n + '", (0, 0))';
    return 'figure = Actor("' + n + '", (200, 150))\\n\\ndef draw():\\n    figure.draw()';
  }
  function openDetail(t) {
    var img = $('img', t), names = frames(t), size = $('.sz', t).textContent.split(' ')[0].split('×');
    var big = $('#d-img'), w = +size[0], h = +size[1], k = Math.min(w <= 64 && h <= 64 ? 3 : 2, 280 / w, 220 / h);
    big.src = img.getAttribute('src'); big.alt = img.alt; big.width = Math.round(w * k); big.height = Math.round(h * k);
    $('#d-name').textContent = t.n;
    $('#d-text').textContent = img.alt;
    $('#d-meta').textContent = w + ' × ' + h + ' px · pack ' + t.getAttribute('data-p') + (names.length ? ' · ' + names.length + ' frames' : '');
    var tags = $('#d-tags'); tags.textContent = '';
    (t.getAttribute('data-g') || '').split(' ').filter(Boolean).forEach(function (g) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'tag-b'; b.textContent = g;
      b.addEventListener('click', function () { dlg.close(); setView(''); input.value = g; apply(); input.focus(); });
      tags.appendChild(b);
    });
    var fr = $('#d-frames'); fr.textContent = ''; fr.hidden = !names.length;
    names.forEach(function (n) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'fr'; b.title = 'Copy ' + n;
      var i = document.createElement('img'); i.src = frameSrc(img, n); i.alt = ''; i.width = Math.round(w * Math.min(1, 40 / w, 40 / h)); i.height = Math.round(h * Math.min(1, 40 / w, 40 / h));
      var c = document.createElement('code'); c.textContent = n.slice(n.lastIndexOf('_') + 1);
      b.appendChild(i); b.appendChild(c); b.addEventListener('click', function () { copy(n); }); fr.appendChild(b);
    });
    $('#d-code').textContent = snippet(t, names);
    if (stopDetail) stopDetail();
    stopDetail = names.length && !still.matches ? play(big, names, 8) : null;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  dlg.addEventListener('close', function () { if (stopDetail) { stopDetail(); stopDetail = null; } });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  $('#d-close').addEventListener('click', function () { dlg.close(); });
  $('#d-copy-name').addEventListener('click', function () { copy($('#d-name').textContent); });
  $('#d-copy-code').addEventListener('click', function () { copy($('#d-code').textContent); });
  $$('.bgs button').forEach(function (b) {
    b.addEventListener('click', function () {
      $('.stage').setAttribute('data-bg', b.getAttribute('data-bg'));
      $$('.bgs button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    });
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button');
    if (!b) return;
    var t = b.closest('.t, .snd');
    if (b.classList.contains('nm')) copy(b.getAttribute('data-copy') || t.n);
    else if (b.classList.contains('pv')) openDetail(t);
    else if (b.classList.contains('play')) playSound(b);
  });

  // ---- sounds
  var audio = null, playing = null;
  function playSound(b) {
    if (audio) { audio.pause(); playing.classList.remove('on'); }
    if (playing === b) { playing = null; audio = null; return; }
    audio = new Audio(b.getAttribute('data-src')); playing = b; b.classList.add('on');
    audio.addEventListener('ended', function () { b.classList.remove('on'); if (playing === b) { playing = null; audio = null; } });
    audio.play().catch(function () { b.classList.remove('on'); note('Could not play the sound'); });
  }

  // ---- game type filter and search
  var input = $('#q'), count = $('#qn'), view = '';
  var chips = $$('.chips a');
  function setView(v) {
    view = v;
    chips.forEach(function (c) { c.setAttribute('aria-current', String(c.getAttribute('href') === '#' + v || (!v && c.getAttribute('href') === '#all'))); });
    apply();
  }
  function apply() {
    var q = input.value.trim().toLowerCase().replace(/^.*?\\(\\s*["']?|["']?\\s*\\).*$/g, '').replace(/^sounds\\.|\\.play$/g, '');
    var words = q.split(/[\\s_]+/).filter(Boolean), total = 0, seen = {};
    document.body.classList.toggle('searching', words.length > 0);
    sections.forEach(function (s) {
      var inView = words.length ? true : (!view || view === s.id);
      var hits = 0;
      $$('.t, .snd', s).forEach(function (t) {
        var ok = inView && words.every(function (w) { return t.q.indexOf(' ' + w) >= 0 || (w.length >= 4 && t.q.indexOf(w) >= 0); });
        if (ok && words.length && seen[t.n]) ok = false; // a starter image also shown in its pack
        if (ok && words.length) { seen[t.n] = 1; hits++; }
        t.hidden = !ok;
      });
      $$('.tiles, .pk, .sub', s).forEach(function (e) {
        var has = e.classList.contains('more') ? s.querySelector('.more ~ .tiles li:not([hidden])')
          : (e.classList.contains('tiles') ? e : e.nextElementSibling).querySelector('li:not([hidden])');
        e.classList.toggle('empty', !!words.length && !has);
      });
      s.hidden = !inView || (words.length > 0 && hits === 0);
      total += hits;
    });
    count.textContent = words.length ? total + (total === 1 ? ' hit' : ' hits') : '';
    $('#none').hidden = !(words.length && !total);
  }
  input.addEventListener('input', apply);
  chips.forEach(function (c) {
    c.addEventListener('click', function (e) {
      e.preventDefault();
      var id = c.getAttribute('href').slice(1);
      input.value = '';
      setView(id === 'all' ? '' : id);
      history.replaceState(null, '', id === 'all' ? location.pathname + location.search : '#' + id);
      $('#content').scrollIntoView();
    });
  });
  function fromHash() {
    var h = decodeURIComponent(location.hash.slice(1));
    if (h === 'all' || sections.some(function (s) { return s.id === h; })) { input.value = ''; setView(h === 'all' ? '' : h); }
  }
  window.addEventListener('hashchange', fromHash);
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== input && !dlg.open) { e.preventDefault(); input.focus(); }
    if (e.key === 'Escape' && document.activeElement === input) { input.value = ''; apply(); }
  });
  var mq = /[?&]q=([^&#]+)/.exec(location.search);
  if (mq) input.value = decodeURIComponent(mq[1].replace(/\\+/g, ' '));
  fromHash();
  apply();
})();
`;

function render({ catalog, types }, base) {
  const nImages = catalog.images.length;
  const about = Math.floor(nImages / 50) * 50;
  const nSounds = catalog.sounds.length;
  const description = `All ${nImages} images and ${nSounds} sounds of Natter's asset library, sorted by game type: names, sizes and previews to use in Pygame Zero with Actor("name"). Free to use (CC0).`;
  return `<!doctype html>
<html lang="en" data-base="${esc(base)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Natter Sprites: images and sounds for Pygame Zero</title>
<meta name="description" content="${esc(description)}">
<meta name="color-scheme" content="light dark">
<link rel="canonical" href="${SITE}sprites/">
<link rel="icon" href="../natter-small.svg" type="image/svg+xml">
<link rel="preconnect" href="${esc(new URL(base).origin)}">
<link rel="stylesheet" href="../style.css">
<link rel="stylesheet" href="sprites.css">
</head>
<body class="spr">
<!-- Generated by scripts/build-sprites.mjs from packages/assets (catalog.json, gametypes.json). Do not edit; run: npm run sprites -->
<a class="skip" href="#gallery">Skip to the images</a>
<header class="spr-top">
  <div class="wrap topbar">
    <a class="brand" href="../" aria-label="Natter, home page"><img src="../natter-small.svg" width="32" height="32" alt="">Natter</a>
    <span class="toplinks"><a class="gh-small" href="../reference/">Reference</a><a class="gh-small" href="${REPO}">GitHub</a></span>
  </div>
  <div class="wrap spr-hero">
    <div>
      <p class="eyebrow">Sprite gallery</p>
      <h1>${nImages} images, <span class="hl">just by name</span></h1>
      <p class="lead">The asset library of Natter: about ${about} sprites in one flat, friendly style and ${nSounds} short sounds, free to use (CC0). A program only writes the name, nobody uploads files. Pick a game type, search, and click a name to copy it.</p>
    </div>
    <div class="usage">
<pre class="codeblock" tabindex="0" aria-label="Using names in Pygame Zero"><code>${highlight(USAGE_CODE.trimEnd())}</code></pre>
      <ul class="howto">
        <li><code>Actor("name")</code> makes a figure, <code>screen.blit("name", (x, y))</code> draws an image, <code>images.name</code> is the image itself, <code>sounds.name.play()</code> plays a sound.</li>
        <li>Animations are numbered: <code>heroine_run_1</code> to <code>heroine_run_8</code>. Switch <code>actor.image</code> to play them; the detail view shows the code.</li>
        <li>Kara draws its world with the <code>kara</code> pack (<code>kara</code>, <code>kara_tree</code> …) and the turtle wears <code>turtle</code>; both work as normal images too.</li>
        <li>An own file with the same name in the project folder <code>images/</code> wins. More in the <a href="../reference/#assets">reference: asset library</a>.</li>
      </ul>
    </div>
  </div>
</header>
<div class="searchbar" id="gallery">
  <div class="wrap sb-inner">
    <label class="sr" for="q">Search images and sounds</label>
    <input id="q" type="search" placeholder="Search: coin, tree, jump, explosion …  (key /)" autocomplete="off" spellcheck="false">
    <span id="qn" class="qn" aria-live="polite"></span>
  </div>
  <nav class="chips" aria-label="Game types"><div class="wrap chips-inner">
    <a href="#all" aria-current="true">All</a>${types.map((t) => `<a href="#${esc(t.id)}">${esc(t.title)}</a>`).join('')}<a href="#sounds">Sounds</a>
  </div></nav>
</div>
<main class="wrap" id="content">
<p class="tip">Click a picture for details and code, click a name to copy it. Animations play when you point at them or open them.</p>
<p id="none" class="none" hidden>Nothing found. Try an English word like <code>tree</code>, <code>coin</code> or <code>walk</code>.</p>
${types.map((t, i) => renderType(t, i, types, base)).join('\n')}
${renderSounds(catalog, base)}
<p class="gen">This page is generated from the asset library (<code>npm run sprites</code>, <code>scripts/build-sprites.mjs</code>) out of <code>packages/assets/catalog.json</code> and <code>gametypes.json</code>; the pictures are the real files, loaded from the npm package <a href="https://www.npmjs.com/package/${esc(PKG.name)}"><code>${esc(PKG.name)}@${esc(PKG.version)}</code></a>. All images and sounds are free to use, change and share (CC0, see <a href="${REPO}/blob/main/packages/assets/LICENSE-ASSETS.md">LICENSE-ASSETS.md</a>). They are original work drawn from our own prompts and do not imitate any existing game, film or brand character.</p>
</main>
<dialog id="detail" aria-labelledby="d-name">
  <div class="d-head"><code id="d-name"></code><button type="button" id="d-close" class="x" aria-label="Close">✕</button></div>
  <div class="stage" data-bg="check"><img id="d-img" src="data:," alt=""></div>
  <div class="bgs" role="group" aria-label="Background"><button type="button" data-bg="check" aria-pressed="true">Checker</button><button type="button" data-bg="light" aria-pressed="false">Light</button><button type="button" data-bg="dark" aria-pressed="false">Dark</button></div>
  <p id="d-text" class="d-text"></p>
  <p id="d-meta" class="d-meta"></p>
  <div id="d-frames" class="d-frames" hidden></div>
  <div id="d-tags" class="d-tags"></div>
<pre class="codeblock"><code id="d-code"></code></pre>
  <div class="d-btns"><button type="button" class="btn primary" id="d-copy-name">Copy name</button><button type="button" class="btn" id="d-copy-code">Copy code</button></div>
</dialog>
<div id="toast" class="toast" role="status" hidden></div>
<footer>
  <div class="wrap foot">
    <img class="foot-mark" src="../natter.svg" width="64" height="64" alt="">
    <p>Natter is open source. <a href="../">Overview</a> &middot; <a href="../reference/">Reference</a> &middot; <a href="${REPO}/tree/main/packages/assets">Asset library</a> &middot; <a href="${REPO}">Source code</a></p>
  </div>
</footer>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

/** Build the page; problems lists everything that does not match the asset library (should be empty). */
export function buildSprites({ base = ASSETS_BASE } = {}) {
  const data = collectSprites();
  return { html: render(data, base), problems: data.problems, ...data };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { html, problems } = buildSprites();
  if (problems.length) {
    console.error(`Sprite page does not match the asset library:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    let old = '';
    try { old = readFileSync(OUT_FILE, 'utf8'); } catch { /* missing */ }
    if (old !== html) { console.error('docs/sprites/index.html is stale: run npm run sprites'); process.exit(1); }
    console.log('sprite page is current');
  } else {
    mkdirSync(dirname(OUT_FILE), { recursive: true });
    writeFileSync(OUT_FILE, html);
    console.log(`wrote ${OUT_FILE.slice(ROOT.length + 1)} (${Math.round(html.length / 1024)} KB)`);
  }
}
