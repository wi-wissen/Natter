// Compiler: syntax tree → bytecode for the stack machine (vm.js).
//
// Process: 1. Collect scopes (which names are local in which function, which are captured by
// inner functions → cells). 2. Resolve names. 3. Generate code.
// Each function becomes a code object with parallel fields ops/args/lines/stmt. `stmt[pc]` marks the
// start of a statement: the debugger's single step stops there.
// The compiler is deterministic – the same source text yields the same code numbers (important for loading).

import { parse } from './parser.js';
import { ScriptError, suggest } from './errors.js';

export const OP = {
  NOP: 0, LOAD_CONST: 1, LOAD_FAST: 2, STORE_FAST: 3, LOAD_GLOBAL: 4, STORE_GLOBAL: 5, LOAD_DEREF: 6, STORE_DEREF: 7,
  LOAD_CLOSURE: 8, LOAD_ATTR: 9, STORE_ATTR: 10, LOAD_INDEX: 11, STORE_INDEX: 12, DELETE_INDEX: 13,
  DELETE_FAST: 14, DELETE_GLOBAL: 15, DELETE_DEREF: 16,
  BINARY: 17, INPLACE: 18, UNARY: 19, COMPARE: 20,
  JUMP: 21, JUMP_IF_FALSE: 22, JUMP_IF_TRUE: 23, JUMP_IF_FALSE_OR_POP: 24, JUMP_IF_TRUE_OR_POP: 25,
  GET_ITER: 26, FOR_ITER: 27, BUILD_LIST: 28, BUILD_TUPLE: 29, BUILD_DICT: 30, BUILD_SLICE: 31,
  UNPACK: 32, UNPACK_EX: 33, LIST_APPEND: 34, DICT_SET: 35, LIST_EXTEND: 36, LIST_TO_TUPLE: 37, LIST_PUSH: 38,
  MAKE_FUNCTION: 39, CALL: 40, CALL_KW: 41, CALL_EX: 42, RETURN: 43, POP: 44, DUP: 45, DUP2: 46, ROT2: 47, ROT3: 48,
  FORMAT: 49, BUILD_STRING: 50, IMPORT: 51, IMPORT_FROM: 52, IMPORT_STAR: 53, ASSERT_FAIL: 54,
  BUILD_CLASS: 55, LOAD_NAME: 56, STORE_NAME: 57, DELETE_NAME: 58, SUPER: 59, DELETE_ATTR: 60,
  SETUP_TRY: 61, POP_BLOCK: 62, EXC_MATCH: 63, ENTER_HANDLER: 64, EXIT_HANDLER: 65, LOAD_EXC: 66, RAISE: 67, RERAISE: 68,
  BUILD_SET: 69, SET_ADD: 70, YIELD: 71, WITH_SETUP: 72, WITH_EXIT_OK: 73, WITH_EXC: 74,
};
export const OP_NAMES = Object.fromEntries(Object.entries(OP).map(([k, v]) => [v, k]));

export const BIN_OPS = ['+', '-', '*', '/', '//', '%', '**', '&', '|', '^', '<<', '>>'];
export const UNARY_OPS = ['-', '+', '~', 'not'];
export const CMP_OPS = ['==', '!=', '<', '>', '<=', '>=', 'in', 'not in', 'is', 'is not'];

/**
 * @typedef {Object} Code
 * @property {string} name
 * @property {string[]} params parameter names
 * @property {number} ndefaults number of default values (last parameters)
 * @property {string[]} varnames local variables (parameters first)
 * @property {string[]} cellvars local variables captured by inner functions
 * @property {string[]} freevars captured variables of outer functions
 * @property {number[]} cellParams for each cell: index of the parameter or -1
 * @property {number[]} ops @property {any[]} args @property {number[]} lines @property {boolean[]} stmt
 * @property {any[]} consts @property {string[]} names
 * @property {boolean} module
 * @property {number} line first line (def)
 */

/**
 * @typedef {Object} Program
 * @property {Code[]} codes codes[0] is the main program
 * @property {string} source
 * @property {string[]} globals all names the program assigns globally
 */

/**
 * Compile source text.
 * @param {string} source
 * @param {{ known?: Iterable<string>, modules?: Record<string, string[]>, removed?: Record<string, object> }} [opts]
 *   known: names available at run time (built-in functions, host API);
 *   removed: names that no longer exist → parameters of their NameError (what to write instead);
 *   modules: modules for import/from … import * with their names;
 *   strictNames: unknown names are errors at compile time (default: warnings, error when the line runs);
 * @returns {Program}
 */
export function compile(source, opts = {}) {
  const tree = parse(source);
  const prog = new Compiler(source, opts).program(tree);
  return prog;
}

class Scope {
  constructor(kind, node, parent) {
    this.kind = kind;            // 'module' | 'function' | 'class'
    this.node = node;
    this.parent = parent;
    this.params = [];
    this.assigned = new Set();
    this.globals = new Set();
    this.nonlocals = new Set();
    /** @type {any[]} name nodes that are read or written */
    this.uses = [];
    this.cells = new Set();
    this.frees = new Set();
    this.locals = new Set();
  }
}

class Compiler {
  constructor(source, opts) {
    this.source = source;
    this.known = new Set(opts.known ?? []);
    this.modules = opts.modules ?? {};
    this.removed = opts.removed ?? {};
    this.strictNames = !!opts.strictNames;
    /** Problems that are no errors yet (unknown names: Python only fails when the line runs) */
    this.warnings = [];
    /** @type {Code[]} */
    this.codes = [];
    this.hidden = 0;
  }

  err(code, params, node) { return new ScriptError(code, params, { line: node?.line ?? 0, col: node?.col ?? 0 }); }

