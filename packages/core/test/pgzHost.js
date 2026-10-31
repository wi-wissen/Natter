// Test host for the Pygame Zero modules: images come from test/cases/images (sizes read from the PNG headers),
// commands are recorded. runPgz works like runToEnd and also returns the recorded commands.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, VM, ScriptError } from '../src/index.js';
import { PGZ_NATIVES, pgzHostModules, frameInput, installPgzero, PGZ_BUILTIN_NAMES } from '../src/stdlib/pgzero.js';

export const IMAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'cases', 'images');
export const SOUND_DIR = join(dirname(fileURLToPath(import.meta.url)), 'cases', 'sounds');

/** Width and height of a PNG file. */
export function pngSize(path) {
  const b = readFileSync(path);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

/** Length in seconds of a PCM WAV file (data bytes / bytes per second). */
export function wavSeconds(path) {
  const b = readFileSync(path);
  let i = 12, rate = 0, align = 0;
  while (i + 8 <= b.length) {
    const id = b.toString('ascii', i, i + 4), size = b.readUInt32LE(i + 4);
    if (id === 'fmt ') { rate = b.readUInt32LE(i + 12); align = b.readUInt16LE(i + 20); }
    if (id === 'data') return size / align / rate;
    i += 8 + size + (size & 1);
  }
  return null;
}

/** Resource answers like a host would give them: images from IMAGE_DIR, a few made-up sounds. */
export function testResource(kind, name) {
  if (kind === 'images') {
    const p = join(IMAGE_DIR, `${name}.png`);
    return existsSync(p) ? pngSize(p) : null;
  }
  if (kind === 'sounds') {
    const p = join(SOUND_DIR, `${name}.wav`);
    return existsSync(p) ? wavSeconds(p) : null;
  }
  if (kind === 'music') return ['theme', 'intro'].includes(name) ? true : null;
  if (kind === 'fonts') return name === 'arial' ? true : null;
  return null;
}

export const TEST_IMAGES = existsSync(IMAGE_DIR) ? readdirSync(IMAGE_DIR).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)) : [];

/** A VM with the Pygame Zero bridge. `game: true` predefines the builtins (game mode without import pgzrun). */
export function pgzVM(source, { game = false, resource = testResource, seed = 1 } = {}) {
  const out = { output: '', errors: '', cmds: [] };
  const prog = compile(source, { known: game ? PGZ_BUILTIN_NAMES : [] });
  const vm = new VM(prog, {
    natives: PGZ_NATIVES,
    seed,
    host: {
      ...pgzHostModules(),
      print: (t) => { out.output += t; },
      printErr: (t) => { out.errors += t; },
      pgz: { resource, cmd: (name, args) => out.cmds.push([name, ...args]) },
    },
  });
  if (game) installPgzero(vm);
  return { vm, out };
}

/** Run a task to its end (or until it waits); returns the error or null. */
export function finish(vm, task, budget = 50_000_000) {
  const r = vm.run(task, budget);
  if (r.status === 'budget') return { code: 'err.script.tooLong' };
  return task.state === 'error' ? task.error : null;
}

/** Like runToEnd, with the Pygame Zero bridge. */
export function runPgz(source, opts = {}) {
  let vm, out;
  try { ({ vm, out } = pgzVM(source, opts)); } catch (e) {
    if (e instanceof ScriptError) return { output: '', cmds: [], error: e.toJSON(), vm: null };
    throw e;
  }
  const task = vm.start();
  const error = finish(vm, task, opts.budget);
  return { ...out, error, vm, task };
}

/** The game loop of a VM (the task that runs pgzero_main.go), once started. */
const loops = new WeakMap();

/**
 * Start the game loop like a host: the main program waiting in pgzrun.go() runs it, else (game mode, the program has
 * ended) a task runs pgzero_main.go like the line a host appends. Runs it up to the first frame (window, hooks, spell
 * check); returns the error or null.
 */
export function startGame(vm) {
  if (loops.has(vm)) return null;
  let loop = [...vm.tasks.values()].find((t) => t.state === 'waiting' && t.wait?.kind === 'pgzero');
  loop ??= vm.spawn(vm.importModule('pgzero_main', null).ns.get('go'), []);
  loops.set(vm, loop);
  let error = finish(vm, loop);
  if (!error && loop.wait?.kind === 'pgzero') { vm.resume(loop, null); error = finish(vm, loop); }
  return error;
}

/** The game loop waits for its next frame. */
export const waitsForFrame = (vm) => loops.get(vm)?.state === 'waiting' && loops.get(vm).wait?.kind === 'pgzero-frame';

/**
 * Run one frame; returns { drawn, exited, ended, error } and the commands recorded during the frame. `exited`: the
 * program ended with SystemExit (exit(), Ctrl+Q), the VM marks that with task.exitCode; `ended`: the game loop is over.
 */
export function frame(vm, out, events = [], dt = 1 / 60) {
  const start = out.cmds.length;
  let error = startGame(vm);
  const loop = loops.get(vm);
  if (!error && waitsForFrame(vm)) {
    vm.resume(loop, frameInput(events, dt));
    error = finish(vm, loop);
  }
  const waiting = waitsForFrame(vm);
  return { drawn: waiting && loop.wait.drawn, exited: 'exitCode' in loop, ended: !waiting, error, cmds: out.cmds.slice(start) };
}

/**
 * Run a program like `pgzrun game.py` and then the scripted frames ([{ dt, events }], see scripts/pgzero-frames.py),
 * printing "--- frame N" before each frame. Stops at the first error.
 */
export function runFrames(source, frames, opts = {}) {
  const { vm, out } = pgzVM(source, { ...opts, game: true });
  const task = vm.start();
  let error = finish(vm, task, opts.budget);
  if (!error && frames.length) error = startGame(vm);
  const drawn = [];
  for (let i = 0; i < frames.length && !error && waitsForFrame(vm); i++) {
    out.output += `--- frame ${i}\n`;
    const r = frame(vm, out, frames[i].events, frames[i].dt);
    error = r.error;
    drawn.push(r.drawn);
  }
  return { ...out, error, drawn, vm };
}
