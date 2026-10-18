// The command reference (docs/reference/index.html) is generated from the interpreter by scripts/build-reference.mjs.
// These tests keep it honest: every listed name must exist in Natter, every example and language snippet must behave
// as the page says, and the checked-in page must be the one the generator writes now.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildReference, OUT_FILE } from '../../../scripts/build-reference.mjs';
import { runToEnd } from '../src/index.js';

const { html, problems, sections } = buildReference();

/** Run a check program; it prints the names that are missing (an empty list when all exist). */
function missing(setup, owner, names) {
  if (!names.length) return [];
  const r = runToEnd(`${setup}\nprint([n for n in ${JSON.stringify(names)} if not hasattr(${owner}, n)])`);
  if (r.error) return [`${owner}: ${r.error.kind} ${JSON.stringify(r.error.params)}`];
  return JSON.parse(r.output.replace(/'/g, '"')).map((n) => `${owner}.${n}`);
}

const byId = (id) => sections.find((s) => s.id === id);

describe('command reference', () => {
  it('matches the interpreter (described names exist, examples and language rows behave as shown)', () => {
    expect(problems).toEqual([]);
  });

  it('lists only names that exist: modules and their classes', () => {
    const bad = [];
    for (const s of sections.filter((x) => x.parts)) {
      for (const part of s.parts) {
        const setup = `import ${part.module}`;
        const entries = part.groups.flatMap((g) => g.entries);
        bad.push(...missing(setup, part.module, entries.map((e) => e.name)));
        for (const e of entries.filter((x) => x.members?.length)) {
          bad.push(...missing(setup, `${part.module}.${e.name}`, e.members.map((m) => m.name)));
        }
      }
      if (s.common) bad.push(...missing(`import ${[].concat(s.module)[0]}`, `${[].concat(s.module)[0]}.Widget`, s.common.members.map((m) => m.name)));
    }
    expect(bad).toEqual([]);
  });

  it('lists only names that exist: builtins, methods, kara, Pygame Zero', () => {
    const bad = [];
    const b = byId('builtins').builtins;
    const r = runToEnd(`x = [${b.entries.map((e) => e.name).join(', ')}]\nprint(len(x))`);
    if (r.error) bad.push(`builtins: ${JSON.stringify(r.error.params)}`);
    for (const n of b.missing) if (!runToEnd(`x = ${n}`).error) bad.push(`builtin ${n} is listed as missing but exists`);
    const sample = { str: '""', list: '[]', tuple: '()', dict: '{}', set: 'set()', frozenset: 'frozenset()' };
    for (const t of byId('methods').methods) bad.push(...missing(`x = ${sample[t.type]}`, 'x', t.entries.map((e) => e.name)));
    bad.push(...missing('import kara', 'kara', byId('kara').kara.entries.map((e) => e.name)));
    const g = byId('pgzero').pgz;
    const setup = 'from pgzero_builtins import *\nfrom pgzero_audio import Sound';
    bad.push(...missing('import pgzero_builtins', 'pgzero_builtins', g.objects.map((o) => o.name)));
    for (const o of [...g.objects, ...g.extra]) {
      if (o.members?.length) bad.push(...missing(setup, o.name, o.members.map((m) => m.name)));
      if (o.consts?.length) bad.push(...missing(setup, o.name, o.consts));
    }
    expect(bad).toEqual([]);
  });

  it('has a section with an example for every module', () => {
    for (const s of sections.filter((x) => x.source === 'module' || x.source === 'kara' || x.source === 'pgzero' || x.source === 'builtins')) {
      expect(s.example?.code, s.id).toBeTruthy();
    }
  });

  it('docs/reference/index.html is current (run: npm run reference)', () => {
    const current = readFileSync(OUT_FILE, 'utf8') === html;
    expect(current, 'docs/reference/index.html is stale: run npm run reference').toBe(true);
  });
});