  // ================= 1. Scopes =================

  program(tree) {
    const mod = new Scope('module', tree, null);
    tree.scope = mod;
    this.collectBody(tree.body, mod, []);
    this.resolveScope(mod);
    // Global names: assigned in the main program or via `global` in functions
    this.globalNames = new Set(mod.assigned);
    const addGlobalAssigns = (s) => {
      for (const c of s.children ?? []) {
        for (const n of c.globals) if (c.assigned.has(n)) this.globalNames.add(n);
        addGlobalAssigns(c);
      }
    };
    addGlobalAssigns(mod);
    if (this.starImports) for (const n of this.starImports) this.globalNames.add(n);
    this.checkUnknown(mod);
    this.compileCode(tree, mod, '<module>', [], true);
    return { codes: this.codes, source: this.source, globals: [...this.globalNames], warnings: this.warnings, removed: this.removed };
  }

  /** @param {any[]} renames stack of renamings (loop variables in comprehensions) */
  collectBody(body, scope, renames) {
    for (const st of body) this.collectStmt(st, scope, renames);
  }

  addAssign(target, scope, renames) {
    switch (target.type) {
      case 'Name': this.renameNode(target, renames); scope.assigned.add(target.id); scope.uses.push(target); break;
      case 'Tuple': case 'List': for (const e of target.elts) this.addAssign(e, scope, renames); break;
      case 'Starred': this.addAssign(target.value, scope, renames); break;
      case 'Attribute': this.collectExpr(target.value, scope, renames); break;
      case 'Subscript': this.collectExpr(target.value, scope, renames); this.collectExpr(target.index, scope, renames); break;
      default: break;
    }
  }

  renameNode(node, renames) {
    for (let i = renames.length - 1; i >= 0; i--) {
      const m = renames[i];
      if (m.has(node.id)) { node.id = m.get(node.id); return; }
    }
  }

  collectStmt(st, scope, renames) {
    switch (st.type) {
      case 'Expr': this.collectExpr(st.value, scope, renames); break;
      case 'Assign': this.collectExpr(st.value, scope, renames); for (const t of st.targets) this.addAssign(t, scope, renames); break;
      case 'AugAssign':
        this.collectExpr(st.value, scope, renames);
        if (st.target.type === 'Name') { this.renameNode(st.target, renames); scope.assigned.add(st.target.id); scope.uses.push(st.target); }
        else this.addAssign(st.target, scope, renames);
        break;
      case 'If': case 'While':
        this.collectExpr(st.test, scope, renames);
        this.collectBody(st.body, scope, renames);
        this.collectBody(st.orelse, scope, renames);
        break;
      case 'For':
        this.collectExpr(st.iter, scope, renames);
        this.addAssign(st.target, scope, renames);
        this.collectBody(st.body, scope, renames);
        this.collectBody(st.orelse, scope, renames);
        break;
      case 'FunctionDef': {
        for (const d of st.decorators) this.collectExpr(d, scope, renames);
        for (const p of st.params) if (p.default) this.collectExpr(p.default, scope, renames);
        scope.assigned.add(st.name);
        const nameNode = { type: 'Name', id: st.name, line: st.line, col: st.col };
        st.nameNode = nameNode;
        scope.uses.push(nameNode);
        this.collectFunction(st, scope, renames, st.body);
        break;
      }
      case 'ClassDef': {
        for (const d of st.decorators) this.collectExpr(d, scope, renames);
        for (const b of st.bases) this.collectExpr(b, scope, renames);
        scope.assigned.add(st.name);
        const nameNode = { type: 'Name', id: st.name, line: st.line, col: st.col };
        st.nameNode = nameNode;
        scope.uses.push(nameNode);
        const cs = new Scope('class', st, scope);
        st.scope = cs;
        (scope.children ??= []).push(cs);
        this.collectBody(st.body, cs, renames);
        break;
      }
      case 'Try':
        this.collectBody(st.body, scope, renames);
        for (const h of st.handlers) {
          if (h.type) this.collectExpr(h.type, scope, renames);
          if (h.name) {
            scope.assigned.add(h.name);
            h.nameNode = { type: 'Name', id: h.name, line: h.line, col: h.col };
            scope.uses.push(h.nameNode);
          }
          this.collectBody(h.body, scope, renames);
        }
        this.collectBody(st.orelse, scope, renames);
        this.collectBody(st.finalbody, scope, renames);
        break;
      case 'With':
        for (const it of st.items) { this.collectExpr(it.ctx, scope, renames); if (it.target) this.addAssign(it.target, scope, renames); }
        this.collectBody(st.body, scope, renames);
        break;
      case 'Raise': this.collectExpr(st.exc, scope, renames); this.collectExpr(st.cause, scope, renames); break;
      case 'Return': if (st.value) this.collectExpr(st.value, scope, renames); break;
      case 'Global': case 'Nonlocal':
        for (const n of st.names) {
          if (scope.kind === 'module') {
            if (st.type === 'Nonlocal') throw this.err('nonlocalMissing', { name: n }, st);
            continue;
          }
          if (scope.params.includes(n)) throw this.err('globalLocal', { name: n }, st);
          (st.type === 'Global' ? scope.globals : scope.nonlocals).add(n);
        }
        break;
      case 'Delete': for (const t of st.targets) this.addAssign(t, scope, renames); break;
      case 'Assert': this.collectExpr(st.test, scope, renames); if (st.msg) this.collectExpr(st.msg, scope, renames); break;
      case 'Import':
        for (const n of st.names) {
          const bind = n.asname ?? n.name.split('.')[0];
          const node = { type: 'Name', id: bind, line: st.line, col: st.col };
          n.node = node;
          scope.assigned.add(bind);
          scope.uses.push(node);
        }
        break;
      case 'ImportFrom':
        if (!st.names) {
          if (scope.kind !== 'module') throw this.err('notSupported', { feature: 'starImportInFunction' }, st);
          const names = this.modules[st.module];
          if (names) (this.starImports ??= new Set()) && names.forEach((x) => this.starImports.add(x));
          break;
        }
        for (const n of st.names) {
          const bind = n.asname ?? n.name;
          const node = { type: 'Name', id: bind, line: st.line, col: st.col };
          n.node = node;
          scope.assigned.add(bind);
          scope.uses.push(node);
        }
        break;
      default: break;
    }
  }

