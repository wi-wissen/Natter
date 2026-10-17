// Lexer of the Python subset: source text → tokens with line/column.
// Indentation becomes INDENT/DEDENT via a stack of indentation depths, as in Python.
// Line breaks do not count inside brackets. The same lexer colours the code editor
// (tokenizeForHighlight), so highlighting and error messages see the same tokens.

import { ScriptError } from './errors.js';

export const KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del',
  'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

const OPERATORS = [
  '**=', '//=', '>>=', '<<=', '...',
  '!=', '==', '<=', '>=', '**', '//', '->', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', ':=', '@=',
  '+', '-', '*', '/', '%', '<', '>', '=', '(', ')', '[', ']', '{', '}', ',', ':', '.', ';', '@', '&', '|', '^', '~',
];
const OPEN = { '(': ')', '[': ']', '{': '}' };
const CLOSE = new Set([')', ']', '}']);

const isIdStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c > '\x7f';
const isIdPart = (c) => isIdStart(c) || (c >= '0' && c <= '9');
const isDigit = (c) => c >= '0' && c <= '9';

/**
 * @typedef {{ type: 'name'|'kw'|'int'|'float'|'str'|'fstr'|'op'|'newline'|'indent'|'dedent'|'eof',
 *   value: any, line: number, col: number, end?: number, raw?: string }} Token
 */

/**
 * @param {string} src
 * @param {{ line?: number, col?: number }} [offset] start position (for expressions in f-strings)
 * @returns {Token[]}
 */
export function tokenize(src, offset = {}) {
  return new Lexer(src, offset).run();
}

class Lexer {
  constructor(src, offset) {
    this.src = src.replace(/\r\n?/g, '\n');
    this.i = 0;
    this.line = offset.line ?? 1;
    this.lineStart = -(offset.col ?? 1) + 1;
    this.tokens = [];
    this.indents = [[0, 0]]; // [width with tab=8, width with tab=1] – different order = TabError
    this.brackets = [];
    this.inline = offset.line !== undefined; // expression in an f-string: no indentation
  }

  get col() { return this.i - this.lineStart + 1; }

  err(code, params = {}, line = this.line, col = this.col) { return new ScriptError(code, params, { line, col }); }

  push(type, value, line, col, extra = {}) {
    this.tokens.push({ type, value, line, col, ...extra });
  }

  run() {
    const s = this.src;
    let atLineStart = !this.inline;
    while (this.i < s.length) {
      if (atLineStart) {
        atLineStart = false;
        if (this.indentation()) continue;
      }
      const c = s[this.i];
      if (c === '\n') {
        if (!this.brackets.length && !this.inline && this.lastSignificant()) this.push('newline', null, this.line, this.col);
        this.i++; this.line++; this.lineStart = this.i;
        atLineStart = !this.brackets.length && !this.inline;
        continue;
      }
      if (c === ' ' || c === '\t' || c === '\f') { this.i++; continue; }
      if (c === '#') { while (this.i < s.length && s[this.i] !== '\n') this.i++; continue; }
      if (c === '\\' && s[this.i + 1] === '\n') { this.i += 2; this.line++; this.lineStart = this.i; continue; }
      if (isDigit(c) || (c === '.' && isDigit(s[this.i + 1] ?? ''))) { this.number(); continue; }
      if (isIdStart(c)) {
        // string prefixes: r, f, rf, fr (b for bytes does not exist)
        let j = this.i;
        while (j < s.length && isIdPart(s[j])) j++;
        const word = s.slice(this.i, j);
        if ((s[j] === '"' || s[j] === "'") && /^(r|f|rf|fr|u)$/i.test(word)) { this.string(word.toLowerCase()); continue; }
        if ((s[j] === '"' || s[j] === "'") && /^(b|br|rb)$/i.test(word)) throw this.err('notSupported', { feature: 'bytes' });
        this.push(KEYWORDS.has(word) ? 'kw' : 'name', word, this.line, this.col, { end: this.col + word.length });
        this.i = j;
        continue;
      }
      if (c === '"' || c === "'") { this.string(''); continue; }
      const op = OPERATORS.find((o) => s.startsWith(o, this.i));
      if (op) {
        const line = this.line, col = this.col;
        if (OPEN[op]) this.brackets.push({ op, line, col });
        else if (CLOSE.has(op)) {
          const top = this.brackets.pop();
          if (!top) throw this.err('unexpected', { token: op }, line, col);
          if (OPEN[top.op] !== op) throw this.err('unclosed', { bracket: top.op, line: top.line }, line, col);
        }
        this.push('op', op, line, col, { end: col + op.length });
        this.i += op.length;
        continue;
      }
      throw this.err('badChar', { char: c });
    }
    if (this.brackets.length) {
      const top = this.brackets[this.brackets.length - 1];
      throw this.err('unclosed', { bracket: top.op, line: top.line }, top.line, top.col);
    }
    if (!this.inline) {
      if (this.lastSignificant()) this.push('newline', null, this.line, this.col);
      while (this.indents.length > 1) { this.indents.pop(); this.push('dedent', null, this.line, 1); }
    }
    this.push('eof', null, this.line, this.col);
    return this.tokens;
  }

