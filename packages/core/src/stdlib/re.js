// _re: regular expressions on top of the JavaScript engine. The pattern is translated from Python's syntax
// (named groups, \A \Z, $ before a final newline, Unicode \w \d \s \b, verbose mode) and run with the
// "u" flag. Positions are code point indices like in Python. The Python module `re` builds on these natives.

import { PyTuple } from '../values.js';
import { params, needStr, needInt } from '../args.js';

export const FLAGS = { I: 2, L: 4, M: 8, S: 16, U: 32, X: 64, A: 256 };

const W = '\\p{L}\\p{N}_';
const WORD_BOUNDARY = `(?:(?<=[${W}])(?![${W}])|(?<![${W}])(?=[${W}]))`;
const NOT_WORD_BOUNDARY = `(?:(?<=[${W}])(?=[${W}])|(?<![${W}])(?![${W}]))`;
const SYNTAX = new Set('^$\\.*+?()[]{}|/'.split(''));

class PatternError extends Error {}

/** Python pattern → { source, groups, names } for a JavaScript RegExp (flags "u" plus i, m, s). */
function translate(pat, flags) {
  const ascii = !!(flags & FLAGS.A);
  const verbose = !!(flags & FLAGS.X);
  const multiline = !!(flags & FLAGS.M);
  const dotall = !!(flags & FLAGS.S);
  const word = ascii ? 'a-zA-Z0-9_' : W;
  const digit = ascii ? '0-9' : '\\p{Nd}';
  const space = ascii ? ' \\t\\n\\r\\f\\v' : '\\s';
  let out = '';
  let groups = 0;
  const names = [];
  const chars = Array.from(pat);
  let i = 0;
  let inClass = false;
  let negs = [];
  let items = '';
  let neg = false;
  const fail = (m) => { throw new PatternError(m); };
  const escape = () => {
    const c = chars[++i];
    if (c === undefined) fail('bad escape (end of pattern)');
    i++;
    switch (c) {
      case 'd': return inClass ? digit : `[${digit}]`;
      case 'D': if (inClass) { negs.push(digit); return ''; } return `[^${digit}]`;
      case 'w': return inClass ? word : `[${word}]`;
      case 'W': if (inClass) { negs.push(word); return ''; } return `[^${word}]`;
      case 's': return inClass ? space : `[${space}]`;
      case 'S': if (inClass) { negs.push(space); return ''; } return `[^${space}]`;
      case 'b': return inClass ? '\\x08' : (ascii ? '\\b' : WORD_BOUNDARY);
      case 'B': return ascii ? '\\B' : NOT_WORD_BOUNDARY;
      case 'A': return '(?<![\\s\\S])';
      case 'Z': return '(?![\\s\\S])';
      case 'n': case 't': case 'r': case 'f': case 'v': return `\\${c}`;
      case 'a': return '\\x07';
      case '0': return '\\0';
      case 'x': { const h = chars.slice(i, i + 2).join(''); if (!/^[0-9a-fA-F]{2}$/.test(h)) fail('incomplete escape \\x'); i += 2; return `\\x${h}`; }
      case 'u': { const h = chars.slice(i, i + 4).join(''); if (!/^[0-9a-fA-F]{4}$/.test(h)) fail('incomplete escape \\u'); i += 4; return `\\u${h}`; }
      case 'U': { const h = chars.slice(i, i + 8).join(''); if (!/^[0-9a-fA-F]{8}$/.test(h)) fail('incomplete escape \\U'); i += 8; return `\\u{${parseInt(h, 16).toString(16)}}`; }
      default:
        if (/[1-9]/.test(c)) {
          let n = c;
          while (/[0-9]/.test(chars[i] ?? '') && n.length < 2) n += chars[i++];
          if (!inClass && Number(n) > groups) fail(`invalid group reference ${n}`);
          return `\\${n}`;
        }
        if (/[a-zA-Z]/.test(c)) fail(`bad escape \\${c}`);
        if (SYNTAX.has(c) || (inClass && c === '-')) return `\\${c}`;
        return c.replace(/[\\]/g, '\\\\');
    }
  };
  while (i < chars.length) {
    const c = chars[i];
    if (inClass) {
      if (c === ']') {
        inClass = false; i++;
        // a class with \D, \W or \S inside: JavaScript has no such class item, so it becomes an alternative or a lookahead
        if (!negs.length) out += `[${neg ? '^' : ''}${items}]`;
        else if (neg) out += '(?:' + negs.map((x) => `(?=[${x}])`).join('') + (items ? `[^${items}]` : '[\\s\\S]') + ')';
        else out += `(?:${items ? `[${items}]|` : ''}${negs.map((x) => `[^${x}]`).join('|')})`;
        negs = [];
      } else if (c === '\\') items += escape();
      else if (c === '[') { items += '\\['; i++; } else { items += c; i++; }
      continue;
    }
    if (verbose && /\s/.test(c)) { i++; continue; }
    if (verbose && c === '#') { while (i < chars.length && chars[i] !== '\n') i++; continue; }
    if (c === '\\') { out += escape(); continue; }
    if (c === '[') {
      inClass = true; i++; items = ''; neg = false;
      if (chars[i] === '^') { neg = true; i++; }
      if (chars[i] === ']') { items += '\\]'; i++; }
      continue;
    }
    if (c === '(') {
      if (chars[i + 1] === '?') {
        const rest = chars.slice(i + 2, i + 4).join('');
        if (rest.startsWith('P<')) {
          let j = i + 4; let name = '';
          while (j < chars.length && chars[j] !== '>') name += chars[j++];
          if (!/^[A-Za-z_]\w*$/.test(name)) fail(`bad character in group name '${name}'`);
          if (names.some((n) => n[0] === name)) fail(`redefinition of group name '${name}'`);
          groups++; names.push([name, groups]);
          out += `(?<${name}>`; i = j + 1; continue;
        }
        if (rest.startsWith('P=')) {
          let j = i + 4; let name = '';
          while (j < chars.length && chars[j] !== ')') name += chars[j++];
          if (!names.some((n) => n[0] === name)) fail(`unknown group name '${name}'`);
          out += `\\k<${name}>`; i = j + 1; continue;
        }
        if (rest[0] === '#') { while (i < chars.length && chars[i] !== ')') i++; i++; continue; }
        if (rest[0] === ':' || rest[0] === '=' || rest[0] === '!') { out += `(?${rest[0]}`; i += 3; continue; }
        if (rest[0] === '<' && (rest[1] === '=' || rest[1] === '!')) { out += `(?<${rest[1]}`; i += 4; continue; }
        fail('this regex feature is not supported');
      }
      groups++; out += '('; i++; continue;
    }
    if (c === '.') { out += dotall ? '[\\s\\S]' : '[^\\n]'; i++; continue; }
    if (c === '$') { out += multiline ? '(?=\\n|(?![\\s\\S]))' : '(?=\\n?(?![\\s\\S]))'; i++; continue; }
    if (c === '{') {
      // a "{" that is not a repeat is a plain character in Python
      const m = /^\{(\d*)(,(\d*))?\}/.exec(chars.slice(i).join(''));
      if (m && (m[1] !== '' || m[2] !== undefined)) { out += m[1] === '' ? `{0,${m[3] ?? ''}}` : m[0]; i += m[0].length; } else { out += '\\{'; i++; }
      continue;
    }
    if (c === '}') { out += '\\}'; i++; continue; }
    if (c === '/') { out += '\\/'; i++; continue; }
    out += c; i++;
  }
  if (inClass) fail('unterminated character set');
  return { source: out, groups, names };
}

