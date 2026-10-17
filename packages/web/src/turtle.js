// Turtle graphics on a canvas: implements host.turtle(kind, args) of docs/HOST-TURTLE-KARA.md, animates moves and
// turns (the returned seconds make the program wait while the animation plays), delivers keys, clicks and timers to
// mainloop() and answers textinput()/numinput() with a dialog.
//
// Drawing model: a display list of everything drawn (lines, fills, dots, texts, stamps) that is rendered into an
// offscreen cache canvas as it comes; the visible canvas shows background + cache + the move in progress + the turtles.
// A resize, clear() or clearstamp() replays the list.

import { turtleEvent, PyFloat } from '@natter/core';
import { createStage } from './stage.js';
import { askDialog } from './dialog.js';
import { makeView, moveSeconds, turnSeconds, angleDiff, shapePolygon, headingDir, cssFont, keysym } from './turtleMath.js';
import turtleSvg from '../../assets/turtle/turtle.svg';

const now = () => performance.now();

/**
 * @param {HTMLElement} container
 * @param {{ width?: number, height?: number, lang?: 'de'|'en', fit?: 'contain'|'width', upscale?: boolean,
 *   instantMs?: number, onTitle?: (title: string) => void, onBye?: () => void }} [opts]
 *   width/height: screen size before setup() (default 960 x 810 like CPython's window_width()/window_height())
 *   instantMs: milliseconds that a move at speed 0 costs while tracing is on (CPython updates the screen after every step)
 */