  /** Is there something before the line end that ends a logical line? */
  lastSignificant() {
    const t = this.tokens[this.tokens.length - 1];
    return !!t && t.type !== 'newline' && t.type !== 'indent' && t.type !== 'dedent';
  }

  /** Evaluate the indentation at the line start. @returns {boolean} true if the line was empty (already consumed) */
  indentation() {
    const s = this.src;
    let w8 = 0, w1 = 0, j = this.i;
    while (j < s.length && (s[j] === ' ' || s[j] === '\t' || s[j] === '\f')) {
      if (s[j] === '\t') { w8 = (Math.floor(w8 / 8) + 1) * 8; w1++; } else if (s[j] === ' ') { w8++; w1++; }
      j++;
    }
    // blank line or comment only: does not count
    if (j >= s.length || s[j] === '\n' || s[j] === '#') { this.i = j; return false; }
    if (s[j] === '\\' && s[j + 1] === '\n') { this.i = j; return false; }
    this.i = j;
    const [t8, t1] = this.indents[this.indents.length - 1];
    if (w8 > t8) {
      if (w1 <= t1) throw this.err('mixedIndent', {}, this.line, 1);
      this.indents.push([w8, w1]);
      this.push('indent', null, this.line, 1);
    } else if (w8 < t8) {
      while (this.indents.length > 1 && this.indents[this.indents.length - 1][0] > w8) {
        this.indents.pop();
        this.push('dedent', null, this.line, 1);
      }
      const [n8, n1] = this.indents[this.indents.length - 1];
      if (n8 !== w8) throw this.err('unindent', {}, this.line, 1);
      if (n1 !== w1) throw this.err('mixedIndent', {}, this.line, 1);
    } else if (w1 !== t1) throw this.err('mixedIndent', {}, this.line, 1);
    return false;
  }

  number() {
    const s = this.src, start = this.i, line = this.line, col = this.col;
    let j = this.i;
    const bad = () => this.err('badNumber', { text: s.slice(start, Math.max(j, start + 1)) }, line, col);
    if (s[j] === '0' && /[xXoObB]/.test(s[j + 1] ?? '')) {
      const base = { x: 16, o: 8, b: 2 }[s[j + 1].toLowerCase()];
      j += 2;
      const digits = base === 16 ? /[0-9a-fA-F_]/ : base === 8 ? /[0-7_]/ : /[01_]/;
      const d0 = j;
      while (j < s.length && digits.test(s[j])) j++;
      const txt = s.slice(d0, j).replace(/_/g, '');
      if (!txt || (j < s.length && isIdPart(s[j]))) throw bad();
      const v = parseInt(txt, base);
      const big = BigInt(s.slice(start, start + 2).toLowerCase() + txt);
      this.push('int', Number.isSafeInteger(v) ? v : big, line, col, { end: col + (j - start) });
      this.i = j;
      return;
    }
    let isFloat = false;
    while (j < s.length && (isDigit(s[j]) || s[j] === '_')) j++;
    if (s[j] === '.' && s[j + 1] !== '.') {
      isFloat = true; j++;
      while (j < s.length && (isDigit(s[j]) || s[j] === '_')) j++;
    }
    if (s[j] === 'e' || s[j] === 'E') {
      let k = j + 1;
      if (s[k] === '+' || s[k] === '-') k++;
      if (isDigit(s[k] ?? '')) {
        isFloat = true; j = k;
        while (j < s.length && isDigit(s[j])) j++;
      }
    }
    if (s[j] === 'j' || s[j] === 'J') throw this.err('notSupported', { feature: 'complex' }, line, col);
    if (j < s.length && isIdStart(s[j])) throw bad();
    const txt = s.slice(start, j).replace(/_/g, '');
    if (!isFloat && txt.length > 1 && txt[0] === '0' && /[1-9]/.test(txt)) throw bad();
    this.i = j;
    if (isFloat) this.push('float', Number(txt), line, col, { end: col + (j - start) });
    else {
      const v = Number(txt);
      // Large integers become BigInt (Python has no upper limit)
      this.push('int', Number.isSafeInteger(v) ? v : BigInt(txt), line, col, { end: col + (j - start) });
    }
  }

