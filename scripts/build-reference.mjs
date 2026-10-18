// Command reference of Natter (docs/reference/index.html), generated from the interpreter itself.
// The names, signatures, members, constants, world characters, error texts, hooks and asset game types come from the
// source (module registries, builtins, stdlib, messages, assets); scripts/reference/content.mjs adds the English
// explanations, examples and notes. Every example and every language snippet is run while building, so the page
// cannot claim what Natter does not do. A test (packages/core/test/reference.test.js) fails when the page is stale.
//
//   node scripts/build-reference.mjs           write docs/reference/index.html
//   node scripts/build-reference.mjs --check   only check (exit code 1 when stale or broken)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VM, compile, runToEnd, karaGlobals, scriptErrorText, BUILTIN_NAMES,
  PyModule, PyClass, PyFunction, PyBuiltin, PyInstance, PyProperty, PyStaticMethod, PyClassMethod, PyMethod,
} from '../packages/core/src/index.js';
import { BUILTINS, METHODS, CLASS_GLOBALS } from '../packages/core/src/builtins.js';
import { KARA_NAMES, KARA_CHARS, worldText } from '../packages/core/src/stdlib/kara.js';
import { PGZ_NATIVES, PGZ_BUILTIN_NAMES, pgzHostModules, installPgzero, pgzFrame, pgzStart } from '../packages/core/src/stdlib/pgzero.js';
import { en as MSG_EN } from '../packages/core/src/messages.js';
import { PACKS } from '../packages/core/src/stdlib/packs.js';
import { SECTIONS, PAGE } from './reference/content.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_FILE = join(ROOT, 'docs', 'reference', 'index.html');
const CATALOG = JSON.parse(readFileSync(join(ROOT, 'packages', 'assets', 'catalog.json'), 'utf8'));
const GAMETYPES = JSON.parse(readFileSync(join(ROOT, 'packages', 'assets', 'gametypes.json'), 'utf8'));

// ---------------------------------------------------------------- introspection

const vm = new VM(compile('pass'), { host: { print() {}, printErr() {} } });
const repr = (v) => { try { return vm.repr(v); } catch { return '…'; } };
const getattr = (o, n) => vm.getattr(null, o, n);
const mod = (name) => vm.importModule(name, null);

/** Parameter list of a native function, read from its params(...) call; null when it has none. */
function nativeParams(key) {
  const f = BUILTINS[key] ?? PGZ_NATIVES[key];
  if (!f) return null;
  const m = /params\(\s*'[^']*'\s*,\s*\w+\s*,\s*\w+\s*,\s*\[([^\]]*)\]/.exec(f.toString());
  if (!m) return null;
  return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter((p) => p && p !== 'self').map((p) => (p.startsWith('?') ? `${p.slice(1)}=…` : p));
}

/** Default value as short text (objects without a readable repr become …). */
const defText = (v) => { const r = repr(v); return r.startsWith('<') || r.length > 24 ? '…' : r; };

/** Parameter list of a Python function (drop = number of leading parameters to hide, self/cls). */
function pyParams(fn, drop = 0) {
  const c = vm.codes[fn.code];
  const out = [];
  const first = c.params.length - c.ndefaults;
  c.params.forEach((p, i) => out.push(i >= first ? `${p}=${defText(fn.defaults[i - first])}` : p));
  if (c.vararg) out.push(`*${c.vararg}`);
  else if (c.kwonly.length) out.push('*');
  c.kwonly.forEach((p, i) => out.push(c.kwMask[i] ? `${p}=${defText(fn.kwdefaults?.[i])}` : p));
  if (c.kwarg) out.push(`**${c.kwarg}`);
  return out.slice(drop);
}

/** Is it one of the placeholders that only raise NotImplementedError (pyplot's _unsupported)? */
const isStub = (v) => v instanceof PyFunction && v.name === 'unsupported';

/** Kind and parameters of a value. */
function describe(v, { method = false } = {}) {
  if (v instanceof PyFunction) return { kind: method ? 'method' : 'function', params: pyParams(v, method ? 1 : 0), stub: isStub(v) };
  if (v instanceof PyBuiltin) return { kind: method ? 'method' : 'function', params: nativeParams(v.name) };
  if (v instanceof PyMethod && v.fn instanceof PyFunction) return { kind: 'function', params: pyParams(v.fn, 1) };
  if (v instanceof PyStaticMethod) return { kind: 'method', params: v.fn instanceof PyFunction ? pyParams(v.fn) : nativeParams(v.fn?.name), tag: 'staticmethod' };
  if (v instanceof PyClassMethod) return { kind: 'method', params: v.fn instanceof PyFunction ? pyParams(v.fn, 1) : null, tag: 'classmethod' };
  if (v instanceof PyProperty) return { kind: 'property', writable: !!v.fset };
  if (v instanceof PyClass) {
    const init = v.mro?.find((c) => c.dict.has('__init__'))?.dict.get('__init__');
    return { kind: 'class', params: init instanceof PyFunction ? pyParams(init, 1) : init instanceof PyBuiltin ? nativeParams(init.name) : null, exception: v.mro?.some((c) => c.name === 'BaseException') };
  }
  if (v instanceof PyModule) return { kind: 'module' };
  if (v instanceof PyInstance) return { kind: 'object', type: v.cls.name };
  return { kind: 'constant', value: repr(v) };
}

