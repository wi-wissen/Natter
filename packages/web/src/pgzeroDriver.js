// The clock of the Pygame Zero host without the DOM. The game loop itself runs in the main program (pgzero_main.go,
// see docs/PGZERO-BRIDGE.md): before every frame it waits (kind 'pgzero-frame'); the driver answers with the events
// and the fixed dt when a frame is due, so breakpoints, single steps and the call stack work in the hooks like
// anywhere else in the program. Uses only the public exports of the core.

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

/** Line that ends a program in game mode: the main program runs the game loop there (like pgzrun.go()). */
export const GAME_TAIL = '\nimport pgzero_main as _pgz_host_\n_pgz_host_.go()\n';

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
 * @param {{
 *   step?: number,          ms per game frame (1000/60); dt of every frame is exactly step / 1000
 *   maxSteps?: number,      frames to catch up at most per tick (4)
 *   frameBudget?: number,   instructions one frame may take before it counts as an endless loop (20 million)
 * }} [opts]
 */
export function createDriver(opts = {}) {
  const maxSteps = opts.maxSteps ?? 4;
  const stepper = createStepper({ step: opts.step ?? 1000 / 60, maxSteps });
  const dt = stepper.step / 1000;
  const frameBudget = opts.frameBudget ?? 20_000_000;
  /** @type {any[]} events since the last frame */
  const events = [];
  /** the game loop waiting for its next frame (WaitContext of the runner), or null while a frame runs */
  let pending = null;
  let owed = 0, frames = 0, started = false, ended = false;

  const driver = {
    /** frames that ran to their end */
    get frames() { return frames; },
    get ended() { return ended; },
    /** a frame is running (or halted in the debugger) */
    get busy() { return started && !pending && !ended; },
    dt,
    /** Queue an event for the next frame (['key_down', key, mod, unicode] ...). */
    push(ev) { if (!ended && events.length < 500) events.push(ev); },
    /** The game loop waits for the next frame (wait handler of 'pgzero-frame'). */
    wait(wait, ctx) {
      if (ended) return;
      if (started) frames++;
      started = true;
      pending = ctx;
      serve();
    },
    /**
     * Real time passed (ms): the frames that are due run (one after the other, each when the loop asks for it).
     * With frames = n: exactly n more frames, whatever the time (single steps, tests).
     */
    tick(ms, n = null) {
      if (ended) return;
      owed += n ?? stepper.advance(ms);
      if (n == null && owed > maxSteps) owed = maxSteps; // a slow game slows down instead of piling up frames
      serve();
    },
    /** Forget time (after a pause, while the debugger halts, when the tab was hidden). */
    resetTime() { stepper.reset(); owed = 0; },
    stop() { ended = true; pending = null; events.length = 0; },
  };

  /** Hand the next frame to the waiting game loop when one is due. */
  function serve() {
    if (!pending || owed <= 0 || ended) return;
    owed--;
    const ctx = pending;
    pending = null;
    ctx.task.allowance = frameBudget; // an endless loop in a hook: "takes too long" at its line
    ctx.resume(new PyTuple([new PyList(events.splice(0).map(toPy)), new PyFloat(dt)]));
  }

  return driver;
}
