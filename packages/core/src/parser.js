// Parser of the Python subset: tokens → syntax tree (plain objects with type, line, col).
// Statements by recursive descent, expressions by Python's precedence
// (lambda < if-else < or < and < not < comparisons < | < ^ < & < Shift < + - < * / // % < sign < ** < call).

import { tokenize } from './lexer.js';
import { ScriptError } from './errors.js';
import { PyFloat } from './values.js';

/** Language features that are (still) missing: friendly message instead of "unexpected token". */
const UNSUPPORTED_KW = { class: 'class', try: 'try', except: 'try', finally: 'try', raise: 'raise', with: 'with', yield: 'yield', async: 'async', await: 'async' };

const AUG_OPS = { '+=': '+', '-=': '-', '*=': '*', '/=': '/', '//=': '//', '%=': '%', '**=': '**', '&=': '&', '|=': '|', '^=': '^', '<<=': '<<', '>>=': '>>' };
const COMPARE_OPS = new Set(['<', '>', '==', '>=', '<=', '!=']);

/**
 * @param {string} src
 * @returns {any} Module { type: 'Module', body }
 */
export function parse(src) {
  const p = new Parser(tokenize(src));
  return p.module();
}

/** Expression in an f-string (own lexer run with position offset). */
function parseInlineExpr(src, line, col) {
  const p = new Parser(tokenize(src, { line, col }));
  const e = p.testListStarExpr();
  if (!p.at('eof')) throw p.error('unexpected', { token: p.tokText(p.tok) });
  return e;
}

class Parser {
  constructor(tokens) {
    this.t = tokens;
    this.i = 0;
  }

  get tok() { return this.t[this.i]; }
  peek(k = 1) { return this.t[Math.min(this.i + k, this.t.length - 1)]; }
  next() { return this.t[this.i++]; }

  at(type, value) {
    const t = this.tok;
    return t.type === type && (value === undefined || t.value === value);
  }
  atOp(v) { return this.at('op', v); }
  atKw(v) { return this.at('kw', v); }

  accept(type, value) {
    if (this.at(type, value)) return this.next();
    return null;
  }

  expect(type, value, what) {
    if (this.at(type, value)) return this.next();
    if (type === 'indent') throw this.error('expectedIndent', {});
    if (type === 'newline' && this.tok.type !== 'eof') throw this.error('unexpected', { token: this.tokText(this.tok) });
    throw this.error('expected', { what: what ?? value ?? type, got: this.tokText(this.tok) });
  }

  tokText(t) {
    switch (t.type) {
      case 'eof': return 'EOF';
      case 'newline': return 'NEWLINE';
      case 'indent': return 'INDENT';
      case 'dedent': return 'DEDENT';
      case 'str': case 'fstr': return '"…"';
      default: return String(t.value);
    }
  }

  error(code, params, tok = this.tok) {
    return new ScriptError(code, params, { line: tok.line, col: tok.col });
  }

  pos(tok = this.tok) { return { line: tok.line, col: tok.col }; }

  // ---------- Statements ----------

  module() {
    const body = [];
    while (!this.at('eof')) {
      if (this.accept('newline')) continue;
      if (this.at('indent')) throw this.error('indent', {});
      body.push(...this.statement());
    }
    return { type: 'Module', body, line: 1, col: 1 };
  }

  /** @returns {any[]} one or more statements (a = 1; b = 2) */
  statement() {
    const t = this.tok;
    if (t.type === 'kw') {
      switch (t.value) {
        case 'if': return [this.ifStmt()];
        case 'while': return [this.whileStmt()];
        case 'for': return [this.forStmt()];
        case 'def': return [this.funcDef([])];
        default: break;
      }
      if (UNSUPPORTED_KW[t.value]) throw this.error('notSupported', { feature: UNSUPPORTED_KW[t.value] });
    }
    if (this.atOp('@')) return [this.decorated()];
    return this.simpleStatements();
  }

  simpleStatements() {
    const out = [this.smallStatement()];
    while (this.accept('op', ';')) {
      if (this.at('newline') || this.at('eof')) break;
      out.push(this.smallStatement());
    }
    if (!this.at('eof')) this.expect('newline');
    return out;
  }

