// Plots in the page: shows the SVG of plt.show() (wait kind 'plot', docs/NUMPY-PLOT.md) inline, scaled to the width of
// the area, with "save as SVG / PNG" (download through a Blob link). Several figures are stacked or shown as tabs.
// In dark mode the white figure stays a sheet of paper; option dark: 'invert' (or the button on each figure) inverts it.

import { renderOpenFigures } from '@natter/core';
import { ensureFormsStyles } from './formsStyles.js';

const TEXT = {
  de: { figure: 'Abbildung', svg: 'SVG', png: 'PNG', saveSvg: 'Als SVG speichern', savePng: 'Als PNG speichern', dark: 'Dunkel',
    darkTitle: 'Abbildung für den Dunkelmodus umfärben', grow: 'Volle Breite', saved: 'gespeichert:', download: 'herunterladen', empty: 'Noch keine Abbildung' },
  en: { figure: 'Figure', svg: 'SVG', png: 'PNG', saveSvg: 'Save as SVG', savePng: 'Save as PNG', dark: 'Dark',
    darkTitle: 'Recolour the figure for dark mode', grow: 'Full width', saved: 'saved:', download: 'download', empty: 'No figure yet' },
};

/** File name without folders and with the wanted extension. */
export function plotFileName(name, ext) {
  const base = String(name || 'figure').split('/').pop().replace(/\.[a-z0-9]{1,5}$/i, '') || 'figure';
  return `${base.replace(/[^\w\-. äöüÄÖÜß]/g, '_')}.${ext}`;
}

/** Trigger a download of a Blob (a link with download=; blocked in some sandboxed viewers). */
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** PNG of an SVG text (scale: device pixels per SVG pixel). */
export function svgToPng(svgText, width, height, scale = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(width * scale);
      c.height = Math.round(height * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('svg')); };
    img.src = url;
  });
}

/**
 * @param {HTMLElement} container  the plot area (scrolls inside when there are several figures)
 * @param {{
 *   lang?: 'de'|'en',
 *   layout?: 'stack'|'tabs',          several figures one below the other (default) or as tabs
 *   dark?: 'paper'|'invert',          dark mode: keep the white sheet (default) or invert the colours
 *   showOpenAtEnd?: boolean,          at the end of a run, show figures that were never shown (default true)
 *   maxWidth?: number,                widest a figure gets in CSS px (default: its own width × 1.5)
 *   onSave?: (file: string, svg: string, wait: any) => boolean|void,  savefig(); return true when handled
 *   onShow?: (figure: { svg: string, width: number, height: number, name: string }) => void,
 * }} [opts]
 */