  collectFunction(node, scope, renames, body) {
    const fs = new Scope('function', node, scope);
    node.scope = fs;
    (scope.children ??= []).push(fs);
    fs.params = node.params.map((p) => p.name);
    if (node.vararg) fs.params.push(node.vararg);
    if (node.kwarg) fs.params.push(node.kwarg);
    // Parameters shadow loop variables of the same name from outer comprehensions
    const shadow = new Map(fs.params.map((p) => [p, p]));
    const inner = [...renames, shadow];
    if (Array.isArray(body)) this.collectBody(body, fs, inner);
    else this.collectExpr(body, fs, inner);
  }

  collectExpr(e, scope, renames) {
    if (!e) return;
    switch (e.type) {
      case 'Name': this.renameNode(e, renames); scope.uses.push(e); break;
      case 'Const': break;
      case 'BinOp': this.collectExpr(e.left, scope, renames); this.collectExpr(e.right, scope, renames); break;
      case 'UnaryOp': this.collectExpr(e.operand, scope, renames); break;
      case 'BoolOp': for (const v of e.values) this.collectExpr(v, scope, renames); break;
      case 'Compare': this.collectExpr(e.left, scope, renames); for (const c of e.comparators) this.collectExpr(c, scope, renames); break;
      case 'Call':
        this.collectExpr(e.func, scope, renames);
        for (const a of e.args) this.collectExpr(a, scope, renames);
        for (const k of e.keywords) this.collectExpr(k.value, scope, renames);
        break;
      case 'Attribute': this.collectExpr(e.value, scope, renames); break;
      case 'Subscript': this.collectExpr(e.value, scope, renames); this.collectExpr(e.index, scope, renames); break;
      case 'Slice': this.collectExpr(e.lower, scope, renames); this.collectExpr(e.upper, scope, renames); this.collectExpr(e.step, scope, renames); break;
      case 'Starred': this.collectExpr(e.value, scope, renames); break;
      case 'List': case 'Tuple': case 'Set': for (const x of e.elts) this.collectExpr(x, scope, renames); break;
      case 'Dict': e.keys.forEach((k, i) => { this.collectExpr(k, scope, renames); this.collectExpr(e.values[i], scope, renames); }); break;
      case 'IfExp': this.collectExpr(e.test, scope, renames); this.collectExpr(e.body, scope, renames); this.collectExpr(e.orelse, scope, renames); break;
      case 'Lambda':
        for (const p of e.params) if (p.default) this.collectExpr(p.default, scope, renames);
        this.collectFunction(e, scope, renames, e.body);
        break;
      case 'JoinedStr':
        for (const p of e.parts) {
          if (typeof p === 'string') continue;
          this.collectExpr(p.value, scope, renames);
          if (p.spec && typeof p.spec !== 'string') this.collectExpr(p.spec, scope, renames);
        }
        break;
      case 'Yield': case 'YieldFrom':
        if (scope.kind !== 'function') throw this.err('outsideFunction', { what: 'yield' }, e);
        scope.isGenerator = true;
        this.collectExpr(e.value, scope, renames);
        break;
      case 'GenExp':
        this.collectExpr(e.firstIter, scope, renames);
        this.collectFunction(e, scope, renames, e.body);
        break;
      case 'ListComp': case 'DictComp': case 'SetComp': {
        // The first source is evaluated outside, the loop variables get hidden names
        const frame = new Map();
        const inner = [...renames, frame];
        e.generators.forEach((g, i) => {
          this.collectExpr(g.iter, scope, i === 0 ? renames : inner);
          const names = [];
          const walk = (t) => { if (t.type === 'Name') names.push(t); else if (t.elts) t.elts.forEach(walk); else if (t.type === 'Starred') walk(t.value); };
          walk(g.target);
          for (const n of names) {
            if (!frame.has(n.id)) frame.set(n.id, `.${this.hidden++}${n.id}`);
          }
          this.addAssign(g.target, scope, inner);
          for (const c of g.ifs) this.collectExpr(c, scope, inner);
        });
        if (e.type === 'DictComp') { this.collectExpr(e.elt.key, scope, inner); this.collectExpr(e.elt.value, scope, inner); }
        else this.collectExpr(e.elt, scope, inner);
        break;
      }
      default: break;
    }
  }

  // ================= 2. Resolve names =================

  resolveScope(scope) {
    if (scope.kind === 'function') {
      for (const p of scope.params) scope.locals.add(p);
      for (const n of scope.assigned) if (!scope.globals.has(n) && !scope.nonlocals.has(n)) scope.locals.add(n);
    }
    for (const c of scope.children ?? []) this.resolveScope(c);
    for (const node of scope.uses) node.ref = this.resolveName(node, scope);
  }

