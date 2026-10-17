// Public interface of the scripting language (Python subset with its own VM).
// No DOM, no dependency on any host – runs identically in tests, editors and embeds.

import { compile as compileRaw, OP, OP_NAMES } from './compiler.js';
import { VM, Suspend } from './vm.js';
import { PyBuiltin } from './values.js';
import { BUILTINS, CLASS_GLOBALS, MODULES } from './builtins.js';
import { ScriptError, suggest } from './errors.js';

export { VM, Suspend, ScriptError, suggest, OP, OP_NAMES, MODULES };
export { KINDS as ERROR_KINDS } from './errors.js';
export { BUDGET_LIMITS } from './vm.js';
export * from './values.js';
export { highlightRanges, tokenize } from './lexer.js';
export { scriptErrorText, message, hasMessage, LANGS } from './errorText.js';

/** Names that every program knows without an import. */
export const BUILTIN_NAMES = [...Object.keys(BUILTINS).filter((n) => !n.includes('.')), ...Object.keys(CLASS_GLOBALS), '__name__'];

/**
 * Translate source text. Built-in functions and modules are always known.
 * @param {string} source
 * @param {{ known?: Iterable<string>, modules?: Record<string, string[]>, removed?: Record<string, object> }} [opts]
 *   removed: names that no longer exist (NameError with the new spelling)
 */
export function compile(source, opts = {}) {
  return compileRaw(source, {
    known: [...BUILTIN_NAMES, ...(opts.known ?? [])],
    modules: { ...MODULES, ...(opts.modules ?? {}) },
    removed: opts.removed,
    strictNames: opts.strictNames,
    codeBase: opts.codeBase,
  });
}

/** Short hash of a source text (FNV-1a) – checks on loading whether the saved code still matches. */
export function sourceHash(src) {
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

/**
 * Simply run a program completely (tests, tools): returns output and, if any, the error.
 * @param {string} source
 * @param {{ budget?: number, seed?: number }} [opts]
 * @returns {{ output: string, error: any|null, vm: VM|null }}
 */
export function runToEnd(source, opts = {}) {
  let output = '', errors = '';
  const inputs = [...(opts.inputs ?? [])];
  let prog;
  try { prog = compile(source); } catch (e) {
    if (e instanceof ScriptError) return { output, error: e.toJSON(), vm: null };
    throw e;
  }
  const vm = new VM(prog, { globals: opts.globals, files: opts.files, host: { print: (t) => { output += t; }, printErr: (t) => { errors += t; }, ...(opts.host ?? {}) }, seed: opts.seed ?? 1 });
  const task = vm.start();
  const plots = [];
  let budget = opts.budget ?? 50_000_000;
  for (;;) {
    const r = vm.run(task, budget);
    budget -= r.used;
    if (r.status === 'waiting' && task.wait?.kind === 'sleep') {
      // sleep(): the virtual clock jumps ahead
      vm.virtualMs += Math.round(task.wait.seconds * 1000);
      vm.resume(task, null);
      continue;
    }
    if (r.status === 'waiting' && task.wait?.kind === 'turtle-event') { vm.resume(task, null); continue; } // no events in a headless run: the program ends
    if (r.status === 'waiting' && (task.wait?.kind === 'forms-event' || task.wait?.kind === 'forms-dialog')) { vm.resume(task, formsHeadless(vm, task.wait)); continue; } // guizero: timers on the virtual clock
    // plt.show(): the SVG is collected (opts.plot sees it, too) and the program goes on
    if (r.status === 'waiting' && task.wait?.kind === 'plot') { plots.push(task.wait); opts.plot?.(task.wait); vm.resume(task, null); continue; }
    if (r.status === 'waiting' && task.wait?.kind === 'http') { vm.resume(task, httpResult(opts.http ? opts.http(task.wait) : { error: 'network', message: 'No network in this run.' })); continue; }
    if (r.status !== 'waiting' || task.wait?.kind !== 'input') break;
    // input(): the next prepared line, or EOFError when there is none
    if (inputs.length) vm.resume(task, inputs.shift());
    else vm.resumeWithError(task, new ScriptError('eof', {}));
  }
  return { output, errors, plots, error: task.state === 'error' ? task.error : task.state === 'ready' ? { code: 'err.script.tooLong', kind: 'RuntimeError', params: {}, line: vm.lineOf(task) } : null, vm };
}

/** Names of the Kara module as predefined globals (for a host that starts programs with `move()` without an import). */
import { KARA_NAMES } from './stdlib/kara.js';
import { httpResult } from './stdlib/http.js';
export { httpResult };
export { turtleEvent } from './stdlib/turtle.js';
import { HOOKS } from './pymodules.js';
const formsHeadless = (...a) => HOOKS.formsHeadless(...a);
/** For the host: report an event of a guizero program (needs the guizero pack: loadPyModules(['guizero'])). */
export const formsEvent = (...a) => HOOKS.formsEvent(...a);
export { KARA_NAMES };

/** The Kara commands as predefined globals: pass as `globals` to VM or runToEnd. */
export function karaGlobals() {
  return Object.fromEntries(KARA_NAMES.map((n) => [n, new PyBuiltin(`kara.${n}`)]));
}

export { formatTraceback } from './traceback.js';

/** SVGs of the figures a program left open without plt.show() (a host may show them when the program ends). */
export const renderOpenFigures = (vm) => HOOKS.renderOpenFigures?.(vm) ?? [];

/** Load the packs a program needs (a no-op here: the full entry index.js has all of them; browser.js has the real one). */
export const loadPyModules = () => Promise.resolve();
