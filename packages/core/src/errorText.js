// Turn an interpreter error (code + parameters) into text for a learner.

import { de, en } from './messages.js';

export const LANGS = ['en', 'de'];
const DICTS = { de, en };
const TOKEN_WORDS = new Set(['NEWLINE', 'EOF', 'INDENT', 'DEDENT']);

const fill = (s, params) => (params ? s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined && params[k] !== null ? String(params[k]) : m)) : s);

/** Is there a message for the key (in any language)? */
export const hasMessage = (key) => key in de || key in en;

/** Text for a key; falls back to English, then to the key itself. */
export function message(key, params, lang = 'en') {
  return fill(DICTS[lang]?.[key] ?? en[key] ?? key, params);
}

/**
 * Title and text of an error, e.g. { title: 'NameError · line 3', text: '…' }.
 * @param {{ code: string, kind?: string, params?: Record<string, any>, line?: number, file?: string } | null | undefined} e
 * @param {{ lang?: 'en'|'de', file?: string }} [opts]  file: the program's own file (default main.py); an error in
 *   another file names it in the title ('NameError in helpers.py, line 3')
 * @returns {{ title: string, text: string }}
 */
export function scriptErrorText(e, { lang = 'en', file = 'main.py' } = {}) {
  if (!e) return { title: '', text: '' };
  const p = { ...(e.params ?? {}) };
  if (TOKEN_WORDS.has(p.got)) p.got = message(`script.token.${p.got.toLowerCase()}`, null, lang);
  const variant = p.what ?? p.feature;
  const key = variant && hasMessage(`${e.code}.${variant}`) ? `${e.code}.${variant}` : e.code;
  let text = hasMessage(key) ? message(key, p, lang) : e.code;
  if (p.suggestion) text += ' ' + message('err.script.suggest', { name: p.suggestion }, lang);
  const where = e.file && e.file !== file ? 'err.script.whereFile' : 'err.script.where';
  const title = e.line ? message(where, { kind: e.kind, line: e.line, file: e.file }, lang) : e.kind;
  return { title, text: text.trim() };
}
