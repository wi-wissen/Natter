# @natter/web – Natter im Browser

Gemeinsame Grundlage, um Natter-Programme in einer Webseite laufen zu lassen: ein **Runner** (Zeitscheiben, Warte-Handler, Host-Callbacks, Debugger), eine **Konsole**, die Zeichenflächen **turtle** und **kara**, **Formulare** (guizero) und **Plots** (matplotlib). Alle Module docken über dieselbe Schnittstelle an (`registerHost`, `registerWait`, `use`). Nutzt nur die öffentlichen Exporte von `@natter/core`.

```bash
npm run web:build   # packages/web/dist/natter-web.js (ES-Modul, mit Kern) + Größe
npm run web:e2e     # bauen, dann Browsertests gegen demo/index.html (Chromium, headless)
npx vitest run packages/web   # reine Logik (Koordinaten, Kara-Welt, http, Runner in Node)
```

Demo: nach dem Bauen `packages/web/demo/index.html` über einen beliebigen statischen Server öffnen (Codefeld, Start/Stopp, Konsole, Turtle oder Kara je nach Programm, Beispiele). Browsertests: `node packages/web/e2e/run.mjs [Filter]`, Formulare und Plots: `node packages/web/e2e/forms.mjs [Filter]`, Pygame Zero: `node packages/web/e2e/pgzero.mjs [Filter]`; Playwright kommt aus dem Projekt oder aus `PLAYWRIGHT_DIR` (Standard `/opt/node-tools/node_modules`), Chromium aus `PW_CHROMIUM`. Screenshots (Desktop 1440×900, Handy 412×915) landen in `e2e/out/`.

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

## Pygame Zero: `createPgzero(container, options)`

Setzt `host.pgz` aus `docs/PGZERO-BRIDGE.md` um (Plugin wie Turtle und Kara, Datei `src/pgzero.js`).

```js
const pgz = createPgzero(document.querySelector('#spiel'), {
  lang: 'de', controls: 'auto',
  assets: { baseUrl: '/assets/', packs: ['turtle', 'sounds'] },   // packages/assets auf dem Server
});
runner.use(pgz);
await pgz.run(runner, source, { files: projekt });   // = prepare() + runner.run()
// oder selbst: const p = await pgz.prepare(source, { files }); runner.run(p.source, { files, globals: p.globals });
```

- **Start:** `prepare()` lädt alle Bilder und Klänge vorab (die Brücke fragt synchron) und erkennt die Art (`pgzMode`): mit `import pgzrun` läuft das Programm unverändert, ohne (wie `pgzrun spiel.py`) bekommt es die Pygame-Zero-Namen vordefiniert und am Ende eine Zeile, die das Spiel startet (Zeilennummern bleiben). `detectModules` meldet `'pgzero'`.
- **Takt:** `requestAnimationFrame`, fester Schritt `dt = 1/60` mit Akkumulator (höchstens `maxCatchUp` = 4 Frames nachholen, kein Rasen nach einer Pause). Jeder Frame läuft in Scheiben von etwa 8 ms; braucht er mehr als `frameBudget` Befehle (20 Mio.), endet das Spiel mit dem Fehler „Das dauert zu lange“ und der Zeile der Schleife. Fehler in `update`/`draw`/Hooks kommen mit Traceback über den Runner, `exit()` beendet das Programm, `pgz.quit()` schließt das Fenster (Code nach `pgzrun.go()` läuft). Verdeckter Tab: Pause. `pause()`, `resume()`, `step(n)` für Einzelschritte.
- **Zeichnen:** Fenster aus `WIDTH`/`HEIGHT`, `TITLE` in der Titelleiste (`titleBar: false` blendet sie aus, `onTitle`), skaliert mit festem Seitenverhältnis (`upscale`, `maxScale` = 2), scharf bei hoher Pixeldichte. Befehle wie pygame (Pixelmitten, Kreis mit Durchmesser 2r), Actor mit Drehung, `scale`, `flip_x/y`, `opacity`; ungedrehte Bilder liegen auf ganzen Gerätepixeln (Kacheln ohne Fugen). Text wie ptext: Standardschrift fett, Größe × 0,6875 wie pygame, Umbruch, `align`, Umriss, Schatten, Verlauf, `alpha`, `angle`, `textbox`. Nach einer Größenänderung werden die Befehle seit dem letzten `fill` neu gezeichnet. `smooth: false` schaltet die Bildglättung ab (Pixelgrafik).
- **Eingaben:** Tasten mit pygame-2-Codes (Buchstaben nach Tastaturbelegung, keine Tastenwiederholung, Modifikatoren links/rechts), nur wenn kein Eingabefeld den Fokus hat; Pfeile und Leertaste scrollen die Seite dann nicht. Maus: Position (ganzzahlig), Tasten 1–3, Rad als 4/5, Bewegung mit `rel` und `buttons`. Ein Finger wirkt wie die linke Maustaste. `controls: true | 'auto' | false` (Standard `false`): Knopfleiste unter dem Spiel (◀ ▶ ▲ ▼ und Sprung = Leertaste), `'auto'` zeigt sie auf Touchscreens; auch später über `pgz.controls`.
- **Bilder, Klänge, Musik, Schriften** werden in dieser Reihenfolge gesucht: 1. Projektdateien `images/`, `sounds/`, `music/`, `fonts/` (Unterordner als `ordner/name`; Inhalt als `data:`-URL, SVG-Text, `Blob`, `ArrayBuffer`/`Uint8Array` oder `{ url }`), 2. Pakete aus `assets` (`{ baseUrl, packs }` oder eine Liste davon; je Paket `<baseUrl><pack>/pack.json`, sonst `<pack>/<pack>.json` wie `sounds/sounds.json`; Einträge `assets`/`images` → Bilder, `sounds`, `music`), 3. Bilder und Klänge der Seite (`addImage(name, canvas|img|SVG-Text|URL, [w, h])`, `addSound(name, AudioBuffer|URL)`), z. B. Platzhalter. Aus den Paketen wird nur geladen, was im Programm (auch in Zeichenketten) vorkommt; ein Wort mit `_` am Ende oder ab fünf Zeichen lädt alle Namen, die so beginnen (`"heroine_run_" + str(i)`). `preload: 'all'` lädt alles. Fehlt etwas, steht vor dem `KeyError` eine Meldung mit Dateiname, durchsuchten Orten und „Meintest du …?“.
- **Ton:** Web Audio. Erst nach der ersten Berührung, dem ersten Klick oder Tastendruck (Vorgabe der Browser); bis dahin zeigt die Bühne „Ton an: tippen oder klicken“, Musik startet dann. Sounds mit `loops`, `maxtime`, `fade_ms`, Lautstärke je Klang; Musik mit Schleife, Warteschlange, Pause, Spulen, Ausblenden, `music_end`; `tone` als Sinus mit der Hüllkurve von pgzero. `volume`, `muted`, Ton-Knopf in der Titelleiste (`soundButton: false` blendet ihn aus).
- Für Tests: `info` (Größe, Titel, Frames, Ton), `pixel(x, y)`, `toClient(x, y)`.