/** Public members of a class: own ones, and those of bases up to (not including) `stop` classes. */
function classMembers(cls, { inherited = true, stopAt = [] } = {}) {
  const out = new Map();
  for (const c of cls.mro ?? [cls]) {
    if (c.name === 'object' || stopAt.includes(c.name)) break;
    if (c !== cls && !inherited) break;
    for (const [k, v] of c.dict) {
      if (k.startsWith('_') || out.has(k) || /^[A-Z_]+$/.test(k) && !(v instanceof PyFunction)) continue;
      out.set(k, { name: k, ...describe(v, { method: true }), from: c === cls ? null : c.name });
    }
  }
  return [...out.values()];
}

/** Public names of a module with their description. */
function moduleEntries(name, { keepModules = [] } = {}) {
  const m = mod(name);
  const out = [];
  for (const n of vm.moduleNames(m)) {
    const v = getattr(m, n);
    const d = describe(v);
    if (d.kind === 'module' && !keepModules.includes(n)) continue; // e.g. statistics imports math
    out.push({ name: n, ...d, raw: v });
  }
  return out;
}

// ---------------------------------------------------------------- running examples

const problems = [];
const problem = (where, text) => problems.push(`${where}: ${text}`);
const errText = (e) => { const t = scriptErrorText(e, { lang: 'en' }); return `${e.kind ?? ''}: ${t.text}`; };

/** Sizes of the images of the asset library (for running Pygame Zero examples like the browser would). */
const IMAGE_SIZE = Object.fromEntries(CATALOG.images.map((i) => [i.name, [i.w, i.h]]));
const SOUND_LEN = Object.fromEntries(CATALOG.sounds.map((s) => [s.name, s.seconds ?? 1]));

/** Run a Pygame Zero program with the asset library for a number of frames; returns the error or null. */
function runPgzero(source, frames = 30) {
  const prog = compile(source, { known: PGZ_BUILTIN_NAMES });
  let output = '';
  const vm2 = new VM(prog, {
    natives: PGZ_NATIVES, seed: 1,
    host: {
      ...pgzHostModules(), print: (t) => { output += t; }, printErr: () => {},
      pgz: {
        resource: (kind, n) => (kind === 'images' ? IMAGE_SIZE[n] ?? null : kind === 'sounds' ? SOUND_LEN[n] ?? null : kind === 'music' ? (n in SOUND_LEN || null) : null),
        cmd: () => {},
      },
    },
  });
  if (!/^\s*import\s+pgzrun\b/m.test(source)) installPgzero(vm2);
  const main = vm2.start();
  vm2.run(main, 5_000_000);
  if (main.state === 'error') return { error: main.error, output };
  const step = (task) => { vm2.run(task, 5_000_000); return task.state === 'error' ? task.error : null; };
  let e = step(pgzStart(vm2));
  for (let i = 0; !e && i < frames; i++) e = step(pgzFrame(vm2, i === 3 ? [['key_down', 32, 0, ' '], ['mouse_down', [100, 100], 1]] : [], 1 / 60));
  return { error: e, output };
}

/** Run an example; returns what the page shows (text output, world picture, SVG). */
function runExample(sec) {
  const ex = sec.example;
  const where = `example of ${sec.id}`;
  try {
    if (ex.run === 'pgzero') {
      const r = runPgzero(ex.code);
      if (r.error) problem(where, errText(r.error));
      return {};
    }
    const opts = { seed: 1, inputs: ex.inputs ?? [], files: ex.files };
    if (ex.run === 'kara') opts.globals = karaGlobals();
    if (ex.run === 'http') opts.http = () => ({ status: 200, reason: 'OK', headers: { 'content-type': 'application/json' }, text: ex.httpAnswer ?? '{}', url: 'https://example.org/' });
    const r = runToEnd(ex.code, opts);
    if (r.error) { problem(where, errText(r.error)); return {}; }
    const shown = {};
    if (ex.showOutput !== false && r.output) shown.output = r.output;
    if (ex.run === 'kara' && r.vm?.kara) shown.world = worldText(r.vm.kara);
    if (ex.run === 'plot' && r.plots.length) shown.svg = r.plots[0].svg;
    if (r.vm?.fs && ex.showFiles) shown.files = Object.fromEntries([...r.vm.fs.files].filter(([k]) => !(k in (ex.files ?? {}))));
    return shown;
  } catch (e) {
    problem(where, String(e?.stack ?? e));
    return {};
  }
}

/** Language rows: `ok` snippets must run, `no` snippets must fail (the page shows Natter's own German message). */
function checkSnippet(code, expectOk, where) {
  const r = runToEnd(code, { seed: 1, inputs: ['Ada'] });
  if (expectOk && r.error) problem(where, `should run but fails: ${errText(r.error)}`);
  if (!expectOk && !r.error) problem(where, `should fail but runs: ${code}`);
  return r;
}

