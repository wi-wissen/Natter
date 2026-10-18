// Python-style traceback text for an error of the VM (the same shape CPython prints, without the caret lines).

import { pyMessage } from './pymessages.js';

/**
 * @param {{ code: string, kind: string, params: object, line?: number, file?: string, traceback?: {name: string, line: number, file?: string}[] }} error
 *   an error object of the VM (task.error / runToEnd().error)
 * @param {{ source?: string, file?: string, files?: Record<string, string> }} [opts]
 *   source: text of the program (for the source lines); file: its name (default main.py), used for frames without a
 *   file; files: texts of the other files (project path → text) for the lines of imported modules
 * @returns {string}
 */
export function formatTraceback(error, opts = {}) {
  const main = opts.file ?? 'main.py';
  const textOf = (file, line) => {
    const src = !file || file === main ? opts.source ?? opts.files?.[main] : opts.files?.[file];
    return typeof src === 'string' ? src.split('\n')[line - 1]?.trim() : '';
  };
  const out = [];
  const frames = error.traceback?.length ? error.traceback : error.line && error.kind !== 'SyntaxError' ? [{ name: '<module>', line: error.line }] : [];
  const fileLine = (f, line, name) => {
    out.push(`  File "${f ?? main}", line ${line}${name ? `, in ${name}` : ''}`);
    const text = textOf(f, line);
    if (text) out.push(`    ${text}`);
  };
  if (frames.length) {
    out.push('Traceback (most recent call last):');
    for (const f of frames) {
      if (f.skipped) { out.push(`  [Previous line repeated ${f.skipped} more times]`); continue; }
      fileLine(f.file, f.line, f.name);
    }
  }
  // a syntax error has no frame of its own: the place in the file (after the imports that led to it)
  if (error.kind === 'SyntaxError' && error.line) fileLine(error.file, error.line, null);
  const msg = pyMessage(error);
  out.push(msg ? `${error.kind}: ${msg}` : error.kind);
  return out.join('\n');
}