  resolveName(node, scope) {
    const name = node.id;
    if (scope.kind === 'module' || scope.globals.has(name)) return { kind: 'global' };
    // Names assigned in a class body live in the class namespace
    if (scope.kind === 'class' && scope.assigned.has(name)) return { kind: 'name' };
    if (scope.locals.has(name)) return { kind: 'local', scope };
    // Free: search in enclosing functions (class bodies are skipped for lookup but pass the variable on)
    const chain = [scope];
    for (let s = scope.parent; s && s.kind !== 'module'; s = s.parent) {
      if (s.kind === 'function') {
        if (s.locals.has(name)) {
          s.cells.add(name);
          for (const c of chain) c.frees.add(name);
          return { kind: 'free', scope };
        }
        if (s.globals.has(name)) break;
      }
      chain.push(s);
    }
    if (scope.nonlocals.has(name)) throw this.err('nonlocalMissing', { name }, node);
    return { kind: 'global' };
  }

  /** Report unknown names already at compile time (friendlier than only at run time). */
  checkUnknown(scope) {
    for (const node of scope.uses) {
      if (node.ref.kind !== 'global' || node.store) continue;
      const n = node.id;
      if (n.startsWith('.') || this.globalNames.has(n) || this.known.has(n) || this.modules[n]) continue;
      if (node.isLoad === false) continue;
      let e;
      if (Object.hasOwn(this.removed, n)) e = this.err('nameUnknown', { name: n, ...this.removed[n] }, node);
      else {
        const cands = new Set([...this.globalNames, ...this.known, ...Object.keys(this.modules)]);
        for (let s = scope; s; s = s.parent) for (const l of s.locals) cands.add(l);
        // true/false/none: Python writes them with a capital letter
        const constant = { true: 'True', false: 'False', none: 'None', null: 'None' }[n.toLowerCase()];
        e = this.err('nameUnknown', { name: n, suggestion: constant ?? suggest(n, cands) }, node);
      }
      // Python reports an unknown name only when the line runs; strictNames makes it an error right away
      if (this.strictNames) throw e;
      this.warnings.push(e.toJSON());
    }
    for (const c of scope.children ?? []) this.checkUnknown(c);
  }

  // ================= 3. Generate code =================

  /**
   * @param {any} node FunctionDef, Lambda or Module
   * @param {Scope} scope
   */
  compileCode(node, scope, name, params, isModule = false) {
    const idx = this.codes.length;
    /** @type {Code} */
    const code = {
      name, params: params.map((p) => p.name), ndefaults: params.filter((p) => p.default).length,
      vararg: node.vararg ?? null, kwarg: node.kwarg ?? null,
      varnames: [], cellvars: [], freevars: [], cellParams: [],
      ops: [], args: [], lines: [], stmt: [], consts: [], names: [], module: isModule, line: node.line ?? 1,
      gen: !!scope.isGenerator,
    };
    this.codes.push(code);
    if (!isModule) {
      code.varnames = [...code.params, ...(code.vararg ? [code.vararg] : []), ...(code.kwarg ? [code.kwarg] : [])];
      for (const l of scope.locals) if (!code.varnames.includes(l)) code.varnames.push(l);
      code.cellvars = [...scope.cells];
      code.freevars = [...scope.frees];
      code.cellParams = code.cellvars.map((c) => { const i = code.varnames.indexOf(c); return i >= 0 && i < code.params.length + (code.vararg ? 1 : 0) + (code.kwarg ? 1 : 0) ? i : -1; });
    }
    const saved = { code: this.code, scope: this.scope, ctx: this.ctx, pendingStmt: this.pendingStmt };
    this.code = code; this.scope = scope; this.ctx = []; this.pendingStmt = 0;
    if (node.type === 'Lambda') {
      this.expr(node.body);
      this.emit(OP.RETURN, 0, node.body);
    } else {
      this.body(node.body);
      this.pendingStmt = 0;
      this.emit(OP.LOAD_CONST, this.constIdx(null), { line: this.lastLine(node) });
      this.emit(OP.RETURN, 0, { line: this.lastLine(node) });
    }
    Object.assign(this, saved);
    return idx;
  }

  lastLine(node) {
    const b = node.body;
    if (!Array.isArray(b) || !b.length) return node.line ?? 1;
    let last = b[b.length - 1];
    while (last && Array.isArray(last.body) && last.body.length) {
      const inner = last.orelse?.length ? last.orelse : last.body;
      last = inner[inner.length - 1];
    }
    return last?.line ?? node.line ?? 1;
  }

  emit(op, arg, node) {
    const c = this.code;
    const pc = c.ops.length;
    c.ops.push(op);
    c.args.push(arg ?? 0);
    c.lines.push(node?.line ?? (pc ? c.lines[pc - 1] : 1));
    c.stmt.push(this.pendingStmt !== 0);
    this.pendingStmt = 0;
    return pc;
  }

  here() { return this.code.ops.length; }
  patch(pc, target = this.here()) { this.code.args[pc] = target; }

  constIdx(v) {
    const c = this.code;
    // Merge primitive values; objects (floats) stay separate but are immutable
    if (v === null || typeof v !== 'object') {
      const i = c.consts.findIndex((x) => x === v && (x === null || typeof x !== 'object'));
      if (i >= 0) return i;
    }
    c.consts.push(v);
    return c.consts.length - 1;
  }

  nameIdx(n) {
    const c = this.code;
    let i = c.names.indexOf(n);
    if (i < 0) { c.names.push(n); i = c.names.length - 1; }
    return i;
  }

  body(stmts) { for (const s of stmts) this.stmt(s); }

