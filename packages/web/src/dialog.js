// A small modal question over a stage (turtle textinput/numinput; forms can reuse it).

import { uiText } from './errors.js';

/**
 * @param {HTMLElement} parent  positioned element to cover
 * @param {{ title?: string, text: string, type?: 'text'|'number', lang?: string, onDone: (value: string|null) => void }} o
 * @returns {() => void}  closes the dialog without an answer
 */
export function askDialog(parent, o) {
  const T = uiText(o.lang ?? 'de');
  const box = document.createElement('div');
  box.className = 'nw-dialog';
  box.innerHTML = `<form><div class="nw-dialog-title"></div><label><span></span></label><input><div class="nw-buttons"><button type="button" class="nw-secondary"></button><button type="submit"></button></div></form>`;
  const form = box.querySelector('form');
  box.querySelector('.nw-dialog-title').textContent = o.title ?? '';
  box.querySelector('label span').textContent = o.text;
  const input = box.querySelector('input');
  input.type = o.type === 'number' ? 'text' : 'text';
  if (o.type === 'number') input.inputMode = 'decimal';
  const [cancel, ok] = box.querySelectorAll('button');
  cancel.textContent = T.cancel;
  ok.textContent = T.ok;
  let closed = false;
  const close = (v) => {
    if (closed) return;
    closed = true;
    box.remove();
    if (v !== undefined) o.onDone(v);
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); close(input.value); });
  cancel.addEventListener('click', () => close(null));
  box.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(null); });
  parent.appendChild(box);
  input.focus();
  return () => close(undefined);
}
