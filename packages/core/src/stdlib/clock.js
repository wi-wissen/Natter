// _time: the clock and sleeping. The VM has a virtual clock unless the host brings a real one (host.now, host.epoch).
// With the virtual clock a program that sleeps needs no real waiting and always prints the same.

import { PyFloat, Suspend } from '../values.js';
import { err, params, needNum } from '../args.js';

/** Milliseconds since the program started: the host's clock if it has one, else the virtual one. */
export const clockMs = (vm) => (vm.host.now ? vm.host.now() : vm.virtualMs);
/** Seconds since 1970-01-01 (UTC); without a host clock the virtual clock counts from 2000-01-01. */
export const epochSeconds = (vm) => (vm.host.epoch ? vm.host.epoch() : 946684800 + vm.virtualMs / 1000);

export const CLOCK_NATIVES = {
  '_time.time': (ctx) => new PyFloat(epochSeconds(ctx.vm)),
  '_time.time_ns': (ctx) => Math.floor(epochSeconds(ctx.vm) * 1000) * 1_000_000,
  '_time.perf_counter': (ctx) => new PyFloat(clockMs(ctx.vm) / 1000),
  '_time.monotonic': (ctx) => new PyFloat(clockMs(ctx.vm) / 1000),
  '_time.process_time': (ctx) => new PyFloat(clockMs(ctx.vm) / 1000),
  '_time.tz_offset': (ctx) => (ctx.vm.host.tzOffset ? ctx.vm.host.tzOffset() : 0),
  '_time.sleep'(ctx, args, kw) {
    const [s] = params('sleep', args, kw, ['secs']);
    const secs = needNum(s, 'sleep');
    if (secs < 0) throw err('value', { what: 'sleepNegative' });
    return new Suspend({ kind: 'sleep', seconds: secs });
  },
};
export const CLOCK_NAMES = ['time', 'time_ns', 'perf_counter', 'monotonic', 'process_time', 'tz_offset', 'sleep'];
