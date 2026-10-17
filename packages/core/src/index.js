// Public interface of the scripting language (Python subset with its own VM).
// No DOM, no dependency on any host – runs identically in tests, editors and embeds.

import { compile as compileRaw, OP, OP_NAMES } from './compiler.js';
import { VM, Suspend } from './vm.js';
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
  let output = '';
  let prog;
  try { prog = compile(source); } catch (e) {
    if (e instanceof ScriptError) return { output, error: e.toJSON(), vm: null };
    throw e;
  }
  const vm = new VM(prog, { host: { print: (t) => { output += t; } }, seed: opts.seed ?? 1 });
  const task = vm.start();
  vm.run(task, opts.budget ?? 50_000_000);
  return { output, error: task.state === 'error' ? task.error : task.state === 'ready' ? { code: 'err.script.tooLong', kind: 'RuntimeError', params: {}, line: vm.lineOf(task) } : null, vm };
}