  smallStatement() {
    const t = this.tok, p = this.pos();
    if (t.type === 'kw') {
      switch (t.value) {
        case 'pass': this.next(); return { type: 'Pass', ...p };
        case 'break': this.next(); return { type: 'Break', ...p };
        case 'continue': this.next(); return { type: 'Continue', ...p };
        case 'return': {
          this.next();
          const value = this.at('newline') || this.at('eof') || this.atOp(';') ? null : this.testListStarExpr();
          return { type: 'Return', value, ...p };
        }
        case 'global': case 'nonlocal': {
          this.next();
          const names = [this.expect('name', undefined, 'name').value];
          while (this.accept('op', ',')) names.push(this.expect('name', undefined, 'name').value);
          return { type: t.value === 'global' ? 'Global' : 'Nonlocal', names, ...p };
        }
        case 'del': {
          this.next();
          const targets = [this.expr()];
          while (this.accept('op', ',')) { if (this.at('newline')) break; targets.push(this.expr()); }
          for (const x of targets) this.checkTarget(x, true);
          return { type: 'Delete', targets, ...p };
        }
        case 'assert': {
          this.next();
          const test = this.test();
          const msg = this.accept('op', ',') ? this.test() : null;
          return { type: 'Assert', test, msg, ...p };
        }
        case 'import': {
          this.next();
          const names = [this.importName()];
          while (this.accept('op', ',')) names.push(this.importName());
          return { type: 'Import', names, ...p };
        }
        case 'from': {
          this.next();
          let module = this.expect('name', undefined, 'module').value;
          while (this.accept('op', '.')) module += '.' + this.expect('name', undefined, 'name').value;
          this.expect('kw', 'import');
          if (this.accept('op', '*')) return { type: 'ImportFrom', module, names: null, ...p };
          const paren = this.accept('op', '(');
          const names = [this.importName(true)];
          while (this.accept('op', ',')) { if (paren && this.atOp(')')) break; names.push(this.importName(true)); }
          if (paren) this.expect('op', ')');
          return { type: 'ImportFrom', module, names, ...p };
        }
        default: break;
      }
      if (UNSUPPORTED_KW[t.value]) throw this.error('notSupported', { feature: UNSUPPORTED_KW[t.value] });
    }
    return this.exprStatement();
  }

  importName(plain = false) {
    let name = this.expect('name', undefined, 'module').value;
    if (!plain) while (this.accept('op', '.')) name += '.' + this.expect('name', undefined, 'name').value;
    const asname = this.accept('kw', 'as') ? this.expect('name', undefined, 'name').value : null;
    return { name, asname };
  }

  exprStatement() {
    const p = this.pos();
    const first = this.testListStarExpr();
    // Annotated assignment: x: int = 5 (type annotation is ignored)
    if (this.atOp(':') && first.type === 'Name') {
      this.next();
      this.test();
      if (!this.accept('op', '=')) return { type: 'Pass', ...p };
      const value = this.testListStarExpr();
      return { type: 'Assign', targets: [first], value, ...p };
    }
    const aug = this.tok.type === 'op' && AUG_OPS[this.tok.value];
    if (aug) {
      const opTok = this.next();
      if (!['Name', 'Attribute', 'Subscript'].includes(first.type)) throw this.error('badAssign', { what: 'aug' }, opTok);
      const value = this.testListStarExpr();
      return { type: 'AugAssign', target: first, op: aug, value, ...p };
    }
    if (this.atOp('=')) {
      const targets = [first];
      let value = null;
      while (this.accept('op', '=')) {
        value = this.testListStarExpr();
        targets.push(value);
      }
      targets.pop();
      for (const x of targets) this.checkTarget(x);
      return { type: 'Assign', targets, value, ...p };
    }
    if (this.atOp('==') === false && this.atOp(':=')) throw this.error('notSupported', { feature: 'walrus' });
    return { type: 'Expr', value: first, ...p };
  }

  /** May this stand left of the =? */
  checkTarget(x, del = false) {
    switch (x.type) {
      case 'Name': case 'Attribute': case 'Subscript': return;
      case 'Tuple': case 'List':
        for (const e of x.elts) {
          if (e.type === 'Starred') { if (del) throw new ScriptError('badAssign', { what: 'del' }, x); this.checkTarget(e.value); }
          else this.checkTarget(e, del);
        }
        if (x.elts.filter((e) => e.type === 'Starred').length > 1) throw new ScriptError('badAssign', { what: 'starred' }, x);
        return;
      case 'Call': throw new ScriptError('badAssign', { what: 'call' }, x);
      case 'Const': throw new ScriptError('badAssign', { what: 'literal' }, x);
      default: throw new ScriptError('badAssign', { what: del ? 'del' : 'expr' }, x);
    }
  }