  stmt(s) {
    this.pendingStmt = s.line;
    switch (s.type) {
      case 'Expr': this.expr(s.value); this.emit(OP.POP, 0, s); break;
      case 'Pass': this.emit(OP.NOP, 0, s); break;
      case 'Assign': {
        this.expr(s.value);
        s.targets.forEach((t, i) => {
          if (i < s.targets.length - 1) this.emit(OP.DUP, 0, s);
          this.store(t);
        });
        break;
      }
      case 'AugAssign': this.augAssign(s); break;
      case 'If': {
        this.expr(s.test);
        const jf = this.emit(OP.JUMP_IF_FALSE, 0, s);
        this.body(s.body);
        if (s.orelse.length) {
          const je = this.emit(OP.JUMP, 0, s);
          this.patch(jf);
          this.body(s.orelse);
          this.patch(je);
        } else this.patch(jf);
        break;
      }
      case 'While': {
        const top = this.here();
        this.expr(s.test);
        const jf = this.emit(OP.JUMP_IF_FALSE, 0, s);
        const loop = { cont: top, breaks: [], iter: false };
        this.ctx.push({ t: 'loop', loop });
        this.body(s.body);
        this.ctx.pop();
        this.pendingStmt = 0;
        this.emit(OP.JUMP, top, s);
        this.patch(jf);
        this.body(s.orelse);
        for (const b of loop.breaks) this.patch(b);
        break;
      }
      case 'For': {
        const p = this.pendingStmt;
        this.pendingStmt = 0;
        this.expr(s.iter);
        this.emit(OP.GET_ITER, 0, s);
        this.pendingStmt = p;
        const top = this.emit(OP.FOR_ITER, 0, s);
        const loop = { cont: top, breaks: [], iter: true };
        this.store(s.target);
        this.ctx.push({ t: 'loop', loop });
        this.body(s.body);
        this.ctx.pop();
        this.pendingStmt = 0;
        this.emit(OP.JUMP, top, s);
        this.patch(top);
        this.body(s.orelse);
        for (const b of loop.breaks) this.patch(b);
        break;
      }
      case 'Break': {
        const at = this.loopIndex();
        if (at < 0) throw this.err('outsideLoop', { what: 'break' }, s);
        const loop = this.ctx[at].loop;
        this.leave(at, false, s);
        if (loop.iter) this.emit(OP.POP, 0, s);
        loop.breaks.push(this.emit(OP.JUMP, 0, s));
        break;
      }
      case 'Continue': {
        const at = this.loopIndex();
        if (at < 0) throw this.err('outsideLoop', { what: 'continue' }, s);
        this.leave(at, false, s);
        this.emit(OP.JUMP, this.ctx[at].loop.cont, s);
        break;
      }
      case 'Try': this.tryStmt(s); break;
      case 'With': this.withStmt(s, 0); break;
      case 'Raise':
        if (!s.exc) this.emit(OP.RAISE, 0, s);
        else {
          this.expr(s.exc);
          if (s.cause) this.expr(s.cause);
          this.emit(OP.RAISE, s.cause ? 2 : 1, s);
        }
        break;
      case 'FunctionDef': {
        for (const d of s.decorators) this.expr(d);
        this.makeFunction(s, s.name, s.params, s.body);
        for (let i = 0; i < s.decorators.length; i++) this.emit(OP.CALL, 1, s);
        this.storeName(s.nameNode);
        break;
      }
      case 'ClassDef': {
        for (const d of s.decorators) this.expr(d);
        this.emit(OP.LOAD_CONST, this.constIdx(s.name), s);
        for (const b of s.bases) this.expr(b);
        this.emit(OP.BUILD_TUPLE, s.bases.length, s);
        const idx = this.compileCode(s, s.scope, s.name, []);
        this.codes[idx].classBody = true;
        for (const f of this.codes[idx].freevars) this.emit(OP.LOAD_CLOSURE, this.cellIndex(f), s);
        this.emit(OP.MAKE_FUNCTION, idx, s);
        this.emit(OP.BUILD_CLASS, 0, s);
        for (let i = 0; i < s.decorators.length; i++) this.emit(OP.CALL, 1, s);
        this.storeName(s.nameNode);
        break;
      }
      case 'Return':
        if (this.code.module || this.code.classBody) throw this.err('outsideFunction', { what: 'return' }, s);
        if (s.value) this.expr(s.value); else this.emit(OP.LOAD_CONST, this.constIdx(null), s);
        this.leave(-1, true, s);
        this.emit(OP.RETURN, 0, s);
        break;
      case 'Global': case 'Nonlocal': this.emit(OP.NOP, 0, s); break;
      case 'Delete':
        for (const t of s.targets) this.del(t);
        break;
      case 'Assert': {
        this.expr(s.test);
        const jt = this.emit(OP.JUMP_IF_TRUE, 0, s);
        if (s.msg) this.expr(s.msg); else this.emit(OP.LOAD_CONST, this.constIdx(null), s);
        this.emit(OP.ASSERT_FAIL, 0, s);
        this.patch(jt);
        break;
      }
      case 'Import':
        for (const n of s.names) {
          if (n.name.includes('.')) throw this.err('importUnknown', { name: n.name }, s);
          this.emit(OP.IMPORT, this.nameIdx(n.name), s);
          this.storeName(n.node);
        }
        break;
      case 'ImportFrom':
        this.emit(OP.IMPORT, this.nameIdx(s.module), s);
        if (!s.names) { this.emit(OP.IMPORT_STAR, 0, s); break; }
        for (const n of s.names) {
          this.emit(OP.IMPORT_FROM, this.nameIdx(n.name), s);
          this.storeName(n.node);
        }
        this.emit(OP.POP, 0, s);
        break;
      default: throw this.err('notSupported', { feature: s.type }, s);
    }
  }

  /** Index of the innermost loop in the context stack, or -1. */
  loopIndex() {
    for (let i = this.ctx.length - 1; i >= 0; i--) if (this.ctx[i].t === 'loop') return i;
    return -1;
  }

