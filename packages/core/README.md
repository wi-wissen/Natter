# @natterjs/core

The interpreter core of [Natter](https://natter.wi7.net/), a small Python interpreter written in JavaScript for teaching. It contains a lexer, parser, compiler and a bytecode VM. The VM runs programs in slices with an instruction budget, can suspend on `input()` or other waits and resume later, and has debugger hooks (breakpoints, stepping, variables, call stack). Error messages are friendly, in English and German, in the style of CPython 3.12. Plain ES modules with JSDoc, no dependencies, platform-independent math. Runs in Node (18+) and in the browser.

For a web page with console, turtle, kara, Pygame Zero, forms and plots use [`@natterjs/web`](https://www.npmjs.com/package/@natterjs/web), which builds on this package.

## Install

```bash
npm install @natterjs/core
```

## Usage

```js
import { runToEnd, scriptErrorText, compile, VM } from '@natterjs/core';

// Run a whole program (tests, tools); input() takes the prepared lines
const result = runToEnd('name = input("Name? ")\nprint("Hello", name)', { inputs: ['Ada'] });
console.log(result.output);   // "Name? Hello Ada\n"

// Errors come as data; turn them into a friendly text ('en' or 'de')
const bad = runToEnd('print(x)');
console.log(scriptErrorText(bad.error, { lang: 'en' }));
// { title: 'NameError in line 1', text: '“x” has no value yet.' }

// Step by step: run in slices with an instruction budget
const vm = new VM(compile('total = 0\nfor i in range(10**6):\n    total += i\nprint(total)'), {
  host: { print: (text) => process.stdout.write(text) },
});
const task = vm.start();
let r;
do { r = vm.run(task, 100_000); } while (r.status === 'budget');   // a page gets control back between slices
console.log(r.status);   // "done"
```

`runToEnd(source, { inputs, seed, budget, files, globals })` returns `{ output, errors, plots, error, vm }`. A `sleep()` advances a virtual clock, `plt.show()` collects the SVG in `plots`.

### Two entry points

- `@natterjs/core`: everything, including the standard modules written in Python. Best for Node, tools and tests.
- `@natterjs/core/browser`: a small start without those modules. Call `await loadPyModules(source)` before running a program; it loads only the packs the program imports (one chunk each when bundled).

```js
import { loadPyModules, runToEnd } from '@natterjs/core/browser';

const source = 'import re\nprint(re.findall(r"\\d+", "a1 b22"))';
await loadPyModules(source);
console.log(runToEnd(source).output);   // "['1', '22']\n"
```

## Features

- Python language for teaching: functions, classes, exceptions, generators, comprehensions, `import` of own files and packages in an in-memory project.
- Standard modules such as `math`, `random`, `time`, `datetime`, `re`, `json`, `collections`, `itertools`, `functools`, `statistics`, `string`, `textwrap`, `copy`, `os`, `sys`, files with `open()`, and `requests` (through the host).
- Teaching libraries: `turtle`, `kara`, Pygame Zero, `guizero`, numpy and `matplotlib.pyplot` (SVG). Drawing, sound and windows go through a host bridge; the core never touches the DOM.
- Never freezes: instruction budget per slice, suspend and resume on any wait.
- Debugger hooks: breakpoints per file, step into/over/out, variables and call stack.
- Friendly English and German error messages with hints and tracebacks.
- Reproducible: optional random seed and deterministic, platform-independent math.

The full list of supported commands, with runnable examples, is in the [reference](https://natter.wi7.net/reference/).

## Use from a CDN

The package is plain ES modules, so jsDelivr serves it as it is (always pin a version):

```html
<script type="module">
  import { runToEnd } from 'https://cdn.jsdelivr.net/npm/@natterjs/core@0.1.0/src/index.js';
  console.log(runToEnd('print(6 * 7)').output);
</script>
```

For pages, the prebuilt [`@natterjs/web`](https://www.npmjs.com/package/@natterjs/web) bundle (`dist/natter-web.js`) is smaller and includes the core.

## Links

- Website: <https://natter.wi7.net/>
- Command reference: <https://natter.wi7.net/reference/>
- Sprite gallery (`@natterjs/assets`): <https://natter.wi7.net/sprites/>
- Source and issues: <https://github.com/wi-wissen/Natter>
- [CodeNatter](https://codenatter.de): a browser IDE for learning Python in school, built on Natter.

## License

MIT, see `LICENSE` (it also contains the notices of the third-party code in this package).
