// A small console: program output (print, stderr, echoed input), the error box with the friendly message, and an
// input line for input(). Output is buffered and written once per frame, so a loop that prints a lot stays fast.

import { describeError, uiText } from './errors.js';
import { ensureStyles } from './styles.js';

const CLASS = { out: '', err: 'nw-err', input: 'nw-in', info: 'nw-info' };

/**
 * @param {HTMLElement} container
 * @param {{ lang?: 'de'|'en', maxChars?: number, onSubmit?: (text: string) => void, onLineClick?: (line: number) => void, file?: string }} [opts]
 */
export function createConsole(container, opts = {}) {
  ensureStyles();
  const T = uiText(opts.lang ?? 'de');
  const maxChars = opts.maxChars ?? 200_000;
  const el = document.createElement('div');
  el.className = 'nw-console';
  el.innerHTML = `<div class="nw-scroll"><pre class="nw-out" role="log" aria-live="polite"></pre>
<form class="nw-inrow" hidden><input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send"><button type="submit"></button></form>
<div class="nw-error" role="alert" hidden><div class="nw-error-title"></div><div class="nw-error-text"></div><details><summary></summary><pre></pre></details></div></div>`;
  container.appendChild(el);
  const scroll = /** @type {HTMLElement} */ (el.querySelector('.nw-scroll'));
  const out = /** @type {HTMLElement} */ (el.querySelector('.nw-out'));
  const form = /** @type {HTMLFormElement} */ (el.querySelector('.nw-inrow'));
  const input = /** @type {HTMLInputElement} */ (form.querySelector('input'));
  const errBox = /** @type {HTMLElement} */ (el.querySelector('.nw-error'));
  form.querySelector('button').textContent = T.send;
  input.setAttribute('aria-label', T.inputLabel);
  errBox.querySelector('summary').textContent = T.traceback;

  /** @type {[string, string][]} pending output by kind */
  let pending = [];
  let frame = 0, chars = 0;

  const atBottom = () => scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 40;

  function flush() {
    frame = 0;
    if (!pending.length) return;
    const stick = atBottom();
    for (const [kind, text] of pending) {
      const last = out.lastElementChild;
      if (last && last.dataset.kind === kind) last.textContent += text;
      else {
        const span = document.createElement('span');
        span.dataset.kind = kind;
        if (CLASS[kind]) span.className = CLASS[kind];
        span.textContent = text;
        out.appendChild(span);
      }
      chars += text.length;
    }
    pending = [];
    // keep the console small: drop the oldest output
    while (chars > maxChars && out.firstElementChild) {
      const first = out.firstElementChild;
      const over = chars - maxChars;
      if (first.textContent.length > over && first !== out.lastElementChild) { first.textContent = first.textContent.slice(over); chars -= over; break; }
      if (first === out.lastElementChild) { first.textContent = first.textContent.slice(-maxChars); chars = first.textContent.length; break; }
      chars -= first.textContent.length;
      first.remove();
    }
    if (stick) scroll.scrollTop = scroll.scrollHeight;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = '';
    con.hideInput();
    opts.onSubmit?.(text);
  });

  const con = {
    el,
    /** Append text; kind 'out' | 'err' | 'input' | 'info'. */
    write(text, kind = 'out') {
      const last = pending[pending.length - 1];
      if (last && last[0] === kind) last[1] += text; else pending.push([kind, text]);
      if (!frame) frame = requestAnimationFrame(flush);
    },
    /** Write everything now (tests, before showing an error). */
    flush() { if (frame) cancelAnimationFrame(frame); flush(); },
    /** Show the input line (input() is waiting). */
    showInput(prompt = '') {
      con.flush();
      form.hidden = false;
      input.placeholder = '';
      input.dataset.prompt = prompt;
      scroll.scrollTop = scroll.scrollHeight;
      input.focus({ preventScroll: true });
    },
    hideInput() { form.hidden = true; },
    /** Show an error of the VM with the friendly message. */
    showError(error, { source, lang } = {}) {
      con.flush();
      con.hideInput();
      const d = describeError(error, { lang: lang ?? opts.lang ?? 'de', source, file: opts.file });
      const title = errBox.querySelector('.nw-error-title');
      title.textContent = '';
      if (d.line && opts.onLineClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = d.title;
        b.addEventListener('click', () => opts.onLineClick(d.line));
        title.appendChild(b);
      } else title.textContent = d.title;
      errBox.querySelector('.nw-error-text').textContent = d.text;
      errBox.querySelector('pre').textContent = d.traceback;
      errBox.dataset.line = String(d.line);
      errBox.dataset.code = error.code ?? '';
      errBox.hidden = false;
      scroll.scrollTop = scroll.scrollHeight;
      return d;
    },
    /** Remove output, error and input line. */
    clear() {
      pending = [];
      if (frame) cancelAnimationFrame(frame);
      frame = 0; chars = 0;
      out.textContent = '';
      errBox.hidden = true;
      form.hidden = true;
    },
    /** Wire to a runner: output, errors, input(). */
    connect(runner) {
      opts.onSubmit ??= (text) => runner.sendInput(text);
      runner.on('output', (text, kind) => con.write(text, kind));
      runner.on('error', (error, ctx) => con.showError(error, { source: ctx.source }));
      runner.on('input', (prompt) => con.showInput(prompt));
      runner.on('state', (s) => { if (s !== 'waiting') con.hideInput(); if (s === 'stopped') con.write('\n' + uiText(opts.lang ?? 'de').stopped + '\n', 'info'); });
      return con;
    },
    get text() { con.flush(); return out.textContent; },
  };
  return con;
}