  /**
   * Leave the constructs above `at` of the context stack (break, continue, return): drop the exception blocks and
   * run the finally bodies inline (the value of a return stays on the stack meanwhile).
   */
  leave(at, isReturn, node) {
    for (let i = this.ctx.length - 1; i > at; i--) {
      const c = this.ctx[i];
      if (c.t === 'try') this.emit(OP.POP_BLOCK, 0, node);
      else if (c.t === 'handler') this.emit(OP.EXIT_HANDLER, 0, node);
      else if (c.t === 'finally') {
        this.emit(OP.POP_BLOCK, 0, node);
        const saved = this.ctx;
        this.ctx = saved.slice(0, i);
        this.body(c.body);
        this.ctx = saved;
      } else if (c.t === 'with') {
        // leaving the with block: __exit__(None, None, None); a return value on the stack sits above the manager's exit
        this.emit(OP.POP_BLOCK, 0, node);
        this.emit(OP.WITH_EXIT_OK, isReturn ? 1 : 0, node);
      } else if (c.t === 'stack' && !isReturn) this.emit(OP.POP, 0, node);
    }
  }

  /** with a as x, b as y: body – the manager's __exit__ runs however the block is left. */
  withStmt(s, i) {
    const item = s.items[i];
    this.expr(item.ctx);
    this.emit(OP.WITH_SETUP, 0, s);
    if (item.target) this.store(item.target); else this.emit(OP.POP, 0, s);
    const setup = this.emit(OP.SETUP_TRY, 0, s);
    this.ctx.push({ t: 'with' });
    if (i + 1 < s.items.length) this.withStmt(s, i + 1); else this.body(s.body);
    this.ctx.pop();
    this.emit(OP.POP_BLOCK, 0, s);
    this.emit(OP.WITH_EXIT_OK, 0, s);
    const end = this.emit(OP.JUMP, 0, s);
    this.patch(setup);
    const exc = this.emit(OP.WITH_EXC, 0, s);
    this.patch(end);
    this.patch(exc);
  }

  /** try / except / else / finally. */
  tryStmt(s) {
    if (!s.finalbody.length) { this.tryExcept(s); return; }
    // try … finally: the finally body runs after the try part, before every jump out of it, and when an exception passes
    const setup = this.emit(OP.SETUP_TRY, 0, s);
    this.ctx.push({ t: 'finally', body: s.finalbody });
    if (s.handlers.length) this.tryExcept(s); else this.body(s.body);
    this.ctx.pop();
    this.emit(OP.POP_BLOCK, 0, s);
    this.body(s.finalbody);
    const end = this.emit(OP.JUMP, 0, s);
    this.patch(setup);
    // exception path: the exception is on the stack while the finally body runs, then it continues
    this.ctx.push({ t: 'stack' });
    this.body(s.finalbody);
    this.ctx.pop();
    this.emit(OP.RERAISE, 0, s);
    this.patch(end);
  }

  tryExcept(s) {
    const setup = this.emit(OP.SETUP_TRY, 0, s);
    this.ctx.push({ t: 'try' });
    this.body(s.body);
    this.ctx.pop();
    this.emit(OP.POP_BLOCK, 0, s);
    this.body(s.orelse);
    const ends = [this.emit(OP.JUMP, 0, s)];
    this.patch(setup);
    for (const h of s.handlers) {
      let next = null;
      if (h.type) {
        this.pendingStmt = h.line;
        this.emit(OP.DUP, 0, h);
        this.expr(h.type);
        this.emit(OP.EXC_MATCH, 0, h);
        next = this.emit(OP.JUMP_IF_FALSE, 0, h);
      }
      this.emit(OP.ENTER_HANDLER, 0, h);
      if (h.name) { this.emit(OP.LOAD_EXC, 0, h); this.storeName(h.nameNode); }
      this.ctx.push({ t: 'handler' });
      this.body(h.body);
      this.ctx.pop();
      // like Python, the name of the exception is gone after the handler
      if (h.name) { this.emit(OP.LOAD_CONST, this.constIdx(null), h); this.storeName(h.nameNode); this.del(h.nameNode); }
      this.emit(OP.EXIT_HANDLER, 0, s);
      ends.push(this.emit(OP.JUMP, 0, s));
      if (next !== null) this.patch(next);
    }
    this.emit(OP.RERAISE, 0, s);
    for (const j of ends) this.patch(j);
  }

  augAssign(s) {
    const t = s.target;
    const op = BIN_OPS.indexOf(s.op);
    if (t.type === 'Name') {
      this.loadName(t);
      this.expr(s.value);
      this.emit(OP.INPLACE, op, s);
      this.storeName(t);
    } else if (t.type === 'Attribute') {
      this.expr(t.value);
      this.emit(OP.DUP, 0, s);
      this.emit(OP.LOAD_ATTR, this.nameIdx(t.attr), t);
      this.expr(s.value);
      this.emit(OP.INPLACE, op, s);
      this.emit(OP.ROT2, 0, s);
      this.emit(OP.STORE_ATTR, this.nameIdx(t.attr), t);
    } else {
      this.expr(t.value);
      this.expr(t.index);
      this.emit(OP.DUP2, 0, s);
      this.emit(OP.LOAD_INDEX, 0, t);
      this.expr(s.value);
      this.emit(OP.INPLACE, op, s);
      this.emit(OP.ROT3, 0, s);
      this.emit(OP.STORE_INDEX, 0, t);
    }
  }

  /** Generate a function: default values, cells, MAKE_FUNCTION. */
  makeFunction(node, name, params, body) {
    for (const p of params) if (p.default) this.expr(p.default);
    const idx = this.compileCode(node, node.scope, name, params);
    const inner = this.codes[idx];
    for (const f of inner.freevars) this.emit(OP.LOAD_CLOSURE, this.cellIndex(f), node);
    this.emit(OP.MAKE_FUNCTION, idx, node);
    return idx;
  }

