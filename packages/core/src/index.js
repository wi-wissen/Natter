// Full entry: the core plus every standard module (Node, tests, tools). A browser page that wants to start small
// uses browser.js and loads modules on demand.
import './stdlib/packs/all.js';
export * from './core.js';