  /** Indented block after ':' (or single-line: if x: y = 1). */
  block() {
    if (!this.atOp(':')) throw this.error('expected', { what: 'colon', got: this.tokText(this.tok) });
    const colon = this.next();
    if (!this.at('newline')) return this.simpleStatements();
    this.expect('newline');
    // Missing block at the end of the program (or only a comment there): report the line with the colon,
    // not a line after the section; otherwise the line that should be indented (as CPython)
    if (!this.at('indent')) throw this.error('expectedIndent', {}, this.at('eof') ? colon : this.tok);
    this.next();
    const body = [];
    while (!this.at('dedent') && !this.at('eof')) {
      if (this.accept('newline')) continue;
      if (this.at('indent')) throw this.error('indent', {});
      body.push(...this.statement());
    }
    this.accept('dedent');
    return body;
  }

  ifStmt() {
    const p = this.pos();
    this.next();
    const test = this.namedTest();
    if (this.atOp('=')) throw this.error('badAssign', { what: 'condition' });
    const body = this.block();
    let orelse = [];
    if (this.atKw('elif')) orelse = [this.ifStmt()];
    else if (this.accept('kw', 'else')) orelse = this.block();
    return { type: 'If', test, body, orelse, ...p };
  }

  whileStmt() {
    const p = this.pos();
    this.next();
    const test = this.namedTest();
    if (this.atOp('=')) throw this.error('badAssign', { what: 'condition' });
    const body = this.block();
    const orelse = this.accept('kw', 'else') ? this.block() : [];
    return { type: 'While', test, body, orelse, ...p };
  }

  forStmt() {
    const p = this.pos();
    this.next();
    const target = this.targetList();
    this.checkTarget(target);
    this.expect('kw', 'in');
    const iter = this.testList();
    const body = this.block();
    const orelse = this.accept('kw', 'else') ? this.block() : [];
    return { type: 'For', target, iter, body, orelse, ...p };
  }

  /** for target: a or a, b or (a, b) – without swallowing "in". */
  targetList() {
    const p = this.pos();
    const first = this.starOrExpr();
    if (!this.atOp(',')) return first;
    const elts = [first];
    while (this.accept('op', ',')) {
      if (this.atKw('in') || this.atOp('=')) break;
      elts.push(this.starOrExpr());
    }
    return { type: 'Tuple', elts, ...p };
  }

  starOrExpr() {
    if (this.atOp('*')) { const p = this.pos(); this.next(); return { type: 'Starred', value: this.expr(), ...p }; }
    return this.expr();
  }

  decorated() {
    const decorators = [];
    while (this.atOp('@')) {
      this.next();
      decorators.push(this.namedTest());
      this.expect('newline');
    }
    if (!this.atKw('def')) {
      if (this.atKw('class')) throw this.error('notSupported', { feature: 'class' });
      throw this.error('expected', { what: 'def', got: this.tokText(this.tok) });
    }
    return this.funcDef(decorators);
  }

  funcDef(decorators) {
    const p = this.pos();
    this.next();
    const name = this.expect('name', undefined, 'name').value;
    this.expect('op', '(');
    const params = this.params(')');
    this.expect('op', ')');
    if (this.accept('op', '->')) this.test();
    const body = this.block();
    return { type: 'FunctionDef', name, params, vararg: params.vararg, kwarg: params.kwarg, body, decorators, ...p };
  }

