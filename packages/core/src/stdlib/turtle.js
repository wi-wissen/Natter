// _turtle_host: what the Python module `turtle` needs from the host. Drawing commands go to host.turtle(kind, args, task);
// its return value is the number of seconds the program waits (the animation). Events come back through next_event.

import { PyFloat, PyTuple, PyList, Suspend } from '../values.js';
import { params, needStr } from '../args.js';

/** Python value → plain JavaScript value for the host. */
export function toHost(v) {
  if (v instanceof PyFloat) return v.v;
  if (v instanceof PyTuple || v instanceof PyList) return v.items.map(toHost);
  if (v && typeof v === 'object' && typeof v[Symbol.iterator] === 'function' && !(v instanceof String)) return Array.from(v, toHost);
  if (v && typeof v === 'object' && 'items' in v && Array.isArray(v.items)) return v.items.map(toHost);
  return v;
}

export const TURTLE_NATIVES = {
  '_turtle_host.cmd'(ctx, args, kw) {
    const [kind, a] = params('cmd', args, kw, ['kind', 'args']);
    const wait = ctx.vm.host.turtle?.(needStr(kind, 'kind'), toHost(a), ctx.task);
    return typeof wait === 'number' && wait > 0 ? new Suspend({ kind: 'sleep', seconds: wait }) : null;
  },
  '_turtle_host.ask'(ctx, args, kw) {
    const [kind, title, prompt] = params('ask', args, kw, ['kind', 'title', 'prompt']);
    return new Suspend({ kind: 'input', prompt: `${title}: ${prompt} `, dialog: kind });
  },
  '_turtle_host.timer'(ctx, args, kw) {
    const [ms, fun] = params('timer', args, kw, ['ms', 'fun']);
    const vm = ctx.vm;
    (vm.turtleTimers ??= []).push({ id: (vm.turtleTimerId = (vm.turtleTimerId ?? 0) + 1), ms: typeof ms === 'number' ? ms : ms.v, fun });
    return null;
  },
  '_turtle_host.next_event'(ctx) {
    const vm = ctx.vm;
    const timers = (vm.turtleTimers ?? []).map((t) => ({ id: t.id, ms: t.ms }));
    return new Suspend({ kind: 'turtle-event', timers });
  },
};
export const TURTLE_NAMES = ['cmd', 'ask', 'timer', 'next_event'];

/** For the host: the value to resume a waiting mainloop with. kind: 'key' | 'keyrelease' | 'click' | 'timer'; for 'timer' pass the timer id. */
export function turtleEvent(vm, kind, ...args) {
  if (kind === 'timer') {
    const i = (vm.turtleTimers ?? []).findIndex((t) => t.id === args[0]);
    if (i < 0) return null;
    const [t] = vm.turtleTimers.splice(i, 1);
    return new PyTuple(['timer', t.fun]);
  }
  return new PyTuple([kind, ...args.map((a) => (typeof a === 'number' && !Number.isInteger(a) ? new PyFloat(a) : a))]);
}
