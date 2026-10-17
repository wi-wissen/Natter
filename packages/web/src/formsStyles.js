// CSS of the guizero renderer (forms.js) and the plot viewer (plot.js), added once to the page. Colours and sizes are
// theme tokens: --nwf-* (forms), --nwp-* (plots), falling back to the --nw-* tokens of the console and to python.jetzt's
// tokens (--bg, --text, --line, --primary ...). Dark mode follows prefers-color-scheme unless the page sets
// data-theme="light" / "dark" on <html>.

const LIGHT = `
  --nwf-font-: var(--nwf-font, var(--nw-font, var(--font, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif)));
  --nwf-mono-: var(--nwf-mono, var(--nw-mono, var(--mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace)));
  --nwf-text-: var(--nwf-text, var(--nw-text, var(--text, #111827)));
  --nwf-muted-: var(--nwf-muted, var(--nw-muted, var(--text-3, #6b7280)));
  --nwf-line-: var(--nwf-line, var(--nw-line, var(--line, #d7dbe1)));
  --nwf-desk-: var(--nwf-desk, var(--nw-stage-bg, var(--canvas, #eceef2)));
  --nwf-surface-: var(--nwf-surface, var(--bg-soft, #f7f8fa));
  --nwf-field-: var(--nwf-field, var(--bg, #ffffff));
  --nwf-button-: var(--nwf-button, var(--bg, #ffffff));
  --nwf-button-hover-: var(--nwf-button-hover, color-mix(in srgb, var(--nwf-accent-) 9%, var(--nwf-button-)));
  --nwf-titlebar-: var(--nwf-titlebar, var(--bg, #ffffff));
  --nwf-accent-: var(--nwf-accent, var(--nw-accent, var(--primary, #1d4ed8)));
  --nwf-on-accent-: var(--nwf-on-accent, #ffffff);
  --nwf-shadow-: var(--nwf-shadow, 0 1px 2px rgba(15,23,42,.06), 0 8px 24px rgba(15,23,42,.10));
  --nwf-radius-: var(--nwf-radius, var(--nw-radius, var(--r, 8px)));
  --nwf-ctl-radius-: var(--nwf-ctl-radius, 6px);
  --nwf-pt-: var(--nwf-pt, 1.4px);
  --nwf-touch-: var(--nwf-touch, 0px);
  --nwf-warn-: var(--nwf-warn, #b45309);
  --nwf-err-: var(--nwf-err, var(--nw-err, var(--err, #dc2626)));
  color-scheme: light;`;
const DARK = `
  --nwf-text-: var(--nwf-text, var(--nw-text, var(--text, #f3f4f6)));
  --nwf-muted-: var(--nwf-muted, var(--nw-muted, var(--text-3, #9ca3af)));
  --nwf-line-: var(--nwf-line, var(--nw-line, var(--line, #343a45)));
  --nwf-desk-: var(--nwf-desk, var(--nw-stage-bg, var(--canvas, #0f1115)));
  --nwf-surface-: var(--nwf-surface, var(--bg-soft, #171a20));
  --nwf-field-: var(--nwf-field, var(--bg, #0b0c0f));
  --nwf-button-: var(--nwf-button, #232730);
  --nwf-titlebar-: var(--nwf-titlebar, #1f232a);
  --nwf-accent-: var(--nwf-accent, var(--nw-accent, var(--primary, #3b82f6)));
  --nwf-shadow-: var(--nwf-shadow, 0 1px 2px rgba(0,0,0,.4), 0 10px 30px rgba(0,0,0,.45));
  --nwf-warn-: var(--nwf-warn, #f59e0b);
  --nwf-err-: var(--nwf-err, var(--nw-err, var(--err, #f87171)));
  color-scheme: dark;`;