  /**
   * Parameter list: a, b=1, *args (only as an error), type annotations are ignored.
   * @returns {{name: string, default: any, line: number, col: number}[]}
   */
  params(close) {
    const params = [];
    let seenDefault = false;
    const seen = (n) => params.some((q) => q.name === n) || params.vararg === n || params.kwarg === n;
    while (!this.atOp(close)) {
      if (this.atOp('*') || this.atOp('**')) {
        const star = this.next().value;
        if (params.kwarg) throw this.error('badParams', {});
        const t = this.at('name') ? this.next() : null;
        if (!t) throw this.error('notSupported', { feature: 'kwOnly' });
        if (seen(t.value)) throw this.error('duplicateArg', { name: t.value }, t);
        if (close === ')' && this.accept('op', ':')) this.test();
        if (star === '*') { if (params.vararg) throw this.error('badParams', {}, t); params.vararg = t.value; }
        else params.kwarg = t.value;
        if (!this.accept('op', ',')) break;
        continue;
      }
      if (params.vararg || params.kwarg) throw this.error('notSupported', { feature: 'kwOnly' });
      const t = this.expect('name', undefined, 'name');
      if (seen(t.value)) throw this.error('duplicateArg', { name: t.value }, t);
      if (close === ')' && this.accept('op', ':')) this.test();
      let def = null;
      if (this.accept('op', '=')) { def = this.test(); seenDefault = true; } else if (seenDefault) throw this.error('badParams', {}, t);
      params.push({ name: t.value, default: def, line: t.line, col: t.col });
      if (!this.accept('op', ',')) break;
    }
    return params;
  }

  // ---------- Expressions ----------

  /** Expression or tuple without brackets, also with *x (assignment targets, return a, b). */
  testListStarExpr() {
    const p = this.pos();
    const first = this.atOp('*') ? this.starOrExpr() : this.test();
    if (!this.atOp(',')) return first;
    const elts = [first];
    while (this.accept('op', ',')) {
      if (this.endOfTuple()) break;
      elts.push(this.atOp('*') ? this.starOrExpr() : this.test());
    }
    return { type: 'Tuple', elts, ...p };
  }

  testList() {
    const p = this.pos();
    const first = this.test();
    if (!this.atOp(',')) return first;
    const elts = [first];
    while (this.accept('op', ',')) {
      if (this.endOfTuple()) break;
      elts.push(this.test());
    }
    return { type: 'Tuple', elts, ...p };
  }

  endOfTuple() {
    const t = this.tok;
    return t.type === 'newline' || t.type === 'eof' || (t.type === 'op' && [')', ']', '}', '=', ':', ';'].includes(t.value)) || AUG_OPS[t.value] !== undefined;
  }

  namedTest() {
    const e = this.test();
    if (this.atOp(':=')) throw this.error('notSupported', { feature: 'walrus' });
    return e;
  }

  test() {
    if (this.atKw('lambda')) return this.lambda();
    const p = this.pos();
    const body = this.orTest();
    if (this.atKw('if')) {
      this.next();
      const test = this.orTest();
      this.expect('kw', 'else');
      const orelse = this.test();
      return { type: 'IfExp', test, body, orelse, ...p };
    }
    return body;
  }

  testNoCond() {
    if (this.atKw('lambda')) return this.lambda(true);
    return this.orTest();
  }

  lambda(noCond = false) {
    const p = this.pos();
    this.next();
    const params = this.params(':');
    this.expect('op', ':');
    const body = noCond ? this.testNoCond() : this.test();
    return { type: 'Lambda', params, vararg: params.vararg, kwarg: params.kwarg, body, ...p };
  }

  orTest() {
    const p = this.pos();
    let left = this.andTest();
    if (!this.atKw('or')) return left;
    const values = [left];
    while (this.accept('kw', 'or')) values.push(this.andTest());
    left = { type: 'BoolOp', op: 'or', values, ...p };
    return left;
  }

  andTest() {
    const p = this.pos();
    const left = this.notTest();
    if (!this.atKw('and')) return left;
    const values = [left];
    while (this.accept('kw', 'and')) values.push(this.notTest());
    return { type: 'BoolOp', op: 'and', values, ...p };
  }

  notTest() {
    if (this.atKw('not')) {
      const p = this.pos();
      this.next();
      return { type: 'UnaryOp', op: 'not', operand: this.notTest(), ...p };
    }
    return this.comparison();
  }

  comparison() {
    const p = this.pos();
    const left = this.expr();
    const ops = [], comparators = [];
    for (;;) {
      let op = null;
      const t = this.tok;
      if (t.type === 'op' && COMPARE_OPS.has(t.value)) { op = t.value; this.next(); }
      else if (this.atKw('in')) { op = 'in'; this.next(); }
      else if (this.atKw('not') && this.peek().type === 'kw' && this.peek().value === 'in') { op = 'not in'; this.next(); this.next(); }
      else if (this.atKw('is')) { this.next(); op = this.accept('kw', 'not') ? 'is not' : 'is'; }
      else break;
      ops.push(op);
      comparators.push(this.expr());
    }
    if (!ops.length) return left;
    return { type: 'Compare', left, ops, comparators, ...p };
  }

