# Natter

A small Python interpreter written in JavaScript, made for teaching in the browser.

- **Small:** the core starts at about 38 KB gzipped (`packages/core/src/browser.js`). Standard modules, numpy, plots, forms and Pygame Zero are separate chunks (15 to 40 KB gzipped each) that load only when a program imports them. `npm run size` prints the numbers.
- **Never freezes:** programs run in slices with an instruction budget, so an endless loop stops instead of blocking the page.
- **Debugger built in:** breakpoints, step into/over/out, variables and call stack.
- **Friendly errors:** English and German messages with hints, in the style of CPython 3.12.
- **Reproducible:** optional random seed and platform-independent math.

> **Status: version 0.1.** The language, the standard library and the browser hosts (console, `turtle`, `kara`, Pygame Zero, `guizero` forms, numpy and plots, with an image and sound library) are done and compared with CPython and the real libraries in the tests. Published on npm as `@natterjs/core`, `@natterjs/web` and `@natterjs/assets`; see *Get started* on <https://natter.wi7.net/>.

## Used by

Natter is built to run the Python in these projects:

- [CodeNatter](https://codenatter.de) ([source](https://github.com/wi-wissen/codenatter.de)): a browser IDE for learning Python in school, built on Natter.
- [Kronland](https://github.com/wi-wissen/kronland): a browser strategy game with Python scripting.

## How it works

```
source -> lexer -> parser -> compiler -> bytecode VM
```

The VM is a stack machine with its own frame stack (no JavaScript recursion). It can stop and resume after any instruction. That allows an instruction budget per slice, suspending on `input()` or animated calls, and a debugger that pauses on statement boundaries. Modules reach the VM through a host bridge and do not touch the DOM from the core.

## What is included

- **Language and standard library:** classes, exceptions, sets, generators, `with`, `input()`; `math` (correctly rounded), `random`, `time`, `datetime`, `json`, `statistics`, `collections`, `itertools`, `functools`, `string`, `copy`, `sys`, `re`, `pprint`, `textwrap`. All compared with CPython (`packages/core/test`).
- **Files and projects:** `open()`, `os`, `os.path` and `import` of your own files on an in-memory project (`vm.fs`); the host decides where it lives (folder, ZIP, browser). Code, errors and tracebacks carry their file, breakpoints work per file, and the web runner serves packages and relative imports from its `files` option. See `docs/HOST-TURTLE-KARA.md`.
- **Turtle and Kara:** the engines match CPython's turtle; Kara uses the book commands. Both are drawn by `@natterjs/web` (`docs/HOST-TURTLE-KARA.md`).
- **Games:** the full Pygame Zero reference with images and sounds from `@natterjs/assets` (`docs/PGZERO-BRIDGE.md`).
- **Forms:** the `guizero` API (a subset) on a grid that grows with its content, tested against guizero 1.6 (`docs/FORMS-BRIDGE.md`).
- **numpy and plots:** a numpy subset with the same numbers as numpy and `matplotlib.pyplot` as SVG (`docs/NUMPY-PLOT.md`).
- **Browser host:** runner with time slices, console, debugger, turtle, Kara, forms, plots (`packages/web/DEVELOPMENT.md`).
- **Not planned:** threads, async, `eval`/`exec`, server code, scraping and ML libraries.

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

The **sprite gallery** ([`docs/sprites/index.html`](docs/sprites/index.html), <https://natter.wi7.net/sprites/>) shows every image and sound of `@natterjs/assets` by game type: the starter set first, then the rest of the packs, with search, animation previews, a detail view with code and copy-on-click names. It is generated from `packages/assets/catalog.json` and `gametypes.json` by `scripts/build-sprites.mjs`; the pictures are not copied into `docs/` but loaded lazily from jsDelivr (`https://cdn.jsdelivr.net/npm/@natterjs/assets@<version>/`, version from `packages/assets/package.json`). To preview with local files, serve `packages/assets` and open the page with `?base=http://localhost:8123/`. After changing the assets or bumping their version, run

```bash
npm run sprites   # rewrite docs/sprites/index.html (--check only checks)
```

`packages/assets/test/sprites-page.test.js` fails when the page is stale or lists a name that is not in the catalog.

## Einbinden

Drei Pakete auf npm, eine Version für alle:

| Paket | Inhalt |
|---|---|
| [`@natterjs/core`](https://www.npmjs.com/package/@natterjs/core) | Interpreter (Quelltext, ES-Module mit JSDoc), Node 18+ und Browser; `@natterjs/core/browser` ist der kleine Start ohne die in Python geschriebenen Module |
| [`@natterjs/web`](https://www.npmjs.com/package/@natterjs/web) | Browser-Host als fertiger Build `dist/natter-web.js` mit nachgeladenen Teilen (Kern eingebaut) |
| [`@natterjs/assets`](https://www.npmjs.com/package/@natterjs/assets) | Bilder, Klänge, `catalog.json` (CC0, siehe `packages/assets/LICENSE-ASSETS.md`) |

Die `README.md` jedes Pakets ist seine englische Seite auf npm. Die ausführliche (deutsche) Entwicklerdokumentation steht in [`packages/web/DEVELOPMENT.md`](packages/web/DEVELOPMENT.md) (Runner, Konsole, Turtle, Kara, Pygame Zero, Formulare, Plots) und [`packages/assets/DEVELOPMENT.md`](packages/assets/DEVELOPMENT.md) (Pakete, Katalog, Spielarten, neue Pakete); sie wird nicht mit veröffentlicht.

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
git commit -am "Release 0.2.0" && git push origin main
```

Jede Veröffentlichung braucht ein npm-Token (Trusted Publishing entfällt, npm verlangt dafür einen Sicherheitsschlüssel). Ablauf bei jedem Release:

1. Auf npmjs.com → Access Tokens → **Generate New Token → Granular Access Token**: Berechtigung **Packages and scopes: Read and write** für `@natterjs/assets`, `@natterjs/core`, `@natterjs/web` (oder den ganzen Scope `@natterjs`), Option **Bypass two-factor authentication** an, keine IP-Einschränkung (GitHub-Runner wechseln die Adresse), Laufzeit so kurz wie möglich (höchstens 90 Tage).
2. Das Token als Repository-Secret **`NPM_TOKEN`** speichern (Settings → Secrets and variables → Actions; ein altes Secret `NPM_INIT_TOKEN` wird ersatzweise noch gelesen).
3. Neue Version setzen und pushen (siehe oben), dann Actions → Release → „Run workflow“ mit der Version. Der Lauf legt den Tag und das GitHub-Release an (Tags lassen sich aus manchen Umgebungen nicht pushen, der Lauf von Hand braucht das nicht).
4. In `LICENSE` steht der Name des Rechteinhabers (der Release-Lauf bricht ab, solange dort ein Platzhalter steht).
5. Nach dem Release das Token auf npmjs.com löschen oder ablaufen lassen und das Secret entfernen, wenn es nicht für die nächsten Wochen gebraucht wird.

## License

Code: MIT, see [`LICENSE`](LICENSE) (with the notices of the third-party code in `packages/core`). Images and sounds in `packages/assets`: CC0, see [`packages/assets/LICENSE-ASSETS.md`](packages/assets/LICENSE-ASSETS.md).