const CSS = `
.nwf-root, .nwp-root {${LIGHT}}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .nwf-root, :root:not([data-theme="light"]) .nwp-root {${DARK}} }
:root[data-theme="dark"] .nwf-root, :root[data-theme="dark"] .nwp-root {${DARK}}
@media (pointer: coarse) { .nwf-root { --nwf-pt-: var(--nwf-pt, 1.6px); --nwf-touch-: var(--nwf-touch, 44px); } }

.nwf-root { position: relative; width: 100%; height: 100%; min-height: 0; display: flex; flex-direction: column;
  background: var(--nwf-desk-); color: var(--nwf-text-); font: calc(10 * var(--nwf-pt-))/1.25 var(--nwf-font-); --nwf-ink: var(--nwf-text-); -webkit-tap-highlight-color: transparent; }
.nwf-root *, .nwf-root *::before, .nwf-root *::after { box-sizing: border-box; }
.nwf-desk { position: relative; flex: 1; min-height: 0; overflow: auto; -webkit-overflow-scrolling: touch; }
.nwf-spacer { position: absolute; width: 1px; height: 1px; pointer-events: none; }
.nwf-ended .nwf-win { opacity: .6; filter: saturate(.6); }
.nwf-ended .nwf-desk { pointer-events: none; }

/* window switcher (tabs mode) */
.nwf-tabs { display: flex; gap: 4px; padding: 6px 8px 0; overflow-x: auto; flex: none; scrollbar-width: none; }
.nwf-tabs[hidden] { display: none; }
.nwf-tabs button { font: 600 13px var(--nwf-font-); color: var(--nwf-muted-); background: transparent; border: 1px solid transparent;
  border-bottom: 0; border-radius: 8px 8px 0 0; padding: 0 14px; min-height: max(34px, var(--nwf-touch-)); white-space: nowrap; cursor: pointer; }
.nwf-tabs button[aria-selected="true"] { color: var(--nwf-text-); background: var(--nwf-titlebar-); border-color: var(--nwf-line-); }

/* windows */
.nwf-win { position: absolute; display: flex; flex-direction: column; background: var(--nwf-surface-); border: 1px solid var(--nwf-line-);
  border-radius: var(--nwf-radius-); box-shadow: var(--nwf-shadow-); overflow: hidden; outline: none; max-width: none; }
.nwf-win[hidden] { display: none; }
.nwf-win.nwf-front { box-shadow: var(--nwf-shadow-), 0 0 0 1px color-mix(in srgb, var(--nwf-accent-) 35%, transparent); }
.nwf-titlebar { display: flex; align-items: center; gap: 8px; background: var(--nwf-titlebar-); border-bottom: 1px solid var(--nwf-line-);
  padding: 0 4px 0 12px; min-height: 36px; cursor: grab; user-select: none; -webkit-user-select: none; touch-action: none; }
.nwf-titlebar:active { cursor: grabbing; }
.nwf-title { flex: 1; min-width: 0; font: 600 13px var(--nwf-font-); color: var(--nwf-text-); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nwf-close { all: unset; display: grid; place-items: center; width: max(30px, var(--nwf-touch-)); height: max(30px, var(--nwf-touch-));
  border-radius: 6px; color: var(--nwf-muted-); font: 20px/1 var(--nwf-font-); cursor: pointer; }
.nwf-close:hover { background: color-mix(in srgb, var(--nwf-err-) 14%, transparent); color: var(--nwf-err-); }
.nwf-close:focus-visible { outline: 2px solid var(--nwf-accent-); outline-offset: -2px; }
.nwf-body { position: relative; padding: 3px; width: var(--nwf-ww, 500px); height: var(--nwf-wh, 500px); overflow: auto; background: var(--nwf-surface-); color: var(--nwf-ink); }
.nwf-full { inset: 0 !important; left: 0 !important; top: 0 !important; }
.nwf-full .nwf-body { width: auto; height: auto; flex: 1; }
.nwf-tabsmode .nwf-desk { padding: 0 8px 8px; }
.nwf-tabsmode .nwf-win { position: relative; left: auto !important; top: auto !important; width: 100%; border-top-left-radius: 0; box-shadow: none; }
.nwf-tabsmode .nwf-tabs:not([hidden]) + .nwf-desk .nwf-win { border-top-left-radius: 0; }
.nwf-tabsmode .nwf-body { width: auto; }
.nwf-tabsmode .nwf-titlebar { cursor: default; }
.nwf-tabsmode .nwf-full { position: absolute; inset: 0 8px 8px !important; width: auto; }

/* pack (auto) and grid layout */
.nwf-cav { display: flex; min-width: 0; min-height: 0; align-items: center; }
.nwf-col { flex-direction: column; }
.nwf-row { flex-direction: row; }
.nwf-cav > * { flex-shrink: 0; }
.nwf-cav > .nwf-cav { align-self: stretch; flex-shrink: 1; flex-basis: auto; }
.nwf-grid { display: grid; justify-content: start; align-content: start; grid-auto-columns: auto; grid-auto-rows: auto; }
.nwf-body.nwf-grid { align-items: center; }

/* widgets: Tk-like tight packing, themed colours */
.nwf-w { max-width: 100%; color: var(--nwf-ink); margin: 0; font: inherit; }
.nwf-text { padding: 1px 2px; white-space: pre; line-height: 1.25; }
.nwf-text.nwf-off { opacity: .5; }
.nwf-box { position: relative; min-width: 0; min-height: 0; }
.nwf-box.nwf-fixed, .nwf-titlebox.nwf-fixed { overflow: hidden; }
.nwf-titlebox { border: 2px groove var(--nwf-line-); border-radius: 4px; padding: 0 4px 4px; margin: 2px; min-width: 0; display: flex; flex-direction: column; }
.nwf-titlebox > legend { padding: 0 4px; font: inherit; color: inherit; }
.nwf-titlebox > .nwf-tbody { flex: 1; min-height: 0; }
.nwf-titlebox.nwf-flat { border-style: none; }
.nwf-input, .nwf-select, .nwf-btn, .nwf-list { font: inherit; color: var(--nwf-ink); border: 1px solid var(--nwf-line-); border-radius: var(--nwf-ctl-radius-); margin: 2px; }
.nwf-input { box-sizing: content-box !important; background: var(--nwf-field-); padding: 3px 6px; min-height: calc(var(--nwf-touch-) - 8px); line-height: 1.25; }
textarea.nwf-input { resize: none; display: block; white-space: pre-wrap; }
textarea.nwf-nowrap { white-space: pre; overflow-x: auto; }
textarea.nwf-noscroll { overflow: hidden; }
.nwf-input:focus, .nwf-select:focus, .nwf-list:focus, .nwf-btn:focus-visible, .nwf-check input:focus-visible, .nwf-slider input:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--nwf-accent-) 70%, transparent); outline-offset: 1px; }
.nwf-btn { box-sizing: content-box !important; background: var(--nwf-button-); padding: 4px 10px; cursor: pointer; line-height: 1.25;
  min-height: calc(var(--nwf-touch-) - 10px); touch-action: manipulation; overflow: hidden; text-overflow: ellipsis; white-space: pre; }
.nwf-btn:hover:not(:disabled) { background: var(--nwf-button-hover-); }
.nwf-btn:active:not(:disabled) { background: color-mix(in srgb, var(--nwf-accent-) 18%, var(--nwf-button-)); }
.nwf-btn img { display: block; max-width: 100%; }
.nwf-btn.nwf-hasimg { padding: 2px; }
.nwf-w:disabled, .nwf-w :disabled, .nwf-list[aria-disabled="true"] { opacity: .5; cursor: not-allowed; }
.nwf-check { display: inline-flex; align-items: center; gap: 6px; padding: 1px 4px; cursor: pointer; min-height: var(--nwf-touch-); box-sizing: content-box !important; white-space: pre; }
.nwf-check input { width: 1.1em; height: 1.1em; margin: 0; accent-color: var(--nwf-accent-); flex: none; }
.nwf-group { border: 0; }
.nwf-select { background: var(--nwf-field-); padding: 0 4px; height: max(calc(1.25em + 10px), var(--nwf-touch-)); }
.nwf-list { background: var(--nwf-field-); overflow-y: auto; overflow-x: hidden; padding: 2px 0; outline: none; user-select: none; -webkit-user-select: none; }
.nwf-list.nwf-noscroll { overflow: hidden; }
.nwf-list [role="option"] { padding: 1px 6px; min-height: max(1.3em, calc(var(--nwf-touch-) - 4px)); display: flex; align-items: center; cursor: pointer; white-space: pre; }
.nwf-list [role="option"][aria-selected="true"] { background: var(--nwf-accent-); color: var(--nwf-on-accent-); }
.nwf-list [role="option"].nwf-cursor { box-shadow: inset 0 0 0 1px var(--nwf-accent-); }
.nwf-slider { display: inline-flex; flex-direction: column; align-items: stretch; padding: 0 2px; }
.nwf-slider output { text-align: center; font-size: .9em; line-height: 1.2; }
.nwf-slider input { width: 100px; margin: 0; accent-color: var(--nwf-accent-); min-height: max(20px, var(--nwf-touch-)); }
.nwf-slider.nwf-vertical { flex-direction: row; align-items: center; }
.nwf-slider.nwf-vertical input { writing-mode: vertical-lr; width: max(20px, var(--nwf-touch-)); height: 100px; min-height: 0; }
.nwf-picture { display: block; object-fit: fill; }
.nwf-canvas { display: block; overflow: hidden; }
.nwf-canvas text, .nwf-canvas foreignObject div { user-select: none; -webkit-user-select: none; }
.nwf-menubar { display: flex; flex-wrap: wrap; gap: 2px; padding: 2px 4px; background: var(--nwf-titlebar-); border-bottom: 1px solid var(--nwf-line-); position: relative; }
.nwf-menubar > div { position: relative; }
.nwf-menubar button { font: 14px var(--nwf-font-); color: var(--nwf-text-); background: transparent; border: 0; border-radius: 5px; padding: 0 10px;
  min-height: max(28px, var(--nwf-touch-)); cursor: pointer; text-align: left; white-space: pre; }
.nwf-menubar button:hover, .nwf-menubar button[aria-expanded="true"], .nwf-menu button:focus-visible { background: color-mix(in srgb, var(--nwf-accent-) 12%, transparent); outline: none; }
.nwf-menu { position: absolute; left: 0; top: 100%; z-index: 20; min-width: 160px; display: flex; flex-direction: column; padding: 4px;
  background: var(--nwf-titlebar-); border: 1px solid var(--nwf-line-); border-radius: 8px; box-shadow: var(--nwf-shadow-); }
.nwf-menu[hidden] { display: none; }

/* dialogs */
.nwf-overlay { position: absolute; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; padding: 16px;
  background: rgba(15,23,42,.38); }
.nwf-dialog { background: var(--nwf-titlebar-); color: var(--nwf-text-); font: 15px/1.45 var(--nwf-font-); border-radius: 12px; border: 1px solid var(--nwf-line-);
  box-shadow: 0 24px 60px rgba(15,23,42,.3); padding: 18px; width: min(380px, 100%); max-height: 100%; overflow: auto; display: grid; gap: 12px; }
.nwf-dialog-head { display: flex; gap: 10px; align-items: flex-start; }
.nwf-dialog-icon { flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font: 700 15px var(--nwf-font-); color: #fff; background: var(--nwf-accent-); }
.nwf-dialog-icon.nwf-warn { background: var(--nwf-warn-); }
.nwf-dialog-icon.nwf-error { background: var(--nwf-err-); }
.nwf-dialog-title { font-weight: 650; }
.nwf-dialog-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.nwf-dialog input:not([type="color"]), .nwf-dialog select { font: 15px var(--nwf-font-); padding: 8px 10px; border: 1px solid var(--nwf-line-); border-radius: 8px;
  background: var(--nwf-field-); color: var(--nwf-text-); width: 100%; min-height: max(38px, var(--nwf-touch-)); }
.nwf-dialog select[size] { padding: 4px; }
.nwf-dialog input[type="color"] { width: 100%; height: 56px; border: 1px solid var(--nwf-line-); border-radius: 8px; background: transparent; padding: 2px; }
.nwf-dialog .nwf-buttons { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.nwf-dialog .nwf-buttons button { font: 600 14px var(--nwf-font-); border-radius: 8px; padding: 0 16px; min-height: max(36px, var(--nwf-touch-)); cursor: pointer;
  border: 1px solid var(--nwf-accent-); background: var(--nwf-accent-); color: var(--nwf-on-accent-); }
.nwf-dialog .nwf-buttons button.nwf-secondary { background: transparent; color: var(--nwf-text-); border-color: var(--nwf-line-); }
.nwf-dialog .nwf-hint { color: var(--nwf-muted-); font-size: 13px; }

/* plots */
.nwp-root { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; background: var(--nwf-desk-); color: var(--nwf-text-);
  font: 13px/1.4 var(--nwf-font-); --nwp-paper-: var(--nwp-paper, #ffffff); }
.nwp-root *, .nwp-root *::before, .nwp-root *::after { box-sizing: border-box; }
.nwp-tabs { display: flex; gap: 4px; padding: 6px 8px 0; overflow-x: auto; flex: none; }
.nwp-tabs[hidden] { display: none; }
.nwp-tabs button { font: 600 13px var(--nwf-font-); color: var(--nwf-muted-); background: transparent; border: 1px solid transparent; border-bottom: 0;
  border-radius: 8px 8px 0 0; padding: 0 12px; min-height: 34px; cursor: pointer; white-space: nowrap; }
.nwp-tabs button[aria-selected="true"] { color: var(--nwf-text-); background: var(--nwf-titlebar-); border-color: var(--nwf-line-); }
.nwp-list { flex: 1; min-height: 0; overflow: auto; padding: 8px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
.nwp-fig { margin: 0; width: 100%; max-width: var(--nwp-max, 100%); background: var(--nwf-titlebar-); border: 1px solid var(--nwf-line-);
  border-radius: var(--nwf-radius-); box-shadow: var(--nwf-shadow-); overflow: hidden; flex: none; }
.nwp-fig[hidden] { display: none; }
.nwp-bar { display: flex; align-items: center; gap: 4px; padding: 4px 4px 4px 12px; border-bottom: 1px solid var(--nwf-line-); }
.nwp-name { flex: 1; min-width: 0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nwp-bar button { font: 600 12.5px var(--nwf-font-); color: var(--nwf-text-); background: transparent; border: 1px solid var(--nwf-line-); border-radius: 6px;
  padding: 0 10px; min-height: 30px; cursor: pointer; white-space: nowrap; }
.nwp-bar button:hover { background: color-mix(in srgb, var(--nwf-accent-) 10%, transparent); }
.nwp-bar button[aria-pressed="true"] { background: color-mix(in srgb, var(--nwf-accent-) 18%, transparent); border-color: var(--nwf-accent-); }
@media (pointer: coarse) { .nwp-bar button, .nwp-tabs button { min-height: 44px; } }
.nwp-paper { background: var(--nwp-paper-); line-height: 0; }
.nwp-paper svg { display: block; width: 100%; height: auto; }
.nwp-fig.nwp-grow { max-width: none; }
.nwp-saved { align-self: stretch; padding: 8px 12px; border: 1px dashed var(--nwf-line-); border-radius: var(--nwf-radius-); color: var(--nwf-muted-); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.nwp-saved button { font: 600 12.5px var(--nwf-font-); color: var(--nwf-accent-); background: none; border: 0; padding: 0; min-height: 30px; cursor: pointer; text-decoration: underline; }
.nwp-empty { color: var(--nwf-muted-); margin: auto; padding: 24px; text-align: center; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .nwp-root.nwp-invert .nwp-paper { filter: invert(1) hue-rotate(180deg); background: #ffffff; } }
:root[data-theme="dark"] .nwp-root.nwp-invert .nwp-paper { filter: invert(1) hue-rotate(180deg); background: #ffffff; }
.nwp-bar .nwp-darkbtn { display: none; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .nwp-bar .nwp-darkbtn { display: inline-block; } }
:root[data-theme="dark"] .nwp-bar .nwp-darkbtn { display: inline-block; }
`;

/** Add the stylesheet once (no-op outside a browser). */
export function ensureFormsStyles() {
  if (typeof document === 'undefined' || document.getElementById('natter-forms-css')) return;
  const style = document.createElement('style');
  style.id = 'natter-forms-css';
  style.textContent = CSS;
  document.head.prepend(style);
}