  /** @param {string} prefix '' | 'r' | 'f' | 'rf' | 'fr' | 'u' */
  string(prefix) {
    const s = this.src, line = this.line, col = this.col, startIndex = this.i;
    this.i += prefix.length;
    const q = s[this.i];
    const triple = s.startsWith(q.repeat(3), this.i);
    const delim = triple ? q.repeat(3) : q;
    this.i += delim.length;
    const raw = prefix.includes('r');
    const isF = prefix.includes('f');
    let out = '';
    const contentStart = { line: this.line, col: this.col };
    for (;;) {
      if (this.i >= s.length) throw this.err('unterminatedString', {}, line, col);
      const c = s[this.i];
      if (s.startsWith(delim, this.i)) { this.i += delim.length; break; }
      if (c === '\n') {
        if (!triple) throw this.err('unterminatedString', {}, line, col);
        out += c; this.i++; this.line++; this.lineStart = this.i;
        continue;
      }
      if (c === '\\') {
        const n = s[this.i + 1];
        if (n === undefined) throw this.err('unterminatedString', {}, line, col);
        if (n === '\n') { this.i += 2; this.line++; this.lineStart = this.i; if (raw) out += '\\\n'; continue; }
        if (raw || isF && (n === '{' || n === '}')) { out += c + n; this.i += 2; continue; }
        this.i += 2;
        switch (n) {
          case 'n': out += '\n'; break;
          case 't': out += '\t'; break;
          case 'r': out += '\r'; break;
          case '0': out += '\0'; break;
          case 'a': out += '\x07'; break;
          case 'b': out += '\b'; break;
          case 'f': out += '\f'; break;
          case 'v': out += '\v'; break;
          case '\\': case "'": case '"': out += n; break;
          case 'x': case 'u': case 'U': {
            const len = n === 'x' ? 2 : n === 'u' ? 4 : 8;
            const hex = s.slice(this.i, this.i + len);
            if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(hex)) throw this.err('unterminatedString', {}, line, col);
            out += String.fromCodePoint(parseInt(hex, 16));
            this.i += len;
            break;
          }
          default: out += '\\' + n; // unknown escapes stay (as in Python)
        }
        continue;
      }
      out += c; this.i++;
    }
    const end = this.line === line ? col + (this.i - startIndex) : undefined;
    if (isF) this.push('fstr', out, line, col, { contentStart, raw, endLine: this.line, end });
    else this.push('str', out, line, col, { endLine: this.line, end });
  }
}

/**
 * For the editor: tokens as colour classes, without throwing errors (incomplete code is normal).
 * @param {string} src
 * @returns {{ from: number, to: number, cls: string }[]} character ranges in the source text
 */
export function highlightRanges(src) {
  const out = [];
  const s = src;
  let i = 0;
  let prevWord = '';
  while (i < s.length) {
    const c = s[i];
    if (c === '#') { const j = s.indexOf('\n', i); const e = j < 0 ? s.length : j; out.push({ from: i, to: e, cls: 'comment' }); i = e; continue; }
    if (isIdStart(c)) {
      let j = i;
      while (j < s.length && isIdPart(s[j])) j++;
      const w = s.slice(i, j);
      if ((s[j] === '"' || s[j] === "'") && /^(r|f|rf|fr|u|b)$/i.test(w)) { i = scanString(s, i, j, out); prevWord = ''; continue; }
      let cls = null;
      if (w === 'True' || w === 'False' || w === 'None') cls = 'const';
      else if (KEYWORDS.has(w)) cls = 'kw';
      else if (prevWord === 'def') cls = 'def';
      else if (BUILTIN_NAMES.has(w) && s[i - 1] !== '.') cls = 'builtin';
      else {
        let k = j;
        while (s[k] === ' ') k++;
        if (s[k] === '(') cls = 'call';
      }
      if (cls) out.push({ from: i, to: j, cls });
      prevWord = w;
      i = j;
      continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(s[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < s.length && (isIdPart(s[j]) || s[j] === '.' || ((s[j] === '+' || s[j] === '-') && /[eE]/.test(s[j - 1])))) j++;
      out.push({ from: i, to: j, cls: 'num' });
      i = j;
      continue;
    }
    if (c === '"' || c === "'") { i = scanString(s, i, i, out); prevWord = ''; continue; }
    if (c === '@') {
      let j = i + 1;
      while (j < s.length && (isIdPart(s[j]) || s[j] === '.')) j++;
      out.push({ from: i, to: j, cls: 'deco' });
      i = j;
      continue;
    }
    if (c !== ' ' && c !== '\n' && c !== '\t') prevWord = '';
    i++;
  }
  return out;
}

function scanString(s, start, qpos, out) {
  const q = s[qpos];
  const triple = s.startsWith(q.repeat(3), qpos);
  const delim = triple ? q.repeat(3) : q;
  let j = qpos + delim.length;
  while (j < s.length) {
    if (s[j] === '\\') { j += 2; continue; }
    if (s.startsWith(delim, j)) { j += delim.length; break; }
    if (s[j] === '\n' && !triple) break;
    j++;
  }
  out.push({ from: start, to: Math.min(j, s.length), cls: 'str' });
  return Math.min(j, s.length);
}

/** Built-in functions for highlighting (the VM knows the same ones, see builtins.js). */
export const BUILTIN_NAMES = new Set([
  'print', 'len', 'range', 'int', 'float', 'str', 'bool', 'list', 'tuple', 'dict', 'abs', 'min', 'max', 'sum',
  'sorted', 'reversed', 'enumerate', 'zip', 'round', 'type', 'isinstance', 'any', 'all', 'map', 'filter', 'chr', 'ord',
  'divmod', 'pow', 'repr', 'hex', 'bin', 'oct', 'iter', 'next', 'hash', 'callable', 'set', 'input',
]);
