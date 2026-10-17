# Natter

A small Python interpreter written in JavaScript, made for teaching in the browser.

- **Small:** the core is about 80 KB gzipped (270 KB minified) with the standard library, including error messages in two languages.
- **Never freezes:** programs run in slices with an instruction budget, so an endless loop stops instead of blocking the page.
- **Debugger built in:** breakpoints, step into/over/out, variables and call stack.
- **Friendly errors:** English and German messages with hints, in the style of CPython 3.12.
- **Reproducible:** optional random seed and platform-independent math.

> **Status: early development.** The language core (classes, exceptions, sets, generators, `with`, `input()`) and a good part of the standard library are done and compared with CPython in the tests. Turtle, kara, projects with files, Pygame Zero, forms and plots are still to come; see the roadmap.

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
4. Projects with several files, `import`, assets. **Core done:** `open()`, `os`, `os.path` and `import` of own files on an in-memory project (`vm.fs`); storing it in a folder, ZIP or browser is the host's job. Assets: see `packages/assets`.
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

## License

Not decided yet.
