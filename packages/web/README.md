# @natterjs/web

Run Python programs in a web page with [Natter](https://natter.wi7.net/), a small Python interpreter written in JavaScript for teaching. This package is the browser host: a **runner** that executes programs in short time slices (an endless loop never freezes the page), a **console** with `input()` and friendly error messages, and drawing surfaces for **turtle**, **kara**, **Pygame Zero**, **forms** (guizero) and **plots** (matplotlib). It ships as a prebuilt ES module bundle, `dist/natter-web.js`, with the interpreter core ([`@natterjs/core`](https://www.npmjs.com/package/@natterjs/core)) built in; larger module groups (standard modules, numpy, pyplot, guizero, Pygame Zero) are separate chunks that load only when a program imports them.

## Install

```bash
npm install @natterjs/web
npm install @natterjs/assets   # optional: images and sounds for Pygame Zero and kara
```

## Usage

With a bundler (Vite, esbuild, webpack):

```js
import { createRunner, createConsole } from '@natterjs/web';

const runner = createRunner();
createConsole(document.querySelector('#console'), { lang: 'en' }).connect(runner);
await runner.run('name = input("Name? ")\nprint("Hello", name)');   // → 'done' | 'error' | 'stopped'
```

Without a build step, from jsDelivr (always pin a version):

```html
<div id="console"></div>
<div id="stage" style="height: 400px"></div>
<button id="stop">Stop</button>
<script type="module">
  import { createRunner, createConsole, createTurtle, createKara, createPgzero, detectModules, karaGlobals }
    from 'https://cdn.jsdelivr.net/npm/@natterjs/web@0.1.0/dist/natter-web.js';
  import { assetsOption } from 'https://cdn.jsdelivr.net/npm/@natterjs/assets@0.1.0/index.js';

  const source = 'import turtle\nfor i in range(4):\n    turtle.forward(100)\n    turtle.left(90)';
  const stage = document.querySelector('#stage');   // drawing surfaces need a container with a height
  const runner = createRunner();
  createConsole(document.querySelector('#console'), { lang: 'en' }).connect(runner);
  document.querySelector('#stop').onclick = () => runner.stop();

  const mods = detectModules(source);   // e.g. ['turtle'], ['kara'], ['pgzero'], ['forms'], ['plot'] or []
  if (mods.includes('turtle')) runner.use(createTurtle(stage));
  if (mods.includes('kara')) runner.use(createKara(stage, { assets: assetsOption() }));
  if (mods.includes('pgzero')) {
    const pgz = createPgzero(stage, { assets: assetsOption(), controls: 'auto', lang: 'en' });
    runner.use(pgz);
    await pgz.run(runner, source);   // loads the images and sounds the program names, then runs it
  } else {
    await runner.run(source, { globals: mods.includes('kara') ? karaGlobals() : {} });
  }
</script>
```

`natter-web.js` loads its chunks (`stdlib-….js`, `numpy-….js` …) from its own location. To host it yourself, copy the whole `dist/` folder (from `node_modules/@natterjs/web/dist/` or from `natter-web-<version>.zip` on the [GitHub releases](https://github.com/wi-wissen/Natter/releases)).

## API overview

| Export | Purpose |
|---|---|
| `createRunner(options)` | Runs programs: `run(source, { file, files, seed, globals, inputs, breakpoints })`, `stop()`, `sendInput(text)`; events `output`, `error`, `state`, `input`, `file`; debugger `pause()`, `continue()`, `step('over'|'into'|'out')`, `setBreakpoints(…)`, `inspect()` |
| `createConsole(el, { lang, onLineClick })` | Output, input line for `input()`, error box with line, message and traceback; `.connect(runner)` |
| `createTurtle(el)` | Python `turtle`: pens, fills, text, stamps, several turtles, key/click events, `textinput` |
| `createKara(el, { assets })` | Kara the ladybug: world with trees, berries and mushrooms, animated moves |
| `createPgzero(el, { assets, controls })` | Pygame Zero: `draw`/`update`, `Actor`, `screen`, keyboard, mouse, touch, sounds, music, on-screen buttons on touch screens |
| `createForms(el)` | guizero windows with real HTML elements, layouts, events, timers, dialogs |
| `createPlot(el)` | `plt.show()` as inline SVG, download as SVG or PNG |
| `detectModules(source)` | Which of the hosts above a program needs |
| `describeError(error, { lang })` | Title, text, line and traceback of an error |

Texts and error messages come in English and German: pass `lang: 'en'` to the console, turtle, Pygame Zero, forms and plots (the default is `'de'`, German). Colours follow CSS variables (`--nw-bg`, `--nw-text`, `--nw-accent` …) and a dark mode. Projects with several files: pass `files` (path → text); `import` finds own modules and packages like Python.

## Features

- Never freezes: programs run in slices of about 10 ms with an instruction budget, the page stays responsive, Stop always works.
- Debugger: breakpoints per file, stepping, variables and call stack.
- Friendly English and German errors with clickable line numbers.
- Turtle, kara, Pygame Zero, guizero forms and matplotlib plots in the page; touch and mobile friendly.
- Small start file; module groups load on demand.
- Pygame Zero and kara use the images and sounds of [`@natterjs/assets`](https://www.npmjs.com/package/@natterjs/assets), loading only what a program names.

## Links

- Website: <https://natter.wi7.net/>
- Command reference: <https://natter.wi7.net/reference/>
- Sprite gallery: <https://natter.wi7.net/sprites/>
- Source and issues: <https://github.com/wi-wissen/Natter>
- [CodeNatter](https://codenatter.de): a browser IDE for learning Python in school, built on this package.

## License

MIT, see `LICENSE`.
