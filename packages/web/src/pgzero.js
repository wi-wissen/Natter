// Pygame Zero on a canvas: implements host.pgz of docs/PGZERO-BRIDGE.md as a runner plugin. Draws the commands of
// every frame (screen, draw.*, text, Actor), runs the game at a fixed 60 frames per second with requestAnimationFrame,
// collects keyboard, mouse and touch input (optional on-screen buttons for phones), loads images and sounds before the
// start and plays sound with Web Audio.

import { createStage } from './stage.js';
import { ensureStyles } from './styles.js';
import { createAudio } from './pgzeroAudio.js';
import { createAssets } from './pgzeroAssets.js';
import { createDriver, gameSource, installPgzero, systemExit } from './pgzeroDriver.js';
import {
  pgzKey, pgzMods, PAD_KEYS, mouseButton, mouseButtons, cssColor, roundHalfEven, rotatedSize, fontPixels, fontCss,
  layoutText, fitFontSize, pgzMode,
} from './pgzeroMath.js';

const TEXT = {
  de: { sound: 'Ton an: tippen oder klicken', mute: 'Ton aus', unmute: 'Ton an', loading: 'Lade Bilder und Klänge …', controls: 'Steuerung' },
  en: { sound: 'Tap or click for sound', mute: 'Mute', unmute: 'Unmute', loading: 'Loading images and sounds …', controls: 'Controls' },
};

const CSS = `
.nw-pgz { --nw-font-: var(--nw-font, var(--font, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif));
  --nw-muted-: var(--nw-muted, var(--text-3, #6b7280)); --nw-line-: var(--nw-line, var(--line, #e5e7eb));
  --nw-accent-: var(--nw-accent, var(--primary, #1d4ed8));
  display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; font-family: var(--nw-font-); }
.nw-pgz-bar { display: flex; align-items: center; gap: 6px; min-height: 28px; padding: 0 2px 4px; color: var(--nw-muted-);
  font: 600 13px/1.2 var(--nw-font-); }
.nw-pgz-bar[hidden] { display: none; }
.nw-pgz-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }
.nw-pgz-bar button { all: unset; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 26px;
  border-radius: 6px; color: var(--nw-muted-); }
.nw-pgz-bar button:hover, .nw-pgz-bar button:focus-visible { background: color-mix(in srgb, var(--nw-muted-) 15%, transparent); }
.nw-pgz-bar button[hidden] { display: none; }
.nw-pgz-bar svg { width: 18px; height: 18px; }
.nw-pgz-body { position: relative; flex: 1; min-height: 0; }
.nw-pgz-body > .nw-stage { position: absolute; inset: 0; }
.nw-pgz-live .nw-canvas { touch-action: none; user-select: none; -webkit-user-select: none; }
.nw-pgz-hint { position: absolute; top: 8px; right: 8px; z-index: 3; font: 600 13px var(--nw-font-); color: #fff; cursor: pointer;
  background: rgba(15, 23, 42, .72); border: 0; border-radius: 999px; padding: 7px 12px; box-shadow: 0 4px 14px rgba(0,0,0,.25); }
.nw-pgz-hint[hidden], .nw-pgz-pad[hidden], .nw-pgz-msg[hidden] { display: none; }
.nw-pgz-msg { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 2; color: #e5e7eb;
  font: 500 14px var(--nw-font-); pointer-events: none; }
.nw-pgz-pad { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 2px 0; }
.nw-pgz-pad > div { display: flex; gap: 8px; }
.nw-pgz-pad button { touch-action: none; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  display: flex; align-items: center; justify-content: center; width: 56px; height: 48px; padding: 0; margin: 0; color: #fff;
  background: #334155; border: 0; border-radius: 12px; box-shadow: 0 2px 0 rgba(15, 23, 42, .35); }
.nw-pgz-pad button.on { background: var(--nw-accent-); transform: translateY(1px); box-shadow: none; }
.nw-pgz-pad button svg { width: 24px; height: 24px; fill: currentColor; }
.nw-pgz-pad [data-key="space"] { width: 72px; border-radius: 24px; }
`;

const ICON = {
  on: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  off: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 6 6M22 9l-6 6"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M12 5 4 15h16z"/></svg>',
  jump: '<svg viewBox="0 0 24 24"><path d="M12 3 4 12h5v8h6v-8h5z"/></svg>',
};

