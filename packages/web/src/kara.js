// Kara the ladybug on a canvas: implements host.kara(kind, args) of docs/HOST-TURTLE-KARA.md. Draws the meadow with
// trees, berries and mushrooms with the images of the asset library (pack kara, found like the Pygame Zero host finds
// it: baseUrl + catalog), or with vector shapes when there is no library or it cannot be loaded. Animates moves,
// turns, pushes and berries (the returned seconds make the program wait while the animation plays) and shows the bump
// before an error.

import { createStage } from './stage.js';
import { parseWorldText, mushroomsDone, DIR_ANGLE, KARA_IMAGES, KARA_OPTIONAL, karaImageUrls, karaSprite, meadowDecor } from './karaWorld.js';

const S = 48; // logical size of a cell
const C = {
  grass: '#eaf4dc', grass2: '#e3f0d2', grid: '#d5e7c0', line: '#2d4a22',
  tree: '#3f8f3a', treeHi: '#5fae4f', treeLine: '#24572a', trunk: '#8b5a2b',
  berry: '#e11d48', berryLine: '#881337', berryRing: 'rgba(225, 29, 72, .13)',
  cap: '#dc2626', capDone: '#16a34a', capLine: '#7f1d1d', capDoneLine: '#14532d', stem: '#fde7c8', stemLine: '#b08968',
  body: '#ef4444', bodyCrash: '#f59e0b', bodyLine: '#7f1d1d', head: '#1f1f24',
};

/** Grass colour of kara_grass (filled under the tiles, so no seams show between them). */
const GRASS = '#97d368';
/** How long the meadow waits for the images before it draws the vector shapes (ms). */
const WAIT_MS = 1500;

function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('image ' + url));
    img.src = url;
  });
}

/**
 * The kara images of the library: name → image. Throws when one of the needed images is missing.
 * @param {{ baseUrl: string, catalog?: any } | { baseUrl: string, catalog?: any }[]} assets
 */