## Formulare (guizero): `createForms(container, { lang, windows, image, images, onTitle })`

Setzt `host.forms(op, data)` aus `docs/FORMS-BRIDGE.md` mit echten HTML-Elementen um: `Text` (div), `TextBox` (input/textarea, `hide_text` als Passwortfeld), `PushButton` (button, auch mit Bild), `CheckBox`, `ButtonGroup` (Radiogruppe), `Combo` (select), `ListBox` (eigene `role="listbox"` mit Tastatur, Mehrfachauswahl), `Slider` (range mit Wertanzeige, auch senkrecht), `Picture` (img), `Drawing` und `Waffle` (SVG), `Box`, `TitleBox` (fieldset), `MenuBar` (Menüleiste mit Aufklappmenüs). Ein vorangehender `Text` wird zum Namen (`aria-labelledby`) eines Eingabefelds.

```js
const forms = createForms(document.querySelector('#forms'), { lang: 'de' });   // Container braucht eine Höhe
runner.use(forms);
```

- **Fenster:** App und `Window` sind Tafeln auf einer Arbeitsfläche (verschiebbar an der Titelleiste, Klick holt nach vorn, das App mittig, weitere daneben oder versetzt). Unter 600 px Breite (oder `windows: 'tabs'`) füllen Fenster die Breite, es ist immer eines zu sehen, ein Umschalter (Tabs) wählt, ein neu gezeigtes Fenster kommt nach vorn. `width`/`height` des Fensters sind die Pixel des Inhalts; was nicht passt, scrollt. `full_screen` füllt die Fläche, `modal` sperrt die anderen Fenster.
- **Layout `auto`** wie Tk `pack`, gebaut aus verschachtelten Flex-„Hohlräumen“: jedes Kind nimmt sich an seiner Seite (`top`, `bottom`, `left`, `right`) einen Streifen und wird darin zentriert; `"fill"` dehnt nach guizeros Regeln (`fill`/`expand`). **Layout `grid`** ist ein CSS-Grid: Spalten und Zeilen so groß wie ihr größtes Kind, wachsen mit dem Inhalt, leere sind 0 breit, Spannen über `[spalte, zeile, spalten, zeilen]`, `align` klebt an die Zellseite, das Gitter sitzt oben links.
- **Größen** wie in guizero: `Text`, `TextBox`, `PushButton`, `CheckBox`, `Combo` in Zeichen (`ch`) und Zeilen, `Box`, `ListBox`, `Picture`, `Drawing`, Fenster in Pixeln (eine `Box` mit Größe schneidet ab), `Waffle` in Feldern. Schrift: Tk-Punkte × `--nwf-pt` (1,4 px, auf Touch-Geräten 1,6 px); `Helvetica`/`Arial` = Schrift der Seite, `Courier` = Monospace.
- **Farben:** Tk-Standardfarben (`#d9d9d9`, weiße Eingabefelder, schwarze Schrift) zeichnen in den Farben des Themas (hell/dunkel). Eine eigene Hintergrundfarbe gilt genau so; Text mit Standardfarbe wird darauf schwarz oder weiß, je nachdem, was lesbar ist.
- **Ereignisse:** Klicks (`press1`, `release1`, `command`, Doppelklick als `double1`, rechte Taste `press3`), Eingaben (`change` bei jeder Änderung, Tasten als `key` mit Tk-`keysym`/`char` an das Widget mit Fokus oder das Fenster), `motion`/`drag1`/`enter`/`leave` nur, wenn das Widget oder sein Fenster sie auswertet (dann auch Wischen auf Touch), Menüs, Schließknopf (`close`), neue Fenstergrößen (`resize`; Widgets nur mit `when_resized`). Mauskoordinaten in Widget-Pixeln, bei verkleinerten Drawings zurückgerechnet. Ereignisse warten in einer Schlange, bis das Programm in `display()`/`update()` danach fragt; Mausbewegungen werden zusammengefasst.
- **Zeitgeber** (`after`, `repeat`) laufen auf echter Zeit (`setTimeout` × `timeScale` des Runners), Stopp löscht sie.
- **Dialoge** liegen als modale Karte über den Fenstern: `info`/`warn`/`error` (OK), `yesno` (Ja/Nein), `question` (Textfeld mit Startwert), `select_file` (Liste der Projektdateien, Dateitypen als Filter; zum Speichern ein Namensfeld), `select_folder`, `select_color` (Farbwähler). Escape bricht ab.
- **Bilder:** `image(path, vm)` liefert `{ url, width, height }` synchron; sonst `images`/`forms.addImage(path, url, w, h)`/`await forms.loadImages({ path: url })`, sonst eine Projektdatei (`files`) als `data:`-URL (PNG, GIF, JPEG, BMP, WebP, SVG) oder SVG-Text.
- **Ende:** Schließt der Nutzer das App-Fenster, endet `display()`. Nach Stopp oder Fehler bleiben die Fenster blass und gesperrt stehen, bis der nächste Lauf beginnt.
- Für Tests und Seiten: `forms.info` (Fenster, Modus, Zeitgeber, wartet?), `forms.element(id)`, `forms.setWindowMode('auto'|'panels'|'tabs')`.

