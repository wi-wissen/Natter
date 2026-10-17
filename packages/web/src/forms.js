// guizero forms in the page: implements host.forms(op, data) of docs/FORMS-BRIDGE.md with real, accessible HTML
// elements (button, input, textarea, select, range, checkbox, radio groups, listbox, SVG for Drawing and Waffle, img,
// menu bar, fieldset). Windows are panels on a desk (draggable, stacked) or, on narrow screens, tabs that fill the width.
// Layout "auto" follows Tk pack (nested flex "cavities"), "grid" is a CSS grid whose rows and columns grow with their
// content. Page events go into a queue and reach the program through the forms-event wait; timers run on real time.

import { formsEvent } from '@natter/core';
import { ensureFormsStyles } from './formsStyles.js';
import { isDefaultBg, contrastInk, packParams, gridPlacement, tkKey, projectImage, EventQueue, TK_TEXT, TK_GRAY } from './formsLogic.js';

const TEXT = {
  de: { close: 'Schließen', ok: 'OK', cancel: 'Abbrechen', yes: 'Ja', no: 'Nein', windows: 'Fenster', info: 'Hinweis', warn: 'Warnung',
    error: 'Fehler', question: 'Frage', open: 'Datei öffnen', save: 'Datei speichern', folder: 'Ordner wählen', color: 'Farbe wählen',
    noFiles: 'Im Projekt gibt es keine passende Datei.', fileName: 'Dateiname', inFolder: 'Ordner' },
  en: { close: 'Close', ok: 'OK', cancel: 'Cancel', yes: 'Yes', no: 'No', windows: 'Windows', info: 'Info', warn: 'Warning',
    error: 'Error', question: 'Question', open: 'Open file', save: 'Save file', folder: 'Select folder', color: 'Select colour',
    noFiles: 'There is no matching file in the project.', fileName: 'File name', inFolder: 'Folder' },
};

const SVGNS = 'http://www.w3.org/2000/svg';
const WINDOW_KINDS = new Set(['app', 'window']);
let uid = 0;

/**
 * @typedef {Object} Widget
 * @property {number} id
 * @property {string} kind
 * @property {number|null} parent
 * @property {Record<string, any>} props
 * @property {HTMLElement|SVGElement} el      outer element (carries data-nwf-id; for windows the section)
 * @property {HTMLElement|null} body          where the children go (containers)
 * @property {HTMLElement} [colorEl]          element that gets bg (window: the body)
 * @property {any} [layout]                   last layout command
 * @property {Map<number, any>} [shapes]       drawing shapes by id
 */

/**
 * @param {HTMLElement} container  should have a size (the stage area); the forms fill it and scroll inside
 * @param {{
 *   lang?: 'de'|'en',
 *   windows?: 'auto'|'panels'|'tabs',     auto: tabs below 600 px width
 *   image?: (path: string, vm: any) => ({ url: string, width: number, height: number } | null),
 *   images?: Record<string, { url: string, width: number, height: number }>,
 *   onTitle?: (title: string) => void,
 * }} [opts]
 */