  binLevel(next, ops) {
    const p = this.pos();
    let left = next();
    while (this.tok.type === 'op' && ops.includes(this.tok.value)) {
      const op = this.next().value;
      left = { type: 'BinOp', op, left, right: next(), ...p };
    }
    return left;
  }

  expr() { return this.binLevel(() => this.xorExpr(), ['|']); }
  xorExpr() { return this.binLevel(() => this.andExpr(), ['^']); }
  andExpr() { return this.binLevel(() => this.shiftExpr(), ['&']); }
  shiftExpr() { return this.binLevel(() => this.arith(), ['<<', '>>']); }
  arith() { return this.binLevel(() => this.term(), ['+', '-']); }
  term() {
    const e = this.binLevel(() => this.factor(), ['*', '/', '//', '%', '@']);
    if (e.type === 'BinOp' && e.op === '@') throw new ScriptError('notSupported', { feature: 'matmul' }, e);
    return e;
  }

  factor() {
    const t = this.tok;
    if (t.type === 'op' && (t.value === '-' || t.value === '+' || t.value === '~')) {
      const p = this.pos();
      this.next();
      const operand = this.factor();
      // Negative number directly as a constant (for assignment checks and a faster VM)
      if (t.value === '-' && operand.type === 'Const' && typeof operand.value === 'number' && !operand.paren) return { type: 'Const', value: -operand.value === 0 ? 0 : -operand.value, ...p };
      return { type: 'UnaryOp', op: t.value, operand, ...p };
    }
    return this.power();
  }

  power() {
    const p = this.pos();
    const base = this.atomExpr();
    if (this.atOp('**')) {
      this.next();
      return { type: 'BinOp', op: '**', left: base, right: this.factor(), ...p };
    }
    return base;
  }

  atomExpr() {
    let e = this.atom();
    for (;;) {
      const p = this.pos();
      if (this.atOp('(')) {
        this.next();
        e = this.callArgs(e, p);
      } else if (this.atOp('[')) {
        this.next();
        const index = this.subscript();
        this.expect('op', ']');
        e = { type: 'Subscript', value: e, index, ...p };
      } else if (this.atOp('.')) {
        this.next();
        const name = this.tok;
        if (name.type !== 'name' && name.type !== 'kw') throw this.error('expected', { what: 'name', got: this.tokText(name) });
        this.next();
        e = { type: 'Attribute', value: e, attr: name.value, ...this.pos(name) };
      } else return e;
    }
  }

  callArgs(func, p) {
    const args = [], keywords = [];
    while (!this.atOp(')')) {
      if (this.atOp('*')) {
        const sp = this.pos();
        this.next();
        args.push({ type: 'Starred', value: this.test(), ...sp });
      } else if (this.atOp('**')) {
        const sp = this.pos();
        this.next();
        keywords.push({ name: null, value: this.test(), ...sp });
      } else if (this.at('name') && this.peek().type === 'op' && this.peek().value === '=') {
        const nt = this.next();
        this.next();
        if (keywords.some((k) => k.name === nt.value)) throw this.error('argDuplicate', { name: nt.value }, nt);
        keywords.push({ name: nt.value, value: this.test(), line: nt.line, col: nt.col });
      } else {
        if (keywords.length) throw this.error('badParams', { what: 'positionalAfterKeyword' });
        const e = this.test();
        if (this.atKw('for')) { args.push(this.comprehension('GeneratorExp', e, p)); break; }
        args.push(e);
      }
      if (!this.accept('op', ',')) break;
    }
    this.expect('op', ')');
    return { type: 'Call', func, args, keywords, ...p };
  }

  subscript() {
    const p = this.pos();
    const one = () => {
      const sp = this.pos();
      let lower = null, upper = null, step = null;
      if (!this.atOp(':')) {
        lower = this.test();
        if (!this.atOp(':')) return lower;
      }
      this.next();
      if (!this.atOp(']') && !this.atOp(':') && !this.atOp(',')) upper = this.test();
      if (this.accept('op', ':')) {
        if (!this.atOp(']') && !this.atOp(',')) step = this.test();
      }
      return { type: 'Slice', lower, upper, step, ...sp };
    };
    const first = one();
    if (!this.atOp(',')) return first;
    const elts = [first];
    while (this.accept('op', ',')) { if (this.atOp(']')) break; elts.push(one()); }
    return { type: 'Tuple', elts, ...p };
  }