async function loadKaraImages(assets, fetchFn) {
  const urls = {};
  for (const s of Array.isArray(assets) ? assets : [assets]) {
    if (!s?.baseUrl) continue;
    const base = s.baseUrl.endsWith('/') ? s.baseUrl : s.baseUrl + '/';
    let found = {};
    try {
      if (s.catalog) {
        let c = s.catalog;
        if (typeof c === 'string') {
          const r = await fetchFn(/^[a-z][a-z0-9+.-]*:|^\//i.test(c) ? c : base + c);
          if (!r.ok) throw new Error(String(r.status));
          c = await r.json();
        }
        found = karaImageUrls(c, base);
      } else {
        const r = await fetchFn(base + 'kara/pack.json');
        if (r.ok) found = karaImageUrls(await r.json(), base, 'kara/');
      }
    } catch { /* the next source */ }
    for (const [k, v] of Object.entries(found)) urls[k] ??= v;
  }
  const images = {};
  await Promise.all(KARA_IMAGES.map(async (name) => {
    try {
      if (!urls[name]) throw new Error('missing ' + name);
      images[name] = await loadImage(urls[name]);
    } catch (e) {
      if (!KARA_OPTIONAL.includes(name)) throw e;
    }
  }));
  return images;
}

/**
 * @param {HTMLElement} container
 * @param {{ stepSeconds?: number, fit?: 'contain'|'width', maxScale?: number, assets?: { baseUrl: string, catalog?: string|object } | { baseUrl: string, catalog?: string|object }[], decor?: boolean, fetch?: typeof fetch }} [opts]
 *   stepSeconds: duration of a move (turns and berries take a bit less); 0 = no animation
 *   assets: the asset library like the Pygame Zero host (catalog.json relative to baseUrl, or the catalog itself;
 *     without catalog <baseUrl>kara/pack.json); its kara images are loaded once, when the first world is shown.
 *     Without it (or when they cannot be loaded) Kara is drawn with vector shapes.
 *   decor: a few small flowers on empty cells (default true; only looks)
 */
export function createKara(container, opts = {}) {
  let ready = false; // the stage reports its first size before the rest exists
  const stage = createStage(container, { width: 5 * S, height: 3 * S, fit: opts.fit, upscale: true, maxScale: opts.maxScale ?? 1.6, className: 'nw-kara', onResize: () => { if (ready) draw(); } });
  let world = null;
  let kara = { x: 0, y: 0, angle: 0 };
  let crash = null, anim = null, raf = 0;
  let step = opts.stepSeconds ?? 0.3;
  const now = () => performance.now();
  /** Images of the library: 'none' (vector shapes), 'loading', 'ready' or 'failed'. */
  let imgState = opts.assets ? 'idle' : 'none';
  let images = null, loadStart = 0, loading = null;
  const fetchFn = opts.fetch ?? ((...a) => fetch(...a));

  function loadImages() {
    if (imgState !== 'idle') return loading ?? Promise.resolve();
    imgState = 'loading';
    loadStart = now();
    setStyle();
    loading = loadKaraImages(opts.assets, fetchFn).then((imgs) => { images = imgs; imgState = 'ready'; }, (e) => {
      imgState = 'failed';
      console.warn('[natter kara] library images not loaded, drawing shapes:', e?.message ?? e);
    }).then(() => { setStyle(); request(); });
    return loading;
  }
  /** What the canvas shows, for tests and styling: data-kara-style="images" | "shapes" | "loading". */
  function setStyle() {
    stage.canvas.dataset.karaStyle = imgState === 'ready' ? 'images' : imgState === 'loading' ? 'loading' : 'shapes';
  }
  setStyle();

  // ---------- drawing ----------
  function circle(ctx, x, y, r, fill, stroke, lw = 2) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }

  function drawTree(ctx, cx, cy) {
    ctx.fillStyle = C.trunk;
    ctx.strokeStyle = C.treeLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cx - 3.5, cy + 5, 7, 14, 1.5);
    ctx.fill();
    ctx.stroke();
    circle(ctx, cx, cy - 3, 15.5, C.tree, C.treeLine, 2.4);
    circle(ctx, cx - 5.5, cy - 8, 6, C.treeHi);
    circle(ctx, cx + 6, cy + 2, 2.2, C.treeHi);
  }

  function drawBerries(ctx, cx, cy, scale = 1) {
    if (scale <= 0) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    circle(ctx, 0, 0, 13, C.berryRing);
    for (const [x, y] of [[-4, 3], [4.5, 2], [0, -4.5]]) {
      circle(ctx, x, y, 5, C.berry, C.berryLine, 1.6);
      circle(ctx, x - 1.6, y - 1.8, 1.3, 'rgba(255,255,255,.75)');
    }
    ctx.restore();
  }

  function drawMushroom(ctx, cx, cy, done) {
    ctx.lineWidth = 2;
    ctx.fillStyle = C.stem;
    ctx.strokeStyle = C.stemLine;
    ctx.beginPath();
    ctx.roundRect(cx - 6, cy, 12, 15, 4);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 17, cy + 3);
    ctx.ellipse(cx, cy + 3, 17, 15, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = done ? C.capDone : C.cap;
    ctx.fill();
    ctx.strokeStyle = done ? C.capDoneLine : C.capLine;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    circle(ctx, cx - 7, cy - 4, 2.8, '#fff');
    circle(ctx, cx + 4, cy - 8, 2.3, '#fff');
    circle(ctx, cx + 8, cy - 1, 1.9, '#fff');
  }

  function drawKara(ctx, cx, cy, angle, crashed) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((angle * Math.PI) / 180);
    // legs
    ctx.strokeStyle = C.head;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const x of [-7, 1, 8]) for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x, s * 10);
      ctx.lineTo(x - 2, s * 16);
      ctx.stroke();
    }
    // head with eyes
    circle(ctx, 13, 0, 8, C.head, C.head, 1);
    circle(ctx, 16.5, -3.4, 2, '#fff');
    circle(ctx, 16.5, 3.4, 2, '#fff');
    // body, wing line, spots
    ctx.beginPath();
    ctx.ellipse(-2, 0, 15.5, 13.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = crashed ? C.bodyCrash : C.body;
    ctx.fill();
    ctx.strokeStyle = C.bodyLine;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-17, 0);
    ctx.lineTo(10, 0);
    ctx.strokeStyle = C.bodyLine;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    for (const [x, y, r] of [[-8, -6, 3], [-8, 6, 3], [1, -7, 2.5], [1, 7, 2.5]]) circle(ctx, x, y, r, C.head);
    ctx.beginPath();
    ctx.ellipse(-6, -8, 4, 2, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.fill();
    ctx.restore();
  }

  function drawBump(ctx, cx, cy, angle) {
    const r = (angle * Math.PI) / 180;
    const bx = cx + Math.cos(r) * S * 0.5, by = cy + Math.sin(r) * S * 0.5;
    ctx.save();
    ctx.translate(bx, by);
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8, rr = i % 2 ? 4.5 : 11;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    raf = 0;
    const ctx = stage.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, stage.canvas.width, stage.canvas.height);
    if (!world) return;
    stage.begin();
    const t = now();
    let f = 1;
    if (anim) {
      f = Math.min(1, (t - anim.t0) / anim.dur);
      if (f >= 1) anim = null;
    }
    const ease = (v) => v * v * (3 - 2 * v);
    const e = ease(f);
    if (imgState === 'loading') {
      // a moment for the images: plain meadow, then the shapes until they arrive
      if (t - loadStart < WAIT_MS) {
        ctx.fillStyle = GRASS;
        ctx.fillRect(0, 0, world.width * S, world.height * S);
        raf = requestAnimationFrame(draw);
        return;
      }
    }
    if (imgState === 'ready') { drawImages(ctx, f, e); if (anim) raf = requestAnimationFrame(draw); return; }
    if (imgState === 'loading') raf = requestAnimationFrame(draw);
    // meadow
    for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
      ctx.fillStyle = (x + y) % 2 ? C.grass2 : C.grass;
      ctx.fillRect(x * S, y * S, S, S);
    }
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= world.width; x++) { ctx.moveTo(x * S, 0); ctx.lineTo(x * S, world.height * S); }
    for (let y = 0; y <= world.height; y++) { ctx.moveTo(0, y * S); ctx.lineTo(world.width * S, y * S); }
    ctx.stroke();
    const done = mushroomsDone(world);
    for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
      const c = world.cells[y][x], cx = x * S + S / 2, cy = y * S + S / 2;
      if (c.berry || (anim?.kind === 'remove' && anim.x === x && anim.y === y)) {
        const sc = anim && (anim.kind === 'put' || anim.kind === 'remove') && anim.x === x && anim.y === y ? (anim.kind === 'put' ? e : 1 - e) : 1;
        drawBerries(ctx, cx, cy, sc);
      }
      if (c.tree) drawTree(ctx, cx, cy);
      if (c.mushroom && !(anim?.kind === 'push' && anim.mx1 === x && anim.my1 === y)) drawMushroom(ctx, cx, cy, c.berry && done);
    }
    // kara (and the pushed mushroom)
    let kx = kara.x, ky = kara.y, angle = kara.angle;
    if (anim) {
      if (anim.kind === 'move' || anim.kind === 'push') { kx = anim.x0 + (kara.x - anim.x0) * e; ky = anim.y0 + (kara.y - anim.y0) * e; }
      if (anim.kind === 'push') {
        const mx = anim.mx0 + (anim.mx1 - anim.mx0) * e, my = anim.my0 + (anim.my1 - anim.my0) * e;
        drawMushroom(ctx, mx * S + S / 2, my * S + S / 2, world.cells[anim.my1][anim.mx1].berry && done);
      }
      if (anim.kind === 'turn') angle = anim.a0 + (kara.angle - anim.a0) * e;
      if (anim.kind === 'crash') {
        const r = (kara.angle * Math.PI) / 180, b = Math.sin(f * Math.PI) * 0.22;
        kx += Math.cos(r) * b; ky += Math.sin(r) * b;
      }
    }
    drawKara(ctx, kx * S + S / 2, ky * S + S / 2, angle, !!crash);
    if (crash && (!anim || f > 0.4)) drawBump(ctx, kara.x * S + S / 2, kara.y * S + S / 2, kara.angle);
    if (anim && !raf) raf = requestAnimationFrame(draw);
  }

  /** Draw an image of the library centred on (cx, cy), one cell wide, turned by `deg` and scaled by `sc`. */
  function sprite(ctx, name, cx, cy, deg = 0, sc = 1, alpha = 1) {
    const img = images[name];
    if (!img || sc <= 0) return;
    const w = S * sc;
    ctx.save();
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    if (deg) ctx.rotate((deg * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -w / 2, w, w);
    ctx.restore();
  }

  /** The meadow with the images of the library (same animations as the shapes). */
  function drawImages(ctx, f, e) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const W = world.width, H = world.height;
    // grass: one colour under the tiles (no seams), then the tufts
    ctx.fillStyle = GRASS;
    ctx.fillRect(0, 0, W * S, H * S);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ctx.drawImage(images.kara_grass, x * S, y * S, S, S);
    // faint cell lines: cells stay countable
    ctx.strokeStyle = 'rgba(40, 90, 20, .13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < W; x++) { ctx.moveTo(x * S, 0); ctx.lineTo(x * S, H * S); }
    for (let y = 1; y < H; y++) { ctx.moveTo(0, y * S); ctx.lineTo(W * S, y * S); }
    ctx.stroke();
    // Kara standing still on a berry is one picture (kara_berry); the berry under her is not drawn then
    const still = !anim || anim.kind === 'turn';
    const kc = world.cells[kara.y]?.[kara.x];
    const onBerry = still && !crash && !!kc?.berry;
    const pushing = anim?.kind === 'push';
    // flowers only where cells are big enough to read them as flowers (on tiny cells they look like noise)
    const decor = opts.decor !== false && !!images.kara_flower && S * stage.scale >= 30;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = world.cells[y][x], cx = x * S + S / 2, cy = y * S + S / 2;
      const changing = anim && (anim.kind === 'put' || anim.kind === 'remove') && anim.x === x && anim.y === y;
      const pushed = pushing && anim.mx1 === x && anim.my1 === y;
      if (decor && !c.tree && !c.berry && !c.mushroom && !changing && !pushed) {
        const d = meadowDecor(x, y);
        if (d) sprite(ctx, d.name, x * S + d.dx * S, y * S + d.dy * S, 0, 0.36, 0.85);
      }
      if (c.tree) sprite(ctx, 'kara_tree', cx, cy);
      const here = x === kara.x && y === kara.y;
      if (c.mushroom && !pushed) sprite(ctx, c.berry ? 'kara_mushroom_berry' : 'kara_mushroom', cx, cy);
      else if (changing) sprite(ctx, 'kara_blueberry', cx, cy, 0, anim.kind === 'put' ? e : 1 - e);
      else if (c.berry && !(here && onBerry)) sprite(ctx, 'kara_blueberry', cx, cy);
    }
    let kx = kara.x, ky = kara.y, angle = kara.angle;
    if (anim) {
      if (anim.kind === 'move' || anim.kind === 'push') { kx = anim.x0 + (kara.x - anim.x0) * e; ky = anim.y0 + (kara.y - anim.y0) * e; }
      if (pushing) {
        const mx = anim.mx0 + (anim.mx1 - anim.mx0) * e, my = anim.my0 + (anim.my1 - anim.my0) * e;
        sprite(ctx, 'kara_mushroom', mx * S + S / 2, my * S + S / 2);
      }
      if (anim.kind === 'turn') angle = anim.a0 + (kara.angle - anim.a0) * e;
      if (anim.kind === 'crash') {
        const r = (kara.angle * Math.PI) / 180, b = Math.sin(f * Math.PI) * 0.22;
        kx += Math.cos(r) * b; ky += Math.sin(r) * b;
      }
    }
    const s = karaSprite({ angle, berry: onBerry, bump: !!crash && (!anim || f > 0.4) });
    sprite(ctx, s.name, kx * S + S / 2, ky * S + S / 2, s.rotate);
  }

  function request() { if (!raf) raf = requestAnimationFrame(draw); }

  function animate(a, seconds) {
    if (seconds <= 0) { anim = null; request(); return 0; }
    anim = { ...a, t0: now(), dur: seconds * 1000 };
    request();
    return seconds;
  }

  // ---------- host.kara ----------
  function host(kind, a = []) {
    anim = null;
    switch (kind) {
      case 'world': {
        loadImages();
        world = parseWorldText(a[0]);
        kara = { x: world.kara.x, y: world.kara.y, angle: 0 };
        crash = null;
        stage.setSize(world.width * S, world.height * S);
        request();
        return 0;
      }
      case 'move': {
        const from = { x0: kara.x, y0: kara.y };
        kara.x = a[0]; kara.y = a[1];
        return animate({ kind: 'move', ...from }, step);
      }
      case 'push': {
        const from = { x0: kara.x, y0: kara.y };
        const [x, y, x2, y2] = a;
        kara.x = x; kara.y = y;
        if (world) { world.cells[y][x].mushroom = false; world.cells[y2][x2].mushroom = true; }
        return animate({ kind: 'push', ...from, mx0: x, my0: y, mx1: x2, my1: y2 }, step);
      }
      case 'turn': {
        const a0 = kara.angle;
        kara.angle += a[1] === 'left' ? -90 : 90;
        // keep the angle in step with the direction of the core
        const want = DIR_ANGLE[a[0]];
        if ((((kara.angle - want) % 360) + 360) % 360 !== 0) kara.angle = want;
        return animate({ kind: 'turn', a0 }, step * 0.8);
      }
      case 'put': if (world) world.cells[a[1]][a[0]].berry = true; return animate({ kind: 'put', x: a[0], y: a[1] }, step * 0.7);
      case 'remove': if (world) world.cells[a[1]][a[0]].berry = false; return animate({ kind: 'remove', x: a[0], y: a[1] }, step * 0.7);
      case 'crash': crash = a[0]; animate({ kind: 'crash' }, 0.45); return 0;
      default: return 0;
    }
  }

  ready = true;

  const plugin = {
    name: 'kara',
    stage,
    get canvas() { return stage.canvas; },
    /** Seconds per step (0: no animation). */
    get stepSeconds() { return step; },
    set stepSeconds(s) { step = Math.max(0, Number(s) || 0); },
    /** State for tests. */
    get info() { return { world: !!world, kara: { ...kara }, crash, size: world ? [world.width, world.height] : null, images: imgState }; },
    /** Load the library images now (otherwise with the first world); resolves when they are there or failed. */
    preload() { return loadImages(); },
    /** Centre of a cell in CSS pixels relative to the canvas (tests, overlays). */
    cellCenter(x, y) { return [(x * S + S / 2) * stage.scale, (y * S + S / 2) * stage.scale]; },
    host: { kara: (kind, args) => host(kind, args) },
    start() { world = null; crash = null; anim = null; request(); },
    end() { if (anim && anim.kind !== 'crash') anim = null; request(); },
    destroy() { stage.destroy(); },
  };
  return plugin;
}
