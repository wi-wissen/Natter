// Entry for pages that want a small start: the core without the standard modules written in Python.
// Call `await loadPyModules(source)` before running a program; it loads exactly the packs the program imports.
export * from './core.js';
export { loadPyModules, loadPacks, packsFor, packOf, PACKS } from './stdlib/packs.js';