  atom() {
    const t = this.tok, p = this.pos();
    switch (t.type) {
      case 'name': this.next(); return { type: 'Name', id: t.value, ...p };
      case 'int': this.next(); return { type: 'Const', value: t.value, ...p };
      case 'float': this.next(); return { type: 'Const', value: new PyFloat(t.value), ...p };
      case 'str': case 'fstr': return this.strings();
      case 'kw':
        if (t.value === 'True' || t.value === 'False' || t.value === 'None') {
          this.next();
          return { type: 'Const', value: t.value === 'None' ? null : t.value === 'True', ...p };
        }
        if (UNSUPPORTED_KW[t.value]) throw this.error('notSupported', { feature: UNSUPPORTED_KW[t.value] });
        throw this.error('unexpected', { token: t.value });
      case 'op':
        if (t.value === '(') return this.parenAtom();
        if (t.value === '[') return this.listAtom();
        if (t.value === '{') return this.dictAtom();
        if (t.value === '...') { this.next(); return { type: 'Const', value: null, ...p }; }
        throw this.error('unexpected', { token: t.value });
      case 'indent': throw this.error('indent', {});
      case 'newline': case 'eof': throw this.error('expected', { what: 'expression', got: this.tokText(t) });
      default: throw this.error('unexpected', { token: this.tokText(t) });
    }
  }

  parenAtom() {
    const p = this.pos();
    this.next();
    if (this.accept('op', ')')) return { type: 'Tuple', elts: [], ...p };
    const first = this.atOp('*') ? this.starOrExpr() : this.test();
    if (this.atKw('for')) {
      const g = this.comprehension('GeneratorExp', first, p);
      this.expect('op', ')');
      return g;
    }
    if (this.accept('op', ')')) {
      if (first.type === 'Starred') throw new ScriptError('badAssign', { what: 'starred' }, first);
      return { ...first, paren: true };
    }
    const elts = [first];
    while (this.accept('op', ',')) {
      if (this.atOp(')')) break;
      elts.push(this.atOp('*') ? this.starOrExpr() : this.test());
    }
    this.expect('op', ')');
    return { type: 'Tuple', elts, ...p };
  }

  listAtom() {
    const p = this.pos();
    this.next();
    if (this.accept('op', ']')) return { type: 'List', elts: [], ...p };
    const first = this.atOp('*') ? this.starOrExpr() : this.test();
    if (this.atKw('for')) {
      const c = this.comprehension('ListComp', first, p);
      this.expect('op', ']');
      return c;
    }
    const elts = [first];
    while (this.accept('op', ',')) {
      if (this.atOp(']')) break;
      elts.push(this.atOp('*') ? this.starOrExpr() : this.test());
    }
    this.expect('op', ']');
    return { type: 'List', elts, ...p };
  }

  dictAtom() {
    const p = this.pos();
    this.next();
    if (this.accept('op', '}')) return { type: 'Dict', keys: [], values: [], ...p };
    const k = this.test();
    if (!this.atOp(':')) throw this.error('notSupported', { feature: 'set' });
    this.next();
    const v = this.test();
    if (this.atKw('for')) {
      const c = this.comprehension('DictComp', { key: k, value: v }, p);
      this.expect('op', '}');
      return c;
    }
    const keys = [k], values = [v];
    while (this.accept('op', ',')) {
      if (this.atOp('}')) break;
      keys.push(this.test());
      this.expect('op', ':');
      values.push(this.test());
    }
    this.expect('op', '}');
    return { type: 'Dict', keys, values, ...p };
  }

  comprehension(type, elt, p) {
    const generators = [];
    while (this.atKw('for')) {
      this.next();
      const target = this.targetList();
      this.checkTarget(target);
      this.expect('kw', 'in');
      const iter = this.orTest();
      const ifs = [];
      while (this.atKw('if')) { this.next(); ifs.push(this.testNoCond()); }
      generators.push({ target, iter, ifs });
    }
    // Generator expressions are evaluated like lists (sum(x for x in …) works the same)
    return { type: type === 'GeneratorExp' ? 'ListComp' : type, elt, generators, generator: type === 'GeneratorExp', ...p };
  }

