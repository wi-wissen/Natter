# Natter

A Python interpreter in JavaScript for teaching in the browser. Overview, layout and commands: `README.md`.

## CPython is the reference

Natter behaves like **CPython 3.13** (the version CI compares with). Whatever a program prints, returns or raises
in CPython, it prints, returns or raises in Natter: values, `repr()`, ordering, `str(e)` of exceptions, exception
types. A difference is a bug, unless it is one of these:

- **Left out on purpose** and listed in the command reference (`scripts/reference/content.mjs`: `not`, `notes`,
  the "Not available" row), e.g. `eval`, threads, subclasses of built-in types.
- **Deliberate limits** of the sandbox (instruction budget, `MAX_ITEMS`/`MAX_STR` in `values.js`, recursion depth).
- **The friendly messages** in `messages.js` (German and English for learners). The CPython wording of the same
  error lives in `pymessages.js` and is what `str(e)` returns; it must match CPython exactly.

When you add or change behaviour:

1. Find out what CPython 3.13 does by running it (`python3 -I -W ignore x.py`), not from memory or documentation.
2. Add a case to `packages/core/test/cases/`: `x.py` plus `x.out` written by CPython (`python3 -I -W ignore x.py > x.out`).
   Cover edge cases and error messages, not only the happy path. For parsers and formatters, generate many inputs
   with CPython and keep them as data in the `.py` file (see `csv_cases.py`): Natter's `random` does not give the
   same numbers as CPython's.
3. Run `npm test` with `python3` on the PATH, so the `.out` files are checked against CPython, too.
4. If something cannot match (a missing module such as `collections.abc`, `...` being `None`), say so in the module's
   `notes` in `scripts/reference/content.mjs` and run `npm run reference`. Do not leave silent differences.

Natter has no metaclasses and no subclasses of built-in types. Where CPython needs them, two class attributes
stand in, so the behaviour still matches: `__natter_instancecheck__` (a class method `isinstance()`/`issubclass()`
call, like a metaclass's `__instancecheck__`; used by `TypedDict`) and `__natter_tuple__ = True` (instances count as
tuples for `isinstance(x, tuple)`; used by `namedtuple`). Prefer these over new special cases in the core.

Modules written in Python (`packages/core/src/stdlib/py/*.js`) should follow CPython's own source where that is
written in Python too (for example `csv.DictReader` is CPython's `csv.py`), and its C code where it is not
(the `csv` reader follows the state machine in `_csv.c`).

## Rules of the code base

- Plain JavaScript with JSDoc, no TypeScript, no runtime dependencies.
- The core stays deterministic: no `Math.sin`, `Math.pow`, `Date` and the like in `packages/core/src` (a test checks it).
- The core does not touch the DOM; hosts reach it through the host bridge.
- New learner messages need a German and an English text in `messages.js`.
- After changing a module, run `npm run reference` (the reference test fails when the page is stale).
- `npm run size` shows the bundle sizes; the browser start (`packages/core/src/browser.js`) should stay small, so
  new modules go into a pack (`packages/core/src/stdlib/packs.js`) that loads on `import`.