export function createTurtle(container, opts = {}) {
  const W0 = opts.width ?? 960, H0 = opts.height ?? 810;
  const instantMs = opts.instantMs ?? 1;
  const stage = createStage(container, { width: W0, height: H0, fit: opts.fit, upscale: opts.upscale, className: 'nw-turtle', onResize: () => { if (ready) rebuild(true); } });
  let ready = false;
  const cache = document.createElement('canvas');
  const cctx = /** @type {CanvasRenderingContext2D} */ (cache.getContext('2d'));

  let view = makeView(W0, H0);
  let worldBox = null;
  let bg = 'white';
  /** @type {any[]} display list */
  let ops = [];
  /** @type {Map<number, any>} */
  const turtles = new Map();
  /** @type {Map<number, { index: number, snap: HTMLCanvasElement|null }>} open fills */
  const fills = new Map();
  let anim = null, tracing = true, raf = 0, debt = 0;
  // events of mainloop()
  let vm = null, runner = null, active = false, loopSeen = false, waiting = null;
  const queue = [];
  const timers = new Map();
  let closeDialog = null;

  // ---------- turtle images ----------
  const svgImages = new Map();
  function turtleImage(fill) {
    const key = !fill || fill === 'black' || fill === '#000000' ? '' : fill;
    if (svgImages.has(key)) return svgImages.get(key);
    let svg = turtleSvg;
    if (key) {
      svg = svg.replace('fill="#2f9e6e"', `fill="${key}"`).replace('fill="#5cc28f"', 'fill="#ffffff" fill-opacity=".22"')
        .replaceAll('stroke="#1f7a52"', 'stroke="#000000" stroke-opacity=".3"');
    }
    const img = new Image();
    img.onload = () => { img.ready = true; request(); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    svgImages.set(key, img);
    return img;
  }

  // ---------- drawing ----------
  function newTurtle(id, shape = 'classic', pencolor = 'black', fillcolor = 'black') {
    return { id, x: 0, y: 0, heading: 0, shape, pencolor, fillcolor, pensize: 1, visible: true, stretch: [1, 1, 1], stamps: 0 };
  }

  function drawShape(ctx, shape, x, y, heading, fill, pen, stretch) {
    const [px, py] = view.toPx(x, y);
    const [dx, dy] = headingDir(view, x, y, heading);
    if (shape === 'turtle') {
      const img = turtleImage(fill);
      if (img.ready) {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(Math.atan2(dy, dx));
        ctx.scale(stretch[1], stretch[0]);
        ctx.drawImage(img, -15, -15, 30, 30);
        ctx.restore();
        return;
      }
    }
    const poly = shapePolygon(shape, px, py, dx, dy, stretch);
    ctx.beginPath();
    poly.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = stretch[2] ?? 1;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = pen;
    ctx.stroke();
  }

  function line(ctx, op, x1 = op.x1, y1 = op.y1) {
    const [a, b] = view.toPx(op.x0, op.y0);
    const [c, d] = view.toPx(x1, y1);
    ctx.beginPath();
    ctx.moveTo(a, b);
    ctx.lineTo(c, d);
    ctx.lineWidth = Math.max(0.5, op.width);
    ctx.lineCap = 'round';
    ctx.strokeStyle = op.color;
    ctx.stroke();
  }

  function drawOp(ctx, op) {
    switch (op.t) {
      case 'line': line(ctx, op); break;
      case 'fill': {
        ctx.beginPath();
        op.pts.forEach(([x, y], i) => { const [a, b] = view.toPx(x, y); if (i) ctx.lineTo(a, b); else ctx.moveTo(a, b); });
        ctx.closePath();
        ctx.fillStyle = op.color;
        ctx.fill('evenodd');
        break;
      }
      case 'dot': {
        const [a, b] = view.toPx(op.x, op.y);
        ctx.beginPath();
        ctx.arc(a, b, Math.max(0.5, op.size / 2), 0, Math.PI * 2);
        ctx.fillStyle = op.color;
        ctx.fill();
        break;
      }
      case 'text': {
        const [a, b] = view.toPx(op.x, op.y);
        ctx.font = cssFont(op.font);
        ctx.fillStyle = op.color;
        ctx.textAlign = op.align === 'center' ? 'center' : op.align === 'right' ? 'right' : 'left';
        ctx.textBaseline = 'bottom';
        const lines = String(op.text).split('\n');
        const lh = parseFloat(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? '11') * 1.2;
        lines.forEach((l, i) => ctx.fillText(l, a - 1, b - (lines.length - 1 - i) * lh));
        if (/underline/i.test(op.font?.[2] ?? '')) {
          const w = ctx.measureText(lines[lines.length - 1]).width;
          const x0 = ctx.textAlign === 'center' ? a - w / 2 : ctx.textAlign === 'right' ? a - w : a;
          ctx.fillRect(x0, b - 1, w, 1);
        }
        break;
      }
      case 'stamp': drawShape(ctx, op.shape, op.x, op.y, op.heading, op.fill, op.pen, op.stretch); break;
    }
  }

  /** Render the whole display list again (size or content changed). */
  function rebuild(force = false) {
    cache.width = stage.canvas.width;
    cache.height = stage.canvas.height;
    cctx.setTransform(stage.pixelScale, 0, 0, stage.pixelScale, 0, 0);
    for (const op of ops) drawOp(cctx, op);
    for (const f of fills.values()) f.snap = null;
    request(force);
  }

  function addOp(op) {
    ops.push(op);
    drawOp(cctx, op);
  }

  function snapshot() {
    const c = document.createElement('canvas');
    c.width = cache.width; c.height = cache.height;
    c.getContext('2d').drawImage(cache, 0, 0);
    return c;
  }

  /** Finish the animation in progress: its line goes into the picture. */
  function commit() {
    if (!anim) return;
    if (anim.op) addOp(anim.op);
    anim = null;
  }

  let forced = false;
  function request(force = false) {
    if (force) forced = true;
    if (!raf) raf = requestAnimationFrame(render);
  }

  function render() {
    raf = 0;
    const t = now();
    if (anim && t >= anim.t0 + anim.dur) commit();
    if (!tracing && !forced) return;
    forced = false;
    const ctx = stage.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, stage.canvas.width, stage.canvas.height);
    ctx.drawImage(cache, 0, 0);
    stage.begin();
    const f = anim ? Math.min(1, (t - anim.t0) / anim.dur) : 1;
    if (anim?.op) line(ctx, anim.op, anim.op.x0 + (anim.op.x1 - anim.op.x0) * f, anim.op.y0 + (anim.op.y1 - anim.op.y0) * f);
    for (const tu of turtles.values()) {
      if (!tu.visible) continue;
      let { x, y, heading } = tu;
      if (anim && anim.id === tu.id) {
        if (anim.kind === 'move') { x = anim.x0 + (anim.x1 - anim.x0) * f; y = anim.y0 + (anim.y1 - anim.y0) * f; }
        else heading = anim.h0 + angleDiff(anim.h0, anim.h1) * f;
      }
      drawShape(ctx, tu.shape, x, y, heading, tu.fillcolor, tu.pencolor, tu.stretch);
    }
    if (anim) raf = requestAnimationFrame(render);
  }

  /** Wait time of a step without animation (speed 0 while tracing): adds up and is paid every 16 ms. */
  function instant() {
    request();
    if (!tracing || instantMs <= 0) return 0;
    debt += instantMs;
    if (debt < 16) return 0;
    const s = debt / 1000;
    debt = 0;
    return s;
  }

  function pxDist(x0, y0, x1, y1) {
    const [a, b] = view.toPx(x0, y0), [c, d] = view.toPx(x1, y1);
    return Math.hypot(c - a, d - b);
  }

  function setWorld(box) {
    worldBox = box;
    view = makeView(stage.W, stage.H, worldBox);
    rebuild();
  }

  function clearAll() {
    anim = null;
    ops = [];
    fills.clear();
    rebuild();
  }

  const T = (id) => {
    if (!turtles.has(id)) turtles.set(id, newTurtle(id));
    return turtles.get(id);
  };

  // ---------- host.turtle ----------
  function host(kind, a = []) {
    commit();
    switch (kind) {
      case 'new': turtles.set(a[0], newTurtle(a[0], a[1], a[2], a[3])); request(); return 0;
      case 'move': {
        const [id, x0, y0, x1, y1, down, color, width, speed] = a;
        const tu = T(id);
        tu.x = x1; tu.y = y1;
        const op = down ? { t: 'line', id, x0, y0, x1, y1, color, width } : null;
        const dur = tracing ? moveSeconds(pxDist(x0, y0, x1, y1), speed) : 0;
        if (dur > 0) {
          anim = { kind: 'move', id, t0: now(), dur: dur * 1000, x0, y0, x1, y1, op };
          request();
          return dur;
        }
        if (op) addOp(op);
        return instant();
      }
      case 'turn': {
        const [id, h0, h1, speed] = a;
        const tu = T(id);
        tu.heading = h1;
        const dur = tracing && tu.visible ? turnSeconds(angleDiff(h0, h1), speed) : 0;
        if (dur > 0) {
          anim = { kind: 'turn', id, t0: now(), dur: dur * 1000, h0, h1, op: null };
          request();
          return dur;
        }
        return instant();
      }
      case 'dot': addOp({ t: 'dot', id: a[0], x: a[1], y: a[2], size: a[3], color: a[4] }); request(); return 0;
      case 'begin_fill': fills.set(a[0], { index: ops.length, snap: snapshot() }); return 0;
      case 'fill': {
        const [id, pts, color] = a;
        const f = fills.get(id) ?? { index: ops.length, snap: null };
        fills.delete(id);
        const op = { t: 'fill', id, pts, color };
        ops.splice(f.index, 0, op);
        for (const g of fills.values()) if (g.index >= f.index) { g.index++; g.snap = null; }
        if (f.snap && f.snap.width === cache.width && f.snap.height === cache.height) {
          cctx.setTransform(1, 0, 0, 1, 0, 0);
          cctx.clearRect(0, 0, cache.width, cache.height);
          cctx.drawImage(f.snap, 0, 0);
          cctx.setTransform(stage.pixelScale, 0, 0, stage.pixelScale, 0, 0);
          for (let i = f.index; i < ops.length; i++) drawOp(cctx, ops[i]);
          request();
        } else rebuild();
        return 0;
      }
      case 'write': addOp({ t: 'text', id: a[0], x: a[1], y: a[2], text: a[3], align: a[4], font: a[5], color: a[6] }); request(); return 0;
      case 'stamp': {
        const [id, x, y, heading, shape, pen, fill] = a;
        const tu = T(id);
        tu.stamps++;
        addOp({ t: 'stamp', id, sid: tu.stamps, x, y, heading, shape, pen, fill, stretch: [...tu.stretch] });
        request();
        return 0;
      }
      case 'clearstamp': ops = ops.filter((o) => !(o.t === 'stamp' && o.id === a[0] && o.sid === a[1])); rebuild(); return 0;
      case 'clearstamps': {
        const [id, n] = a;
        const mine = ops.filter((o) => o.t === 'stamp' && o.id === id);
        const gone = new Set(n === null || n === undefined ? mine : n >= 0 ? mine.slice(0, n) : mine.slice(n));
        ops = ops.filter((o) => !gone.has(o));
        rebuild();
        return 0;
      }
      case 'pen': { const tu = T(a[0]); tu.pencolor = a[1]; tu.fillcolor = a[2]; tu.pensize = a[3]; request(); return 0; }
      case 'visible': T(a[0]).visible = !!a[1]; request(); return 0;
      case 'shape': T(a[0]).shape = a[1]; request(); return 0;
      case 'shapesize': T(a[0]).stretch = [a[1] ?? 1, a[2] ?? 1, a[3] ?? 1]; request(); return 0;
      case 'speed': return 0;
      case 'clear': ops = ops.filter((o) => o.id !== a[0]); fills.delete(a[0]); rebuild(); return 0;
      case 'reset': {
        ops = ops.filter((o) => o.id !== a[0]);
        fills.delete(a[0]);
        const old = T(a[0]);
        turtles.set(a[0], { ...newTurtle(a[0], old.shape), stamps: old.stamps });
        rebuild();
        return 0;
      }
      case 'bgcolor': bg = a[0] || 'white'; request(); return 0;
      case 'title': stage.el.dataset.title = a[0]; opts.onTitle?.(String(a[0])); return 0;
      case 'setup': {
        const w = Math.max(10, Math.round(Number(a[0]) || W0)), h = Math.max(10, Math.round(Number(a[1]) || H0));
        stage.setSize(w, h);
        view = makeView(w, h, worldBox);
        rebuild();
        return 0;
      }
      case 'tracer': tracing = Number(a[0]) > 0; if (tracing) request(true); return 0;
      case 'update': request(true); return 0;
      case 'mode': if (a[0] !== 'world' && worldBox) setWorld(null); return 0;
      case 'world': setWorld([a[0], a[1], a[2], a[3]]); return 0;
      case 'clearscreen': {
        bg = 'white';
        for (const [id, tu] of turtles) turtles.set(id, { ...newTurtle(id, tu.shape), stamps: tu.stamps });
        clearAll();
        return 0;
      }
      case 'bye': opts.onBye?.(); return 0;
      default: return 0; // bgpic and future kinds: nothing to draw yet
    }
  }

  // ---------- events ----------
  function deliver() {
    if (!waiting || !queue.length) return;
    const ev = queue.shift();
    const ctx = waiting;
    waiting = null;
    const value = turtleEvent(vm, ev.kind, ...ev.args);
    if (ev.kind === 'timer' && value === null) { waiting = ctx; deliver(); return; } // timer already gone
    ctx.resume(value);
  }
  function push(kind, ...args) {
    if (!active || !loopSeen) return false;
    if (queue.length < 200) queue.push({ kind, args });
    deliver();
    return true;
  }
  const editable = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  function onKey(e) {
    if (!active || !loopSeen || editable(e.target) || e.ctrlKey || e.metaKey) return;
    const k = keysym(e.key);
    if (push(e.type === 'keydown' ? 'key' : 'keyrelease', k) && /^(Left|Right|Up|Down|space)$/.test(k)) e.preventDefault();
  }
  stage.canvas.addEventListener('pointerdown', (e) => {
    if (!active) return;
    const [lx, ly] = stage.pointer(e);
    const [x, y] = view.fromPx(Math.round(lx), Math.round(ly));
    if (push('click', new PyFloat(Math.round(x * 1e6) / 1e6), new PyFloat(Math.round(y * 1e6) / 1e6))) e.preventDefault();
  });

  function reset() {
    commit();
    ops = [];
    fills.clear();
    turtles.clear();
    bg = 'white';
    tracing = true;
    debt = 0;
    worldBox = null;
    stage.setSize(W0, H0);
    view = makeView(W0, H0);
    delete stage.el.dataset.title;
    rebuild(true);
  }

  ready = true;
  rebuild(true);

  const plugin = {
    name: 'turtle',
    stage,
    get canvas() { return stage.canvas; },
    /** Turtle coordinates → CSS pixels relative to the canvas (for tests and overlays). */
    toClient(x, y) { const [px, py] = view.toPx(x, y); return [px * stage.scale, py * stage.scale]; },
    /** State for tests: turtles and the number of drawn items. */
    get info() { return { turtles: [...turtles.values()].map((t) => ({ ...t })), ops: ops.length, bg, tracing, size: [stage.W, stage.H] }; },
    reset,
    host: { turtle: (kind, args) => host(kind, args) },
    waits: {
      'turtle-event'(wait, ctx) {
        loopSeen = true;
        request(true); // like Tk: the event loop shows what tracer(0) held back
        waiting = ctx;
        ctx.onCancel(() => { if (waiting === ctx) waiting = null; });
        const scale = runner?.options.timeScale ?? 1;
        for (const t of wait.timers ?? []) {
          if (timers.has(t.id)) continue;
          timers.set(t.id, setTimeout(() => { timers.delete(t.id); queue.push({ kind: 'timer', args: [t.id] }); deliver(); }, Math.max(0, t.ms) * scale));
        }
        deliver();
      },
      input(wait, ctx) {
        if (!wait.dialog) return false;
        const p = String(wait.prompt ?? '');
        const i = p.indexOf(': ');
        closeDialog = askDialog(stage.el, {
          title: i >= 0 ? p.slice(0, i) : '', text: (i >= 0 ? p.slice(i + 2) : p).trim(), type: wait.dialog === 'num' ? 'number' : 'text',
          lang: opts.lang, onDone: (v) => { closeDialog = null; ctx.resume(v); },
        });
        ctx.onCancel(() => closeDialog?.());
      },
    },
    start(c) {
      vm = c.vm; runner = c.runner; active = true; loopSeen = false; waiting = null;
      queue.length = 0;
      reset();
      window.addEventListener('keydown', onKey);
      window.addEventListener('keyup', onKey);
    },
    end() {
      active = false; waiting = null;
      commit();
      request(true);
      for (const h of timers.values()) clearTimeout(h);
      timers.clear();
      queue.length = 0;
      closeDialog?.();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    },
    destroy() { plugin.end(); stage.destroy(); },
  };
  return plugin;
}