export function createForms(container, opts = {}) {
  ensureFormsStyles();
  const T = TEXT[opts.lang] ?? TEXT.de;
  const prefix = `nwf${++uid}-`;
  const root = document.createElement('div');
  root.className = 'nwf-root';
  root.innerHTML = `<div class="nwf-tabs" role="tablist" hidden></div><div class="nwf-desk"><div class="nwf-spacer"></div></div>`;
  container.appendChild(root);
  const tabs = /** @type {HTMLElement} */ (root.querySelector('.nwf-tabs'));
  const desk = /** @type {HTMLElement} */ (root.querySelector('.nwf-desk'));
  const spacer = /** @type {HTMLElement} */ (root.querySelector('.nwf-spacer'));
  tabs.setAttribute('aria-label', T.windows);

  /** @type {Map<number, Widget>} */
  const widgets = new Map();
  /** @type {Widget[]} windows in creation order / in stacking order (last = front) */
  let order = [], stack = [];
  /** @type {Widget|null} the window shown in tabs mode */
  let activeWin = null;
  /** @type {Map<number, { x: number, y: number }>} panel positions */
  const pos = new Map();
  const images = new Map(Object.entries(opts.images ?? {}));
  const queue = new EventQueue();
  /** @type {Map<number, any>} host timers by timer id */
  const timers = new Map();
  /** @type {Map<number, [number, number]>} last size reported (or set) per widget, for resize events */
  const sizes = new Map();
  let vm = null, runner = null, waitCtx = null, displayed = false, ended = false, dialogClose = null;
  let mode = 'panels', arrangeFrame = 0;

  // ---------- small helpers ----------
  const el = (tag, cls, attrs) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const svg = (tag, attrs) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs ?? {})) if (v !== null && v !== undefined) e.setAttribute(k, String(v));
    return e;
  };
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const windowOf = (w) => {
    while (w && !WINDOW_KINDS.has(w.kind)) w = widgets.get(w.parent);
    return w ?? null;
  };
  const shown = (w) => displayed && w.props.visible !== false && w.el.isConnected;
  const scale = () => runner?.options?.timeScale ?? 1;

  // ---------- events to the program ----------
  function push(ev) {
    if (!vm || ended) return;
    queue.push(ev);
    deliver();
  }

  function deliver() {
    const ctx = waitCtx;
    if (!ctx) return;
    while (queue.length) {
      const raw = queue.shift();
      const v = formsEvent(ctx.vm, ...raw);
      if (v === null) continue; // a timer that was cancelled in the meantime
      waitCtx = null;
      ctx.resume(v);
      return;
    }
  }

  // ---------- creating widgets ----------
  function create(data) {
    const w = /** @type {Widget} */ ({ id: data.id, kind: data.kind, parent: data.parent, props: { ...data.props }, el: null, body: null });
    widgets.set(w.id, w);
    build(w);
    apply(w, w.props);
    if (WINDOW_KINDS.has(w.kind)) refreshWindows();
    if (w.kind === 'menubar') {
      const win = widgets.get(w.parent);
      win?.menus?.appendChild(w.el);
    }
  }

  function build(w) {
    const p = w.props;
    let e, body = null;
    switch (w.kind) {
      case 'app': case 'window': return buildWindow(w);
      case 'box': e = el('div', 'nwf-w nwf-box'); body = e; break;
      case 'buttongroup': e = el('div', 'nwf-w nwf-box nwf-group', { role: 'radiogroup' }); body = e; break;
      case 'titlebox': {
        e = el('fieldset', 'nwf-w nwf-titlebox');
        const legend = el('legend');
        body = el('div', 'nwf-tbody');
        e.append(legend, body);
        break;
      }
      case 'text': e = el('div', 'nwf-w nwf-text'); break;
      case 'textbox':
        e = p.multiline ? el('textarea', 'nwf-w nwf-input', { rows: '1' }) : el('input', 'nwf-w nwf-input', { type: 'text' });
        e.setAttribute('autocomplete', 'off');
        e.setAttribute('spellcheck', 'false');
        break;
      case 'pushbutton': e = el('button', 'nwf-w nwf-btn', { type: 'button' }); break;
      case 'checkbox': case 'radiobutton': {
        e = el('label', 'nwf-w nwf-check');
        const input = el('input', '', { type: w.kind === 'checkbox' ? 'checkbox' : 'radio' });
        if (w.kind === 'radiobutton') input.name = prefix + 'g' + w.parent;
        e.append(input, el('span'));
        break;
      }
      case 'combo': e = el('select', 'nwf-w nwf-select'); break;
      case 'listbox': e = el('div', 'nwf-w nwf-list', { role: 'listbox', tabindex: '0' }); break;
      case 'slider': {
        e = el('div', 'nwf-w nwf-slider');
        e.append(el('output'), el('input', '', { type: 'range' }));
        break;
      }
      case 'picture': e = el('img', 'nwf-w nwf-picture', { alt: '', draggable: 'false' }); break;
      case 'waffle': case 'drawing': e = svg('svg', { class: 'nwf-w nwf-canvas', role: 'img' }); w.shapes = new Map(); break;
      case 'menubar': e = el('div', 'nwf-menubar', { role: 'menubar' }); break;
      default: e = el('div', 'nwf-w'); break;
    }
    e.dataset.nwfId = String(w.id);
    e.id = prefix + w.id;
    w.el = e;
    w.body = body;
  }

  function buildWindow(w) {
    const sec = el('section', 'nwf-win', { tabindex: '-1' });
    sec.hidden = true;
    sec.dataset.nwfWin = String(w.id);
    sec.innerHTML = `<header class="nwf-titlebar"><span class="nwf-title"></span><button type="button" class="nwf-close">×</button></header><div class="nwf-menus"></div><div class="nwf-body nwf-cav nwf-col"></div>`;
    const title = /** @type {HTMLElement} */ (sec.querySelector('.nwf-title'));
    title.id = prefix + 'title' + w.id;
    sec.setAttribute('aria-labelledby', title.id);
    const close = sec.querySelector('.nwf-close');
    close.setAttribute('aria-label', T.close);
    close.title = T.close;
    close.addEventListener('click', () => push(['close', w.id]));
    const body = /** @type {HTMLElement} */ (sec.querySelector('.nwf-body'));
    body.dataset.nwfId = String(w.id);
    body.id = prefix + w.id;
    w.el = sec;
    w.body = body;
    w.colorEl = body;
    w.menus = sec.querySelector('.nwf-menus');
    desk.appendChild(sec);
    order.push(w);
    stack.push(w);
    dragPanel(w, /** @type {HTMLElement} */ (sec.querySelector('.nwf-titlebar')));
    sec.addEventListener('pointerdown', () => toFront(w), true);
    winObserver?.observe(body);
  }

  // ---------- properties ----------
  function apply(w, ch) {
    const p = w.props, e = w.el;
    if ('bg' in ch || 'text_color' in ch) colors(w);
    if ('font' in ch) font(w);
    if ('width' in ch || 'height' in ch) size(w);
    if ('enabled' in ch) enabled(w);
    if ('events' in ch) events(w);
    switch (w.kind) {
      case 'app': case 'window': {
        if ('title' in ch) {
          w.el.querySelector('.nwf-title').textContent = p.title ?? '';
          if (w.kind === 'app') opts.onTitle?.(p.title ?? '');
          renderTabs();
        }
        if ('visible' in ch || 'modal' in ch || 'full_screen' in ch) {
          e.classList.toggle('nwf-full', !!p.full_screen);
          refreshWindows();
        }
        break;
      }
      case 'text': if ('text' in ch) e.textContent = String(p.text ?? ''); break;
      case 'textbox': {
        if ('multiline' in ch && (e.tagName === 'TEXTAREA') !== !!p.multiline) { replaceElement(w); return; }
        const box = /** @type {HTMLInputElement} */ (e);
        if ('value' in ch && box.value !== String(p.value ?? '')) box.value = String(p.value ?? '');
        if ('hide_text' in ch && box.tagName === 'INPUT') box.type = p.hide_text ? 'password' : 'text';
        if ('wrap' in ch || 'scrollbar' in ch) {
          box.classList.toggle('nwf-nowrap', p.wrap === 'none');
          box.classList.toggle('nwf-noscroll', p.multiline && !p.scrollbar);
        }
        break;
      }
      case 'pushbutton': {
        if ('text' in ch || 'image' in ch) {
          const img = p.image ? resolveImage(p.image) : null;
          e.replaceChildren();
          e.classList.toggle('nwf-hasimg', !!img);
          if (img) {
            const i = el('img', '', { src: img.url, alt: p.text || p.image });
            e.appendChild(i);
          } else e.textContent = String(p.text ?? '');
          size(w);
        }
        if ('padx' in ch || 'pady' in ch) {
          if (num(p.padx)) e.style.paddingInline = `${p.padx}px`;
          if (num(p.pady)) e.style.paddingBlock = `${Math.max(2, p.pady - 6)}px`;
        }
        break;
      }
      case 'checkbox': case 'radiobutton': {
        const input = /** @type {HTMLInputElement} */ (e.querySelector('input'));
        if ('text' in ch) e.querySelector('span').textContent = String(p.text ?? '');
        if (w.kind === 'checkbox' && 'value' in ch) input.checked = !!p.value;
        if (w.kind === 'radiobutton' && 'value' in ch) {
          input.value = String(p.value ?? '');
          const g = widgets.get(w.parent);
          input.checked = !!g && String(g.props.value) === String(p.value);
        }
        break;
      }
      case 'buttongroup': if ('value' in ch) syncRadios(w); break;
      case 'combo': {
        const sel = /** @type {HTMLSelectElement} */ (e);
        if ('options' in ch) {
          sel.replaceChildren(...(p.options ?? []).map((o) => { const op = el('option'); op.textContent = String(o); return op; }));
        }
        if ('options' in ch || 'value' in ch) {
          const i = (p.options ?? []).findIndex((o) => String(o) === String(p.value));
          sel.selectedIndex = i;
        }
        break;
      }
      case 'listbox': if ('items' in ch || 'selected' in ch || 'multiselect' in ch || 'scrollbar' in ch) renderList(w); break;
      case 'slider': {
        const input = /** @type {HTMLInputElement} */ (e.querySelector('input'));
        if ('start' in ch || 'end' in ch || 'step' in ch) {
          const lo = Math.min(p.start, p.end), hi = Math.max(p.start, p.end);
          input.min = String(lo);
          input.max = String(hi);
          input.step = String(p.step || 'any');
          // a slider from 100 to 0: the browser always runs min to max, so mirror it
          input.style.direction = p.start > p.end ? 'rtl' : '';
        }
        if ('horizontal' in ch) {
          e.classList.toggle('nwf-vertical', p.horizontal === false);
          size(w);
        }
        if ('value' in ch || 'start' in ch || 'end' in ch) {
          input.value = String(p.value);
          e.querySelector('output').textContent = String(p.value);
        }
        break;
      }
      case 'picture': {
        if ('image' in ch) {
          const img = resolveImage(p.image);
          if (img) e.setAttribute('src', img.url); else e.removeAttribute('src');
          e.setAttribute('alt', p.image ? String(p.image).split('/').pop() : '');
        }
        break;
      }
      case 'waffle': if (['dim', 'pad', 'pixels', 'width', 'height', 'bg'].some((k) => k in ch)) renderWaffle(w); else if ('pixel' in ch) setPixel(w, p.pixel); break;
      case 'drawing': if ('shapes' in ch) { e.replaceChildren(); w.shapes.clear(); for (const s of p.shapes ?? []) drawShape(w, s); } if ('width' in ch || 'height' in ch) sizeCanvas(w, p.width, p.height); break;
      case 'titlebox': {
        if ('text' in ch) e.querySelector('legend').textContent = String(p.text ?? '');
        if ('border' in ch) e.classList.toggle('nwf-flat', !p.border);
        break;
      }
      case 'box': if ('border' in ch || 'border_color' in ch) {
        const b = p.border === true ? 1 : Number(p.border) || 0;
        const c = !p.border_color || p.border_color.toLowerCase() === TK_GRAY ? 'var(--nwf-text-)' : p.border_color;
        e.style.border = b ? `${b}px solid ${c}` : '';
        break;
      }
      case 'menubar': if ('toplevel' in ch || 'options' in ch) renderMenu(w); break;
    }
  }

  /** A text box switched between one and several lines: new element in the same place. */
  function replaceElement(w) {
    const old = w.el;
    build(w);
    old.replaceWith(w.el);
    apply(w, w.props);
  }

  function colors(w) {
    const e = /** @type {HTMLElement} */ (w.colorEl ?? w.el), p = w.props;
    if ('bg' in p) {
      const def = isDefaultBg(w.kind, p.bg);
      e.style.background = def ? '' : p.bg;
      e.style.setProperty('--nwf-ink', def ? 'var(--nwf-text-)' : contrastInk(p.bg));
      if (w.kind === 'drawing' || w.kind === 'waffle') renderBg(w);
    }
    const tc = p.text_color;
    e.style.color = !tc || tc.toLowerCase() === TK_TEXT ? '' : tc;
  }

  function font(w) {
    const f = w.props.font, s = /** @type {HTMLElement} */ (w.el).style;
    if (!f || w.kind === 'menubar') return;
    const fam = String(f.family ?? '');
    s.fontFamily = /^(helvetica|arial|sans-serif|tkdefaultfont|segoe ui|)$/i.test(fam) ? '' : /^(courier|courier new|monospace|tkfixedfont)$/i.test(fam) ? 'var(--nwf-mono-)'
      : /^(times|times new roman|serif)$/i.test(fam) ? '"Times New Roman", Times, serif' : `"${fam.replace(/"/g, '')}", var(--nwf-font-)`;
    s.fontSize = f.size < 0 ? `${-f.size}px` : `calc(${f.size || 10} * var(--nwf-pt-))`;
    s.fontWeight = f.bold ? '700' : '';
    s.fontStyle = f.italic ? 'italic' : '';
    s.textDecoration = [f.underline && 'underline', f.overstrike && 'line-through'].filter(Boolean).join(' ');
  }

  function size(w) {
    const p = w.props, e = /** @type {HTMLElement} */ (w.el), s = e.style;
    const W = p.width, H = p.height;
    switch (w.kind) {
      case 'app': case 'window': {
        if (num(W)) w.body.style.setProperty('--nwf-ww', `${W}px`);
        if (num(H)) w.body.style.setProperty('--nwf-wh', `${H}px`);
        if (num(W) && num(H)) sizes.set(w.id, [W, H]);
        scheduleArrange();
        return;
      }
      case 'text': case 'checkbox': case 'radiobutton':
        s.width = num(W) ? `calc(${W}ch + 4px)` : '';
        s.height = num(H) ? `calc(${H} * 1.25em + 2px)` : '';
        s.justifyContent = num(W) ? 'center' : '';
        if (w.kind === 'text') s.textAlign = 'center';
        return;
      case 'textbox':
        s.width = num(W) ? `${W}ch` : '';
        s.height = num(H) && p.multiline ? `calc(${H} * 1.25em)` : '';
        return;
      case 'pushbutton':
        if (p.image) { s.width = num(W) ? `${W}px` : ''; s.height = num(H) ? `${H}px` : ''; } else {
          s.width = num(W) ? `${W}ch` : '';
          s.height = num(H) ? `calc(${H} * 1.25em)` : '';
        }
        return;
      case 'combo': s.width = num(W) ? `calc(${W}ch + 32px)` : ''; return;
      case 'listbox': case 'box': case 'titlebox': case 'buttongroup':
        s.width = num(W) ? `${W}px` : w.kind === 'listbox' && W !== 'fill' ? '20ch' : '';
        s.height = num(H) ? `${H}px` : w.kind === 'listbox' && H !== 'fill' ? 'calc(10 * 1.3em + 6px)' : '';
        e.classList.toggle('nwf-fixed', num(W) || num(H));
        return;
      case 'slider': {
        const input = /** @type {HTMLElement} */ (e.querySelector('input'));
        const vertical = p.horizontal === false;
        input.style.width = !vertical && num(W) ? `${W}px` : !vertical && W === 'fill' ? '100%' : '';
        input.style.height = vertical && num(H) ? `${H}px` : '';
        return;
      }
      case 'picture':
        s.width = num(W) ? `${W}px` : '';
        s.height = num(W) && num(H) ? 'auto' : num(H) ? `${H}px` : '';
        s.aspectRatio = num(W) && num(H) ? `${W} / ${H}` : '';
        return;
      case 'drawing': sizeCanvas(w, W, H); return;
      case 'waffle': renderWaffle(w); return;
    }
  }

  function enabled(w) {
    const off = w.props.enabled === false;
    w.el.classList.toggle('nwf-off', off);
    for (const c of w.el.matches('input, button, select, textarea') ? [w.el] : w.el.querySelectorAll(':scope > input, :scope > button')) {
      if (!c.classList.contains('nwf-close')) c.disabled = off;
    }
    if (w.kind === 'listbox') w.el.setAttribute('aria-disabled', String(off));
  }

  /** What the widget listens for: drag and motion need touch-action none, configure needs a size observer. */
  function events(w) {
    const ev = w.props.events ?? [];
    if (!WINDOW_KINDS.has(w.kind)) {
      const drag = ev.includes('drag1') || ev.includes('motion');
      w.el.style.touchAction = drag ? 'none' : '';
      if (ev.includes('configure')) widgetObserver?.observe(w.el); else widgetObserver?.unobserve(w.el);
    }
  }

  function syncRadios(group) {
    for (const r of widgets.values()) {
      if (r.kind === 'radiobutton' && r.parent === group.id) r.el.querySelector('input').checked = String(r.props.value) === String(group.props.value);
    }
  }

  // ---------- list box ----------
  function renderList(w) {
    const p = w.props, e = w.el;
    const sel = new Set(p.selected ?? []);
    e.setAttribute('aria-multiselectable', String(!!p.multiselect));
    e.classList.toggle('nwf-noscroll', p.scrollbar === false);
    const items = p.items ?? [];
    const opts2 = [...e.children];
    while (opts2.length > items.length) opts2.pop().remove();
    items.forEach((text, i) => {
      let o = opts2[i];
      if (!o) { o = el('div', '', { role: 'option' }); o.id = `${prefix}${w.id}-o${i}`; e.appendChild(o); }
      o.textContent = String(text);
      o.dataset.index = String(i);
      o.setAttribute('aria-selected', String(sel.has(i)));
    });
    const cur = w.cursor ?? [...sel][0] ?? -1;
    [...e.children].forEach((o, i) => o.classList.toggle('nwf-cursor', i === cur && document.activeElement === e));
    if (cur >= 0 && e.children[cur]) e.setAttribute('aria-activedescendant', e.children[cur].id); else e.removeAttribute('aria-activedescendant');
  }

  function listChoose(w, i, toggle) {
    const p = w.props;
    if (p.enabled === false || i < 0 || i >= (p.items ?? []).length) return;
    let sel;
    if (p.multiselect && toggle) {
      const s = new Set(p.selected ?? []);
      if (s.has(i)) s.delete(i); else s.add(i);
      sel = [...s].sort((a, b) => a - b);
    } else sel = [i];
    w.cursor = i;
    p.selected = sel;
    renderList(w);
    w.el.children[i]?.scrollIntoView({ block: 'nearest' });
    push(['change', w.id, sel]);
  }

  // ---------- slider, waffle, drawing ----------
  function sizeCanvas(w, W, H) {
    const e = /** @type {SVGSVGElement} */ (w.el);
    if (num(W) && num(H)) {
      e.setAttribute('viewBox', `0 0 ${W} ${H}`);
      e.style.width = `${W}px`;
      e.style.height = 'auto';
      e.style.aspectRatio = `${W} / ${H}`;
    } else {
      e.removeAttribute('viewBox');
      e.style.aspectRatio = '';
      e.style.width = num(W) ? `${W}px` : W === 'fill' ? '100%' : '100px';
      e.style.height = num(H) ? `${H}px` : H === 'fill' ? '100%' : '100px';
    }
    w.logical = num(W) && num(H) ? [W, H] : null;
    renderBg(w);
  }

  function renderBg(w) {
    const e = w.el;
    let r = e.querySelector(':scope > rect.nwf-bg');
    if (!r) { r = svg('rect', { class: 'nwf-bg', width: '100%', height: '100%' }); e.prepend(r); }
    const bg = w.props.bg;
    r.setAttribute('fill', isDefaultBg(w.kind, bg) ? 'transparent' : bg);
  }

  function renderWaffle(w) {
    const p = w.props, e = w.el;
    const dim = p.dim ?? 20, pad = p.pad ?? 5, cols = p.width ?? 0, rows = p.height ?? 0;
    sizeCanvas(w, cols * (dim + pad) + pad, rows * (dim + pad) + pad);
    e.querySelectorAll('.nwf-px').forEach((n) => n.remove());
    w.cells = [];
    for (let y = 0; y < rows; y++) {
      const row = [];
      for (let x = 0; x < cols; x++) {
        const [color, dotty] = p.pixels?.[y]?.[x] ?? ['#ffffff', false];
        const n = makeCell(pad + x * (dim + pad), pad + y * (dim + pad), dim, color, dotty);
        e.appendChild(n);
        row.push(n);
      }
      w.cells.push(row);
    }
  }

  function makeCell(x, y, dim, color, dotty) {
    return dotty
      ? svg('ellipse', { class: 'nwf-px', cx: x + dim / 2, cy: y + dim / 2, rx: dim / 2, ry: dim / 2, fill: color, stroke: '#000000', 'stroke-width': 1 })
      : svg('rect', { class: 'nwf-px', x: x + 0.5, y: y + 0.5, width: dim, height: dim, fill: color, stroke: '#000000', 'stroke-width': 1 });
  }

  function setPixel(w, px) {
    if (!Array.isArray(px)) return;
    const [x, y, color, dotty] = px;
    const p = w.props;
    if (p.pixels?.[y]?.[x]) p.pixels[y][x] = [color, dotty];
    const old = w.cells?.[y]?.[x];
    if (!old) return;
    const dim = p.dim ?? 20, pad = p.pad ?? 5;
    const n = makeCell(pad + x * (dim + pad), pad + y * (dim + pad), dim, color, dotty);
    old.replaceWith(n);
    w.cells[y][x] = n;
  }

  function drawShape(w, s) {
    const e = w.el;
    const c = s.coords ?? [];
    const fill = s.color ?? 'none';
    const outline = (n) => (s.outline ? { stroke: s.outline_color ?? '#000000', 'stroke-width': s.outline } : {});
    let n;
    switch (s.type) {
      case 'line': n = svg('line', { x1: c[0], y1: c[1], x2: c[2], y2: c[3], stroke: s.color ?? 'none', 'stroke-width': s.width ?? 1 }); break;
      case 'oval': n = svg('ellipse', { cx: (c[0] + c[2]) / 2, cy: (c[1] + c[3]) / 2, rx: Math.abs(c[2] - c[0]) / 2, ry: Math.abs(c[3] - c[1]) / 2, fill, ...outline() }); break;
      case 'rectangle': n = svg('rect', { x: Math.min(c[0], c[2]), y: Math.min(c[1], c[3]), width: Math.abs(c[2] - c[0]), height: Math.abs(c[3] - c[1]), fill, ...outline() }); break;
      case 'polygon': {
        const pts = [];
        for (let i = 0; i + 1 < c.length; i += 2) pts.push(`${c[i]},${c[i + 1]}`);
        n = svg('polygon', { points: pts.join(' '), fill, ...outline() });
        break;
      }
      case 'text': {
        const f = s.font ?? {};
        n = svg('foreignObject', { x: c[0], y: c[1], width: s.max_width ?? 4000, height: 4000 });
        n.style.overflow = 'visible';
        n.style.pointerEvents = 'none';
        const d = document.createElement('div');
        d.textContent = s.text ?? '';
        Object.assign(d.style, {
          display: 'inline-block', whiteSpace: s.max_width ? 'pre-wrap' : 'pre', lineHeight: '1.2', color: s.color ?? 'transparent',
          font: `${f.italic ? 'italic ' : ''}${f.bold ? '700 ' : ''}${f.size < 0 ? -f.size : Math.round((f.size || 10) * 4 / 3)}px ${/^helvetica$/i.test(f.family ?? '') ? 'var(--nwf-font-)' : `"${f.family}", var(--nwf-font-)`}`,
          textDecoration: [f.underline && 'underline', f.overstrike && 'line-through'].filter(Boolean).join(' '),
        });
        if (s.max_width) d.style.maxWidth = `${s.max_width}px`;
        n.appendChild(d);
        break;
      }
      case 'image': {
        const img = resolveImage(s.image);
        n = svg('image', { x: c[0], y: c[1], width: s.width, height: s.height, preserveAspectRatio: 'none' });
        if (img) n.setAttribute('href', img.url);
        break;
      }
      default: return;
    }
    n.dataset.shape = String(s.id);
    e.appendChild(n);
    w.shapes.set(s.id, n);
  }

  // ---------- menu bar ----------
  function renderMenu(w) {
    const p = w.props, e = w.el;
    e.replaceChildren();
    (p.toplevel ?? []).forEach((name, i) => {
      const wrap = el('div');
      const top = el('button', '', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
      top.textContent = String(name);
      const list = el('div', 'nwf-menu', { role: 'menu' });
      list.hidden = true;
      (p.options?.[i] ?? []).forEach((label, j) => {
        const item = el('button', '', { type: 'button', role: 'menuitem' });
        item.textContent = String(label);
        item.addEventListener('click', () => { closeMenus(); push(['menu', w.id, i, j]); });
        list.appendChild(item);
      });
      top.addEventListener('click', () => {
        const open = list.hidden;
        closeMenus();
        if (open) { list.hidden = false; top.setAttribute('aria-expanded', 'true'); list.querySelector('button')?.focus(); }
      });
      list.addEventListener('keydown', (ev) => {
        const items = [...list.querySelectorAll('button')];
        const k = items.indexOf(/** @type {any} */ (document.activeElement));
        if (ev.key === 'ArrowDown') { items[(k + 1) % items.length]?.focus(); ev.preventDefault(); }
        if (ev.key === 'ArrowUp') { items[(k - 1 + items.length) % items.length]?.focus(); ev.preventDefault(); }
        if (ev.key === 'Escape') { closeMenus(); top.focus(); }
        ev.stopPropagation();
      });
      wrap.append(top, list);
      e.appendChild(wrap);
    });
  }

  function closeMenus() {
    for (const m of root.querySelectorAll('.nwf-menu:not([hidden])')) {
      m.hidden = true;
      m.previousElementSibling?.setAttribute('aria-expanded', 'false');
    }
  }

  // ---------- layout ----------
  function layout(data) {
    const w = widgets.get(data.id);
    if (!w || !w.body) return;
    w.layout = data;
    const body = w.body;
    const focused = /** @type {HTMLElement|null} */ (root.contains(document.activeElement) ? document.activeElement : null);
    const items = data.children.map((c) => [c, widgets.get(c.id)]).filter(([, cw]) => cw && cw.el);
    for (const [, cw] of items) cw.el.remove();
    body.replaceChildren();
    if (data.layout === 'grid') {
      body.classList.remove('nwf-cav', 'nwf-col', 'nwf-row');
      body.classList.add('nwf-grid');
      for (const [c, cw] of items) {
        resetPlacement(cw.el);
        Object.assign(cw.el.style, gridPlacement(c, cw.props));
        body.appendChild(cw.el);
      }
    } else {
      body.classList.remove('nwf-grid');
      body.classList.add('nwf-cav', 'nwf-col');
      const params = items.map(([c, cw]) => packParams(c, cw.props));
      let cav = body;
      items.forEach(([, cw], i) => {
        const p = params[i];
        cav.classList.toggle('nwf-row', p.horizontal);
        cav.classList.toggle('nwf-col', !p.horizontal);
        const e = cw.el;
        resetPlacement(e);
        e.style.flexGrow = p.expand ? '1' : '0';
        e.style.flexShrink = p.expand ? '1' : '0';
        e.style.alignSelf = (p.horizontal ? p.fillY : p.fillX) ? 'stretch' : 'center';
        if (p.expand) { e.style.minWidth = '0'; e.style.minHeight = '0'; }
        const next = el('div', 'nwf-cav nwf-col');
        const later = params.slice(i + 1).filter((q) => q.expand && q.horizontal === p.horizontal).length;
        next.style.flexGrow = p.expand ? String(later) : '1';
        if (p.side === 'top' || p.side === 'left') cav.append(e, next); else cav.append(next, e);
        cav = next;
      });
    }
    // accessible names: a text right before an input names it
    items.forEach(([, cw], i) => {
      const prev = items[i - 1]?.[1];
      const target = cw.kind === 'slider' ? cw.el.querySelector('input') : cw.el;
      if (['textbox', 'combo', 'listbox', 'slider'].includes(cw.kind)) {
        if (prev?.kind === 'text') target.setAttribute('aria-labelledby', prev.el.id); else target.removeAttribute('aria-labelledby');
      }
    });
    if (focused && root.contains(focused) && document.activeElement !== focused) focused.focus({ preventScroll: true });
    scheduleArrange();
  }

  function resetPlacement(e) {
    const s = e.style;
    s.flexGrow = s.flexShrink = s.alignSelf = s.minWidth = s.minHeight = '';
    s.gridColumn = s.gridRow = s.justifySelf = '';
  }

  // ---------- windows ----------
  function computeMode() {
    if (opts.windows === 'panels' || opts.windows === 'tabs') return opts.windows;
    return root.clientWidth && root.clientWidth < 600 ? 'tabs' : 'panels';
  }

  function refreshWindows() {
    mode = computeMode();
    root.classList.toggle('nwf-tabsmode', mode === 'tabs');
    // a window that has just appeared comes to the front
    for (const w of order) {
      const s = shown(w);
      if (s && !w.wasShown) { stack = [...stack.filter((o) => o !== w), w]; if (mode === 'tabs') activeWin = w; }
      w.wasShown = s;
    }
    const vis = stack.filter(shown);
    if (mode === 'tabs' && (!activeWin || !vis.includes(activeWin))) activeWin = vis.at(-1) ?? null;
    const modal = vis.filter((w) => w.props.modal).at(-1);
    for (const w of order) {
      const s = shown(w);
      w.el.hidden = !s || (mode === 'tabs' && w !== activeWin);
      w.el.style.zIndex = String(1 + stack.indexOf(w));
      w.el.inert = !!modal && w !== modal;
      w.el.classList.toggle('nwf-front', mode === 'panels' && vis.length > 1 && w === vis.at(-1));
      if (s && mode === 'panels' && !pos.has(w.id)) place(w);
    }
    renderTabs();
    scheduleArrange();
  }

  function renderTabs() {
    const vis = order.filter(shown);
    tabs.hidden = mode !== 'tabs' || vis.length < 2;
    if (tabs.hidden) { tabs.replaceChildren(); return; }
    tabs.replaceChildren(...vis.map((w) => {
      const b = el('button', '', { type: 'button', role: 'tab', 'aria-selected': String(w === activeWin) });
      b.textContent = w.props.title || (w.kind === 'app' ? 'App' : T.windows);
      b.addEventListener('click', () => { activeWin = w; toFront(w); refreshWindows(); });
      return b;
    }));
  }

  /** First position of a panel: the app centred at the top, further windows cascade from the one in front. */
  function place(w) {
    w.el.hidden = false;
    const width = w.el.offsetWidth;
    const others = stack.filter((o) => o !== w && pos.has(o.id) && shown(o));
    let x, y;
    if (!others.length) { x = Math.max(8, Math.round((desk.clientWidth - width) / 2)); y = 8; } else {
      // next to the window in front when there is room, else cascading below it
      const lastW = others.at(-1), last = pos.get(lastW.id);
      if (last.x + lastW.el.offsetWidth + 16 + width <= desk.clientWidth - 8) { x = last.x + lastW.el.offsetWidth + 16; y = last.y; } else {
        x = last.x + 40; y = last.y + 40;
        if (x + width > desk.clientWidth - 8) x = Math.max(8, desk.clientWidth - width - 8);
      }
    }
    pos.set(w.id, { x, y });
  }

  function toFront(w) {
    if (stack.at(-1) === w) return;
    stack = [...stack.filter((o) => o !== w), w];
    for (const o of stack) o.el.style.zIndex = String(1 + stack.indexOf(o));
    const vis = stack.filter(shown);
    for (const o of order) o.el.classList.toggle('nwf-front', mode === 'panels' && vis.length > 1 && o === vis.at(-1));
  }

  function scheduleArrange() {
    if (arrangeFrame) return;
    arrangeFrame = requestAnimationFrame(() => { arrangeFrame = 0; arrange(); });
  }

  /** Put the panels at their places and let the desk scroll to the furthest one. */
  function arrange() {
    let maxX = 0, maxY = 0;
    for (const w of order) {
      if (w.el.hidden) continue;
      if (mode === 'panels' && !w.props.full_screen) {
        const p = pos.get(w.id) ?? { x: 8, y: 8 };
        w.el.style.left = p.x + 'px';
        w.el.style.top = p.y + 'px';
        maxX = Math.max(maxX, p.x + w.el.offsetWidth + 8);
        maxY = Math.max(maxY, p.y + w.el.offsetHeight + 8);
      } else { w.el.style.left = ''; w.el.style.top = ''; }
    }
    spacer.style.left = Math.max(0, maxX - 1) + 'px';
    spacer.style.top = Math.max(0, maxY - 1) + 'px';
  }

  function dragPanel(w, bar) {
    let start = null;
    bar.addEventListener('pointerdown', (e) => {
      if (mode !== 'panels' || w.props.full_screen || e.button !== 0 || /** @type {HTMLElement} */ (e.target).closest('.nwf-close')) return;
      const p = pos.get(w.id) ?? { x: 0, y: 0 };
      start = { x: p.x, y: p.y, cx: e.clientX, cy: e.clientY };
      bar.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    bar.addEventListener('pointermove', (e) => {
      if (!start) return;
      const x = Math.max(0, Math.round(start.x + e.clientX - start.cx));
      const y = Math.max(0, Math.round(start.y + e.clientY - start.cy));
      pos.set(w.id, { x, y });
      w.el.style.left = x + 'px';
      w.el.style.top = y + 'px';
    });
    const stop = () => { if (start) { start = null; scheduleArrange(); } };
    bar.addEventListener('pointerup', stop);
    bar.addEventListener('pointercancel', stop);
  }

  // ---------- destroy ----------
  function destroy(id) {
    const w = widgets.get(id);
    if (!w) return;
    const gone = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const o of widgets.values()) if (!gone.has(o.id) && gone.has(o.parent)) { gone.add(o.id); grew = true; }
    }
    for (const g of gone) {
      const o = widgets.get(g);
      o.el.remove();
      widgetObserver?.unobserve(o.el);
      if (o.body) winObserver?.unobserve(o.body);
      widgets.delete(g);
      sizes.delete(g);
      pos.delete(g);
    }
    order = order.filter((o) => !gone.has(o.id));
    stack = stack.filter((o) => !gone.has(o.id));
    if (w.kind === 'app') clearTimers();
    refreshWindows();
  }

  function clearTimers() {
    for (const h of timers.values()) clearTimeout(h);
    timers.clear();
  }

  // ---------- images ----------
  function resolveImage(path) {
    if (!path) return null;
    const own = opts.image?.(path, vm);
    if (own) return own;
    const key = String(path).replace(/^\.\//, '');
    if (images.has(key)) return images.get(key);
    const text = vm?.fs?.files?.get?.(key) ?? vm?.opts?.files?.[key];
    const img = projectImage(text);
    if (img) images.set(key, img);
    return img;
  }

  // ---------- host.forms ----------
  function command(op, d) {
    switch (op) {
      case 'create': create(d); break;
      case 'set': {
        const w = widgets.get(d.id);
        if (!w) break;
        Object.assign(w.props, d.props);
        apply(w, d.props);
        break;
      }
      case 'layout': layout(d); break;
      case 'destroy': destroy(d.id); break;
      case 'display': displayed = true; refreshWindows(); break;
      case 'after': {
        const ms = Math.max(0, Number(d.ms) || 0) * scale();
        const h = setTimeout(() => { timers.delete(d.timer); push(['timer', d.timer]); }, ms);
        timers.set(d.timer, h);
        break;
      }
      case 'cancel': clearTimeout(timers.get(d.timer)); timers.delete(d.timer); break;
      case 'draw': { const w = widgets.get(d.id); if (w?.shapes) { w.props.shapes = [...(w.props.shapes ?? []), d.shape]; drawShape(w, d.shape); } break; }
      case 'undraw': {
        const w = widgets.get(d.id);
        if (!w?.shapes) break;
        w.shapes.get(d.shape)?.remove();
        w.shapes.delete(d.shape);
        w.props.shapes = (w.props.shapes ?? []).filter((s) => s.id !== d.shape);
        break;
      }
      case 'clear': {
        const w = widgets.get(d.id);
        if (!w?.shapes) break;
        for (const n of w.shapes.values()) n.remove();
        w.shapes.clear();
        w.props.shapes = [];
        break;
      }
      case 'focus': {
        const w = widgets.get(d.id);
        if (!w) break;
        const win = windowOf(w);
        if (win && mode === 'tabs' && win !== activeWin && shown(win)) { activeWin = win; refreshWindows(); }
        const target = WINDOW_KINDS.has(w.kind) ? w.el : w.el.matches('input, button, select, textarea, [tabindex]') ? w.el : w.el.querySelector('input, button, select, textarea');
        /** @type {HTMLElement} */ (target)?.focus({ preventScroll: false });
        break;
      }
      case 'image': {
        const img = resolveImage(d.path);
        return img ? { width: img.width, height: img.height } : null;
      }
    }
    return undefined;
  }

  // ---------- page events ----------
  const widgetAt = (target) => {
    const t = /** @type {Element|null} */ (target)?.closest?.('[data-nwf-id]');
    return t && root.contains(t) ? widgets.get(Number(t.getAttribute('data-nwf-id'))) ?? null : null;
  };
  const wants = (w, type) => (w.props.events ?? []).includes(type) || (windowOf(w)?.props.events ?? []).includes(type);
  /** Box whose top left corner is x = y = 0 for a widget (the body of a window). */
  const coordBox = (w) => (WINDOW_KINDS.has(w.kind) ? w.body : w.el);
  function rel(w, e) {
    const r = coordBox(w).getBoundingClientRect();
    const k = w.logical && r.width ? w.logical[0] / r.width : 1;
    return [Math.round((e.clientX - r.left) * k), Math.round((e.clientY - r.top) * k)];
  }
  const mouse = (w, type, e) => push(['mouse', w.id, type, ...rel(w, e), Math.round(e.screenX), Math.round(e.screenY)]);

  let pressed = null, hover = null, lastPress = null;
  root.addEventListener('pointerdown', (e) => {
    if (!/** @type {Element} */ (e.target).closest('.nwf-menubar')) closeMenus();
    const w = widgetAt(e.target);
    if (!w || (e.button !== 0 && e.button !== 2)) return;
    let type = e.button === 2 ? 'press3' : 'press1';
    const t = performance.now();
    if (type === 'press1' && lastPress && lastPress.id === w.id && t - lastPress.t < 450 && Math.abs(e.clientX - lastPress.x) < 8 && Math.abs(e.clientY - lastPress.y) < 8) {
      type = 'double1';
      lastPress = null;
    } else if (type === 'press1') lastPress = { id: w.id, t, x: e.clientX, y: e.clientY };
    pressed = { w, button: e.button };
    mouse(w, type, e);
  });
  root.addEventListener('pointerup', (e) => {
    if (!pressed) return;
    const { w, button } = pressed;
    pressed = null;
    if (widgets.has(w.id)) mouse(w, button === 2 ? 'release3' : 'release1', e);
  });
  root.addEventListener('pointercancel', () => { pressed = null; });
  root.addEventListener('pointermove', (e) => {
    const w = widgetAt(e.target);
    if (w !== hover) {
      if (hover && widgets.has(hover.id) && wants(hover, 'leave')) mouse(hover, 'leave', e);
      if (w && wants(w, 'enter')) mouse(w, 'enter', e);
      hover = w;
    }
    if (pressed && pressed.button === 0 && widgets.has(pressed.w.id)) {
      if (wants(pressed.w, 'drag1')) mouse(pressed.w, 'drag1', e);
      else if (wants(pressed.w, 'motion')) mouse(pressed.w, 'motion', e);
    } else if (w && wants(w, 'motion')) mouse(w, 'motion', e);
  });
  root.addEventListener('pointerleave', (e) => {
    if (hover && widgets.has(hover.id) && wants(hover, 'leave')) mouse(hover, 'leave', e);
    hover = null;
  });
  root.addEventListener('contextmenu', (e) => {
    const w = widgetAt(e.target);
    if (w && wants(w, 'press3')) e.preventDefault();
  });

  root.addEventListener('click', (e) => {
    const t = /** @type {Element} */ (e.target);
    const w = widgetAt(t);
    if (!w || w.props.enabled === false) return;
    if (w.kind === 'pushbutton') push(['command', w.id]);
    if (w.kind === 'listbox') {
      const o = t.closest('[role="option"]');
      if (o) listChoose(w, Number(o.getAttribute('data-index')), true);
    }
  });
  root.addEventListener('input', (e) => {
    const w = widgetAt(e.target);
    if (!w) return;
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (w.kind === 'textbox') { w.props.value = t.value; push(['change', w.id, t.value]); }
    if (w.kind === 'slider') {
      const v = Number(t.value);
      w.el.querySelector('output').textContent = String(v);
      push(['change', w.id, v]);
    }
  });
  root.addEventListener('change', (e) => {
    const w = widgetAt(e.target);
    if (!w) return;
    const t = /** @type {any} */ (e.target);
    if (w.kind === 'combo') push(['change', w.id, t.selectedIndex]);
    if (w.kind === 'checkbox') push(['command', w.id]);
    if (w.kind === 'radiobutton' && t.checked) push(['command', w.id]);
  });

  function keyTarget() {
    const a = document.activeElement;
    if (!a || !root.contains(a)) return null;
    const w = widgetAt(a);
    if (w) return w;
    const sec = a.closest('[data-nwf-win]');
    return sec ? widgets.get(Number(sec.getAttribute('data-nwf-win'))) ?? null : null;
  }
  root.addEventListener('keydown', (e) => {
    if (dialogClose) return;
    const w = keyTarget();
    if (!w) return;
    if (w.kind === 'listbox' && w.props.enabled !== false) {
      const n = (w.props.items ?? []).length;
      const cur = w.cursor ?? (w.props.selected ?? [])[0] ?? -1;
      const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      if (step && n) {
        e.preventDefault();
        const i = Math.max(0, Math.min(n - 1, cur + step));
        if (w.props.multiselect) { w.cursor = i; renderList(w); w.el.children[i]?.scrollIntoView({ block: 'nearest' }); } else listChoose(w, i, false);
      } else if ((e.key === ' ' || e.key === 'Enter') && w.props.multiselect && cur >= 0) { e.preventDefault(); listChoose(w, cur, true); }
    }
    const { char, keysym } = tkKey(e.key);
    push(['key', w.id, 'press', char, keysym, e.keyCode || 0]);
  });
  root.addEventListener('keyup', (e) => {
    if (dialogClose) return;
    const w = keyTarget();
    if (!w) return;
    const { char, keysym } = tkKey(e.key);
    push(['key', w.id, 'release', char, keysym, e.keyCode || 0]);
  });
  root.addEventListener('focusin', (e) => {
    const w = widgetAt(e.target);
    if (w?.kind === 'listbox') renderList(w);
    const sec = /** @type {Element} */ (e.target).closest?.('[data-nwf-win]');
    if (sec) { const win = widgets.get(Number(sec.getAttribute('data-nwf-win'))); if (win) toFront(win); }
  });
  root.addEventListener('focusout', (e) => {
    const w = widgetAt(e.target);
    if (w?.kind === 'listbox') requestAnimationFrame(() => widgets.has(w.id) && renderList(w));
  });

  // sizes: windows always report a new size, widgets only with a configure binding
  const report = (entries) => {
    for (const en of entries) {
      const t = /** @type {HTMLElement} */ (en.target);
      const w = widgets.get(Number(t.getAttribute('data-nwf-id')));
      if (!w || !t.offsetParent) continue;
      const W = Math.round(t.clientWidth), H = Math.round(t.clientHeight);
      if (!W || !H) continue;
      const last = sizes.get(w.id);
      if (last && last[0] === W && last[1] === H) continue;
      sizes.set(w.id, [W, H]);
      if (displayed) push(['resize', w.id, W, H]);
    }
  };
  const winObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(report) : null;
  const widgetObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(report) : null;
  const rootObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (computeMode() !== mode) refreshWindows(); else scheduleArrange(); }) : null;
  rootObserver?.observe(root);

  // ---------- dialogs ----------
  function projectFiles() {
    const fs = vm?.fs?.files;
    const names = fs ? [...fs.keys()] : Object.keys(vm?.opts?.files ?? {});
    return names.sort();
  }

  function globMatch(name, filetypes) {
    const pats = (filetypes ?? []).map((f) => String(f?.[1] ?? '*')).flatMap((p) => p.split(/\s+/));
    if (!pats.length || pats.some((p) => p === '*' || p === '*.*')) return true;
    return pats.some((p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i').test(name.split('/').pop()));
  }

  /** Modal dialog over the forms; answers with done(value). Returns nothing; dialogClose closes it without an answer. */
  function openDialog(wait, done) {
    dialogClose?.();
    closeMenus();
    const k = wait.dialog;
    const ov = el('div', 'nwf-overlay');
    const form = el('form', 'nwf-dialog', { role: ['info', 'warn', 'error', 'yesno'].includes(k) ? 'alertdialog' : 'dialog', 'aria-modal': 'true' });
    const head = el('div', 'nwf-dialog-head');
    const icon = { info: 'i', warn: '!', error: '×', yesno: '?', question: '?' }[k];
    if (icon) head.appendChild(Object.assign(el('div', `nwf-dialog-icon nwf-${k}`, { 'aria-hidden': 'true' }), { textContent: icon }));
    const texts = el('div');
    const title = el('div', 'nwf-dialog-title');
    title.id = prefix + 'dlg-title';
    const fallback = { info: T.info, warn: T.warn, error: T.error, yesno: T.question, question: T.question, open_file: T.open, save_file: T.save, folder: T.folder, color: T.color }[k];
    title.textContent = wait.title || fallback || '';
    form.setAttribute('aria-labelledby', title.id);
    texts.appendChild(title);
    const isFile = k === 'open_file' || k === 'save_file' || k === 'folder';
    if (wait.text && !isFile && k !== 'color') {
      const tx = el('div', 'nwf-dialog-text');
      tx.id = prefix + 'dlg-text';
      tx.textContent = wait.text;
      form.setAttribute('aria-describedby', tx.id);
      texts.appendChild(tx);
    }
    head.appendChild(texts);
    form.appendChild(head);

    let value = () => null;
    const cancelValue = k === 'yesno' ? false : null;
    let first = null;
    if (k === 'question') {
      const input = el('input', '', { type: 'text', 'aria-labelledby': title.id + (wait.text ? ' ' + prefix + 'dlg-text' : '') });
      input.value = wait.initial == null ? '' : String(wait.initial);
      form.appendChild(input);
      value = () => input.value;
      first = input;
    } else if (k === 'color') {
      const input = el('input', '', { type: 'color', 'aria-label': T.color });
      input.value = /^#[0-9a-f]{6}$/i.test(wait.initial ?? '') ? wait.initial : '#000000';
      form.appendChild(input);
      value = () => input.value.toLowerCase();
      first = input;
    } else if (isFile) {
      const folder = String(wait.text ?? '.').replace(/^\.\/?/, '').replace(/\/$/, '');
      const join = (n) => (folder && !n.startsWith(folder + '/') ? folder + '/' + n : n);
      if (folder) form.appendChild(Object.assign(el('div', 'nwf-hint'), { textContent: `${T.inFolder}: ${folder}` }));
      const inFolder = projectFiles().filter((f) => !folder || f.startsWith(folder + '/'));
      if (k === 'folder') {
        const dirs = [...new Set(inFolder.map((f) => f.split('/').slice(0, -1).join('/')).filter(Boolean))];
        const input = el('input', '', { type: 'text', 'aria-label': T.folder, list: prefix + 'dirs' });
        input.value = folder;
        const dl = el('datalist');
        dl.id = prefix + 'dirs';
        for (const d of dirs) dl.appendChild(Object.assign(el('option'), { value: d }));
        form.append(input, dl);
        value = () => input.value.trim() || '.';
        first = input;
      } else {
        const files = inFolder.filter((f) => globMatch(f, wait.initial?.filetypes));
        if (k === 'open_file') {
          if (files.length) {
            const sel = el('select', '', { size: String(Math.min(8, Math.max(3, files.length))), 'aria-label': T.open });
            for (const f of files) sel.appendChild(Object.assign(el('option'), { value: f, textContent: folder ? f.slice(folder.length + 1) : f }));
            sel.selectedIndex = 0;
            sel.addEventListener('dblclick', () => form.requestSubmit());
            form.appendChild(sel);
            value = () => sel.value || null;
            first = sel;
          } else form.appendChild(Object.assign(el('div', 'nwf-hint'), { textContent: T.noFiles }));
        } else {
          const input = el('input', '', { type: 'text', 'aria-label': T.fileName, list: prefix + 'files' });
          input.value = wait.initial?.filename ?? '';
          const dl = el('datalist');
          dl.id = prefix + 'files';
          for (const f of files) dl.appendChild(Object.assign(el('option'), { value: folder ? f.slice(folder.length + 1) : f }));
          form.append(input, dl);
          value = () => (input.value.trim() ? join(input.value.trim()) : null);
          first = input;
        }
      }
    }
    const buttons = el('div', 'nwf-buttons');
    const btn = (text, secondary, fn) => {
      const b = el('button', secondary ? 'nwf-secondary' : '', { type: secondary ? 'button' : 'submit' });
      b.textContent = text;
      if (secondary) b.addEventListener('click', fn);
      buttons.appendChild(b);
      return b;
    };
    let ok;
    if (k === 'yesno') { btn(T.no, true, () => finish(false)); ok = btn(T.yes, false); value = () => true; } else if (['info', 'warn', 'error'].includes(k)) ok = btn(T.ok, false);
    else { btn(T.cancel, true, () => finish(null)); ok = btn(T.ok, false); }
    form.appendChild(buttons);
    form.addEventListener('submit', (e) => { e.preventDefault(); finish(value()); });
    form.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); finish(cancelValue); }
    });
    form.addEventListener('keyup', (e) => e.stopPropagation());
    ov.appendChild(form);
    const close = () => {
      ov.remove();
      desk.inert = false;
      tabs.inert = false;
      if (dialogClose === close) dialogClose = null;
    };
    function finish(v) {
      if (dialogClose !== close) return;
      close();
      done(v);
    }
    dialogClose = close;
    desk.inert = true;
    tabs.inert = true;
    root.appendChild(ov);
    (first ?? ok).focus();
  }

  // ---------- plugin ----------
  function reset() {
    clearTimers();
    dialogClose?.();
    for (const w of widgets.values()) { widgetObserver?.unobserve(w.el); if (w.body) winObserver?.unobserve(w.body); }
    widgets.clear();
    order = []; stack = []; activeWin = null;
    pos.clear(); sizes.clear(); images.clear();
    for (const [k, v] of Object.entries(opts.images ?? {})) images.set(k, v);
    queue.clear();
    waitCtx = null; displayed = false; ended = false; pressed = null; hover = null;
    desk.replaceChildren(spacer);
    tabs.replaceChildren();
    tabs.hidden = true;
    root.classList.remove('nwf-ended');
  }

  const plugin = {
    name: 'forms',
    root,
    host: { forms: (op, data) => command(op, data) },
    waits: {
      'forms-event'(wait, ctx) {
        if (!displayed) { displayed = true; refreshWindows(); }
        waitCtx = ctx;
        ctx.onCancel(() => { if (waitCtx === ctx) waitCtx = null; });
        deliver();
        if (waitCtx === ctx && wait.poll) { waitCtx = null; ctx.resume(null); }
      },
      'forms-dialog'(wait, ctx) {
        if (!displayed && stack.length) { displayed = true; refreshWindows(); }
        openDialog(wait, (v) => ctx.resume(v));
        ctx.onCancel(() => dialogClose?.());
      },
    },
    start({ vm: v, runner: r }) { reset(); vm = v; runner = r; },
    end() {
      clearTimers();
      waitCtx = null;
      dialogClose?.();
      closeMenus();
      ended = true;
      if (widgets.size) {
        root.classList.add('nwf-ended');
        const a = document.activeElement;
        if (a && root.contains(a)) /** @type {HTMLElement} */ (a).blur();
      }
    },
    /** Register a picture for Picture/PushButton/Drawing.image: path in the program → url and size. */
    addImage(path, url, width, height) { images.set(String(path).replace(/^\.\//, ''), { url, width, height }); opts.images = { ...(opts.images ?? {}), [path]: { url, width, height } }; },
    /** Load pictures by URL (measures them), then they work like addImage. */
    async loadImages(map) {
      await Promise.all(Object.entries(map).map(([path, url]) => new Promise((res) => {
        const img = new Image();
        img.onload = () => { plugin.addImage(path, url, img.naturalWidth, img.naturalHeight); res(null); };
        img.onerror = () => res(null);
        img.src = url;
      })));
    },
    /** Element of a widget id (tests, page integrations). */
    element(id) { return widgets.get(id)?.el ?? null; },
    /** State for tests. */
    get info() {
      return {
        mode, displayed, waiting: !!waitCtx, timers: timers.size, queued: queue.length, dialog: !!dialogClose,
        windows: order.map((w) => ({ id: w.id, kind: w.kind, title: w.props.title, visible: !w.el.hidden })),
        widgets: [...widgets.values()].map((w) => ({ id: w.id, kind: w.kind })),
      };
    },
    /** Show the windows as 'panels', 'tabs' or 'auto'. */
    setWindowMode(m) { opts.windows = m; refreshWindows(); },
    destroy() { reset(); rootObserver?.disconnect(); winObserver?.disconnect(); widgetObserver?.disconnect(); root.remove(); },
  };
  return plugin;
}
