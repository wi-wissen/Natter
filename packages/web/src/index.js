// Browser host of Natter: one runner for all modules, plus the console and the canvas modules turtle and kara.
export { createRunner } from './runner.js';
export { createConsole } from './console.js';
export { createTurtle } from './turtle.js';
export { createKara } from './kara.js';
export { createPgzero } from './pgzero.js';
export { pgzMode } from './pgzeroMath.js';
export { createForms } from './forms.js';
export { createPlot, downloadBlob, svgToPng } from './plot.js';
export { createStage } from './stage.js';
export { askDialog } from './dialog.js';
export { describeError, UI_TEXT } from './errors.js';
export { doHttp, httpWait } from './http.js';
export { ensureStyles } from './styles.js';
export { karaGlobals, KARA_NAMES } from '@natterjs/core';
import { pgzMode } from './pgzeroMath.js';

/** Which modules a program needs: 'turtle', 'kara', 'pgzero', 'forms' (guizero), 'plot' (matplotlib) or none (a simple look at its imports and calls). */
export function detectModules(source) {
  const uses = [];
  if (/^\s*(import\s+turtle\b|from\s+turtle\s+import\b)/m.test(source)) uses.push('turtle');
  if (/^\s*(import\s+kara\b|from\s+kara\s+import\b)/m.test(source) || /^\s*world\s*\(/m.test(source)) uses.push('kara');
  if (!uses.length && pgzMode(source)) uses.push('pgzero');
  if (/^\s*(import\s+guizero\b|from\s+guizero\s+import\b)/m.test(source)) uses.push('forms');
  if (/^\s*(import\s+matplotlib\b|from\s+matplotlib(\.pyplot)?\s+import\b)/m.test(source)) uses.push('plot');
  return uses;
}
