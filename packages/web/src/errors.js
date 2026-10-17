// Friendly text of a VM error for the page: title (kind and line), message in the learner's language, Python traceback.

import { scriptErrorText, formatTraceback } from '@natter/core';

/**
 * @param {{ code: string, kind: string, params?: object, line?: number, traceback?: {name: string, line: number}[] }} error  task.error of the VM
 * @param {{ lang?: 'de'|'en', source?: string, file?: string }} [opts]
 * @returns {{ title: string, text: string, line: number, kind: string, traceback: string }}
 */
export function describeError(error, opts = {}) {
  const { title, text } = scriptErrorText(error, { lang: opts.lang ?? 'de' });
  let traceback = '';
  try { traceback = formatTraceback(error, { source: opts.source, file: opts.file }); } catch { /* unusual error object */ }
  return { title, text, line: error?.line ?? 0, kind: error?.kind ?? 'Error', traceback };
}

/** Texts of the web components. */
export const UI_TEXT = {
  de: { traceback: 'Traceback (wie in Python)', send: 'Eingabe', inputLabel: 'Eingabe für input()', ok: 'OK', cancel: 'Abbrechen', stopped: 'Programm gestoppt.' },
  en: { traceback: 'Traceback (as in Python)', send: 'Enter', inputLabel: 'Input for input()', ok: 'OK', cancel: 'Cancel', stopped: 'Program stopped.' },
};
export const uiText = (lang) => UI_TEXT[lang] ?? UI_TEXT.en;
