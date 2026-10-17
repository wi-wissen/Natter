// Browser host of Natter: one runner for all modules, plus the console and the canvas modules turtle and kara.
export { createRunner } from './runner.js';
export { createConsole } from './console.js';
export { createTurtle } from './turtle.js';
export { createKara } from './kara.js';
export { createStage } from './stage.js';
export { askDialog } from './dialog.js';
export { describeError, UI_TEXT } from './errors.js';
export { doHttp, httpWait } from './http.js';
export { ensureStyles } from './styles.js';
export { karaGlobals, KARA_NAMES } from '@natter/core';

/** Which canvas module a program needs: 'turtle', 'kara' or null (a simple look at its imports and calls). */
export function detectModules(source) {
  const uses = [];
  if (/^\s*(import\s+turtle\b|from\s+turtle\s+import\b)/m.test(source)) uses.push('turtle');
  if (/^\s*(import\s+kara\b|from\s+kara\s+import\b)/m.test(source) || /^\s*world\s*\(/m.test(source)) uses.push('kara');
  return uses;
}
