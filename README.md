# Natter

A small Python interpreter written in JavaScript, made for teaching in the browser.

- **Small:** the core starts at about 38 KB gzipped (`packages/core/src/browser.js`). Standard modules, numpy, plots, forms and Pygame Zero are separate chunks (15 to 40 KB gzipped each) that load only when a program imports them. `npm run size` prints the numbers.
- **Never freezes:** programs run in slices with an instruction budget, so an endless loop stops instead of blocking the page.
- **Debugger built in:** breakpoints, step into/over/out, variables and call stack.
- **Friendly errors:** English and German messages with hints, in the style of CPython 3.12.
- **Reproducible:** optional random seed and platform-independent math.

> **Status: early development.** The language, the standard library, `turtle`, `kara`, files, `requests`, Pygame Zero, `guizero`, numpy and plots run in the interpreter and are compared with CPython and the real libraries in the tests. The browser host (`packages/web`) draws turtle and kara so far; games, forms and plots are being added. See the roadmap.

## Used by

Natter is built to run the Python in these projects:

- [python.jetzt](https://github.com/wi-wissen/python.jetzt): a browser editor for learning Python in school.
- [Kronland](https://github.com/wi-wissen/kronland): a browser strategy game with Python scripting.

## How it works

```
source -> lexer -> parser -> compiler -> bytecode VM
```

The VM is a stack machine with its own frame stack (no JavaScript recursion). It can stop and resume after any instruction. That allows an instruction budget per slice, suspending on `input()` or animated calls, and a debugger that pauses on statement boundaries. Modules reach the VM through a host bridge and do not touch the DOM from the core.

## Roadmap

0. Repository setup, interpreter core with its tests. **Done.**
1. Language core: classes, exceptions, sets, generators, `with`, `input()`. **Done.**
2. Standard library and deterministic math. **Done:** `math`, `random`, `time`, `datetime`, `json`, `statistics`, `collections`, `itertools`, `functools`, `string`, `copy`, `sys`. `re`, `pprint`, `textwrap` and correctly rounded `math` are in, too.
3. `turtle` and `kara`. **Engines done** (movement, commands, errors, tests against CPython; see `docs/HOST-TURTLE-KARA.md`). The drawing surface comes with the browser host.
4. Projects with several files, `import`, assets. **Core done:** `open()`, `os`, `os.path` and `import` of own files on an in-memory project (`vm.fs`); storing it in a folder, ZIP or browser is the host's job. Assets: see `packages/assets`. Code objects, frames, errors and tracebacks carry their file (`compile(src, { file })`, `code.file`, `error.file`, `traceback[i].file`), breakpoints can be set per file, and the web runner serves `import` of project files and packages from its `files` option (`pkg/__init__.py`, `from . import x`).
5. Games with the full Pygame Zero reference.
6. Forms with the `guizero` API (a subset), grid layout. **Engine done:** `import guizero` follows guizero 1.6 (tests against the real library); the host draws the widgets, see `docs/FORMS-BRIDGE.md`.
7. numpy subset and plots. **Core done:** `numpy` (arrays, statistics, `numpy.random` with the same numbers as numpy, `linalg`) and `matplotlib.pyplot` (line, scatter, bar, hist, pie … as SVG for the host); see `docs/NUMPY-PLOT.md`.

## Development

```bash
npm install
npm test          # Vitest; compares the example programs with CPython when python3 is installed
npm run size      # bundle the core, print minified and gzip size
```

The core lives in [`packages/core`](packages/core). Plain JavaScript with JSDoc, no TypeScript. The core must stay deterministic: a test forbids `Math.sin`, `Math.pow`, `Date` and similar in `packages/core/src`.

Example programs are in `packages/core/test/cases/*.py` with the output of CPython in `*.out`. To add a case, write the `.py` file and run `python3 x.py > x.out`.

## Website

A static overview page lives in [`docs/`](docs/), published with GitHub Pages (source: `main`, folder `/docs`) at <https://natter.wi7.net/> (custom domain `natter.wi7.net`, set in the repository's Pages settings).

The **command reference** ([`docs/reference/index.html`](docs/reference/index.html)) lists the language, the builtins, every standard module, `turtle`, `kara` (commands and world format), Pygame Zero (hooks, `screen`, `Actor`, `keyboard`, sounds, music, `clock`, images from the asset library), `guizero`, numpy, pyplot, `requests` with CORS, files and the asset library, each with a runnable example. It is generated from the interpreter: `scripts/build-reference.mjs` reads the module registries, builtins, stdlib, messages and `packages/assets` and adds the English text from `scripts/reference/content.mjs`. Every example and every language snippet runs while building. After changing a module, run

```bash
npm run reference   # rewrite docs/reference/index.html
```

`packages/core/test/reference.test.js` fails when the page is stale, when a described name no longer exists or when an example stops working.

## Einbinden

Drei Pakete auf npm, eine Version für alle:

| Paket | Inhalt |
|---|---|
| [`@natterjs/core`](https://www.npmjs.com/package/@natterjs/core) | Interpreter (Quelltext, ES-Module mit JSDoc), Node 18+ und Browser; `@natterjs/core/browser` ist der kleine Start ohne die in Python geschriebenen Module |
| [`@natterjs/web`](https://www.npmjs.com/package/@natterjs/web) | Browser-Host als fertiger Build `dist/natter-web.js` mit nachgeladenen Teilen (Kern eingebaut) |
| [`@natterjs/assets`](https://www.npmjs.com/package/@natterjs/assets) | Bilder, Klänge, `catalog.json` (CC0, siehe `packages/assets/LICENSE-ASSETS.md`) |

**Mit npm und Bundler** (Vite, esbuild, webpack):

```bash
npm install @natterjs/web @natterjs/assets
```

```js
import { createRunner, createConsole } from '@natterjs/web';
const runner = createRunner();
createConsole(document.querySelector('#console')).connect(runner);
await runner.run('print(1 + 1)');
```

**In Node** (Tests, Werkzeuge):

```js
import { runToEnd } from '@natterjs/core';   // npm install @natterjs/core
console.log(runToEnd('print(1 + 1)').output); // 2
```

**Statische Seite ohne Build, über jsDelivr** (immer mit fester Version):

```html
<div id="console"></div>
<script type="module">
  import { createRunner, createConsole, createPgzero } from 'https://cdn.jsdelivr.net/npm/@natterjs/web@0.1.0/dist/natter-web.js';
  const runner = createRunner();
  createConsole(document.querySelector('#console')).connect(runner);
  await runner.run('for i in range(3):\n    print("Hallo", i)');
  // Bildbibliothek für Pygame Zero und Kara:
  // createPgzero(el, { assets: { baseUrl: 'https://cdn.jsdelivr.net/npm/@natterjs/assets@0.1.0/', catalog: 'catalog.json' } })
</script>
```

`natter-web.js` lädt seine Teile (`stdlib-…js`, `numpy-…js` …) von seinem eigenen Ort nach. Wer selbst hostet, kopiert den ganzen Ordner `dist/` (aus `node_modules/@natterjs/web/dist/` oder aus `natter-web-<version>.zip` der [GitHub-Releases](https://github.com/wi-wissen/Natter/releases)) und für Bilder den Inhalt von `@natterjs/assets`. `import { assetsOption } from '@natterjs/assets'` liefert `{ baseUrl, catalog }` relativ zum Paket, wenn es so ausgeliefert wird, wie es ist.

**Ohne npm-Registry, aus dem GitHub-Release:** jedes Release hat die npm-Tarballs als Anhang (mit `SHA256SUMS.txt`):

```bash
npm install https://github.com/wi-wissen/Natter/releases/download/v0.1.0/natterjs-core-0.1.0.tgz \
            https://github.com/wi-wissen/Natter/releases/download/v0.1.0/natterjs-web-0.1.0.tgz
```

(`@natterjs/web` hängt von `@natterjs/core` ab, darum beide.) jsDelivr direkt aus GitHub (`https://cdn.jsdelivr.net/gh/wi-wissen/Natter@v0.1.0/…`) liefert nur, was im Repository liegt: die Bibliothek (`…/packages/assets/catalog.json`) und den Quelltext, aber nicht `dist/`, das nicht eingecheckt ist. Für den Browser-Build also die npm-Adresse oben nehmen.

## Veröffentlichen (Release)

Ein Tag `v<version>` startet `.github/workflows/release.yml`: Lizenz- und Versionsprüfung (`scripts/release-check.mjs`), `npm ci`, Tests, Build, Größenbericht, `npm pack` und `npm publish --provenance` für `@natterjs/assets`, `@natterjs/core`, `@natterjs/web` (in dieser Reihenfolge; was schon auf npm liegt, wird übersprungen, ein fehlgeschlagener Lauf lässt sich neu starten), dann ein GitHub-Release mit erzeugten Notizen, `natter-web-<version>.zip`, den drei Tarballs und `SHA256SUMS.txt`. Von Hand geht es auch: Actions → Release → „Run workflow“ mit der Version (legt den Tag an). Bei jedem Push und Pull Request laufen Tests, Build und Größenbericht (`.github/workflows/ci.yml`).

Neue Version:

```bash
node scripts/set-version.mjs 0.2.0   # alle package.json und die internen Abhängigkeiten
npm install                          # package-lock.json
git commit -am "Release 0.2.0" && git tag v0.2.0 && git push origin main v0.2.0
```

Checkliste für die Inhaberin bzw. den Inhaber (einmalig):

1. Auf npmjs.com ein **Granular Access Token** anlegen: Pakete und Scopes `@natterjs` (bzw. Organisation `natterjs`), Berechtigung **Read and write**, kurze Laufzeit (z. B. 7 Tage). Es als Repository-Secret **`NPM_TOKEN`** speichern (Settings → Secrets and variables → Actions). Nötig, weil npm einen Trusted Publisher erst für ein bestehendes Paket einrichten lässt.
2. In `LICENSE` steht der Name des Rechteinhabers (der Release-Lauf bricht ab, solange dort ein Platzhalter steht).
3. Erstes Release: `git tag v0.1.0 && git push origin v0.1.0`. Der Lauf veröffentlicht mit dem Token.
4. Danach für **jedes** der drei Pakete auf npmjs.com → Paket → Settings → **Trusted Publisher** → GitHub Actions: Organisation/Benutzer `wi-wissen`, Repository `Natter`, Workflow `release.yml` (Environment leer). Optional dort „Require two-factor authentication and disallow tokens“ wählen.
5. Das Token auf npmjs.com löschen und das Secret `NPM_TOKEN` im Repository entfernen. Ab jetzt meldet sich der Workflow per OIDC an (`id-token: write`, npm ab 11.5.1), ohne Geheimnis; die Provenienz zeigt npm am Paket an.

## License

Code: MIT, see [`LICENSE`](LICENSE) (with the notices of the third-party code in `packages/core`). Images and sounds in `packages/assets`: CC0, see [`packages/assets/LICENSE-ASSETS.md`](packages/assets/LICENSE-ASSETS.md).
