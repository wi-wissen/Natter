// _forms_host: what the Python module `guizero` needs from the host. The module keeps the widget tree and all property
// values itself and tells the host about changes through host.forms(op, data, task) (see docs/FORMS-BRIDGE.md).
// Waiting for events (app.display(), app.update()) and dialogs suspend the program; the host resumes it with formsEvent().

import { PyFloat, PyTuple, PyList, PyDict, PyFunction, PyMethod, Suspend } from '../values.js';
import { params, needStr, needInt } from '../args.js';
import { tkColor } from './tkcolors.js';

/** Python value → plain JavaScript value for the host (dicts become objects, tuples and lists arrays). */
export function toJS(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof PyFloat) return v.v;
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof PyTuple || v instanceof PyList) return v.items.map(toJS);
  if (v instanceof PyDict) {
    const o = {};
    for (const [k, x] of v.entries()) o[String(k)] = toJS(x);
    return o;
  }
  return v;
}

/** Plain JavaScript value from the host → Python value. */
export function fromJS(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return Number.isInteger(v) ? v : new PyFloat(v);
  if (Array.isArray(v)) return new PyList(v.map(fromJS));
  return v;
}

/** Number of arguments a callback expects, counted like guizero's no_args_expected (a leading `self` is not counted). */
function argCount(vm, f) {
  let fn = f, bound = false;
  if (f instanceof PyMethod) { fn = f.fn; bound = true; }
  if (!(fn instanceof PyFunction)) return 0;
  const names = vm.codes[fn.code]?.params ?? [];
  if (names.length && (bound || names[0] === 'self')) return names.length - 1;
  return names.length;
}

const timersOf = (vm) => (vm.formsTimers ??= []);

export const FORMS_NATIVES = {
  '_forms_host.cmd'(ctx, args, kw) {
    const [op, data] = params('cmd', args, kw, ['op', 'data']);
    const kind = needStr(op, 'op');
    const r = ctx.vm.host.forms?.(kind, toJS(data), ctx.task);
    // only the 'image' query answers: { width, height } of a picture file, or nothing when it cannot be loaded
    if (kind === 'image') return r && typeof r === 'object' ? new PyTuple([r.width | 0, r.height | 0]) : null;
    return null;
  },
  '_forms_host.color'(ctx, args, kw) {
    const [name] = params('color', args, kw, ['name']);
    return tkColor(needStr(name, 'name'));
  },
  '_forms_host.argcount'(ctx, args, kw) {
    const [f] = params('argcount', args, kw, ['f']);
    return argCount(ctx.vm, f);
  },
  '_forms_host.after'(ctx, args, kw) {
    const [ms] = params('after', args, kw, ['ms']);
    const vm = ctx.vm, t = needInt(ms, 'ms');
    const id = (vm.formsTimerId = (vm.formsTimerId ?? 0) + 1);
    timersOf(vm).push({ id, ms: t, due: vm.virtualMs + Math.max(0, t) });
    vm.host.forms?.('after', { timer: id, ms: t }, ctx.task);
    return id;
  },
  '_forms_host.cancel'(ctx, args, kw) {
    const [id] = params('cancel', args, kw, ['id']);
    const list = timersOf(ctx.vm), i = list.findIndex((t) => t.id === id);
    if (i >= 0) { list.splice(i, 1); ctx.vm.host.forms?.('cancel', { timer: id }, ctx.task); }
    return null;
  },
  '_forms_host.next_event'(ctx, args, kw) {
    const [poll] = params('next_event', args, kw, ['poll']);
    const timers = timersOf(ctx.vm).map((t) => ({ id: t.id, ms: t.ms, due: t.due }));
    return new Suspend({ kind: 'forms-event', poll: !!poll, timers });
  },
  '_forms_host.dialog'(ctx, args, kw) {
    const [kind, title, text, initial] = params('dialog', args, kw, ['kind', 'title', 'text', 'initial']);
    return new Suspend({ kind: 'forms-dialog', dialog: needStr(kind, 'kind'), title: String(title), text: String(text), initial: toJS(initial) });
  },
};
export const FORMS_NAMES = ['cmd', 'color', 'argcount', 'after', 'cancel', 'next_event', 'dialog'];

/**
 * For the host: the value to resume a program that waits with `wait.kind === 'forms-event'`.
 * kind: 'timer' (timer id), 'command' (id), 'change' (id, value), 'mouse' (id, type, x, y, display_x, display_y),
 * 'key' (id, 'press' | 'release', char, keysym, keycode), 'menu' (id, menu, item), 'close' (id), 'resize' (id, width, height).
 * Returns null for a timer that no longer exists.
 */
export function formsEvent(vm, kind, ...args) {
  if (kind === 'timer') {
    const list = timersOf(vm), i = list.findIndex((t) => t.id === args[0]);
    if (i < 0) return null;
    list.splice(i, 1);
  }
  return new PyTuple([kind, ...args.map(fromJS)]);
}

/**
 * Headless run (tests, runToEnd): the answer to a forms wait without a page. Timers fire in the order they are due and
 * the virtual clock jumps ahead; with no timers left the event loop ends. Dialogs are answered with null (cancel).
 */
export function formsHeadless(vm, wait) {
  if (wait.kind === 'forms-dialog') return wait.dialog === 'yesno' ? false : null;
  const list = timersOf(vm);
  if (!list.length) return null;
  let next = list[0];
  for (const t of list) if (t.due < next.due) next = t;
  if (wait.poll && next.due > vm.virtualMs) return null;
  vm.virtualMs = Math.max(vm.virtualMs, next.due);
  return formsEvent(vm, 'timer', next.id);
}