  cellIndex(name) {
    const c = this.code;
    const i = c.cellvars.indexOf(name);
    if (i >= 0) return i;
    const j = c.freevars.indexOf(name);
    if (j >= 0) return c.cellvars.length + j;
    throw new Error(`Cell ${name} missing`);
  }

  /** How is a name addressed in the current code? */
  access(node) {
    const ref = node.ref;
    if (ref && ref.kind === 'name') return ['n', this.nameIdx(node.id)];
    if (!ref || ref.kind === 'global' || this.code.module) return ['g', this.nameIdx(node.id)];
    const c = this.code;
    if (c.cellvars.includes(node.id) || c.freevars.includes(node.id)) return ['d', this.cellIndex(node.id)];
    return ['f', c.varnames.indexOf(node.id)];
  }

  loadName(node) {
    const [k, i] = this.access(node);
    this.emit(k === 'g' ? OP.LOAD_GLOBAL : k === 'd' ? OP.LOAD_DEREF : k === 'n' ? OP.LOAD_NAME : OP.LOAD_FAST, i, node);
  }

  storeName(node) {
    const [k, i] = this.access(node);
    this.emit(k === 'g' ? OP.STORE_GLOBAL : k === 'd' ? OP.STORE_DEREF : k === 'n' ? OP.STORE_NAME : OP.STORE_FAST, i, node);
  }

  store(t) {
    switch (t.type) {
      case 'Name': this.storeName(t); break;
      case 'Attribute': this.expr(t.value); this.emit(OP.STORE_ATTR, this.nameIdx(t.attr), t); break;
      case 'Subscript': this.expr(t.value); this.expr(t.index); this.emit(OP.STORE_INDEX, 0, t); break;
      case 'Tuple': case 'List': {
        const star = t.elts.findIndex((e) => e.type === 'Starred');
        if (star < 0) this.emit(OP.UNPACK, t.elts.length, t);
        else this.emit(OP.UNPACK_EX, star * 256 + (t.elts.length - star - 1), t);
        for (const e of t.elts) this.store(e.type === 'Starred' ? e.value : e);
        break;
      }
      default: throw this.err('badAssign', { what: 'expr' }, t);
    }
  }

  del(t) {
    switch (t.type) {
      case 'Name': {
        const [k, i] = this.access(t);
        this.emit(k === 'g' ? OP.DELETE_GLOBAL : k === 'd' ? OP.DELETE_DEREF : k === 'n' ? OP.DELETE_NAME : OP.DELETE_FAST, i, t);
        break;
      }
      case 'Subscript': this.expr(t.value); this.expr(t.index); this.emit(OP.DELETE_INDEX, 0, t); break;
      case 'Attribute': this.expr(t.value); this.emit(OP.DELETE_ATTR, this.nameIdx(t.attr), t); break;
      case 'Tuple': case 'List': for (const e of t.elts) this.del(e); break;
      default: throw this.err('badAssign', { what: 'del' }, t);
    }
  }

