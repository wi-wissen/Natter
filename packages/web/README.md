# @natter/web – Natter im Browser

Gemeinsame Grundlage, um Natter-Programme in einer Webseite laufen zu lassen: ein **Runner** (Zeitscheiben, Warte-Handler, Host-Callbacks, Debugger), eine **Konsole** und die Zeichenflächen **turtle** und **kara**. Pygame Zero, guizero und Plots docken über dieselbe Schnittstelle an (`registerHost`, `registerWait`, `use`). Nutzt nur die öffentlichen Exporte von `@natter/core`.

```bash
npm run web:build   # packages/web/dist/natter-web.js (ES-Modul, mit Kern) + Größe
npm run web:e2e     # bauen, dann Browsertests gegen demo/index.html (Chromium, headless)
npx vitest run packages/web   # reine Logik (Koordinaten, Kara-Welt, http, Runner in Node)
```

Demo: nach dem Bauen `packages/web/demo/index.html` über einen beliebigen statischen Server öffnen (Codefeld, Start/Stopp, Konsole, Turtle oder Kara je nach Programm, Beispiele). Browsertests: `node packages/web/e2e/run.mjs [Filter]`; Playwright kommt aus dem Projekt oder aus `PLAYWRIGHT_DIR` (Standard `/opt/node-tools/node_modules`), Chromium aus `PW_CHROMIUM`. Screenshots (Desktop 1440×900, Handy 412×915) landen in `e2e/out/`.

## Einbinden

```js
import { createRunner, createConsole, createTurtle, createKara, detectModules, karaGlobals } from './natter-web.js';

const runner = createRunner({ timeScale: 1 });
const con = createConsole(document.querySelector('#console'), { lang: 'de', onLineClick: (line) => editor.goto(line) }).connect(runner);
const turtle = createTurtle(document.querySelector('#turtle'));   // Container braucht eine Höhe
const kara = createKara(document.querySelector('#kara'));
runner.use(turtle).use(kara);

const mods = detectModules(source);                               // ['turtle'] / ['kara'] / []
await runner.run(source, { files: projekt, globals: mods.includes('kara') ? karaGlobals() : {} });  // → 'done' | 'error' | 'stopped'
stopButton.onclick = () => runner.stop();
```

## Runner: `createRunner(options)`

- Optionen: `onOutput(text, kind)` (`out`, `err`, `input` = Echo der Eingabe), `onError(error, { source, vm })`, `onState(state, info)`, `onInput(prompt, wait)`, `onFileChange(path, text|null)`, `sliceMs` (10), `timeScale` (1; < 1 macht sleep und Timer schneller), `fetch`, `httpTimeout` (30 s), `host`, `globals`. Statt der Optionen geht auch `runner.on('output'|'error'|'state'|'input'|'file', fn)` (gibt eine Abmeldefunktion zurück).
- `run(source, { files, seed, globals, inputs, breakpoints, debug })`: übersetzt (Syntaxfehler kommen als normaler Fehler), startet die VM und rechnet in Scheiben von etwa 10 ms mit selbst angepasstem Befehlsbudget. Zwischen den Scheiben bekommt die Seite die Kontrolle (MessageChannel, regelmäßig auch `setTimeout`), eine Endlosschleife blockiert nie. `seed` fehlt → zufällig.
- Zustände: `running`, `waiting` (input, Ereignisschleife; Schlafen bei Animationen zählt als `running`), `paused`, `done`, `error`, `stopped`.
- `stop()`, `sendInput(text)` (beantwortet ein wartendes `input()` oder wird für das nächste gemerkt).
- Debugger (dünn über `vm.debugCommand`): `pause()`, `continue()`, `step('over'|'into'|'out')`, `setBreakpoints(lines)`, `inspect()` (Variablen, Aufrufstapel); bei `paused` liefert `onState` `{ line }`.
- `vm`, `task`, `state`, `source`; `wake()` rechnet sofort weiter (für Module, die selbst Tasks starten, z. B. mit `vm.spawn`). Fehler eines beliebigen Tasks beenden den Lauf.
- Uhr: `host.now`/`host.epoch`/`host.tzOffset` kommen aus `performance.now()` und `Date`, `time.time()` ist also echt. Dateien: `files` füllt `vm.fs`, Änderungen meldet `onFileChange`.

Fehlerobjekt = `task.error` des Kerns (`code`, `kind`, `params`, `line`, `traceback`). `describeError(error, { lang, source })` liefert `{ title, text, line, traceback }` (Text aus `scriptErrorText`, Traceback aus `formatTraceback`).

