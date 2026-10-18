// Friendly text of a VM error for the page: title (kind and line), message in the learner's language, Python traceback.

import { scriptErrorText, formatTraceback } from '@natterjs/core';

/**
 * @param {{ code: string, kind: string, params?: object, line?: number, file?: string, traceback?: {name: string, line: number, file?: string}[] }} error  task.error of the VM
 * @param {{ lang?: 'de'|'en', source?: string, file?: string, files?: Record<string, string> }} [opts]
 *   source/file: the program and its path (default main.py); files: the project, for the lines of other files
 * @returns {{ title: string, text: string, line: number, file: string, kind: string, traceback: string, trace: {name: string, line: number, file: string, lib?: true}[] }}
 *   file: where the error happened (the program's file when the error has none); trace: the call stack with files
 */
export function describeError(error, opts = {}) {
  const main = opts.file ?? 'main.py';
  const { title, text } = scriptErrorText(error, { lang: opts.lang ?? 'de', file: main });
  let traceback = '';
  try { traceback = formatTraceback(error, { source: opts.source, file: main, files: opts.files }); } catch { /* unusual error object */ }
  const trace = (error?.traceback ?? []).map((f) => ({ ...f, file: f.file ?? main }));
  return { title, text, line: error?.line ?? 0, file: error?.file ?? main, kind: error?.kind ?? 'Error', traceback, trace };
}

/** Texts of the web components. */
export const UI_TEXT = {
  de: { traceback: 'Traceback (wie in Python)', send: 'Eingabe', inputLabel: 'Eingabe für input()', ok: 'OK', cancel: 'Abbrechen', stopped: 'Programm gestoppt.' },
  en: { traceback: 'Traceback (as in Python)', send: 'Enter', inputLabel: 'Input for input()', ok: 'OK', cancel: 'Cancel', stopped: 'Program stopped.' },
};
export const uiText = (lang) => UI_TEXT[lang] ?? UI_TEXT.en;