  expr(e) {
    switch (e.type) {
      case 'Const': this.emit(OP.LOAD_CONST, this.constIdx(e.value), e); break;
      case 'Name': this.loadName(e); break;
      case 'BinOp': this.expr(e.left); this.expr(e.right); this.emit(OP.BINARY, BIN_OPS.indexOf(e.op), e); break;
      case 'UnaryOp': this.expr(e.operand); this.emit(OP.UNARY, UNARY_OPS.indexOf(e.op), e); break;
      case 'BoolOp': {
        const jumps = [];
        e.values.forEach((v, i) => {
          this.expr(v);
          if (i < e.values.length - 1) jumps.push(this.emit(e.op === 'and' ? OP.JUMP_IF_FALSE_OR_POP : OP.JUMP_IF_TRUE_OR_POP, 0, v));
        });
        for (const j of jumps) this.patch(j);
        break;
      }
      case 'Compare': {
        this.expr(e.left);
        const n = e.ops.length;
        const cleanups = [];
        e.ops.forEach((op, i) => {
          this.expr(e.comparators[i]);
          if (i < n - 1) {
            this.emit(OP.DUP, 0, e);
            this.emit(OP.ROT3, 0, e);
            this.emit(OP.COMPARE, CMP_OPS.indexOf(op), e.comparators[i]);
            cleanups.push(this.emit(OP.JUMP_IF_FALSE_OR_POP, 0, e));
          } else this.emit(OP.COMPARE, CMP_OPS.indexOf(op), e.comparators[i]);
        });
        if (n > 1) {
          const je = this.emit(OP.JUMP, 0, e);
          for (const c of cleanups) this.patch(c);
          this.emit(OP.ROT2, 0, e);
          this.emit(OP.POP, 0, e);
          this.patch(je);
        }
        break;
      }
      case 'Call': this.call(e); break;
      case 'Attribute': this.expr(e.value); this.emit(OP.LOAD_ATTR, this.nameIdx(e.attr), e); break;
      case 'Subscript': this.expr(e.value); this.expr(e.index); this.emit(OP.LOAD_INDEX, 0, e); break;
      case 'Slice':
        for (const part of [e.lower, e.upper, e.step]) {
          if (part) this.expr(part); else this.emit(OP.LOAD_CONST, this.constIdx(null), e);
        }
        this.emit(OP.BUILD_SLICE, 3, e);
        break;
      case 'List': case 'Tuple':
        if (e.elts.some((x) => x.type === 'Starred')) {
          this.emit(OP.BUILD_LIST, 0, e);
          for (const x of e.elts) {
            if (x.type === 'Starred') { this.expr(x.value); this.emit(OP.LIST_EXTEND, 0, x); }
            else { this.expr(x); this.emit(OP.LIST_PUSH, 0, x); }
          }
          if (e.type === 'Tuple') this.emit(OP.LIST_TO_TUPLE, 0, e);
        } else {
          for (const x of e.elts) this.expr(x);
          this.emit(e.type === 'List' ? OP.BUILD_LIST : OP.BUILD_TUPLE, e.elts.length, e);
        }
        break;
      case 'Dict':
        e.keys.forEach((k, i) => { this.expr(k); this.expr(e.values[i]); });
        this.emit(OP.BUILD_DICT, e.keys.length, e);
        break;
      case 'IfExp': {
        this.expr(e.test);
        const jf = this.emit(OP.JUMP_IF_FALSE, 0, e);
        this.expr(e.body);
        const je = this.emit(OP.JUMP, 0, e);
        this.patch(jf);
        this.expr(e.orelse);
        this.patch(je);
        break;
      }
      case 'Lambda': this.makeFunction(e, '<lambda>', e.params, e.body); break;
      case 'GenExp':
        this.makeFunction(e, '<genexpr>', e.params, e.body);
        this.expr(e.firstIter);
        this.emit(OP.GET_ITER, 0, e);
        this.emit(OP.CALL, 1, e);
        break;
      case 'Yield':
        if (e.value) this.expr(e.value); else this.emit(OP.LOAD_CONST, this.constIdx(null), e);
        this.emit(OP.YIELD, 0, e);
        break;
      case 'YieldFrom': {
        this.expr(e.value);
        this.emit(OP.GET_ITER, 0, e);
        const top = this.emit(OP.FOR_ITER, 0, e);
        this.emit(OP.YIELD, 0, e);
        this.emit(OP.POP, 0, e);
        this.emit(OP.JUMP, top, e);
        this.patch(top);
        this.emit(OP.LOAD_CONST, this.constIdx(null), e);
        break;
      }
      case 'JoinedStr': {
        let n = 0;
        for (const p of e.parts) {
          n++;
          if (typeof p === 'string') { this.emit(OP.LOAD_CONST, this.constIdx(p), e); continue; }
          this.expr(p.value);
          let flags = { s: 1, r: 2, a: 3 }[p.conv] ?? 0;
          if (p.spec !== null && p.spec !== undefined) {
            if (typeof p.spec === 'string') this.emit(OP.LOAD_CONST, this.constIdx(p.spec), e);
            else this.expr(p.spec);
            flags |= 4;
          }
          this.emit(OP.FORMAT, flags, p.value);
        }
        if (n !== 1 || typeof e.parts[0] !== 'string') this.emit(OP.BUILD_STRING, n, e);
        break;
      }
      case 'ListComp': case 'DictComp': case 'SetComp': this.comprehension(e); break;
      case 'Set':
        for (const x of e.elts) this.expr(x);
        this.emit(OP.BUILD_SET, e.elts.length, e);
        break;
      case 'Starred': throw this.err('badAssign', { what: 'starred' }, e);
      default: throw this.err('notSupported', { feature: e.type }, e);
    }
  }

  call(e) {
    // super() without arguments: the class of the running method and its first argument
    if (e.func.type === 'Name' && e.func.id === 'super' && !e.args.length && !e.keywords.length && !this.code.module && !this.code.classBody) {
      this.emit(OP.SUPER, 0, e);
      return;
    }
    this.expr(e.func);
    const starred = e.args.some((a) => a.type === 'Starred') || e.keywords.some((k) => k.name === null);
    if (starred) {
      this.emit(OP.BUILD_LIST, 0, e);
      for (const a of e.args) {
        if (a.type === 'Starred') { this.expr(a.value); this.emit(OP.LIST_EXTEND, 0, a); }
        else { this.expr(a); this.emit(OP.LIST_PUSH, 0, a); }
      }
      for (const k of e.keywords) this.expr(k.value);
      // null as name: **dictionary, unpacked in the VM
      this.emit(OP.LOAD_CONST, this.constIdx(e.keywords.map((k) => k.name)), e);
      this.emit(OP.CALL_EX, e.keywords.length, e);
      return;
    }
    for (const a of e.args) this.expr(a);
    if (e.keywords.length) {
      for (const k of e.keywords) this.expr(k.value);
      this.emit(OP.LOAD_CONST, this.constIdx(e.keywords.map((k) => k.name)), e);
      this.emit(OP.CALL_KW, e.args.length + e.keywords.length, e);
    } else this.emit(OP.CALL, e.args.length, e);
  }

  comprehension(e) {
    this.emit(e.type === 'DictComp' ? OP.BUILD_DICT : e.type === 'SetComp' ? OP.BUILD_SET : OP.BUILD_LIST, 0, e);
    const k = e.generators.length;
    const exits = [];
    const tops = [];
    e.generators.forEach((g) => {
      this.expr(g.iter);
      this.emit(OP.GET_ITER, 0, g.iter);
      const top = this.emit(OP.FOR_ITER, 0, g.iter);
      tops.push(top);
      exits.push(top);
      this.store(g.target);
      for (const c of g.ifs) {
        this.expr(c);
        this.emit(OP.JUMP_IF_FALSE, top, c);
      }
    });
    if (e.type === 'DictComp') {
      this.expr(e.elt.key);
      this.expr(e.elt.value);
      this.emit(OP.DICT_SET, k, e);
    } else {
      this.expr(e.elt);
      this.emit(e.type === 'SetComp' ? OP.SET_ADD : OP.LIST_APPEND, k, e);
    }
    for (let i = k - 1; i >= 0; i--) {
      this.emit(OP.JUMP, tops[i], e);
      this.patch(exits[i]);
    }
  }
}
