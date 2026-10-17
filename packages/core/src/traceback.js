// Python-style traceback text for an error of the VM (the same shape CPython prints, without the caret lines).

import { pyMessage } from './pymessages.js';

/**
 * @param {{ code: string, kind: string, params: object, line?: number, traceback?: {name: string, line: number}[] }} error  an error object of the VM (task.error / runToEnd().error)
 * @param {{ source?: string, file?: string }} [opts]  source: text of the program for the source lines
 * @returns {string}
 */
export function formatTraceback(error, opts = {}) {
  const file = opts.file ?? 'main.py';
  const lines = opts.source?.split('\n');
  const out = [];
  const frames = error.traceback?.length ? error.traceback : error.line ? [{ name: '<module>', line: error.line }] : [];
  if (error.kind !== 'SyntaxError' && frames.length) {
    out.push('Traceback (most recent call last):');
    for (const f of frames) {
      out.push(`  File "${file}", line ${f.line}, in ${f.name}`);
      const text = lines?.[f.line - 1]?.trim();
      if (text) out.push(`    ${text}`);
    }
  } else if (frames.length) {
    out.push(`  File "${file}", line ${error.line}`);
    const text = lines?.[error.line - 1]?.trim();
    if (text) out.push(`    ${text}`);
  }
  const msg = pyMessage(error);
  out.push(msg ? `${error.kind}: ${msg}` : error.kind);
  return out.join('\n');
}