  /** Consecutive strings are joined ("a" "b"), f-strings split into parts. */
  strings() {
    const p = this.pos();
    const parts = [];
    let hasF = false;
    while (this.at('str') || this.at('fstr')) {
      const t = this.next();
      if (t.type === 'str') parts.push(t.value);
      else { hasF = true; parts.push(...this.fstringParts(t)); }
    }
    if (!hasF) return { type: 'Const', value: parts.join(''), ...p };
    // Merge adjacent text pieces
    const merged = [];
    for (const x of parts) {
      if (typeof x === 'string' && typeof merged[merged.length - 1] === 'string') merged[merged.length - 1] += x;
      else merged.push(x);
    }
    return { type: 'JoinedStr', parts: merged, ...p };
  }

  /** f"Wood: {wood:>5} and {name!r}" → ['Wood: ', {value, conv, spec}, …] */
  fstringParts(tok) {
    const s = tok.value;
    const out = [];
    let i = 0, text = '';
    // Position in the source for error messages (precise enough: line of the string, column from the content)
    const base = tok.contentStart ?? { line: tok.line, col: tok.col };
    const posAt = (k) => {
      const before = s.slice(0, k);
      const nl = before.lastIndexOf('\n');
      const line = base.line + (before.match(/\n/g)?.length ?? 0);
      const col = nl < 0 ? base.col + k : k - nl;
      return { line, col };
    };
    while (i < s.length) {
      const c = s[i];
      if (c === '{') {
        if (s[i + 1] === '{') { text += '{'; i += 2; continue; }
        if (text) { out.push(text); text = ''; }
        // find the end of the expression (mind brackets and strings)
        let depth = 0, j = i + 1, quote = null;
        let exprEnd = -1, conv = null, specStart = -1;
        for (; j < s.length; j++) {
          const d = s[j];
          if (quote) { if (d === quote) quote = null; continue; }
          if (d === '"' || d === "'") { quote = d; continue; }
          if (d === '(' || d === '[' || d === '{') depth++;
          else if (d === ')' || d === ']' || (d === '}' && depth > 0)) depth--;
          else if (depth === 0 && d === '!' && s[j + 1] !== '=' && exprEnd < 0) { exprEnd = j; conv = s[j + 1]; j++; }
          else if (depth === 0 && d === ':' && specStart < 0) { if (exprEnd < 0) exprEnd = j; specStart = j + 1; break; }
          else if (depth === 0 && d === '}') { if (exprEnd < 0) exprEnd = j; break; }
        }
        let close = j;
        let spec = null;
        if (specStart >= 0) {
          // the format spec may itself contain {nested} fields
          let k = specStart, dd = 0;
          for (; k < s.length; k++) { if (s[k] === '{') dd++; else if (s[k] === '}') { if (dd === 0) break; dd--; } }
          close = k;
          const specText = s.slice(specStart, k);
          spec = specText.includes('{')
            ? { type: 'JoinedStr', parts: this.fstringParts({ ...tok, value: specText, contentStart: posAt(specStart) }), ...posAt(specStart) }
            : specText;
        }
        if (close >= s.length || s[close] !== '}') throw new ScriptError('badFString', { what: 'unclosed' }, posAt(i));
        const exprText = s.slice(i + 1, exprEnd);
        if (!exprText.trim()) throw new ScriptError('badFString', { what: 'empty' }, posAt(i));
        if (conv !== null && !'rsa'.includes(conv)) throw new ScriptError('badFString', { what: 'conversion' }, posAt(exprEnd));
        // self-documenting: f"{x=}"
        let selfDoc = null;
        let src = exprText;
        if (/=\s*$/.test(src) && !/[=!<>]=\s*$/.test(src)) { selfDoc = src; src = src.replace(/=\s*$/, ''); }
        const at = posAt(i + 1);
        const value = parseInlineExpr(src, at.line, at.col);
        if (selfDoc) out.push(selfDoc);
        out.push({ value, conv: conv ?? (selfDoc && spec === null ? 'r' : null), spec });
        i = close + 1;
        continue;
      }
      if (c === '}') {
        if (s[i + 1] === '}') { text += '}'; i += 2; continue; }
        throw new ScriptError('badFString', { what: 'single' }, posAt(i));
      }
      text += c;
      i++;
    }
    if (text) out.push(text);
    return out;
  }
}