// ---------------------------------------------------------------- collecting the sections

/** Attach curated German text to entries (key `name` or `module.name`); report curated names that do not exist. */
function annotate(sec, entries, { check = true } = {}) {
  const desc = sec.desc ?? {};
  if (check) {
    const known = new Set(entries.flatMap((e) => [e.name, `${e.owner}.${e.name}`]));
    for (const k of Object.keys(desc)) if (!known.has(k)) problem(sec.id, `described name ${k} does not exist`);
  }
  for (const e of entries) {
    const d = desc[`${e.owner}.${e.name}`] ?? desc[e.name];
    if (typeof d === 'string') e.text = d;
    else if (d) { e.text = d.text; if (d.sig) e.sig = d.sig; }
  }
  return entries;
}

/** Group entries of a module by kind. */
function groupEntries(entries) {
  const groups = [
    ['Functions', entries.filter((e) => e.kind === 'function' && !e.stub)],
    ['Classes', entries.filter((e) => e.kind === 'class' && !e.exception)],
    ['Objects', entries.filter((e) => e.kind === 'object' || e.kind === 'module')],
    ['Exceptions', entries.filter((e) => e.kind === 'class' && e.exception)],
    ['Constants', entries.filter((e) => e.kind === 'constant')],
    ['Placeholders only (raise NotImplementedError)', entries.filter((e) => e.stub)],
  ];
  return groups.filter(([, list]) => list.length).map(([title, list]) => ({ title, entries: list }));
}

/** A class with its members (for the sections that show members). */
function classBlock(sec, owner, cls, opts = {}) {
  const members = classMembers(cls, opts);
  const desc = sec.members?.[owner] ?? {};
  const names = new Set(members.map((m) => m.name));
  for (const k of Object.keys(desc)) if (!names.has(k)) problem(sec.id, `described member ${owner}.${k} does not exist`);
  for (const m of members) if (desc[m.name]) m.text = desc[m.name];
  return members;
}

function collectModule(sec) {
  const parts = [];
  const all = [];
  for (const m of [].concat(sec.module)) {
    const entries = moduleEntries(m, { keepModules: sec.keepModules ?? [] }).filter((e) => !(sec.hide ?? []).includes(e.name));
    for (const e of entries) {
      e.owner = m;
      if (e.kind === 'class' && (sec.showMembers === true || Array.isArray(sec.showMembers) && sec.showMembers.includes(e.name))) {
        e.members = classBlock(sec, e.name, e.raw, { inherited: sec.inherited ?? true, stopAt: sec.stopAt ?? [] });
      }
      if (e.kind === 'object' && Array.isArray(sec.showMembers) && sec.showMembers.includes(e.name)) e.members = classBlock(sec, e.name, e.raw.cls, { stopAt: sec.stopAt ?? [] });
      // turtle: the module functions take *args; show the signature of the method with the same name
      if (e.kind === 'function' && sec.sigFrom && e.params?.[0]?.startsWith('*')) {
        for (const cn of sec.sigFrom) {
          const f = getattr(mod(m), cn).mro.find((c) => c.dict.has(e.name))?.dict.get(e.name);
          if (f instanceof PyFunction) { e.params = pyParams(f, 1); break; }
        }
      }
      delete e.raw;
    }
    annotate(sec, entries, { check: false });
    all.push(...entries);
    parts.push({ module: m, label: sec.labels?.[m] ?? m, groups: groupEntries(entries) });
  }
  annotate(sec, all);
  return parts;
}

function collectBuiltins(sec) {
  const fn = BUILTIN_NAMES.filter((n) => n !== '__name__' && !(n in CLASS_GLOBALS));
  const entries = fn.map((n) => ({ name: n, kind: 'function', params: nativeParams(n), owner: 'builtins' }));
  entries.push({ name: 'open', kind: 'function', params: pyParams(mod('_fileio').ns.get('open')), owner: 'builtins' });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  annotate(sec, entries);
  const missing = sec.cpythonBuiltins.filter((n) => !fn.includes(n) && !(n in CLASS_GLOBALS) && n !== 'open');
  const exceptions = Object.keys(CLASS_GLOBALS).filter((n) => CLASS_GLOBALS[n] instanceof PyClass && CLASS_GLOBALS[n].mro?.some((c) => c.name === 'BaseException'));
  // exception tree: parent → children
  const tree = exceptions.map((n) => ({ name: n, base: CLASS_GLOBALS[n].bases[0]?.name ?? null }));
  return { entries, missing, exceptions: tree };
}

