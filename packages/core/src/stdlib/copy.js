// copy: shallow and deep copies of the built-in containers and of instances of classes.

import { PyList, PyTuple, PyDict, PySet, PyInstance, callDunder, definesDunder, NO_METHOD } from '../values.js';
import { params } from '../args.js';

function shallow(v) {
  if (v instanceof PyList) return new PyList(v.items.slice());
  if (v instanceof PyDict) { const d = new PyDict(); for (const [k, x] of v.entries()) d.set(k, x); return d; }
  if (v instanceof PySet) { const s = new PySet(v.frozen); for (const x of v.items()) s.add(x); return s; }
  if (v instanceof PyInstance && definesDunder(v.cls, '__copy__')) { const r = callDunder(v, '__copy__'); if (r !== NO_METHOD) return r; }
  if (v instanceof PyInstance) { const c = new PyInstance(v.cls); for (const [k, x] of v.dict) c.dict.set(k, x); c.scriptError = v.scriptError; return c; }
  return v; // numbers, texts, tuples, functions … are shared
}

function deep(v, memo) {
  if (memo.has(v)) return memo.get(v);
  if (v instanceof PyList) { const c = new PyList([]); memo.set(v, c); c.items = v.items.map((x) => deep(x, memo)); return c; }
  if (v instanceof PyTuple) {
    const c = new PyTuple(v.items.map((x) => deep(x, memo)));
    const same = c.items.every((x, i) => x === v.items[i]);
    const r = same ? v : c;
    memo.set(v, r);
    return r;
  }
  if (v instanceof PyDict) { const c = new PyDict(); memo.set(v, c); for (const [k, x] of v.entries()) c.set(deep(k, memo), deep(x, memo)); return c; }
  if (v instanceof PySet) { const c = new PySet(v.frozen); memo.set(v, c); for (const x of v.items()) c.add(deep(x, memo)); return c; }
  if (v instanceof PyInstance && definesDunder(v.cls, '__deepcopy__')) {
    const r = callDunder(v, '__deepcopy__', [new PyDict()]);
    if (r !== NO_METHOD) { memo.set(v, r); return r; }
  }
  if (v instanceof PyInstance) {
    const c = new PyInstance(v.cls);
    memo.set(v, c);
    for (const [k, x] of v.dict) c.dict.set(k, deep(x, memo));
    return c;
  }
  return v;
}

export const COPY_NATIVES = {
  'copy.copy': (ctx, args, kw) => shallow(params('copy', args, kw, ['x'])[0]),
  'copy.deepcopy': (ctx, args, kw) => deep(params('deepcopy', args, kw, ['x', '?memo'])[0], new Map()),
};
export const COPY_NAMES = ['copy', 'deepcopy'];