export function createPlot(container, opts = {}) {
  ensureFormsStyles();
  const T = TEXT[opts.lang] ?? TEXT.de;
  const root = document.createElement('div');
  root.className = 'nwp-root';
  root.innerHTML = '<div class="nwp-tabs" role="tablist" hidden></div><div class="nwp-list" role="list"></div>';
  container.appendChild(root);
  const tabs = /** @type {HTMLElement} */ (root.querySelector('.nwp-tabs'));
  const list = /** @type {HTMLElement} */ (root.querySelector('.nwp-list'));
  tabs.setAttribute('aria-label', T.figure);
  let dark = opts.dark ?? 'paper';
  root.classList.toggle('nwp-invert', dark === 'invert');
  /** @type {{ el: HTMLElement, svg: string, width: number, height: number, name: string }[]} */
  let figures = [];
  let active = -1, count = 0, vm = null;
  // a figure fits the visible height of the area (the ⤢ button gives it the full width)
  const fit = () => root.style.setProperty('--nwp-fit-h', `${Math.max(160, list.clientHeight - 16 - 40)}px`);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  ro?.observe(list);

  function btn(text, title, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    b.addEventListener('click', fn);
    return b;
  }

  function add(wait, name) {
    const fig = { el: document.createElement('figure'), svg: String(wait.svg ?? ''), width: wait.width || 640, height: wait.height || 480, name: name ?? `${T.figure} ${++count}` };
    const el = fig.el;
    el.className = 'nwp-fig';
    el.setAttribute('role', 'listitem');
    el.style.setProperty('--nwp-max', `min(${opts.maxWidth ?? Math.round(fig.width * 1.5)}px, var(--nwp-fit-h, 100vh) * ${(fig.width / fig.height).toFixed(4)})`);
    const bar = document.createElement('div');
    bar.className = 'nwp-bar';
    const title = document.createElement('figcaption');
    title.className = 'nwp-name';
    title.textContent = fig.name;
    const darkBtn = btn(T.dark, T.darkTitle, () => plot.setDark(dark === 'invert' ? 'paper' : 'invert'));
    darkBtn.className = 'nwp-darkbtn';
    darkBtn.setAttribute('aria-pressed', String(dark === 'invert'));
    const grow = btn('⤢', T.grow, () => { const on = el.classList.toggle('nwp-grow'); grow.setAttribute('aria-pressed', String(on)); });
    grow.setAttribute('aria-pressed', 'false');
    bar.append(title, darkBtn, grow,
      btn('↓ ' + T.svg, T.saveSvg, () => plot.saveSvg(figures.indexOf(fig))),
      btn('↓ ' + T.png, T.savePng, () => plot.savePng(figures.indexOf(fig))));
    const paper = document.createElement('div');
    paper.className = 'nwp-paper';
    paper.innerHTML = fig.svg;
    const s = paper.querySelector('svg');
    if (s) {
      s.setAttribute('role', 'img');
      s.setAttribute('aria-label', fig.name);
      s.removeAttribute('width');
      s.removeAttribute('height');
      s.style.aspectRatio = `${fig.width} / ${fig.height}`;
    }
    el.append(bar, paper);
    list.querySelector('.nwp-empty')?.remove();
    list.appendChild(el);
    figures.push(fig);
    active = figures.length - 1;
    render();
    if (opts.layout !== 'tabs') requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest' }));
    opts.onShow?.({ svg: fig.svg, width: fig.width, height: fig.height, name: fig.name });
    return fig;
  }

  function addSaved(file, wait) {
    const row = document.createElement('div');
    row.className = 'nwp-saved';
    row.setAttribute('role', 'listitem');
    const ext = /\.png$/i.test(file) ? 'png' : 'svg';
    const label = document.createElement('span');
    label.textContent = `${file} ${T.saved}`;
    const dl = btn(`${T.download} (${ext.toUpperCase()})`, '', async () => {
      if (ext === 'png') downloadBlob(await svgToPng(wait.svg, wait.width, wait.height), plotFileName(file, 'png'));
      else downloadBlob(new Blob([wait.svg], { type: 'image/svg+xml' }), plotFileName(file, 'svg'));
    });
    row.append(label, dl);
    list.appendChild(row);
  }

  function render() {
    const tabbed = opts.layout === 'tabs' && figures.length > 1;
    tabs.hidden = !tabbed;
    figures.forEach((f, i) => { f.el.hidden = tabbed && i !== active; });
    if (!tabbed) { tabs.replaceChildren(); return; }
    tabs.replaceChildren(...figures.map((f, i) => {
      const b = btn(f.name, '', () => { active = i; render(); });
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(i === active));
      return b;
    }));
  }

  const plot = {
    name: 'plot',
    root,
    get figures() { return figures.map(({ svg, width, height, name }) => ({ svg, width, height, name })); },
    get dark() { return dark; },
    /** 'paper' (white sheet in dark mode) or 'invert' (colours inverted in dark mode). */
    setDark(mode) {
      dark = mode === 'invert' ? 'invert' : 'paper';
      root.classList.toggle('nwp-invert', dark === 'invert');
      for (const b of root.querySelectorAll('.nwp-darkbtn')) b.setAttribute('aria-pressed', String(dark === 'invert'));
    },
    /** Show an SVG (as plt.show() does). */
    show(svg, width, height, name) { return add({ svg, width, height }, name); },
    clear() { figures = []; active = -1; count = 0; list.replaceChildren(); tabs.replaceChildren(); tabs.hidden = true; },
    saveSvg(i = figures.length - 1) {
      const f = figures[i];
      if (f) downloadBlob(new Blob([f.svg], { type: 'image/svg+xml' }), plotFileName(f.name, 'svg'));
    },
    async savePng(i = figures.length - 1, scale = 2) {
      const f = figures[i];
      if (f) downloadBlob(await svgToPng(f.svg, f.width, f.height, scale), plotFileName(f.name, 'png'));
    },
    waits: {
      plot(wait, ctx) {
        if (wait.file) {
          if (!opts.onSave?.(wait.file, wait.svg, wait)) addSaved(String(wait.file), wait);
        } else add(wait);
        ctx.resume(null);
      },
    },
    start({ vm: v }) { vm = v; plot.clear(); },
    end(state) {
      if (state === 'done' && vm && opts.showOpenAtEnd !== false) {
        try { for (const r of renderOpenFigures(vm, true)) add(r); } catch { /* no plot module loaded */ }
      }
      vm = null;
    },
    destroy() { ro?.disconnect(); root.remove(); },
  };
  return plot;
}
