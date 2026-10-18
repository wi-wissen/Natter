// Demo page: code box, Run/Stop, console and a canvas that shows turtle or kara, depending on the program.
import { createRunner, createConsole, createTurtle, createKara, createForms, createPlot, detectModules, karaGlobals } from '../dist/natter-web.js';
import { EXAMPLES } from './examples.js';
import { FORMS_EXAMPLES } from './examples-forms.js';
import { createPgzero } from '../dist/natter-web.js';
import { PGZ_EXAMPLES } from './examples-pgzero.js';
import { addPondPlaceholders } from './pgzero-placeholders.js';
import { attachHighlight } from './highlight.js';

EXAMPLES.push(...FORMS_EXAMPLES);
EXAMPLES.push(...PGZ_EXAMPLES);

const $ = (id) => document.getElementById(id);
const code = /** @type {HTMLTextAreaElement} */ ($('code'));
const status = $('status');
const editor = attachHighlight(code, $('hl'));
const STATES = { idle: 'bereit', running: 'läuft …', waiting: 'wartet …', paused: 'angehalten', done: 'fertig', error: 'Fehler', stopped: 'gestoppt' };

const runner = createRunner();
const con = createConsole($('console'), { lang: 'de', onLineClick: (line) => selectLine(line) }).connect(runner);
const turtle = createTurtle($('turtle'), { lang: 'de' });
// Kara draws with the images of the library (pack kara); ?kara=shapes points it at a missing library (fallback: shapes)
const library = new URL('../../assets/', import.meta.url).href;
const karaLib = new URLSearchParams(location.search).get('kara') === 'shapes' ? new URL('./missing/', import.meta.url).href : library;
const kara = createKara($('kara'), { assets: { baseUrl: karaLib, catalog: 'catalog.json' } });
const forms = createForms($('forms'), { lang: 'de' });
const plot = createPlot($('plot'), { lang: 'de' });
runner.use(turtle).use(kara).use(forms).use(plot);
// Pygame Zero: the library of packages/assets (catalog.json; the demo's own figures fill in ground_flat), on-screen buttons on touch screens
const pgz = createPgzero($('pgzero'), {
  lang: 'de', controls: 'auto',
  assets: [{ baseUrl: library, catalog: 'catalog.json' }, { baseUrl: new URL('./assets/', import.meta.url).href, packs: ['anim'] }],
});
addPondPlaceholders(pgz);
runner.use(pgz);

runner.on('state', (s) => {
  status.textContent = STATES[s] ?? s;
  document.body.dataset.state = s;
  const active = s === 'running' || s === 'waiting' || s === 'paused';
  $('stop').disabled = !active;
});

/** Rows / columns of the world("""...""") in a Kara program, or 0 (the phone layout fits the stage to it). */
function worldRatio(src) {
  const m = /world\(\s*[rR]?("""|''')([\s\S]*?)\1/.exec(src);
  const rows = m ? m[2].split('\n').filter((l) => l.trim()) : [];
  return rows.length ? rows.length / Math.max(...rows.map((l) => l.length)) : 0;
}

function show(mods, src = code.value) {
  $('stage').hidden = !mods.length;
  const ratio = mods.includes('kara') && !mods.includes('turtle') ? worldRatio(src) : 0;
  $('stage').style.setProperty('--world-ratio', String(ratio));
  $('stage').classList.toggle('fit', ratio > 0);
  $('turtle').hidden = !mods.includes('turtle');
  $('kara').hidden = !mods.includes('kara') || mods.includes('turtle');
  $('forms').hidden = !mods.includes('forms');
  $('plot').hidden = !mods.includes('plot') || mods.includes('forms') || mods.includes('turtle');
  $('stage').classList.toggle('tall', mods.includes('forms') || mods.includes('plot'));
  turtle.stage.layout();
  kara.stage.layout();
  $('pgzero').hidden = !mods.includes('pgzero');
  pgz.stage.layout();
}

function run() {
  const src = code.value;
  const mods = detectModules(src);
  show(mods);
  con.clear();
  if (mods.includes('pgzero')) return pgz.run(runner, src);
  return runner.run(src, { globals: mods.includes('kara') ? karaGlobals() : {} });
}

function selectLine(line) {
  const lines = code.value.split('\n');
  const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
  code.focus();
  code.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
}

for (const ex of EXAMPLES) {
  const o = document.createElement('option');
  o.value = ex.id;
  o.textContent = ex.title;
  $('examples').appendChild(o);
}
function load(id) {
  const ex = EXAMPLES.find((e) => e.id === id) ?? EXAMPLES[0];
  $('examples').value = ex.id;
  code.value = ex.code;
  editor.refresh();
  show(detectModules(ex.code));
}
$('examples').addEventListener('change', (e) => load(e.target.value));
$('run').addEventListener('click', () => run());
$('stop').addEventListener('click', () => runner.stop());
code.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
});
load(new URLSearchParams(location.search).get('example') ?? 'square');

// for the browser tests
window.demo = { runner, con, turtle, kara, forms, plot, pgz, run, load, setCode: (s) => { code.value = s; editor.refresh(); } };