function collectMethods(sec) {
  return sec.types.map((t) => {
    const names = Object.keys(METHODS[t] ?? {}).filter((n) => !n.startsWith('_')).sort();
    if (!names.length) problem(sec.id, `type ${t} has no methods`);
    const desc = sec.members?.[t] ?? {};
    for (const k of Object.keys(desc)) if (!names.includes(k)) problem(sec.id, `described method ${t}.${k} does not exist`);
    return { type: t, entries: names.map((n) => ({ name: n, kind: 'method', owner: t, params: (() => { const s = /params\(\s*'[^']*'\s*,\s*\w+\s*,\s*\w+\s*,\s*\[([^\]]*)\]/.exec(METHODS[t][n].toString()); return s ? s[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean).map((p) => (p.startsWith('?') ? `${p.slice(1)}=…` : p)) : null; })(), text: desc[n] })) };
  });
}

function collectKara(sec) {
  const entries = annotate(sec, KARA_NAMES.map((n) => ({ name: n, kind: 'function', params: nativeParams(`kara.${n}`) ?? [], owner: 'kara' })));
  const charText = sec.chars ?? {};
  for (const c of Object.keys(charText)) if (!(c in KARA_CHARS)) problem(sec.id, `world character ${JSON.stringify(c)} does not exist`);
  const chars = Object.entries(KARA_CHARS).map(([ch, what]) => {
    if (!charText[ch]) problem(sec.id, `world character ${JSON.stringify(ch)} (${what}) is not explained`);
    return { ch, what, text: charText[ch] ?? what };
  });
  const errors = Object.entries(MSG_EN).filter(([k]) => k.startsWith('err.script.kara.')).map(([k, v]) => ({ key: k.slice('err.script.kara.'.length), text: v }));
  return { entries, chars, errors };
}

function collectPgzero(sec) {
  const b = mod('pgzero_builtins');
  const objects = [];
  for (const n of PGZ_BUILTIN_NAMES) {
    const v = getattr(b, n);
    const d = describe(v);
    const o = { name: n, ...d, owner: 'pgzero', text: sec.desc?.[n] };
    if (v instanceof PyClass) o.members = classBlock(sec, n, v, { stopAt: ['object'] });
    else if (v instanceof PyInstance && !['keys', 'keymods', 'mouse'].includes(n)) o.members = classBlock(sec, n, v.cls);
    else if (v instanceof PyModule) o.members = vm.moduleNames(v).filter((k) => !/^[A-Z]/.test(k) && k !== 'clock').map((k) => ({ name: k, ...describe(getattr(v, k)), text: sec.members?.[n]?.[k] }));
    if (['keys', 'keymods', 'mouse'].includes(n)) o.consts = [...v.dict.keys()].filter((k) => !k.startsWith('_'));
    objects.push(o);
  }
  for (const k of Object.keys(sec.desc ?? {})) if (!PGZ_BUILTIN_NAMES.includes(k)) problem(sec.id, `described name ${k} does not exist`);
  // sub-objects reached through attributes
  const extra = [];
  for (const [label, path, cls] of sec.subObjects ?? []) {
    let c;
    if (cls) c = getattr(mod(cls[0]), cls[1]);
    else { let v = b; for (const p of path.split('.')) v = getattr(v, p); c = v.cls; }
    extra.push({ name: label, kind: 'object', members: classBlock(sec, label, c) });
  }
  const spell = mod('pgzero_spellcheck');
  const valid = spell.ns.get('VALID_PARAMS');
  const hooks = [...spell.ns.get('HOOKS').items].map((h) => {
    const d = sec.hooks?.[h];
    if (!d) problem(sec.id, `hook ${h} is not explained`);
    return { name: h, params: d?.params ?? valid.get(h)?.items ?? [], text: d?.text };
  });
  for (const h of Object.keys(sec.hooks ?? {})) if (!hooks.some((x) => x.name === h)) problem(sec.id, `hook ${h} does not exist`);
  return { objects, extra, hooks };
}

function collectAssets() {
  const packs = CATALOG.packs.map((p) => ({ pack: p.pack, kind: p.kind, title: p.title?.en ?? p.pack }));
  const types = GAMETYPES.types.map((t) => ({ id: t.id, text: t.en, hint: t.hint?.en ?? '', packs: t.packs, starter: t.starter }));
  return { packs, types, sounds: CATALOG.sounds.map((s) => ({ name: s.name, text: s.en ?? '' })) };
}

function collectLanguage(sec) {
  return sec.rows.map((row, i) => {
    const where = `${sec.id} row ${i + 1} (${row.area})`;
    for (const code of [].concat(row.ok ?? [])) checkSnippet(code, true, where);
    const no = [].concat(row.no ?? []).map((code) => {
      const r = checkSnippet(code, false, where);
      return { code, message: r.error ? errText(r.error) : '' };
    });
    for (const { code, output } of row.same ?? []) {
      const r = checkSnippet(code, true, where);
      if (r.output !== output) problem(where, `expected ${JSON.stringify(output)} but got ${JSON.stringify(r.output)}`);
    }
    return { ...row, noResults: no };
  });
}

function collect() {
  problems.length = 0;
  return SECTIONS.map((sec) => {
    const out = { ...sec };
    if (sec.example) out.shown = runExample(sec);
    if (sec.source === 'module') out.parts = collectModule(sec);
    if (sec.common) {
      const m = mod([].concat(sec.module)[0]);
      const seen = new Set();
      out.common = { title: sec.common.title, members: sec.common.classes.flatMap((cn) => classMembers(getattr(m, cn), { inherited: false })).filter((x) => !x.tag && !seen.has(x.name) && seen.add(x.name)) };
    }
    else if (sec.source === 'builtins') out.builtins = collectBuiltins(sec);
    else if (sec.source === 'methods') out.methods = collectMethods(sec);
    else if (sec.source === 'kara') out.kara = collectKara(sec);
    else if (sec.source === 'pgzero') out.pgz = collectPgzero(sec);
    else if (sec.source === 'assets') out.assets = collectAssets();
    else if (sec.source === 'language') out.rows = collectLanguage(sec);
    if (sec.module) out.pack = [].concat(sec.module).map((m) => PACKS && Object.entries(PACKS).find(([, names]) => names.includes(m) || names.includes(m.split('.')[0]))?.[0]).filter(Boolean)[0] ?? null;
    return out;
  });
}

// ---------------------------------------------------------------- rendering

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Curated text: plain text with `code` in backticks and [links](url). */
const md = (s) => esc(s ?? '')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');

/** Small Python highlighter for the examples (keywords, strings, comments, numbers, builtins). */
const KW = new Set('False None True and as assert break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));
function highlight(code) {
  const re = /("""[\s\S]*?"""|'''[\s\S]*?'''|[rbfRBF]?"(?:\\.|[^"\\\n])*"|[rbfRBF]?'(?:\\.|[^'\\\n])*')|(#[^\n]*)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)\b/g;
  let out = '', last = 0;
  for (const m of code.matchAll(re)) {
    out += esc(code.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1]) out += `<span class="s">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="c">${esc(m[2])}</span>`;
    else if (m[3]) out += `<span class="n">${esc(m[3])}</span>`;
    else if (KW.has(m[4])) out += `<span class="k">${m[4]}</span>`;
    else if (BUILTIN_NAMES.includes(m[4]) && /^[a-z]/.test(m[4])) out += `<span class="b">${m[4]}</span>`;
    else out += esc(m[4]);
  }
  return out + esc(code.slice(last));
}

const sigText = (e) => e.sig ?? (e.kind === 'function' || e.kind === 'method' || e.kind === 'class' ? `${e.name}(${(e.params ?? (e.kind === 'class' ? [] : ['…'])).join(', ')})` : e.name);
const kindTag = (e) => e.tag ? `<span class="rk">${e.tag}</span>` : e.kind === 'property' ? `<span class="rk">${e.writable ? 'property' : 'read-only'}</span>` : e.kind === 'constant' && e.value !== undefined ? `<span class="rv">= ${esc(e.value.length > 40 ? e.value.slice(0, 38) + '…' : e.value)}</span>` : e.kind === 'object' && e.type ? `<span class="rk">${esc(e.type)}</span>` : '';

/** One searchable entry. Described entries get a row, the others a compact chip. */
function entry(e, prefix) {
  const id = `${prefix}${e.name}`;
  const q = `${id} ${e.name} ${e.text ?? ''}`.toLowerCase();
  if (e.text) return `<div class="re" id="${esc(id)}" data-q="${esc(q)}"><code class="sig">${esc(sigText(e))}</code>${kindTag(e)}<p>${md(e.text)}</p></div>`;
  return `<li class="re" id="${esc(id)}" data-q="${esc(q)}"><code>${esc(sigText(e))}</code>${kindTag(e)}</li>`;
}

function entryList(list, prefix) {
  const described = list.filter((e) => e.text);
  const plain = list.filter((e) => !e.text);
  let h = '';
  if (described.length) h += `<div class="rlist">${described.map((e) => entry(e, prefix)).join('')}</div>`;
  if (plain.length) h += `<ul class="chips">${plain.map((e) => entry(e, prefix)).join('')}</ul>`;
  return h;
}

function membersBlock(owner, members, prefix) {
  if (!members?.length) return '';
  const own = members.filter((m) => !m.from);
  const inh = members.filter((m) => m.from);
  let h = `<div class="members">${entryList(own, `${prefix}${owner}.`)}`;
  if (inh.length) {
    const byBase = new Map();
    for (const m of inh) { if (!byBase.has(m.from)) byBase.set(m.from, []); byBase.get(m.from).push(m); }
    h += `<p class="inh">Inherited from ${[...byBase.keys()].map((b) => `<code>${esc(b)}</code>`).join(', ')}:</p><ul class="chips">${inh.map((m) => entry(m, `${prefix}${owner}.`).replace('<li class="re"', '<li class="re"')).join('')}</ul>`;
  }
  return h + '</div>';
}

function exampleBlock(sec) {
  const ex = sec.example;
  if (!ex) return '';
  const s = sec.shown ?? {};
  let h = `<figure class="ex"><figcaption>Example${ex.title ? `: ${md(ex.title)}` : ''}</figcaption><pre class="codeblock" tabindex="0"><code>${highlight(ex.code.replace(/\n$/, ''))}</code></pre>`;
  if (s.output) h += `<div class="out-label">Output</div><pre class="out" tabindex="0"><code>${esc(s.output.replace(/\n$/, ''))}</code></pre>`;
  if (s.world) h += `<div class="out-label">Meadow at the end</div><pre class="out" tabindex="0"><code>${esc(s.world)}</code></pre>`;
  if (s.files) for (const [f, t] of Object.entries(s.files)) h += `<div class="out-label">File ${esc(f)}</div><pre class="out" tabindex="0"><code>${esc(t.replace(/\n$/, ''))}</code></pre>`;
  if (s.svg) h += `<div class="out-label">Image (drawn by Natter)</div><div class="plot">${s.svg}</div>`;
  if (ex.note) h += `<p class="ex-note">${md(ex.note)}</p>`;
  return h + '</figure>';
}

function notesBlock(sec) {
  let h = '';
  for (const [title, list] of [[sec.notesTitle ?? 'Limits and differences from CPython', sec.notes], ['In the browser', sec.host]]) {
    if (list?.length) h += `<div class="notes"><h3>${title}</h3><ul>${list.map((n) => `<li>${md(n)}</li>`).join('')}</ul></div>`;
  }
  return h;
}

function renderBody(sec) {
  const p = `${sec.id}.`;
  let h = '';
  if (sec.parts) {
    for (const part of sec.parts) {
      if (sec.parts.length > 1) h += `<h3 class="part"><code>${esc(part.label)}</code></h3>`;
      for (const g of part.groups) {
        h += `<h4>${g.title}</h4>${entryList(g.entries, `${part.module}.`)}`;
        for (const e of g.entries) if (e.members?.length) h += `<h5 class="cls"><code>${esc(e.name)}</code></h5>${membersBlock(e.name, e.members, `${part.module}.`)}`;
      }
    }
  }
  if (sec.common) h += `<h5 class="cls">${esc(sec.common.title)}</h5><div class="members">${entryList(sec.common.members, `${sec.id}.`)}</div>`;
  if (sec.builtins) {
    const b = sec.builtins;
    h += `<h4>Funktionen</h4>${entryList(b.entries, 'builtins.')}`;
    h += `<h4>Exceptions</h4><p class="small">${b.exceptions.map((x) => `<code title="inherits from ${esc(x.base ?? '')}">${esc(x.name)}</code>`).join(' ')}</p>`;
    if (b.missing.length) h += `<h4>Missing compared with CPython</h4><p class="small">${b.missing.map((n) => `<code class="no">${esc(n)}</code>`).join(' ')}</p>`;
  }
  if (sec.methods) for (const t of sec.methods) h += `<h4><code>${t.type}</code></h4>${entryList(t.entries, `${t.type}.`)}`;
  if (sec.kara) {
    const k = sec.kara;
    h += `<h4>Commands</h4>${entryList(k.entries, 'kara.')}`;
    h += `<h4>World characters</h4><div class="scroll"><table class="rt"><thead><tr><th>Character</th><th>Meaning</th></tr></thead><tbody>${k.chars.map((c) => `<tr><td><code class="wc">${c.ch === ' ' ? '␣' : esc(c.ch)}</code></td><td>${md(c.text)}</td></tr>`).join('')}</tbody></table></div>`;
    h += `<h4>Error messages</h4><ul class="errs">${k.errors.map((e) => `<li><code>${esc(e.key)}</code> ${esc(e.text)}</li>`).join('')}</ul>`;
  }
  if (sec.pgz) {
    const g = sec.pgz;
    h += `<h4>Hooks (functions you write)</h4><div class="rlist">${g.hooks.map((x) => `<div class="re" id="pgzero.${x.name}" data-q="${esc(`pgzero ${x.name} ${x.text ?? ''}`.toLowerCase())}"><code class="sig">def ${x.name}(${x.params.join(', ')})</code><p>${md(x.text ?? '')}</p></div>`).join('')}</div>`;
    h += `<h4>Predefined names</h4>${entryList(g.objects.map((o) => ({ ...o, members: undefined, consts: undefined })), 'pgzero.')}`;
    for (const o of [...g.objects, ...g.extra]) {
      if (o.members?.length) h += `<h5 class="cls"><code>${esc(o.name)}</code></h5>${membersBlock(o.name, o.members, 'pgzero.')}`;
      if (o.consts?.length) h += `<h5 class="cls"><code>${esc(o.name)}</code></h5><ul class="chips">${o.consts.map((c) => `<li class="re" data-q="${esc(`${o.name}.${c}`.toLowerCase())}"><code>${esc(o.name)}.${esc(c)}</code></li>`).join('')}</ul>`;
    }
  }
  if (sec.assets) {
    const a = sec.assets;
    h += `<h4>Game types with starter sets</h4><div class="scroll"><table class="rt"><thead><tr><th>Game type</th><th>Packs and starter images</th></tr></thead><tbody>${a.types.map((t) => `<tr class="re" data-q="${esc(`${t.id} ${t.text} ${t.hint} ${t.packs.join(' ')} ${t.starter.join(' ')}`.toLowerCase())}"><td><b>${esc(t.text)}</b><br><code>${esc(t.id)}</code></td><td>${esc(t.hint)}<br><span class="small">Packs: ${t.packs.map((p) => `<code>${esc(p)}</code>`).join(' ')}</span><br>${t.starter.map((s) => `<code class="img">${esc(s)}</code>`).join(' ')}</td></tr>`).join('')}</tbody></table></div>`;
    h += `<p class="intro"><a class="btn" href="../sprites/">Browse all images and sounds in the sprite gallery</a></p>`;
    h += `<h4>Packs</h4><ul class="chips">${a.packs.map((p) => `<li class="re" data-q="${esc(`${p.pack} ${p.title}`.toLowerCase())}"><code>${esc(p.pack)}</code> ${esc(p.title)}</li>`).join('')}</ul>`;
    h += `<h4>Sounds</h4><ul class="chips">${a.sounds.map((s) => `<li class="re" data-q="${esc(`sounds.${s.name} ${s.text}`.toLowerCase())}"><code>sounds.${esc(s.name)}</code> ${esc(s.text)}</li>`).join('')}</ul>`;
  }
  if (sec.rows) {
    h += `<div class="scroll"><table class="rt lang"><thead><tr><th>Area</th><th>What works</th><th>What does not</th></tr></thead><tbody>`;
    for (const r of sec.rows) {
      h += `<tr class="re" data-q="${esc(`${r.area} ${r.text} ${r.not ?? ''} ${[].concat(r.ok ?? []).join(' ')}`.toLowerCase())}"><td><b>${esc(r.area)}</b></td><td>${md(r.text)}${[].concat(r.ok ?? []).length ? `<pre class="snip"><code>${highlight([].concat(r.ok)[0])}</code></pre>` : ''}</td><td>${md(r.not ?? '')}${r.noResults.map((n) => `<pre class="snip no"><code>${highlight(n.code)}</code></pre><p class="msg">${esc(n.message.split('\n').slice(-1)[0])}</p>`).join('')}</td></tr>`;
    }
    h += '</tbody></table></div>';
  }
  void p;
  return h;
}

function renderSection(sec, i) {
  const imp = sec.imports ? `<code class="chip">${esc(sec.imports)}</code>` : '';
  const pack = sec.pack && sec.pack !== 'stdlib' ? `<span class="pack" title="Loaded only when a program imports it">Pack ${esc(sec.pack)}</span>` : '';
  return `<section class="rs" id="${esc(sec.id)}" data-title="${esc(sec.title.toLowerCase())}">
<p class="kicker">${String(i + 1).padStart(2, '0')} &middot; ${esc(sec.group)}</p>
<h2>${esc(sec.title)}</h2>
<div class="rhead">${imp}${pack}</div>
${(sec.intro ?? []).map((x) => `<p class="intro">${md(x.replace('{images}', String(Math.round(CATALOG.images.length / 100) * 100)))}</p>`).join('')}
${exampleBlock(sec)}
${notesBlock(sec)}
${renderBody(sec)}
</section>`;
}

function renderNav(sections) {
  const groups = [];
  for (const s of sections) {
    let g = groups.find((x) => x.name === s.group);
    if (!g) groups.push(g = { name: s.group, items: [] });
    g.items.push(s);
  }
  return groups.map((g) => `<p class="sg">${esc(g.name)}</p><ul>${g.items.map((s) => `<li><a href="#${esc(s.id)}">${esc(s.nav ?? s.title)}</a></li>`).join('')}</ul>`).join('');
}

const SCRIPT = `
(function () {
  var input = document.getElementById('q'), count = document.getElementById('qn');
  var sections = [].slice.call(document.querySelectorAll('.rs'));
  var navLinks = [].slice.call(document.querySelectorAll('.side a'));
  // a hit: the query starts a word of the entry (print, forward, screen.draw); with no such hit anywhere, any substring
  function words(q) { return function (t) { return t.indexOf(q) === 0 || t.indexOf(' ' + q) >= 0 || t.indexOf('.' + q) >= 0 || t.indexOf('(' + q) >= 0; }; }
  function inside(q) { return function (t) { return t.indexOf(q) >= 0; }; }
  // does a heading have a visible hit before the next heading of its level or higher?
  function headingHas(h) {
    var level = +h.tagName[1];
    for (var n = h.nextElementSibling; n; n = n.nextElementSibling) {
      if (/^H[1-6]$/.test(n.tagName) && +n.tagName[1] <= level) return false;
      if (n.matches('.re:not([hidden])') || n.querySelector('.re:not([hidden])')) return true;
    }
    return false;
  }
  function run(q, match) {
    var total = 0;
    sections.forEach(function (s) {
      var hit = 0, title = match(s.getAttribute('data-title'));
      [].slice.call(s.querySelectorAll('.re')).forEach(function (e) {
        var ok = !q || title || match(e.getAttribute('data-q'));
        e.hidden = !ok; if (ok && q) hit++;
      });
      [].slice.call(s.querySelectorAll('.members, .chips, .rlist, h4, h5, .scroll, .errs, h3.part')).forEach(function (b) {
        b.classList.toggle('empty', !!q && !title && !(/^H[1-6]$/.test(b.tagName) ? headingHas(b) : b.querySelector('.re:not([hidden])')));
      });
      s.hidden = !!q && !title && hit === 0;
      total += hit;
      var a = document.querySelector('.side a[href="#' + s.id + '"]');
      if (a) a.parentNode.hidden = s.hidden;
    });
    return total;
  }
  function apply() {
    var q = input.value.trim().toLowerCase();
    document.body.classList.toggle('searching', q.length > 0);
    var total = run(q, words(q));
    if (q && !total) total = run(q, inside(q));
    count.textContent = q ? (total + (total === 1 ? ' hit' : ' hits')) : '';
    [].slice.call(document.querySelectorAll('.side .sg')).forEach(function (g) {
      var list = g.nextElementSibling;
      g.hidden = !!list && !list.querySelector('li:not([hidden])');
    });
  }
  input.addEventListener('input', apply);
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); }
    if (e.key === 'Escape' && document.activeElement === input) { input.value = ''; apply(); }
  });
  var m = /[?&]q=([^&]+)/.exec(location.search);
  if (m) { input.value = decodeURIComponent(m[1]); apply(); }
  var menu = document.getElementById('menu');
  var narrow = window.matchMedia('(max-width: 899px)');
  function sync() { menu.open = !narrow.matches; }
  sync();
  if (narrow.addEventListener) narrow.addEventListener('change', sync);
  navLinks.forEach(function (a) { a.addEventListener('click', function () { if (narrow.matches) menu.open = false; }); });
})();
`;

function render(sections) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Natter Reference</title>
<meta name="description" content="${esc(PAGE.description)}">
<meta name="color-scheme" content="light dark">
<link rel="canonical" href="https://natter.wi7.net/reference/">
<link rel="icon" href="../natter-small.svg" type="image/svg+xml">
<link rel="stylesheet" href="../style.css">
<link rel="stylesheet" href="reference.css">
</head>
<body class="ref">
<!-- Generated by scripts/build-reference.mjs from the Natter source. Do not edit; run: npm run reference -->
<a class="skip" href="#content">Skip to content</a>
<header class="ref-top">
  <div class="wrap topbar">
    <a class="brand" href="../index.html" aria-label="Natter, home page"><img src="../natter-small.svg" width="32" height="32" alt="">Natter</a>
    <span class="toplinks"><a class="gh-small" href="../sprites/">Sprites</a><a class="gh-small" href="https://github.com/wi-wissen/Natter">GitHub</a></span>
  </div>
  <div class="wrap ref-hero">
    <p class="eyebrow">Command reference</p>
    <h1>What Natter <span class="hl">can do</span></h1>
    ${PAGE.intro.map((x) => `<p class="lead">${md(x)}</p>`).join('')}
  </div>
</header>
<div class="searchbar"><div class="wrap sb-inner">
  <label class="sr" for="q">Search</label>
  <input id="q" type="search" placeholder="Search: print, forward, Actor, sounds …  (key /)" autocomplete="off" spellcheck="false">
  <span id="qn" class="qn" aria-live="polite"></span>
</div></div>
<div class="wrap ref-grid">
  <details class="side" id="menu" open>
    <summary>Contents</summary>
    <div class="toc" role="navigation" aria-label="Modules">${renderNav(sections)}</div>
  </details>
  <main id="content">
${sections.map(renderSection).join('\n')}
<p class="gen">This page is generated from the Natter source (<code>npm run reference</code>, <code>scripts/build-reference.mjs</code>): names, parameters, constants, error messages and image names come from the interpreter itself, and every example ran while the page was built. A test fails when the page no longer matches the code.</p>
  </main>
</div>
<footer>
  <div class="wrap foot">
    <img class="foot-mark" src="../natter.svg" width="64" height="64" alt="">
    <p>Natter is open source. <a href="../index.html">Overview</a> &middot; <a href="../sprites/">Sprites</a> &middot; <a href="https://github.com/wi-wissen/Natter">Source code</a></p>
  </div>
</footer>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

/** Build the page; problems lists everything that does not match the interpreter (should be empty). */
export function buildReference() {
  const sections = collect();
  return { html: render(sections), problems: [...problems], sections };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { html, problems: p } = buildReference();
  if (p.length) {
    console.error(`Reference does not match the interpreter:\n- ${p.join('\n- ')}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    let old = '';
    try { old = readFileSync(OUT_FILE, 'utf8'); } catch { /* missing */ }
    if (old !== html) { console.error('docs/reference/index.html is stale: run npm run reference'); process.exit(1); }
    console.log('reference is current');
  } else {
    mkdirSync(dirname(OUT_FILE), { recursive: true });
    writeFileSync(OUT_FILE, html);
    console.log(`wrote ${OUT_FILE.slice(ROOT.length + 1)} (${Math.round(html.length / 1024)} KB)`);
  }
}

