// _json: JSON text from and to Python values (dumps and loads), with Python's formatting.

import { PyFloat, PyList, PyTuple, PyDict, PyInstance, formatFloat, isNum, num, typeName, normBig, reprStr } from '../values.js';
import { err, params, needInt } from '../args.js';
import { ScriptError } from '../errors.js';

function escape(s, ascii) {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (c < 0x20 || (ascii && c > 0x7e)) {
      if (c > 0xffff) { const h = c - 0x10000; out += `\\u${(0xd800 + (h >> 10)).toString(16)}\\u${(0xdc00 + (h & 0x3ff)).toString(16)}`; }
      else out += `\\u${c.toString(16).padStart(4, '0')}`;
    } else out += ch;
  }
  return out + '"';
}

function dumps(ctx, v, o, level, seen) {
  if (v === null || v === undefined) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (typeof v === 'string') return escape(v, o.ascii);
  if (isNum(v)) {
    if (v instanceof PyFloat) {
      if (Number.isNaN(v.v)) return 'NaN';
      if (!Number.isFinite(v.v)) return v.v > 0 ? 'Infinity' : '-Infinity';
      return formatFloat(v.v);
    }
    return String(num(v));
  }
  const nl = (lv) => (o.indent === null ? '' : `\n${o.indent.repeat(lv)}`);
  const items = (open, close, parts, lv) => {
    if (!parts.length) return open + close;
    if (o.indent === null) return open + parts.join(o.itemSep) + close;
    return open + nl(lv + 1) + parts.join(o.itemSep + nl(lv + 1)) + nl(lv) + close;
  };
  if (v instanceof PyList || v instanceof PyTuple) {
    if (seen.has(v)) throw err('value', { what: 'circular' });
    seen.add(v);
    const r = items('[', ']', v.items.map((x) => dumps(ctx, x, o, level + 1, seen)), level);
    seen.delete(v);
    return r;
  }
  if (v instanceof PyDict) {
    if (seen.has(v)) throw err('value', { what: 'circular' });
    seen.add(v);
    let entries = v.entries();
    if (o.sortKeys) entries = entries.slice().sort((a, b) => (keyText(a[0]) < keyText(b[0]) ? -1 : keyText(a[0]) > keyText(b[0]) ? 1 : 0));
    const parts = entries.map(([k, x]) => `${escape(keyText(k, true), o.ascii)}${o.keySep}${dumps(ctx, x, o, level + 1, seen)}`);
    seen.delete(v);
    return items('{', '}', parts, level);
  }
  if (o.default) return dumps(ctx, ctx.vm.callSync(o.default, [v], null, ctx.task), o, level, seen);
  throw err('type', { what: 'jsonType', type: typeName(v) });
}

/** A dictionary key as JSON wants it: texts stay, numbers, booleans and None become text. */
function keyText(k, strict = false) {
  if (typeof k === 'string') return k;
  if (k === null) return 'null';
  if (k === true) return 'true';
  if (k === false) return 'false';
  if (k instanceof PyFloat) return formatFloat(k.v);
  if (isNum(k)) return String(num(k));
  if (strict) throw err('type', { what: 'jsonKey', type: typeName(k) });
  return String(k);
}

/** Parser for JSON text that keeps integers and floats apart (JSON.parse cannot). */
function parse(text) {
  let i = 0;
  const fail = (msg, at = i) => {
    const before = text.slice(0, at);
    const lineno = before.split('\n').length, colno = at - before.lastIndexOf('\n');
    throw err('jsonDecode', { msg, pos: at, lineno, colno });
  };
  const ws = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i++; };
  function value() {
    ws();
    const c = text[i];
    if (c === '{') return object();
    if (c === '[') return array();
    if (c === '"') return string();
    if (text.startsWith('true', i)) { i += 4; return true; }
    if (text.startsWith('false', i)) { i += 5; return false; }
    if (text.startsWith('null', i)) { i += 4; return null; }
    if (text.startsWith('NaN', i)) { i += 3; return new PyFloat(NaN); }
    if (text.startsWith('Infinity', i)) { i += 8; return new PyFloat(Infinity); }
    if (text.startsWith('-Infinity', i)) { i += 9; return new PyFloat(-Infinity); }
    const m = /^-?(?:0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) fail('Expecting value');
    i += m[0].length;
    if (m[1] || m[2]) return new PyFloat(Number(m[0]));
    const n = BigInt(m[0]);
    return normBig(n);
  }
  function string() {
    const start = i;
    i++;
    let out = '';
    for (;;) {
      if (i >= text.length) fail('Unterminated string starting at', start);
      const c = text[i];
      if (c === '"') { i++; return out; }
      if (c === '\\') {
        const e = text[i + 1];
        const map = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (e === 'u') {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Invalid \\uXXXX escape', i + 1);
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else if (map[e] !== undefined) { out += map[e]; i += 2; } else fail('Invalid \\escape', i);
      } else if (c < ' ') fail('Invalid control character at', i);
      else { out += c; i++; }
    }
  }
  function array() {
    i++;
    const items = [];
    ws();
    if (text[i] === ']') { i++; return new PyList(items); }
    for (;;) {
      items.push(value());
      ws();
      if (text[i] === ',') { const at = i; i++; ws(); if (text[i] === ']') fail('Illegal trailing comma before end of array', at); continue; }
      if (text[i] === ']') { i++; return new PyList(items); }
      fail("Expecting ',' delimiter");
    }
  }
  function object() {
    i++;
    const d = new PyDict();
    ws();
    if (text[i] === '}') { i++; return d; }
    for (;;) {
      ws();
      if (text[i] !== '"') fail('Expecting property name enclosed in double quotes');
      const k = string();
      ws();
      if (text[i] !== ':') fail("Expecting ':' delimiter");
      i++;
      d.set(k, value());
      ws();
      if (text[i] === ',') { const at = i; i++; ws(); if (text[i] === '}') fail('Illegal trailing comma before end of object', at); continue; }
      if (text[i] === '}') { i++; return d; }
      fail("Expecting ',' delimiter");
    }
  }
  const v = value();
  ws();
  if (i < text.length) fail('Extra data');
  return v;
}

export const JSON_NATIVES = {
  '_json.dumps'(ctx, args, kw) {
    const [obj, indent, sortKeys, ascii, sepItem, sepKey, dflt] = params('dumps', args, kw, ['obj', '?indent', '?sort_keys', '?ensure_ascii', '?item_separator', '?key_separator', '?default']);
    let ind = null;
    if (indent !== undefined && indent !== null) ind = typeof indent === 'string' ? indent : ' '.repeat(needInt(indent, 'indent'));
    const o = {
      indent: ind,
      sortKeys: !!sortKeys,
      ascii: ascii === undefined ? true : !!ascii,
      itemSep: sepItem ?? (ind === null ? ', ' : ','),
      keySep: sepKey ?? ': ',
      default: dflt ?? null,
    };
    return dumps(ctx, obj, o, 0, new Set());
  },
  '_json.loads'(ctx, args, kw) {
    const [s] = params('loads', args, kw, ['s']);
    if (typeof s !== 'string') throw err('type', { what: 'jsonText', type: typeName(s) });
    try { return new PyTuple([true, parse(s)]); } catch (e) {
      if (e instanceof ScriptError && e.code === 'err.script.jsonDecode') return new PyTuple([false, e.params.msg, e.params.pos]);
      throw e;
    }
  },
};
export const JSON_NAMES = ['dumps', 'loads'];
export { reprStr, PyInstance };