const cache = new Map();
/** Compiled form of (pattern, flags), or throws PatternError. */
function compile(pat, flags, anchor) {
  // global flags at the start: (?i) (?ms) ...
  for (let m; (m = /^\(\?([aiLmsux]+)\)/.exec(pat));) {
    for (const ch of m[1]) flags |= { a: FLAGS.A, i: FLAGS.I, L: FLAGS.L, m: FLAGS.M, s: FLAGS.S, u: FLAGS.U, x: FLAGS.X }[ch];
    pat = pat.slice(m[0].length);
  }
  const key = `${flags}|${anchor}|${pat}`;
  let c = cache.get(key);
  if (c) return c;
  const t = translate(pat, flags);
  let source = t.source;
  if (anchor === 'full') source = `(?:${source})(?![\\s\\S])`;
  let re;
  try {
    re = new RegExp(source, `du${flags & FLAGS.I ? 'i' : ''}${flags & FLAGS.M ? 'm' : ''}${anchor ? 'y' : 'g'}`);
  } catch (e) {
    throw new PatternError(String(e.message).replace(/^Invalid regular expression: \/.*\/[a-z]*: /, ''));
  }
  c = { re, groups: t.groups, names: t.names };
  if (cache.size > 200) cache.clear();
  cache.set(key, c);
  return c;
}

const astral = (s) => /[\uD800-\uDFFF]/.test(s);
/** Index conversion between UTF-16 and code points (only needed when the text has surrogate pairs). */
function toUnits(s, cp) { let u = 0; for (let n = 0; n < cp; n++) u += s.codePointAt(u) > 0xFFFF ? 2 : 1; return u; }
function toPoints(s, u) { let n = 0; for (let k = 0; k < u; k++) { if (s.codePointAt(k) > 0xFFFF) k++; n++; } return n; }

export const RE_NATIVES = {
  /** _re.info(pattern, flags) -> (groups, (name, index, ...)) or (None, message) */
  '_re.info'(ctx, args, kw) {
    const [pat, flags] = params('info', args, kw, ['pattern', 'flags']);
    try {
      const t = compile(needStr(pat, 'pattern'), needInt(flags, 'flags'), 'search');
      return new PyTuple([t.groups, new PyTuple(t.names.flat())]);
    } catch (e) {
      if (e instanceof PatternError) return new PyTuple([null, e.message]);
      throw e;
    }
  },
  /** _re.run(pattern, flags, string, pos, endpos, mode) -> None or (start0, end0, start1, end1, ...) ; mode: 0 search, 1 match, 2 fullmatch */
  '_re.run'(ctx, args, kw) {
    const [pat, flags, string, pos, endpos, mode] = params('run', args, kw, ['pattern', 'flags', 'string', 'pos', 'endpos', 'mode']);
    const t = compile(pat, flags, ['', 'match', 'full'][mode] || '');
    let s = string;
    const wide = astral(s);
    let from = pos, to = endpos;
    if (wide) { from = toUnits(s, pos); to = to === null ? null : toUnits(s, to); }
    if (to !== null && to < s.length) s = s.slice(0, to);
    t.re.lastIndex = from;
    const m = t.re.exec(s);
    if (!m) return null;
    const out = [];
    for (let g = 0; g <= t.groups; g++) {
      const ind = m.indices[g];
      if (!ind) { out.push(-1, -1); continue; }
      out.push(wide ? toPoints(string, ind[0]) : ind[0], wide ? toPoints(string, ind[1]) : ind[1]);
    }
    return new PyTuple(out);
  },
};
export const RE_NAMES = ['info', 'run'];
