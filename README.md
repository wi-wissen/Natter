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

A static overview page lives in [`docs/`](docs/). To publish it with GitHub Pages, set the source to the `main` branch and the `/docs` folder.

The **command reference** ([`docs/reference/index.html`](docs/reference/index.html)) lists the language, the builtins, every standard module, `turtle`, `kara` (commands and world format), Pygame Zero (hooks, `screen`, `Actor`, `keyboard`, sounds, music, `clock`, images from the asset library), `guizero`, numpy, pyplot, `requests` with CORS, files and the asset library, each with a runnable example. It is generated from the interpreter: `scripts/build-reference.mjs` reads the module registries, builtins, stdlib, messages and `packages/assets` and adds the English text from `scripts/reference/content.mjs`. Every example and every language snippet runs while building. After changing a module, run

```bash
npm run reference   # rewrite docs/reference/index.html
```

`packages/core/test/reference.test.js` fails when the page is stale, when a described name no longer exists or when an example stops working.

## License

Not decided yet.
