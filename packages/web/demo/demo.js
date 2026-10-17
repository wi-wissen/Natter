// Demo page: code box, Run/Stop, console and a canvas that shows turtle or kara, depending on the program.
import { createRunner, createConsole, createTurtle, createKara, createForms, createPlot, detectModules, karaGlobals } from '../dist/natter-web.js';
import { EXAMPLES } from './examples.js';
import { FORMS_EXAMPLES } from './examples-forms.js';
import { createPgzero } from '../dist/natter-web.js';
import { PGZ_EXAMPLES } from './examples-pgzero.js';
import { addPondPlaceholders } from './pgzero-placeholders.js';

EXAMPLES.push(...FORMS_EXAMPLES);
EXAMPLES.push(...PGZ_EXAMPLES);

const $ = (id) => document.getElementById(id);
const code = /** @type {HTMLTextAreaElement} */ ($('code'));
const status = $('status');
const STATES = { idle: 'bereit', running: 'läuft …', waiting: 'wartet …', paused: 'angehalten', done: 'fertig', error: 'Fehler', stopped: 'gestoppt' };

const runner = createRunner();
const con = createConsole($('console'), { lang: 'de', onLineClick: (line) => selectLine(line) }).connect(runner);
const turtle = createTurtle($('turtle'), { lang: 'de' });
const kara = createKara($('kara'));
const forms = createForms($('forms'), { lang: 'de' });
const plot = createPlot($('plot'), { lang: 'de' });
runner.use(turtle).use(kara).use(forms).use(plot);
// Pygame Zero: images and sounds from packages/assets (and the demo's animated figures), on-screen buttons on touch screens
const pgz = createPgzero($('pgzero'), {
  lang: 'de', controls: 'auto',
  assets: [{ baseUrl: new URL('../../assets/', import.meta.url).href, packs: ['turtle', 'sounds', 'book'] }, { baseUrl: new URL('./assets/', import.meta.url).href, packs: ['anim'] }],
});
addPondPlaceholders(pgz);
runner.use(pgz);

runner.on('state', (s) => {
  status.textContent = STATES[s] ?? s;
  document.body.dataset.state = s;
  const active = s === 'running' || s === 'waiting' || s === 'paused';
  $('stop').disabled = !active;
});

function show(mods) {
  $('stage').hidden = !mods.length;
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
  show(detectModules(ex.code));
}
$('examples').addEventListener('change', (e) => load(e.target.value));
$('run').addEventListener('click', () => run());
$('stop').addEventListener('click', () => runner.stop());
code.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
  if (e.key === 'Tab') { e.preventDefault(); code.setRangeText('    ', code.selectionStart, code.selectionEnd, 'end'); }
});
load(new URLSearchParams(location.search).get('example') ?? 'square');

// for the browser tests
window.demo = { runner, con, turtle, kara, forms, plot, pgz, run, load, setCode: (s) => { code.value = s; } };
