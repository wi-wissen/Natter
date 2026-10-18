// The game loop of the Pygame Zero host without the DOM: starts the game in the VM, runs one frame task per fixed
// time step (pgzero_main.frame, see docs/PGZERO-BRIDGE.md) in slices with an instruction budget, and reports how the
// game ended. Uses only the public exports of the core (the same steps as installPgzero/pgzStart/pgzFrame of
// packages/core/src/stdlib/pgzero.js).

import { ScriptError, PyList, PyTuple, PyFloat, PyDict } from '@natterjs/core';
import { createStepper } from './pgzeroMath.js';

/** Names a Pygame Zero program knows without `import pgzrun` (PGZ_BUILTIN_NAMES of the core; a test keeps them equal). */
export const PGZ_BUILTIN_NAMES = ['Actor', 'Rect', 'ZRect', 'animate', 'clock', 'keyboard', 'keys', 'keymods', 'mouse', 'music',
  'sounds', 'images', 'tone', 'screen', 'exit'];

/** JavaScript value → Python value (arrays → tuples, non-integer numbers → floats), like toPy of the core. */
export function toPy(v) {
  if (Array.isArray(v)) return new PyTuple(v.map(toPy));
  if (typeof v === 'number') return Number.isInteger(v) && !Object.is(v, -0) ? v : new PyFloat(v);
  if (v && typeof v === 'object') { const d = new PyDict(); for (const [k, x] of Object.entries(v)) d.set(k, toPy(x)); return d; }
  return v ?? null;
}

/** Line that ends a program in game mode: the main program waits there while the game runs (like pgzrun.go()). */
export const GAME_TAIL = '\nimport _pgz as _pgz_host_\n_pgz_host_.go()\n';

/**
 * Source and globals for runner.run(): 'game' mode predefines the Pygame Zero names and hands over to the game at
 * the end of the program (line numbers stay the same), 'pgzrun' mode runs the program as it is.
 * @param {string} source @param {'game'|'pgzrun'|null} mode
 */
export function gameSource(source, mode) {
  if (mode !== 'game') return { source, globals: {} };
  return { source: source + GAME_TAIL, globals: Object.fromEntries(PGZ_BUILTIN_NAMES.map((n) => [n, null])) };
}

/** Game mode: put the Pygame Zero names into the predefined names of the VM (installPgzero of the core). */
export function installPgzero(vm) {
  const mod = vm.importModule('pgzero_builtins', null);
  for (const [k, v] of mod.ns) if (!k.startsWith('_')) vm.predef.set(k, v);
}

/** SystemExit for the main program (exit() or Ctrl+Q in the game ends the whole program, like sys.exit). */
export function systemExit() {
  const e = new ScriptError('raised', { message: '' });
  e.kind = 'SystemExit';
  return e;
}

/**
 * @param {import('@natterjs/core').VM} vm
 * @param {{
 *   step?: number,          ms per game frame (1000/60); dt of every frame is exactly step / 1000
 *   maxSteps?: number,      frames to catch up at most per tick (4)
 *   frameBudget?: number,   instructions one frame may take before it counts as an endless loop (20 million)
 *   sliceMs?: number,       time per tick for the VM (8 ms), a slow frame goes on in the next tick
 *   now?: () => number,
 *   onEnd: (how: 'exit'|'quit'|'error', error?: any) => void,
 * }} opts
 */
export function createDriver(vm, opts) {
  const now = opts.now ?? (() => performance.now());
  const maxSteps = opts.maxSteps ?? 4;
  const stepper = createStepper({ step: opts.step ?? 1000 / 60, maxSteps });
  const dt = stepper.step / 1000;
  const frameBudget = opts.frameBudget ?? 20_000_000;
  const sliceMs = opts.sliceMs ?? 8;
  /** @type {any[]} events since the last frame */
  const events = [];
  let task = null, used = 0, chunk = 20000, ended = false, frames = 0, started = false, owed = 0;

  const driver = {
    get frames() { return frames; },
    get ended() { return ended; },
    get busy() { return !!task; },
    dt,
    /** Queue an event for the next frame (['key_down', key, mod, unicode] ...). */
    push(ev) { if (!ended && events.length < 500) events.push(ev); },
    /**
     * Real time passed (ms): run the frames that are due. With frames = n, run exactly n frames (single steps,
     * tests) and ignore the time. Returns { drawn } (draw() ran in at least one frame).
     */
    tick(ms, frames = null) {
      if (ended) return { drawn: false, ran: 0 };
      owed += frames ?? stepper.advance(ms);
      return run(frames == null ? now() + sliceMs : Infinity);
    },
    /** Forget time (after a pause, when the tab was hidden). */
    resetTime() { stepper.reset(); if (!task) owed = 0; },
    stop() { ended = true; if (task) vm.kill(task); task = null; events.length = 0; },
  };

  function finish(how, error) {
    if (ended) return;
    ended = true;
    if (task && task.state !== 'error') vm.kill(task);
    task = null;
    vm.prune();
    opts.onEnd(how, error);
  }

  /** Run due frames until the deadline. */
  function run(deadline) {
    let drawn = false, ran = 0;
    while (!ended && (task || owed > 0 || !started)) {
      if (!task) {
        if (!started) { task = vm.spawn(vm.importModule('pgzero_main', null).ns.get('start'), [], { pgzero: 'start' }); }
        else {
          owed--;
          task = vm.spawn(vm.importModule('pgzero_main', null).ns.get('frame'), [new PyList(events.splice(0).map(toPy)), new PyFloat(dt)], { pgzero: 'frame' });
        }
        used = 0;
      }
      const t0 = now();
      const r = vm.run(task, Math.min(chunk, frameBudget - used));
      const ms = now() - t0;
      used += r.used;
      if (r.status === 'budget') {
        chunk = Math.max(2000, Math.min(500000, Math.round(chunk * (ms < 1 ? 1.5 : ms > 4 ? 0.7 : 1))));
        if (used >= frameBudget) {
          // an endless loop in update(), draw() or a hook: the core's "takes too long" error at the line it hangs in
          vm.fail(task, new ScriptError('tooLong', {}), task.frames[task.frames.length - 1]);
          finish('error', task.errorRaw);
          break;
        }
        if (now() >= deadline) break;
        continue;
      }
      if (task.state === 'waiting') {
        if (task.wait?.kind === 'sleep') { // time.sleep in a hook: the game stands still (the virtual clock moves)
          vm.virtualMs += Math.round(task.wait.seconds * 1000);
          vm.resume(task, null);
          continue;
        }
        vm.fail(task, new ScriptError('type', { what: 'waitInSync' }), task.frames[task.frames.length - 1]);
      }
      if (task.state === 'error') { const e = task.errorRaw; task = null; finish('error', e); break; }
      // done
      const t = task;
      task = null;
      if (!started) { started = true; vm.prune(); continue; }
      frames++;
      ran++;
      vm.prune();
      if ('exitCode' in t) { finish('exit'); break; }
      if (t.result === null) { finish('quit'); break; }
      if (t.result === true) drawn = true;
      if (now() >= deadline) break;
    }
    if (deadline !== Infinity && owed > maxSteps) owed = maxSteps; // a slow game slows down instead of piling up frames
    return { drawn, ran };
  }

  return driver;
}
