// CSS of the web components, added once to the page. Colours are theme tokens (CSS variables) with defaults that
// follow CodeNatter's tokens when they exist (--bg, --text, --err ...), so a page restyles by setting --nw-*.

const CSS = `
.nw-console, .nw-stage, .nw-dialog {
  --nw-font-: var(--nw-font, var(--font, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif));
  --nw-mono-: var(--nw-mono, var(--mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace));
  --nw-bg-: var(--nw-bg, var(--bg-soft, #f9fafb));
  --nw-text-: var(--nw-text, var(--text, #111827));
  --nw-muted-: var(--nw-muted, var(--text-3, #6b7280));
  --nw-line-: var(--nw-line, var(--line, #e5e7eb));
  --nw-err-: var(--nw-err, var(--err-text, #b91c1c));
  --nw-err-bg-: var(--nw-err-bg, var(--err-soft, #fef2f2));
  --nw-err-line-: var(--nw-err-line, var(--err-line, #fecaca));
  --nw-stderr-: var(--nw-stderr, var(--err, #dc2626));
  --nw-input-: var(--nw-input, var(--primary-text, #1e40af));
  --nw-input-bg-: var(--nw-input-bg, var(--bg, #ffffff));
  --nw-accent-: var(--nw-accent, var(--primary, #1d4ed8));
  --nw-radius-: var(--nw-radius, var(--r, 8px));
  --nw-stage-bg-: var(--nw-stage-bg, var(--canvas, transparent));
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .nw-console, :root:not([data-theme="light"]) .nw-dialog {
    --nw-bg-: var(--nw-bg, var(--bg-soft, #16181d)); --nw-text-: var(--nw-text, var(--text, #f3f4f6));
    --nw-muted-: var(--nw-muted, var(--text-3, #9ca3af)); --nw-line-: var(--nw-line, var(--line, #2a2e36));
    --nw-err-: var(--nw-err, var(--err-text, #fca5a5)); --nw-err-bg-: var(--nw-err-bg, var(--err-soft, rgba(239,68,68,.12)));
    --nw-err-line-: var(--nw-err-line, var(--err-line, rgba(239,68,68,.35))); --nw-stderr-: var(--nw-stderr, var(--err, #f87171));
    --nw-input-: var(--nw-input, var(--primary-text, #93c5fd)); --nw-input-bg-: var(--nw-input-bg, var(--bg, #0b0c0f));
  }
}
.nw-console { display: flex; flex-direction: column; min-height: 0; background: var(--nw-bg-); color: var(--nw-text-);
  font: 13.5px/1.55 var(--nw-mono-); border-radius: var(--nw-radius-); overflow: hidden; }
.nw-scroll { flex: 1; min-height: 0; overflow: auto; padding: 10px 12px; -webkit-overflow-scrolling: touch; }
.nw-out { white-space: pre-wrap; word-break: break-word; margin: 0; font: inherit; }
.nw-out .nw-err { color: var(--nw-stderr-); }
.nw-out .nw-in { color: var(--nw-input-); font-weight: 600; }
.nw-out .nw-info { color: var(--nw-muted-); font-style: italic; }
.nw-inrow { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
.nw-inrow[hidden] { display: none; }
.nw-inrow input { flex: 1; min-width: 0; font: inherit; color: var(--nw-input-); background: var(--nw-input-bg-);
  border: 1px solid var(--nw-accent-); border-radius: 6px; padding: 4px 8px; outline: none; }
.nw-inrow input:focus { box-shadow: 0 0 0 3px color-mix(in srgb, var(--nw-accent-) 25%, transparent); }
.nw-inrow button, .nw-dialog button { font: 600 13px var(--nw-font-); border-radius: 6px; padding: 5px 12px; cursor: pointer;
  border: 1px solid var(--nw-accent-); background: var(--nw-accent-); color: #fff; min-height: 30px; }
.nw-dialog button.nw-secondary { background: transparent; color: var(--nw-text-); border-color: var(--nw-line-); }
.nw-error { margin: 8px 0 2px; padding: 9px 11px; border: 1px solid var(--nw-err-line-); background: var(--nw-err-bg-);
  border-radius: var(--nw-radius-); font-family: var(--nw-font-); color: var(--nw-text-); }
.nw-error[hidden] { display: none; }
.nw-error-title { font-weight: 650; color: var(--nw-err-); font-size: 13.5px; }
.nw-error-title button { all: unset; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.nw-error-text { font-size: 14px; margin-top: 2px; }
.nw-error details { margin-top: 6px; font-size: 12px; color: var(--nw-muted-); }
.nw-error summary { cursor: pointer; }
.nw-error pre { margin: 4px 0 0; white-space: pre-wrap; font: 12px/1.5 var(--nw-mono-); }
.nw-stage { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;
  min-height: 0; background: var(--nw-stage-bg-); }
.nw-canvas { display: block; touch-action: manipulation; outline: none; -webkit-tap-highlight-color: transparent;
  box-shadow: 0 0 0 1px var(--nw-line-, #e5e7eb); }
.nw-dialog { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(15,23,42,.35); z-index: 5; }
.nw-dialog form { background: var(--nw-input-bg-); color: var(--nw-text-); font: 14px/1.45 var(--nw-font-); border-radius: 12px;
  box-shadow: 0 24px 60px rgba(15,23,42,.25); padding: 16px; width: min(340px, calc(100% - 32px)); display: grid; gap: 10px; }
.nw-dialog .nw-dialog-title { font-weight: 650; }
.nw-dialog input { font: 15px var(--nw-font-); padding: 7px 9px; border: 1px solid var(--nw-line-); border-radius: 6px;
  background: var(--nw-bg-); color: var(--nw-text-); }
.nw-dialog .nw-buttons { display: flex; justify-content: flex-end; gap: 8px; }
`;

/** Add the stylesheet once (no-op outside a browser). */
export function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById('natter-web-css')) return;
  const style = document.createElement('style');
  style.id = 'natter-web-css';
  style.textContent = CSS;
  document.head.prepend(style);
}
