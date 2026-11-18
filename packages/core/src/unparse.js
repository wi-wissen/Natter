// Annotations as text, the way CPython's ast.unparse writes them (used with `from __future__ import annotations`).

import { reprStr, formatFloat, PyFloat } from './values.js';

const BIN = { '|': 1, '^': 2, '&': 3, '<<': 4, '>>': 4, '+': 5, '-': 5, '*': 6, '/': 6, '//': 6, '%': 6, '@': 6, '**': 8 };

/** @param {any} e expression node @param {number} [outer] precedence of the surrounding operator */
export function unparse(e, outer = 0) {
  const wrap = (p, text) => (p < outer ? `(${text})` : text);
  switch (e.type) {
    case 'Name': return e.id;
    case 'Const': {
      const v = e.value;
      if (e.ellipsis) return '...';
      if (v === null) return 'None';
      if (v === true) return 'True';
      if (v === false) return 'False';
      if (typeof v === 'string') return reprStr(v);
      if (v instanceof PyFloat) return formatFloat(v.v);
      return String(v);
    }
    case 'Attribute': return `${unparse(e.value, 9)}.${e.attr}`;
    case 'Subscript': {
      const i = e.index;
      const inner = i.type === 'Tuple' && i.elts.length ? i.elts.map((x) => unparse(x)).join(', ') : unparse(i);
      return `${unparse(e.value, 9)}[${inner}]`;
    }
    case 'Slice': return `${e.lower ? unparse(e.lower) : ''}:${e.upper ? unparse(e.upper) : ''}${e.step ? ':' + unparse(e.step) : ''}`;
    case 'Tuple': return e.elts.length === 1 ? `(${unparse(e.elts[0])},)` : `(${e.elts.map((x) => unparse(x)).join(', ')})`;
    case 'List': return `[${e.elts.map((x) => unparse(x)).join(', ')}]`;
    case 'Set': return `{${e.elts.map((x) => unparse(x)).join(', ')}}`;
    case 'Dict': return `{${e.keys.map((k, i) => (k ? `${unparse(k)}: ${unparse(e.values[i])}` : `**${unparse(e.values[i])}`)).join(', ')}}`;
    case 'Starred': return `*${unparse(e.value, 7)}`;
    case 'BinOp': {
      const p = BIN[e.op] ?? 5;
      const right = e.op === '**' ? p : p + 0.5;
      const left = e.op === '**' ? p + 0.5 : p;
      return wrap(p, `${unparse(e.left, left)} ${e.op} ${unparse(e.right, right)}`);
    }
    case 'UnaryOp': return e.op === 'not' ? wrap(-1, `not ${unparse(e.operand, -1)}`) : wrap(7, `${e.op}${unparse(e.operand, 7)}`);
    case 'BoolOp': { const p = e.op === 'or' ? -3 : -2; return wrap(p, e.values.map((v) => unparse(v, p + 0.5)).join(` ${e.op} `)); }
    case 'Compare': return wrap(0, unparse(e.left, 0.5) + e.ops.map((o, i) => ` ${o} ${unparse(e.comparators[i], 0.5)}`).join(''));
    case 'IfExp': return wrap(-4, `${unparse(e.body, -3.5)} if ${unparse(e.test, -3.5)} else ${unparse(e.orelse, -4)}`);
    case 'Call': {
      const args = [...e.args.map((a) => unparse(a)), ...e.keywords.map((k) => (k.name ? `${k.name}=${unparse(k.value)}` : `**${unparse(k.value)}`))];
      return `${unparse(e.func, 9)}(${args.join(', ')})`;
    }
    default: throw new Error(`unparse: ${e.type}`);
  }
}