function ensurePgzStyles() {
  ensureStyles();
  if (typeof document === 'undefined' || document.getElementById('natter-web-pgz-css')) return;
  const style = document.createElement('style');
  style.id = 'natter-web-pgz-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

const editable = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
/** Keys whose browser default (scrolling, pressing a focused button) must not happen while a game runs. */
const GAME_KEYS = /^(Arrow(Left|Right|Up|Down)|Space|PageUp|PageDown|Home|End|Backspace)$/;

/**
 * @param {HTMLElement} container  needs a size (e.g. flex: 1 or a fixed height)
 * @param {{
 *   assets?: { baseUrl: string, packs: string[] } | { baseUrl: string, packs: string[] }[],
 *   preload?: 'used'|'all',
 *   controls?: boolean|'auto',
 *   titleBar?: boolean, soundButton?: boolean, volume?: number, muted?: boolean,
 *   upscale?: boolean, maxScale?: number, smooth?: boolean,
 *   frameBudget?: number, maxCatchUp?: number,
 *   lang?: 'de'|'en', onTitle?: (title: string) => void,
 * }} [opts]
 */
export function createPgzero(container, opts = {}) {
  ensurePgzStyles();
  const T = TEXT[opts.lang ?? 'de'] ?? TEXT.en;
  const root = document.createElement('div');
  root.className = 'nw-pgz';
  root.innerHTML = `<div class="nw-pgz-bar"><span class="nw-pgz-title"></span><button type="button" class="nw-pgz-mute" hidden></button></div><div class="nw-pgz-body"></div>`;
  container.appendChild(root);
  const bar = /** @type {HTMLElement} */ (root.querySelector('.nw-pgz-bar'));
  const titleEl = /** @type {HTMLElement} */ (root.querySelector('.nw-pgz-title'));
  const muteBtn = /** @type {HTMLButtonElement} */ (root.querySelector('.nw-pgz-mute'));
  bar.hidden = opts.titleBar === false;

  let ready = false;
  const stage = createStage(/** @type {HTMLElement} */ (root.querySelector('.nw-pgz-body')), {
    width: 800, height: 600, upscale: opts.upscale ?? true, maxScale: opts.maxScale ?? 2, className: 'nw-pgz-stage',
    onResize: () => { if (ready) replay(); },
  });
  const hint = document.createElement('button');
  hint.type = 'button';
  hint.className = 'nw-pgz-hint';
  hint.textContent = '🔈 ' + T.sound;
  hint.hidden = true;
  const msg = document.createElement('div');
  msg.className = 'nw-pgz-msg';
  msg.hidden = true;
  const pad = document.createElement('div');
  pad.className = 'nw-pgz-pad';
  pad.setAttribute('aria-label', T.controls);
  const arrow = (k) => `<button type="button" data-key="${k}" aria-label="${k}"><span style="display:flex;transform:rotate(${{ up: 0, right: 90, down: 180, left: 270 }[k]}deg)">${ICON.arrow}</span></button>`;
  pad.innerHTML = `<div>${arrow('left')}${arrow('right')}</div><div>${arrow('up')}${arrow('down')}<button type="button" data-key="space" aria-label="space">${ICON.jump}</button></div>`;
  pad.hidden = true;
  stage.el.append(hint, msg);
  root.appendChild(pad); // a row under the game: the buttons never cover it

  const assets = createAssets({ assets: opts.assets, preload: opts.preload, lang: opts.lang });
  const audio = createAudio({
    volume: opts.volume, muted: opts.muted,
    buffer: (kind, name) => assets.buffer(kind, name),
    onMusicEnd: () => driver?.push(['music_end']),
    onLocked: () => { if (live) hint.hidden = false; },
    onUnlocked: () => { hint.hidden = true; },
  });

  // ---------- state ----------
  let vm = null, live = false, driver = null, game = null, raf = 0, last = null, paused = false, hiddenTab = false;
  let title = '', showControls = opts.controls ?? false;
  /** Draw commands since the screen was last filled completely (replayed after a resize) */
  let display = [], snapshot = null;
  let drawCalls = 0, runs = 0;
  /** @type {Map<string, string>} sources prepared by prepare() → mode */
  const prepared = new Map();
  const keyCodes = new Map(); // KeyboardEvent.code → { key } of its key_down
  const modsDown = new Set();
  let mousePos = null, pointerDown = 0;
  const textCache = new Map();

  // ---------- drawing ----------
  const W = () => stage.W, H = () => stage.H;

  function begin() {
    const ctx = stage.begin();
    ctx.imageSmoothingEnabled = opts.smooth !== false;
    ctx.imageSmoothingQuality = 'high';
    return ctx;
  }

  function clearScreen() {
    display = [];
    snapshot = null;
    const ctx = begin();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W(), H());
  }

  /** Draw again after a resize: the commands since the last full fill (crisp at the new size). */
  function replay() {
    const ctx = begin();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W(), H());
    if (snapshot) ctx.drawImage(snapshot, 0, 0, W(), H());
    for (const [name, a] of display) exec(ctx, name, a);
  }

  function record(name, a) {
    if (name === 'fill' || (name === 'blit' && covers(a))) { display = []; snapshot = null; }
    display.push([name, a]);
    if (display.length > 20000) {
      // a game that never fills the screen: keep a picture instead of the commands
      const c = document.createElement('canvas');
      c.width = stage.canvas.width; c.height = stage.canvas.height;
      c.getContext('2d').drawImage(stage.canvas, 0, 0);
      snapshot = c;
      display = [];
    }
  }
  function covers(a) {
    const e = assets.image(a[0]);
    return e && a[1] <= 0 && a[2] <= 0 && a[1] + e.w >= W() && a[2] + e.h >= H();
  }

  /** Draw an unrotated image on whole device pixels (tiles then join without seams). */
  function image(ctx, img, x, y, w, h) {
    const k = stage.pixelScale;
    const x0 = Math.round(x * k) / k, y0 = Math.round(y * k) / k;
    ctx.drawImage(img, x0, y0, Math.round((x + w) * k) / k - x0, Math.round((y + h) * k) / k - y0);
  }

  function exec(ctx, name, a) {
    drawCalls++;
    switch (name) {
      case 'fill': {
        const [c, g] = a;
        if (g) {
          const grad = ctx.createLinearGradient(0, 0, 0, H());
          grad.addColorStop(0, cssColor(c));
          grad.addColorStop(1, cssColor(g));
          ctx.fillStyle = grad;
        } else ctx.fillStyle = cssColor(c);
        ctx.fillRect(0, 0, W(), H());
        break;
      }
      case 'blit': {
        const e = assets.image(a[0]);
        if (e) image(ctx, e.img, a[1], a[2], e.w, e.h);
        break;
      }
      case 'actor': {
        const [img, x, y, w, h, angle, scale, fx, fy, opacity] = a;
        const e = assets.image(img);
        if (!e || opacity <= 0) break;
        ctx.save();
        if (opacity < 1) ctx.globalAlpha = opacity;
        if (!angle && !fx && !fy) image(ctx, e.img, x, y, e.w * scale, e.h * scale);
        else {
          ctx.translate(x + w / 2, y + h / 2);
          if (angle) ctx.rotate((-angle * Math.PI) / 180);
          ctx.scale(fx ? -scale : scale, fy ? -scale : scale);
          ctx.drawImage(e.img, -e.w / 2, -e.h / 2, e.w, e.h);
        }
        ctx.restore();
        break;
      }
      case 'line': {
        const [x1, y1, x2, y2, c, w] = a;
        if (w < 1) break;
        const o = w % 2 ? 0.5 : 0;
        ctx.beginPath();
        ctx.moveTo(x1 + o, y1 + o);
        ctx.lineTo(x2 + o, y2 + o);
        ctx.lineWidth = w;
        ctx.lineCap = w === 1 ? 'square' : 'butt';
        ctx.strokeStyle = cssColor(c);
        ctx.stroke();
        break;
      }
      case 'circle': case 'filled_circle': {
        const [x, y, r, c] = a;
        const w = name === 'circle' ? a[4] : 0;
        if (r < 1) break;
        ctx.beginPath();
        if (w <= 0 || w >= r) {
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = cssColor(c);
          ctx.fill();
        } else {
          ctx.arc(x, y, r - w / 2, 0, Math.PI * 2);
          ctx.lineWidth = w;
          ctx.strokeStyle = cssColor(c);
          ctx.stroke();
        }
        break;
      }
      case 'rect': case 'filled_rect': {
        const [x, y, w, h, c] = a;
        const width = name === 'rect' ? a[5] : 0;
        if (width <= 0) { ctx.fillStyle = cssColor(c); ctx.fillRect(x, y, w, h); break; }
        ctx.lineWidth = 1;
        ctx.strokeStyle = cssColor(c);
        ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
        break;
      }
      case 'polygon': case 'filled_polygon': {
        const [pts, c] = a;
        if (!pts.length) break;
        ctx.beginPath();
        pts.forEach(([px, py], i) => (i ? ctx.lineTo(px + 0.5, py + 0.5) : ctx.moveTo(px + 0.5, py + 0.5)));
        ctx.closePath();
        ctx.lineWidth = 1;
        ctx.lineJoin = 'miter';
        ctx.strokeStyle = cssColor(c);
        if (name === 'filled_polygon') { ctx.fillStyle = cssColor(c); ctx.fill(); }
        ctx.stroke();
        break;
      }
      case 'text': drawText(ctx, a[0], a[1], a[2], a[3], a[4], a[5]); break;
      case 'textbox': drawTextbox(ctx, ...a); break;
      default: drawCalls--;
    }
  }

  /** Font metrics and a measuring function for text options at a size. */
  function fontOf(ctx, o) {
    const px = fontPixels(o);
    const css = fontCss(o, px, assets.families);
    ctx.font = css;
    const m = ctx.measureText('Hg');
    const ascent = m.fontBoundingBoxAscent ?? px * 0.8, descent = m.fontBoundingBoxDescent ?? px * 0.25;
    return { css, px, ascent, descent, height: Math.ceil(ascent + descent), measure: (s) => ctx.measureText(s).width };
  }

  function drawText(ctx, text, x, y, hanchor, vanchor, o) {
    ctx.save();
    const f = fontOf(ctx, o);
    const L = layoutText(text, o, f);
    const [bw, bh] = o.angle ? rotatedSize(L.w, L.h, o.angle) : [L.w, L.h];
    const left = roundHalfEven(x - hanchor * bw), top = roundHalfEven(y - vanchor * bh);
    if (o.alpha != null && o.alpha < 1) ctx.globalAlpha = o.alpha;
    if (o.angle) {
      ctx.translate(left + bw / 2, top + bh / 2);
      ctx.rotate((-o.angle * Math.PI) / 180);
      ctx.translate(-L.w / 2, -L.h / 2);
    } else ctx.translate(left, top);
    if (o.background) { ctx.fillStyle = cssColor(o.background); ctx.fillRect(0, 0, L.w, L.h); }
    const align = o.align ?? hanchor ?? 0;
    const ox = L.opx + Math.max(0, -L.sx), oy = L.opx + Math.max(0, -L.sy);
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    L.lines.forEach((line, i) => {
      const lx = ox + align * (L.textW - L.widths[i]);
      const ly = oy + i * L.lineStep + f.ascent;
      const paint = (dx, dy, fill) => {
        if (L.opx) { ctx.lineWidth = 2 * L.opx; ctx.strokeStyle = cssColor(o.ocolor ?? [0, 0, 0]); ctx.strokeText(line, lx + dx, ly + dy); }
        ctx.fillStyle = fill;
        ctx.fillText(line, lx + dx, ly + dy);
        if (o.underline) ctx.fillRect(lx + dx, ly + dy + Math.max(1, Math.round(f.px / 10)), L.widths[i], Math.max(1, Math.round(f.px / 14)));
      };
      if (o.shadow) paint(L.sx, L.sy, cssColor(o.scolor ?? [0, 0, 0]));
      let fill = cssColor(o.color ?? [255, 255, 255]);
      if (o.gcolor) {
        const g = ctx.createLinearGradient(0, ly - f.ascent, 0, ly + f.descent);
        g.addColorStop(0, fill);
        g.addColorStop(1, cssColor(o.gcolor));
        fill = g;
      }
      paint(0, 0, fill);
    });
    ctx.restore();
  }

  function drawTextbox(ctx, text, x, y, w, h, hanchor, vanchor, o) {
    const key = JSON.stringify([text, w, h, o.fontname, o.sysfontname, o.bold, o.italic, o.lineheight, o.strip]);
    let size = textCache.get(key);
    if (size === undefined) {
      ctx.save();
      size = fitFontSize((s) => {
        const so = { ...o, fontsize: s, width: w };
        const L = layoutText(text, so, fontOf(ctx, so));
        return L.textW <= w && L.textH <= h;
      });
      ctx.restore();
      if (textCache.size > 200) textCache.clear();
      textCache.set(key, size);
    }
    drawText(ctx, text, x + hanchor * w, y + vanchor * h, hanchor, vanchor, { ...o, fontsize: size, width: w });
  }

  // ---------- host.pgz ----------
  function cmd(name, a) {
    if (audio.cmd(name, a)) return;
    if (name === 'window') {
      const [w, h, t] = a;
      if (w !== stage.W || h !== stage.H) stage.setSize(Math.max(1, w), Math.max(1, h));
      setTitle(String(t));
      return;
    }
    record(name, a);
    exec(begin(), name, a);
  }

  function resource(kind, name) {
    const r = assets.resource(kind, name);
    if (r === null && vm) vm.host.printErr?.(assets.describeMissing(kind, name) + '\n');
    return r;
  }

  function setTitle(t) {
    title = t;
    titleEl.textContent = t;
    stage.el.dataset.title = t;
    opts.onTitle?.(t);
  }

  // ---------- the loop ----------
  function frameLoop(t) {
    raf = 0;
    if (!driver || driver.ended) return;
    if (!paused && !hiddenTab) {
      const ms = last === null ? 0 : t - last;
      last = t;
      driver.tick(ms);
    }
    if (driver && !driver.ended) raf = requestAnimationFrame(frameLoop);
  }
  function startLoop() { if (!raf && driver && !paused && !hiddenTab) { last = null; raf = requestAnimationFrame(frameLoop); } }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  function endGame(how, error) {
    stopLoop();
    releaseKeys(false);
    audio.stopAll();
    hint.hidden = true;
    root.classList.remove('nw-pgz-live');
    const ctx = game;
    game = null;
    if (!ctx) return;
    if (how === 'error') ctx.throwError(error);
    else if (how === 'exit') ctx.throwError(systemExit());
    else ctx.resume(null);
  }

  function onVisibility() {
    hiddenTab = document.hidden;
    if (hiddenTab) { stopLoop(); releaseKeys(true); audio.suspend(); } else { audio.resume(); driver?.resetTime(); startLoop(); }
  }

  // ---------- input ----------
  function push(ev) { if (driver && !driver.ended) driver.push(ev); }
  const mods = (e) => pgzMods(modsDown, { caps: e?.getModifierState?.('CapsLock'), num: e?.getModifierState?.('NumLock') });

  function onKey(e) {
    if (!live || editable(e.target)) return;
    if (e.type === 'keydown') audio.unlock();
    if (!driver) return;
    const down = e.type === 'keydown';
    if (/^(Shift|Control|Alt|Meta|OS)(Left|Right)$/.test(e.code)) { if (down) modsDown.add(e.code); else modsDown.delete(e.code); }
    if (GAME_KEYS.test(e.code) && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault();
    if (down) {
      if (e.repeat || keyCodes.has(e.code)) return; // no key repeat in Pygame Zero
      const k = pgzKey(e);
      if (!k) return;
      keyCodes.set(e.code || e.key, k);
      push(['key_down', k.key, mods(e), k.unicode]);
    } else {
      const k = keyCodes.get(e.code || e.key) ?? pgzKey(e);
      keyCodes.delete(e.code || e.key);
      if (k) push(['key_up', k.key, mods(e)]);
    }
  }
  /** Release all keys (window lost the focus): keys must not stick. */
  function releaseKeys(send) {
    if (send) for (const k of keyCodes.values()) push(['key_up', k.key, 0]);
    keyCodes.clear();
    modsDown.clear();
    for (const b of pad.querySelectorAll('button.on')) b.classList.remove('on');
  }
  const onBlur = () => releaseKeys(true);
  const onGesture = () => { if (live) audio.unlock(); };

  function posOf(e) {
    const [lx, ly] = stage.pointer(e);
    return [Math.min(W() - 1, Math.max(0, Math.floor(lx))), Math.min(H() - 1, Math.max(0, Math.floor(ly)))];
  }
  const canvas = stage.canvas;
  canvas.addEventListener('pointerdown', (e) => {
    if (!live) return;
    audio.unlock();
    canvas.focus({ preventScroll: true });
    if (!e.isPrimary || !driver) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const p = posOf(e);
    mousePos = p;
    pointerDown |= 1 << e.button;
    const b = mouseButton(e.button);
    if (b) push(['mouse_down', p, b]);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!live || !driver || !e.isPrimary) return;
    if (e.pointerType !== 'mouse' && !pointerDown) return;
    const p = posOf(e);
    const prev = mousePos ?? p;
    mousePos = p;
    const rel = [p[0] - prev[0], p[1] - prev[1]];
    if (!rel[0] && !rel[1]) return;
    const buttons = e.pointerType === 'mouse' ? mouseButtons(e.buttons) : [1, 0, 0];
    driver.push(['mouse_move', p, rel, buttons]);
  });
  const up = (e) => {
    if (!live || !driver || !e.isPrimary) return;
    if (!(pointerDown & (1 << e.button)) && e.type !== 'pointercancel') return;
    pointerDown &= ~(1 << e.button);
    if (e.type === 'pointercancel') pointerDown = 0;
    const b = mouseButton(e.button);
    if (b) push(['mouse_up', posOf(e), b]);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    if (!live || !driver || !e.deltaY) return;
    e.preventDefault();
    const p = posOf(e), b = e.deltaY < 0 ? 4 : 5;
    push(['mouse_down', p, b]);
    push(['mouse_up', p, b]);
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => { if (live) e.preventDefault(); });

  hint.addEventListener('click', () => { audio.unlock(); hint.hidden = true; canvas.focus({ preventScroll: true }); });
  muteBtn.addEventListener('click', () => { audio.unlock(); plugin.muted = !audio.muted; });
  function showMute() {
    muteBtn.hidden = opts.soundButton === false;
    muteBtn.innerHTML = audio.muted ? ICON.off : ICON.on;
    muteBtn.title = muteBtn.ariaLabel = audio.muted ? T.unmute : T.mute;
  }

  // on-screen buttons: each one is a key (several fingers at once)
  for (const b of pad.querySelectorAll('button')) {
    const key = PAD_KEYS[b.dataset.key];
    const press = (e) => {
      e.preventDefault();
      audio.unlock();
      try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      if (b.classList.contains('on')) return;
      b.classList.add('on');
      push(['key_down', key, 0, b.dataset.key === 'space' ? ' ' : '']);
    };
    const release = (e) => {
      e.preventDefault();
      if (!b.classList.contains('on')) return;
      b.classList.remove('on');
      push(['key_up', key, 0]);
    };
    b.addEventListener('pointerdown', press);
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  function updatePad() {
    const auto = showControls === 'auto' && typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    pad.hidden = !(live && (showControls === true || auto));
  }

  ready = true;
  clearScreen();
  showMute();

  // ---------- plugin ----------
  const plugin = {
    name: 'pgzero',
    stage,
    assets,
    audio,
    get canvas() { return stage.canvas; },
    /** State for tests and pages. */
    get info() {
      return {
        live, runs, running: !!driver && !driver.ended, paused, size: [stage.W, stage.H], title, frames: driver?.frames ?? 0,
        drawCalls, controls: !pad.hidden, audio: { unlocked: audio.unlocked, muted: audio.muted, volume: audio.volume, log: audio.log.slice() },
        hint: !hint.hidden,
      };
    },
    /** Logical game coordinates → CSS pixels relative to the canvas. */
    toClient(x, y) { return [x * stage.scale, y * stage.scale]; },
    /** Colour [r, g, b] of the game pixel (x, y) as drawn. */
    pixel(x, y) {
      const k = stage.pixelScale;
      return [...stage.ctx.getImageData(Math.floor((x + 0.5) * k), Math.floor((y + 0.5) * k), 1, 1).data.slice(0, 3)];
    },

    /** On-screen buttons (arrows and a jump/space button): true, false or 'auto' (on touch screens). */
    get controls() { return showControls; },
    set controls(v) { showControls = v; updatePad(); },
    get volume() { return audio.volume; },
    set volume(v) { audio.volume = v; },
    get muted() { return audio.muted; },
    set muted(m) { audio.muted = m; showMute(); },
    /** Register an image of the page (placeholders, generated images): canvas, image, ImageBitmap, SVG text or URL; size [w, h] in game pixels. */
    addImage(name, src, size) { assets.addImage(name, src, size); return plugin; },
    /** Register a sound of the page (AudioBuffer or URL). */
    addSound(name, src) { assets.addSound(name, src); return plugin; },

    /**
     * Get a program ready: load the images and sounds it may use, and tell how to start it.
     * Returns { source, globals, mode, problems } for runner.run (mode null: not a Pygame Zero program).
     * @param {string} source @param {{ files?: Record<string, any>, mode?: 'game'|'pgzrun'|null }} [o]
     */
    async prepare(source, o = {}) {
      const mode = o.mode !== undefined ? o.mode : pgzMode(source);
      const files = o.files ?? {};
      let problems = [];
      if (mode) {
        msg.textContent = T.loading;
        const t = setTimeout(() => { msg.hidden = false; }, 150);
        try { problems = await assets.prepare([source, ...Object.entries(files).filter(([p]) => p.endsWith('.py')).map(([, v]) => String(v))], files); }
        finally { clearTimeout(t); msg.hidden = true; }
      }
      const r = gameSource(source, mode);
      if (mode) prepared.set(r.source, mode);
      if (prepared.size > 20) prepared.delete(prepared.keys().next().value);
      return { ...r, mode, problems };
    },
    /** prepare() and runner.run() in one step. */
    async run(runner, source, o = {}) {
      const p = await plugin.prepare(source, o);
      return runner.run(p.source, { ...o, globals: { ...(o.globals ?? {}), ...p.globals } });
    },

    /** Hold the game (the frames stop, input waits). */
    pause() { paused = true; stopLoop(); },
    /** Go on after pause(). */
    resume() { paused = false; driver?.resetTime(); startLoop(); },
    /** Run n frames now (single steps while paused; tests). */
    step(n = 1) { if (driver && !driver.ended) driver.tick(0, n); },
    /** Close the window: the game ends, code after pgzrun.go() runs. */
    quit() { push(['quit']); if (paused) plugin.step(1); },

    host: { pgz: { resource: (kind, name) => resource(kind, name), cmd: (name, args) => cmd(name, args) } },
    waits: {
      pgzero(wait, ctx) {
        if (game) return; // go() a second time: only one game window
        game = ctx;
        driver = createDriver(ctx.vm, { frameBudget: opts.frameBudget, maxSteps: opts.maxCatchUp, onEnd: endGame });
        ctx.onCancel(() => { game = null; driver?.stop(); endGame('stopped'); });
        root.classList.add('nw-pgz-live');
        canvas.focus({ preventScroll: true });
        driver.tick(0, 0); // pgzero_main.start: window, hooks, spell check
        startLoop();
      },
    },
    start(c) {
      const mode = prepared.get(c.source) ?? pgzMode(c.source);
      live = !!mode;
      runs++;
      vm = c.vm;
      driver = null; game = null; paused = false;
      releaseKeys(false);
      audio.stopAll();
      textCache.clear();
      drawCalls = 0;
      if (!live) return;
      if (mode === 'game' && c.vm.predef.get('Actor') === null) installPgzero(c.vm);
      stage.setSize(800, 600);
      clearScreen();
      setTitle('');
      updatePad();
      window.addEventListener('keydown', onKey);
      window.addEventListener('keyup', onKey);
      window.addEventListener('blur', onBlur);
      document.addEventListener('visibilitychange', onVisibility);
      document.addEventListener('pointerdown', onGesture, true);
      hiddenTab = document.hidden;
    },
    end() {
      if (driver && !driver.ended) driver.stop();
      stopLoop();
      audio.stopAll();
      live = false;
      hint.hidden = true;
      root.classList.remove('nw-pgz-live');
      updatePad();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('pointerdown', onGesture, true);
    },
    destroy() { plugin.end(); stage.destroy(); root.remove(); },
  };
  return plugin;
}
