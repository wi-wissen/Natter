// A canvas that shows a logical W x H screen crisp on high-DPI displays and fits its container (keeps the aspect ratio).
// Shared by turtle and kara; pgzero can use it too.

import { fitScale } from './turtleMath.js';
import { ensureStyles } from './styles.js';

/**
 * @param {HTMLElement} container  should have a size (e.g. flex: 1 or a fixed height); with fit 'width' only the width counts
 * @param {{ width: number, height: number, fit?: 'contain'|'width', upscale?: boolean, maxScale?: number, className?: string, onResize?: () => void }} opts
 */
export function createStage(container, opts) {
  ensureStyles();
  const el = document.createElement('div');
  el.className = 'nw-stage ' + (opts.className ?? '');
  const canvas = document.createElement('canvas');
  canvas.className = 'nw-canvas';
  canvas.tabIndex = 0;
  el.appendChild(canvas);
  container.appendChild(el);
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  const stage = {
    el, canvas, ctx,
    W: opts.width, H: opts.height,
    /** CSS pixels per logical pixel */
    scale: 1,
    /** device pixels per logical pixel (scale * devicePixelRatio) */
    pixelScale: 1,
    /** Change the logical size. */
    setSize(W, H) { stage.W = W; stage.H = H; layout(); },
    /** Logical coordinates of a pointer event. */
    pointer(e) {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * stage.W, ((e.clientY - r.top) / r.height) * stage.H];
    },
    /** Reset the transform: draw in logical pixels from here on. */
    begin() { ctx.setTransform(stage.pixelScale, 0, 0, stage.pixelScale, 0, 0); return ctx; },
    layout,
    destroy() { ro?.disconnect(); el.remove(); },
  };

  function layout() {
    const fit = opts.fit ?? 'contain';
    const cs = getComputedStyle(container);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const availW = Math.max(40, container.clientWidth - padX);
    const availH = fit === 'width' ? Infinity : Math.max(40, container.clientHeight - padY);
    const s = fitScale(availW, availH, stage.W, stage.H, { upscale: opts.upscale, max: opts.maxScale });
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cssW = Math.max(1, Math.floor(stage.W * s)), cssH = Math.max(1, Math.floor(stage.H * s));
    const pw = Math.round(cssW * dpr), ph = Math.round(cssH * dpr);
    const changed = pw !== canvas.width || ph !== canvas.height;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    stage.scale = cssW / stage.W;
    stage.pixelScale = pw / stage.W;
    if (changed) { canvas.width = pw; canvas.height = ph; opts.onResize?.(); }
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => layout()) : null;
  ro?.observe(container);
  layout();
  return stage;
}
