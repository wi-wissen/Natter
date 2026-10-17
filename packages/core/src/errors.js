// Errors of the scripting language. They carry a stable code ('err.script.…') with parameters and the
// Python name of the exception (NameError, TypeError …). Texts arise only in the UI
// (src/messages.js), so the language stays independent of German/English.

/** Python name of the exception per error code (everything else: RuntimeError). */
export const KINDS = {
  syntax: 'SyntaxError', expected: 'SyntaxError', unexpected: 'SyntaxError', unclosed: 'SyntaxError',
  unterminatedString: 'SyntaxError', badNumber: 'SyntaxError', badAssign: 'SyntaxError', badChar: 'SyntaxError',
  notSupported: 'SyntaxError', outsideLoop: 'SyntaxError', outsideFunction: 'SyntaxError', badParams: 'SyntaxError',
  duplicateArg: 'SyntaxError', badFString: 'SyntaxError', globalLocal: 'SyntaxError', nonlocalMissing: 'SyntaxError',
  indent: 'IndentationError', unindent: 'IndentationError', expectedIndent: 'IndentationError', mixedIndent: 'TabError',
  nameUnknown: 'NameError', nameUnbound: 'NameError', localUnbound: 'UnboundLocalError',
  type: 'TypeError', notCallable: 'TypeError', argCount: 'TypeError', argUnexpected: 'TypeError', argMissing: 'TypeError',
  argDuplicate: 'TypeError', notIterable: 'TypeError', notSubscriptable: 'TypeError', unhashable: 'TypeError',
  operand: 'TypeError', compare: 'TypeError', notIndex: 'TypeError', unaryOperand: 'TypeError',
  zeroDivision: 'ZeroDivisionError', index: 'IndexError', key: 'KeyError', value: 'ValueError',
  unpack: 'ValueError', attr: 'AttributeError', recursion: 'RecursionError', overflow: 'OverflowError',
  assertion: 'AssertionError', powFraction: 'ValueError', mathDomain: 'ValueError',
  importUnknown: 'ModuleNotFoundError', stopIteration: 'StopIteration', internal: 'RuntimeError', host: 'RuntimeError',
  raised: 'RuntimeError', badExcept: 'SyntaxError', eof: 'EOFError',
};

export class ScriptError extends Error {
  /**
   * @param {string} code short code without prefix, e.g. 'nameUnknown'
   * @param {Record<string, any>} [params]
   * @param {{line?: number, col?: number}} [pos]
   */
  constructor(code, params = {}, pos = {}) {
    super(`err.script.${code}`);
    this.code = `err.script.${code}`;
    this.short = code;
    this.params = params;
    this.line = pos.line ?? 0;
    this.col = pos.col ?? 0;
    this.kind = KINDS[code] ?? 'RuntimeError';
    /** Errors a program must not catch (budget used up, bugs of the interpreter itself) */
    this.uncatchable = code === 'tooLong' || code === 'internal';
    /** @type {{name: string, line: number}[]} call stack, innermost frame last */
    this.traceback = [];
  }

  /** Pure JSON (for saving, events and UI). */
  toJSON() {
    return { code: this.code, kind: this.kind, params: this.params, line: this.line, col: this.col, traceback: this.traceback };
  }
}

/**
 * Find the most similar name for "Did you mean …?" (Levenshtein, at most 2 errors or a third).
 * @param {string} name @param {Iterable<string>} candidates
 * @returns {string|null}
 */
export function suggest(name, candidates) {
  let best = null, bestD = Infinity;
  const lower = name.toLowerCase();
  for (const c of candidates) {
    if (c === name || c.startsWith('_') || c.startsWith('.')) continue;
    const d = c.toLowerCase() === lower ? 0.5 : levenshtein(lower, c.toLowerCase());
    if (d < bestD || (d === bestD && best !== null && c < best)) { bestD = d; best = c; }
  }
  const limit = Math.max(1, Math.min(2, Math.floor(name.length / 3)));
  return bestD <= limit ? best : null;
}

function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  // Optimal string alignment: swapped neighbours (trun → turn) count as one error
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}