Thema über CSS-Variablen (sonst die `--nw-*`-Werte der Konsole, sonst die Tokens von python.jetzt): `--nwf-font`, `--nwf-mono`, `--nwf-text`, `--nwf-muted`, `--nwf-line`, `--nwf-desk` (Fläche hinter den Fenstern), `--nwf-surface` (Fensterinhalt), `--nwf-field` (Eingabefelder), `--nwf-button`, `--nwf-button-hover`, `--nwf-titlebar`, `--nwf-accent`, `--nwf-on-accent`, `--nwf-shadow`, `--nwf-radius`, `--nwf-ctl-radius`, `--nwf-pt`, `--nwf-touch` (Mindesthöhe von Bedienelementen, auf Touch-Geräten 44 px), `--nwf-warn`, `--nwf-err`. Dunkelmodus nach `prefers-color-scheme`, außer `<html data-theme="light|dark">` legt es fest.

## Plots: `createPlot(container, { lang, layout, dark, showOpenAtEnd, maxWidth, onSave, onShow })`

Zeigt das SVG von `plt.show()` (Warteart `plot`, `docs/NUMPY-PLOT.md`) direkt in der Seite und setzt das Programm sofort fort. Eine Abbildung passt sich der Fläche an (so breit, dass sie ganz zu sehen ist, höchstens 1,5-fache Größe); „⤢“ gibt ihr die volle Breite. Mehrere Abbildungen stehen untereinander (`layout: 'tabs'`: als Tabs). Jede Abbildung hat „↓ SVG“ und „↓ PNG“ (Download über einen Blob-Link, PNG in doppelter Auflösung; in Sandbox-Ansichten wie Artifacts sind Downloads gesperrt). Figuren, die am Programmende noch offen sind (kein `show()`), erscheinen dann (`showOpenAtEnd: false` schaltet das ab).

- **Dunkelmodus:** Das SVG hat einen weißen Hintergrund. Standard (`dark: 'paper'`) zeigt es als weißes Blatt; `dark: 'invert'` (oder der Knopf „Dunkel“, nur im Dunkelmodus sichtbar) kehrt die Farben um (`invert` + `hue-rotate`, Farben der Linien bleiben erkennbar). Heruntergeladen wird immer das Original.
- **`savefig(datei)`:** ohne `onSave` erscheint eine Zeile „datei gespeichert: herunterladen“; `onSave(file, svg, wait)` kann die Datei selbst ablegen (z. B. im Projekt) und gibt dann `true` zurück.
- `plot.show(svg, w, h, name)`, `plot.clear()`, `plot.saveSvg(i)`, `plot.savePng(i, scale)`, `plot.setDark('paper'|'invert')`, `plot.figures`. Hilfen: `downloadBlob(blob, name)`, `svgToPng(svg, w, h, scale)`.

`detectModules(source)` meldet zusätzlich `forms` (Import von guizero) und `plot` (Import von matplotlib). Die Demo hat Beispiele für Zähler, Temperatur-Umrechner, Quiz, To-do-Liste, Uhr, Raster mit zweitem Fenster und Plots mit numpy.
