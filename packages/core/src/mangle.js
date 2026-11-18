// Private name mangling like CPython: inside a class body, an identifier `__x` (not ending in `__`) becomes
// `_Class__x` (leading underscores of the class name removed). It applies to names, attributes, parameters,
// `global`/`nonlocal`, `except … as`, the names that `import`, `def` and `class` bind. The code object
// keeps its plain name (`__name__` stays `__x`), so the binding name goes to `node.bound`.

/** @param {string} name @param {string|null} cls */
export function mangleName(name, cls) {
  if (!cls || !name.startsWith('__') || name.endsWith('__') || name.includes('.')) return name;
  const stripped = cls.replace(/^_+/, '');
  return stripped ? `_${stripped}${name}` : name;
}

/**
 * Rename private names in the tree in place (call after parsing, before compiling).
 * @param {any} node @param {string|null} [cls] name of the class whose body we are in
 */
export function mangle(node, cls = null) {
  if (Array.isArray(node)) { for (const n of node) mangle(n, cls); return; }
  if (!node || typeof node !== 'object') return;
  const m = (n) => mangleName(n, cls);
  switch (node.type) {
    case 'Name': node.id = m(node.id); return;
    case 'Attribute': node.attr = m(node.attr); mangle(node.value, cls); return;
    case 'ClassDef':
      if (cls) node.bound = m(node.name);
      mangle(node.decorators, cls);
      mangle(node.bases, cls);
      mangle(node.body, node.name);
      return;
    case 'FunctionDef': case 'Lambda':
      if (node.type === 'FunctionDef' && cls) node.bound = m(node.name);
      for (const p of [...node.params, ...node.kwonly]) p.name = m(p.name);
      if (node.vararg) node.vararg = node.params.vararg = m(node.vararg);
      if (node.kwarg) node.kwarg = node.params.kwarg = m(node.kwarg);
      break;
    case 'Global': case 'Nonlocal': node.names = node.names.map(m); break;
    case 'Try': for (const h of node.handlers) if (h.name) h.name = m(h.name); break;
    case 'Import': case 'ImportFrom':
      // the bound name is mangled, not the module or the imported name (import __x binds _Class__x)
      for (const n of node.names ?? []) {
        const bound = n.asname ?? (node.type === 'Import' ? n.name.split('.')[0] : n.name);
        if (node.type === 'Import' && !n.asname && n.name.includes('.')) continue;
        if (m(bound) !== bound) n.asname = m(bound);
      }
      return;
  }
  for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object') mangle(v, cls);
}