### Warte-Handler und Host-Einträge (für weitere Module)

Hält ein Task an (`task.wait`), fragt der Runner die Handler für `wait.kind`: zuletzt registrierte zuerst, `return false` reicht weiter, eingebaut sind `sleep` (Echtzeit × `timeScale`), `input` (Konsole), `http` (fetch mit AbortController; `TypeError` → `error: 'cors'`, Zeitüberschreitung → `'timeout'`, andere Schemata → `'blocked'`) und `turtle-event` (ohne Turtle-Modul: Schleife endet). Unbekannte Arten beenden das Programm mit einem klaren Fehler.

```js
runner.registerWait('pgzero', (wait, ctx) => {
  // ctx: { vm, task, runner, resume(value), throwError(scriptError), onCancel(fn) }
  startGame(ctx.vm, () => ctx.resume(null));       // Spiel zu Ende → Programm läuft weiter
  ctx.onCancel(() => stopGame());                   // Stopp-Knopf
});
runner.registerHost('pgzero', { draw(kind, args) { … } });   // landet in vm.host.pgzero
```

Ein Modul bündelt das als Plugin: `runner.use({ name, host: {…}, waits: {…}, start({ vm, task, runner, source }), end(state) })`. So sind `createTurtle` und `createKara` gebaut. Gemeinsame Bausteine: `createStage(container, { width, height, fit, upscale, maxScale })` (Canvas, scharf bei hoher Pixeldichte, passt sich dem Container an, `pointer(e)` gibt logische Koordinaten) und `askDialog(parent, { title, text, onDone })`.

## Konsole: `createConsole(container, { lang, onSubmit, onLineClick, maxChars })`

Ausgabe (gepuffert, einmal pro Frame geschrieben, ältere Ausgabe fällt nach `maxChars` weg), Eingabezeile für `input()`, Fehlerkasten mit Zeile (klickbar), freundlicher Meldung und aufklappbarem Traceback. `connect(runner)` verdrahtet alles; einzeln: `write`, `showInput`, `showError`, `clear`, `text`. Der Stopp-Knopf gehört der Seite.

Farben über CSS-Variablen `--nw-bg`, `--nw-text`, `--nw-muted`, `--nw-line`, `--nw-err`, `--nw-err-bg`, `--nw-err-line`, `--nw-stderr`, `--nw-input`, `--nw-input-bg`, `--nw-accent`, `--nw-font`, `--nw-mono`, `--nw-radius`, `--nw-stage-bg`. Ohne sie gelten die Tokens von python.jetzt (`--bg-soft`, `--text`, `--err` …), sonst eigene Werte mit Dunkelmodus.

## Turtle: `createTurtle(container, { width, height, fit, upscale, instantMs, lang, onTitle })`

Setzt `host.turtle(kind, args)` aus `docs/HOST-TURTLE-KARA.md` um: Ursprung in der Mitte, y nach oben, `setworldcoordinates`, Stifte, Füllen (`evenodd` wie Tk, die Füllung liegt unter den Linien), Punkte, Text mit Schrift, Stempel, mehrere Schildkröten mit Formen (`turtle` aus `packages/assets/turtle/turtle.svg`, mit `fillcolor` eingefärbt), Sichtbarkeit, `bgcolor`, `setup`, `title`, `clear`, `reset`, `clearscreen`, `tracer`/`update`. Geschwindigkeit 1–10 animiert (Rückgabe = Wartezeit); Tempo 0 kostet `instantMs` (1 ms) pro Schritt, solange `tracer` an ist (wie die Bildschirm-Updates in CPython), mit `tracer(0)` nichts. Tasten (Tk-Namen: `Left`, `space` …), Klicks und Tipps (als Float-Koordinaten) und Timer gehen über `turtleEvent` an `mainloop()`, `exitonclick()` endet beim Klick; `textinput`/`numinput` öffnen einen Dialog. Bildschirm vor `setup()`: 960 × 810 (wie `window_width()` im Kern), auf das Containermaß verkleinert; Schildkröten behalten dabei ihre Bildschirmgröße.

## Kara: `createKara(container, { stepSeconds, fit, maxScale })`

Wiese von 3×3 bis 30×20 (Zellen passen sich an), Bäume, Beeren, Pilze (grün, wenn alle auf Beeren liegen), Marienkäfer mit Blickrichtung. `move`, `push`, `turn`, `put`, `remove` sind animiert (`stepSeconds`, Standard 0,3; auch später über `kara.stepSeconds` änderbar), `crash` zeigt den Zusammenstoß, der Fehler kommt wie jeder andere.
