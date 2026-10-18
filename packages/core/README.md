# @natterjs/core

The interpreter core of [Natter](https://natter.wi7.net/), a small Python interpreter written in JavaScript for teaching: lexer, parser, compiler and a bytecode VM with an instruction budget, suspend/resume and debugger hooks. Plain ES modules with JSDoc, no dependencies, deterministic math. Runs in Node (18+) and in the browser.

```bash
npm install @natterjs/core
```

```js
import { runToEnd } from '@natterjs/core';

console.log(runToEnd('print(1 + 1)').output);   // "2\n"
```

- `@natterjs/core`: everything, including the standard modules written in Python (Node, tools, tests).
- `@natterjs/core/browser`: a small start without those modules; call `await loadPyModules(source)` before running a program, it loads only the packs the program imports (one chunk each when bundled).

For a web page with console, turtle, kara, Pygame Zero, forms and plots use [`@natterjs/web`](https://www.npmjs.com/package/@natterjs/web). Documentation and command reference: <https://natter.wi7.net/>, source: <https://github.com/wi-wissen/Natter>. License: MIT.
