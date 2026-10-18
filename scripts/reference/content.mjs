// Curated text of the command reference: intros, examples, notes and short descriptions (English).
// Names, parameters, members, constants and lists come from the interpreter (scripts/build-reference.mjs); every
// name described here must exist there, every example must run, every `ok` snippet must run and every `no` snippet
// must fail – otherwise the build (and its test) reports a problem. Text: plain text, `code` in backticks, [links](url).

export const PAGE = {
  description: 'Command reference of Natter: language, builtins, standard modules, turtle, Kara, Pygame Zero, guizero, numpy, matplotlib, requests and files – generated from the source.',
  intro: [
    'Everything a program can use in Natter: the language, the built-in functions, the standard modules, turtle, Kara, Pygame Zero, forms with guizero, numpy, plots, requests and files. Each module comes with a short example that runs as shown.',
    'Natter aims to be plain Python: what is listed here behaves as in CPython 3.12 (and as the real libraries). Where it differs or something is missing, it says so. Press `/` to search.',
  ],
};

const G_BASE = 'Basics';
const G_STD = 'Standard modules';
const G_DRAW = 'Drawing and games';
const G_DATA = 'Forms, data, network';

const CPYTHON_BUILTINS = ['abs', 'aiter', 'all', 'anext', 'any', 'ascii', 'bin', 'bool', 'breakpoint', 'bytearray', 'bytes', 'callable', 'chr',
  'classmethod', 'compile', 'complex', 'delattr', 'dict', 'dir', 'divmod', 'enumerate', 'eval', 'exec', 'filter', 'float', 'format', 'frozenset',
  'getattr', 'globals', 'hasattr', 'hash', 'help', 'hex', 'id', 'input', 'int', 'isinstance', 'issubclass', 'iter', 'len', 'list', 'locals', 'map',
  'max', 'memoryview', 'min', 'next', 'object', 'oct', 'open', 'ord', 'pow', 'print', 'property', 'range', 'repr', 'reversed', 'round', 'set',
  'setattr', 'slice', 'sorted', 'staticmethod', 'str', 'sum', 'super', 'tuple', 'type', 'vars', 'zip', '__import__'];

export const SECTIONS = [
  // ------------------------------------------------------------------ language
  {
    id: 'language', title: 'The language', group: G_BASE, source: 'language',
    intro: ['Natter compiles Python 3 to bytecode and runs it in time slices. The table shows what works, with an example, and what does not, with the message Natter then shows. Every row ran while this page was built.'],
    rows: [
      { area: 'Basics', text: 'Integers of any size, floats, strings, `True`/`False`, `None`; `if`/`elif`/`else`, `while`, `for` (also with `else`), `break`, `continue`, `pass`, multiple assignment `a, b = b, a`, chained comparisons `1 < x < 5`, `x if c else y`.',
        ok: 'for i in range(3):\n    if i == 1:\n        continue\n    print(i, 2 ** 70)',
        not: '`match`/`case` and the walrus operator `:=` are missing.', no: ['x = 3\nmatch x:\n    case 3:\n        print("drei")', 'if (n := 5) > 3:\n    print(n)'] },
      { area: 'Numbers', text: 'Arithmetic as in CPython: `//` and `%` with Python\'s signs, `round()` rounds halves to even, integers become big integers above 2^53, floats print the same digits as CPython.',
        ok: 'print(round(2.5), -7 // 2, -7 % 3, 2 ** 100, 0.1 + 0.2)',
        not: 'Complex numbers are missing.', no: ['print(1 + 2j)'] },
      { area: 'Strings', text: 'f-strings with format specs, `%` formatting, `str.format`, slices, `in`, all the usual string methods (see [methods](#methods)).',
        ok: 'n = "Ada"\nprint(f"{n:>5}|{3.14159:.2f}|{1234567:,}", "%d%%" % 5, "{} {}".format(1, 2))',
        not: 'No bytes: `b"…"`, `str.encode()` and binary files are missing; the function `format()` is missing (the method `str.format` and f-strings work).', no: ['print(b"abc")', 'print(format(255, "x"))'] },
      { area: 'Lists, tuples, dicts, sets', text: 'Indexing and slicing (also negative and with a step), list, dict and set comprehensions, unpacking with `*rest`, `set`/`frozenset` with all set operations, `del`.',
        ok: 'a, *rest = [3, 1, 2]\nprint(a, rest, [x * x for x in rest], {x % 2 for x in rest}, {k: len(k) for k in ["ab", "c"]})',
        not: '`dict | dict` is missing (use `update`).', no: ['print({"a": 1} | {"b": 2})'] },
      { area: 'Functions', text: '`def` with defaults, `*args`, `**kwargs`, keyword-only parameters after `*`, `lambda`, closures, `global`, `nonlocal`, decorators, recursion up to depth 1000 like CPython.',
        ok: 'def gruss(name, *, laut=False, **extra):\n    t = "Hallo " + name\n    return t.upper() if laut else t\nprint(gruss("Ada", laut=True), (lambda x: x * 2)(21))',
        not: 'Positional-only parameters (`/`) are missing.', no: ['def f(a, /, b):\n    return a + b'] },
      { area: 'Classes', text: '`class` with inheritance (also multiple, MRO as in CPython), `super()`, `@property` with setter, `@classmethod`, `@staticmethod`, operators via `__add__`, `__eq__`, `__lt__`, `__getitem__`, `__len__`, `__iter__`, `__call__`, `__getattr__` …',
        ok: 'class Tier:\n    def __init__(self, name):\n        self.name = name\n    def __str__(self):\n        return "Tier " + self.name\nclass Hund(Tier):\n    def __init__(self, name):\n        super().__init__(name)\nprint(Hund("Bello"))',
        not: 'No subclasses of built-in types (`class L(list)`), no metaclasses; `__setattr__` and `__slots__` have no effect.',
        no: ['class L(list):\n    pass', 'class M(type):\n    pass\nclass A(metaclass=M):\n    pass'],
        same: [{ code: 'class A:\n    def __setattr__(self, k, v):\n        print("gerufen")\nA().x = 1\nprint("fertig")', output: 'fertig\n' }] },
      { area: 'Exceptions', text: '`try`/`except`/`else`/`finally`, `raise`, `raise … from …`, custom exception classes, all common built-in exceptions. Errors come with the line, the call stack and a hint in English or German.',
        ok: 'class ZuKlein(Exception):\n    pass\ntry:\n    raise ZuKlein("unter 0")\nexcept ZuKlein as e:\n    print("Fehler:", e)\nfinally:\n    print("fertig")',
        not: 'Exception groups (`except*`) are missing.', no: ['try:\n    pass\nexcept* ValueError:\n    pass'] },
      { area: 'Generators, with', text: '`yield`, `yield from`, generator expressions (lazy), `with` with your own context managers (`__enter__`/`__exit__`).',
        ok: 'def zaehle(n):\n    yield from range(n)\nprint(sum(x * x for x in zaehle(4)))',
        not: '`async`/`await` and threads are missing.', no: ['async def f():\n    pass'] },
      { area: 'Input and output', text: '`input()` pauses the program until the answer arrives; `print` with `sep`, `end`, `file=sys.stderr`.',
        ok: 'name = input("Wie heißt du? ")\nprint("Hallo", name, sep=", ", end="!\\n")' },
      { area: 'Modules', text: '`import` of standard modules and of the project\'s own files (`helpers.py`, packages with `__init__.py`, `from . import x`), `import a.b`, `import x as y`, `from x import *`.',
        ok: 'import math as m\nfrom os import path\nprint(m.floor(2.7), path.join("a", "b"))',
        not: 'Modules that do not exist (see the list on the left) raise `ModuleNotFoundError`.', no: ['import tkinter'] },
      { area: 'Type hints', text: 'Parsed and ignored, so programs from books run.',
        ok: 'def doppelt(x: int) -> int:\n    return 2 * x\nzahlen: list = [1, 2]\nprint(doppelt(4), zahlen)',
        not: 'The module `typing` is missing (hints like `List[int]` do not need it if you write `list`).', no: ['from typing import List'] },
      { area: 'Not available', text: 'Left out on purpose: rarely needed in class, or it would make the page unsafe.',
        not: '`eval`, `exec`, `dir`, `globals`; `...` equals `None`.', no: ['print(eval("1 + 2"))', 'print(dir())'],
        same: [{ code: 'print(...)', output: 'None\n' }] },
    ],
  },

  // ------------------------------------------------------------------ builtins
  {
    id: 'builtins', title: 'Built-in functions', group: G_BASE, source: 'builtins', cpythonBuiltins: CPYTHON_BUILTINS,
    intro: ['Every program knows these names without an `import`. Parameters are shown as Natter checks them; `x=…` means it may be left out.'],
    example: {
      code: 'zahlen = [5, 3, 8, 1]\nprint(len(zahlen), sum(zahlen), min(zahlen), max(zahlen))\nprint(sorted(zahlen, reverse=True))\nfor i, z in enumerate(zahlen, start=1):\n    print(i, z, end="; ")\nprint()\nprint(list(zip("abc", range(3))), round(3.14159, 2), abs(-4), divmod(17, 5))',
    },
    notes: [
      '`print(..., file=sys.stderr)` writes to the error output (the console shows it in red).',
      '`hash()` and `id()` return fixed numbers that differ from CPython; `pow` has no third (modulo) parameter.',
      '`type()` with three arguments (creating classes) and `zip(strict=True)` are missing.',
    ],
    desc: {
      print: { sig: 'print(*objects, sep=" ", end="\\n", file=None, flush=False)', text: 'Prints values, separated by `sep`, followed by `end`.' },
      input: 'Asks for a line. The program waits until the answer is entered; the result is always a string.',
      len: 'Number of items of a string, list, dict …',
      range: { sig: 'range(stop) / range(start, stop, step=1)', text: 'Sequence of numbers for `for` loops, excluding `stop`.' },
      int: 'Integer from a string or float (truncates); with `base` from a string in that base.',
      float: 'Float from a string or number (also `"inf"`, `"nan"`).',
      str: 'String of a value (as `print` shows it).',
      bool: 'Truth value: `0`, `""`, empty collections and `None` are `False`.',
      list: 'New list, e.g. from a string, `range` or generator.',
      tuple: 'New tuple.',
      dict: { sig: 'dict(**kwargs) / dict(iterable)', text: 'New dictionary.' },
      set: 'New set (duplicates disappear).',
      abs: 'Absolute value.',
      round: 'Rounds to `ndigits` places; exact halves go to the even number (`round(2.5) == 2`) as in CPython.',
      min: { sig: 'min(iterable, key=None, default=…) / min(a, b, …)', text: 'Smallest value.' },
      max: { sig: 'max(iterable, key=None, default=…) / max(a, b, …)', text: 'Largest value.' },
      sum: 'Sum; floats exactly as in CPython (`sum([0.1] * 10) == 1.0`).',
      sorted: 'New sorted list (stable), optionally with `key` and `reverse`.',
      reversed: 'Iterator going backwards.',
      enumerate: 'Pairs `(number, item)`.',
      zip: { sig: 'zip(*iterables)', text: 'Combines several sequences pairwise (stops at the shortest).' },
      map: { sig: 'map(function, *iterables)', text: 'Applies a function to every item.' },
      filter: 'Keeps the items for which the function is true (`None`: the true items).',
      type: 'Type of a value, e.g. `<class \'int\'>`.',
      isinstance: 'Is the value of the type (or one of the types in the tuple)?',
      open: 'Opens a text file of the project, see [files](#files).',
      chr: 'Character for a Unicode number.',
      ord: 'Unicode number of a character.',
      divmod: 'Integer quotient and remainder as a tuple.',
      pow: 'Power `base ** exp`.',
      hex: 'Hexadecimal string, e.g. `0xff`.',
      bin: 'Binary string, e.g. `0b101`.',
      any: 'Is at least one item true?',
      all: 'Are all items true?',
      slice: { sig: 'slice(stop) / slice(start, stop, step=None)', text: 'Slice object for `a[s]`.' },
      next: 'Next item of an iterator (or `default`).',
      iter: 'Iterator over a collection.',
      getattr: 'Reads an attribute by its name (with `default` if it is missing).',
      hasattr: 'Does the attribute exist?',
      setattr: 'Sets an attribute by its name.',
      vars: 'Attributes of an object as a dict.',
      super: 'Access to the methods of the base class (usually without arguments: `super().__init__()`).',
    },
  },

  // ------------------------------------------------------------------ methods
  {
    id: 'methods', title: 'Methods of the built-in types', nav: 'Methods (str, list …)', group: G_BASE, source: 'methods',
    types: ['str', 'list', 'tuple', 'dict', 'set', 'frozenset'],
    intro: ['Methods of strings, lists, tuples, dicts and sets. They all behave as in CPython. `int` and `float` have no methods (e.g. `bit_length` and `is_integer` are missing).'],
    example: {
      code: 'satz = "  Natter ist eine kleine Schlange  "\nwoerter = satz.strip().split()\nprint(woerter, "-".join(woerter).upper())\nprint(satz.count("e"), satz.find("klein"), satz.replace("klein", "groß").strip())\nzahlen = [3, 1, 2]\nzahlen.append(5)\nzahlen.sort()\nprint(zahlen, zahlen.index(5), zahlen.pop())\nalter = {"Ada": 36}\nalter.setdefault("Linus", 21)\nfor name, jahre in alter.items():\n    print(name, alter.get(name), jahre)',
    },
    notes: ['Methods not listed below are missing, e.g. `str.encode`, `str.partition`, `str.maketrans`/`translate`, `str.removeprefix`/`removesuffix`, `dict.fromkeys`, `dict.popitem`; `list.sort` takes only `key` and `reverse`.'],
    members: {
      str: {
        split: 'Splits at `sep` (without: at whitespace).', join: 'Joins the strings of a list with this string in between.',
        strip: 'Removes whitespace (or `chars`) at both ends.', replace: 'Replaces `old` with `new`.',
        find: 'Position of `sub` or `-1`.', format: 'Fills values into `{}`.', upper: 'Upper case.', lower: 'Lower case.',
        startswith: 'Does the string start with `prefix` (also a tuple)?', isdigit: 'Only digits?', count: 'How often does `sub` occur?',
      },
      list: {
        append: 'Adds an item at the end.', insert: 'Inserts at position `index`.', pop: 'Removes the last item (or the one at `index`) and returns it.',
        remove: 'Removes the first item with this value.', sort: 'Sorts the list in place (stable), `key=`, `reverse=`.', index: 'Position of the first occurrence.',
      },
      dict: { get: 'Value for `key` or `default`.', items: 'Pairs `(key, value)`.', keys: 'The keys.', values: 'The values.', setdefault: 'Value for `key`; if it is missing, `default` is stored.', pop: 'Removes `key` and returns its value.', update: 'Takes over the entries of another dict.' },
      set: { add: 'Adds an item.', discard: 'Removes an item if present.', union: 'Union (also `a | b`).', intersection: 'Intersection (also `a & b`).', difference: 'Difference (also `a - b`).' },
    },
  },

  // ------------------------------------------------------------------ files
  {
    id: 'files', title: 'Files, os and os.path', nav: 'Files (open, os)', group: G_BASE, source: 'module', module: ['_fileio', 'os', 'os.path'],
    labels: { _fileio: 'open() and file objects' }, showMembers: ['TextFile'], hide: ['UnsupportedOperation'],
    intro: [
      'A program sees the files of its project as a folder. `open()` reads and writes text files; `os` and `os.path` list, check, rename and delete. Paths are relative to the project folder (`/` is the project folder).',
      'The files live in memory. Where they are kept permanently (folder, ZIP, browser storage) is up to the page that embeds Natter: it is told about every change (`onFileChange`).',
    ],
    example: {
      code: 'with open("noten.txt", "w") as f:\n    f.write("Ada,1\\nLinus,2\\n")\n\nwith open("noten.txt") as f:\n    for zeile in f:\n        name, note = zeile.strip().split(",")\n        print(name, "hat eine", note)\n\nimport os\nprint(os.listdir("."), os.path.getsize("noten.txt"))',
      showFiles: true,
    },
    notes: [
      'Text files only (modes `r`, `w`, `a`, `x`, with `+`); `"rb"`/`"wb"` raise `ValueError`. The encoding is always UTF-8, line endings become `\\n`.',
      '`os.environ` is empty, `os.getcwd()` is `"/"`; `os.walk` works, `os.path.getsize` counts characters.',
      '`pathlib`, `shutil`, `csv` and `sqlite3` are missing (read CSV with `split(",")`).',
    ],
    desc: {
      open: 'Opens a text file. `mode`: `"r"` read, `"w"` write anew, `"a"` append, `"x"` create only, with `+` both.',
      listdir: 'Names in a folder (sorted).', exists: 'Does the file or folder exist?', join: 'Joins path parts with `/`.',
      remove: 'Deletes a file.', mkdir: 'Creates a folder.', makedirs: 'Creates folders including the ones in between.', rename: 'Renames or moves.',
      isfile: 'Is it a file?', isdir: 'Is it a folder?', splitext: 'Splits into name and extension.', basename: 'Last part of the path.',
    },
    members: { TextFile: { read: 'Reads the rest (or `size` characters).', readline: 'Reads one line including `\\n`.', readlines: 'All lines as a list.', write: 'Writes a string, returns the number of characters.', close: 'Closes the file (`with` does it for you).' } },
  },

  // ------------------------------------------------------------------ stdlib
  {
    id: 'math', title: 'math', group: G_STD, source: 'module', module: 'math', imports: 'import math',
    intro: ['All functions of `math` used in school. They compute the same on every device: `sin`, `exp`, `log` … are implemented in Natter itself (after fdlibm, `hypot` and `dist` correctly rounded) instead of using the browser\'s functions, which differ in the last digit from device to device.'],
    example: { code: 'import math\nprint(math.sqrt(2), math.pi)\nprint(math.sin(math.radians(30)), math.floor(-2.5), math.ceil(2.1))\nprint(math.gcd(12, 18), math.factorial(10), math.comb(49, 6))\nprint(math.hypot(3, 4), math.log(8, 2), math.isclose(0.1 + 0.2, 0.3))' },
    notes: ['Results match CPython (apart from rare differences in the last digit for functions that CPython takes from the C library).'],
    desc: {
      sqrt: { sig: 'sqrt(x)', text: 'Square root.' }, sin: { sig: 'sin(x)', text: 'Sine (radians).' }, cos: { sig: 'cos(x)', text: 'Cosine (radians).' }, tan: { sig: 'tan(x)', text: 'Tangent (radians).' },
      asin: { sig: 'asin(x)', text: 'Arc sine.' }, acos: { sig: 'acos(x)', text: 'Arc cosine.' }, atan: { sig: 'atan(x)', text: 'Arc tangent.' }, atan2: 'Angle of the point (x, y), respecting the quadrant.',
      exp: { sig: 'exp(x)', text: 'e to the power of x.' }, log: 'Natural logarithm, or to base `base`.', log10: { sig: 'log10(x)', text: 'Base-10 logarithm.' }, log2: { sig: 'log2(x)', text: 'Base-2 logarithm.' },
      pow: 'Power as a float.', floor: { sig: 'floor(x)', text: 'Round down to an integer.' }, ceil: { sig: 'ceil(x)', text: 'Round up to an integer.' }, trunc: { sig: 'trunc(x)', text: 'Cut off the decimals.' },
      degrees: { sig: 'degrees(x)', text: 'Radians to degrees.' }, radians: { sig: 'radians(x)', text: 'Degrees to radians.' }, hypot: { sig: 'hypot(*coordinates)', text: 'Length of the vector (Pythagoras), correctly rounded.' },
      dist: 'Distance between two points.', gcd: { sig: 'gcd(*integers)', text: 'Greatest common divisor.' }, lcm: { sig: 'lcm(*integers)', text: 'Least common multiple.' }, factorial: 'Factorial n!.',
      comb: 'Number of ways to choose k from n.', isqrt: 'Integer square root.', isclose: 'Are two floats almost equal?', fabs: { sig: 'fabs(x)', text: 'Absolute value as a float.' },
      pi: 'The number π.', e: 'Euler\'s number.', inf: 'Infinity.',
    },
  },
  {
    id: 'random', title: 'random', group: G_STD, source: 'module', module: 'random', imports: 'import random',
    intro: ['Random numbers from the VM\'s own generator. Without a seed it starts from the browser\'s secure randomness, so every run differs; with `random.seed(…)` or a fixed seed from the page, every run is the same.'],
    example: { code: 'import random\nrandom.seed(7)\nprint(random.randint(1, 6), random.choice(["Stein", "Schere", "Papier"]))\nkarten = list(range(1, 11))\nrandom.shuffle(karten)\nprint(karten, random.sample(karten, 3))\nprint(round(random.random(), 3), round(random.uniform(1, 2), 3))' },
    notes: ['The generator differs from CPython\'s (sfc32 instead of the Mersenne Twister): the same seed always gives the same numbers in Natter, but not the same as in CPython. (`numpy.random`, on the other hand, gives exactly numpy\'s numbers.)'],
    desc: {
      random: 'Float 0 ≤ x < 1.', randint: 'Integer from `a` to `b` inclusive.', randrange: 'Random item of `range(start, stop, step)`.',
      choice: 'One random item.', choices: '`k` items with replacement, optionally weighted.', sample: '`k` different items without replacement.',
      shuffle: 'Shuffles a list in place.', uniform: 'Float between `a` and `b`.', gauss: 'Normally distributed with mean `mu` and deviation `sigma`.', seed: 'Sets the seed (number or string; `None`: random).',
    },
  },
  {
    id: 'time', title: 'time', group: G_STD, source: 'module', module: 'time', imports: 'import time',
    intro: ['Clock and waiting. `time.sleep()` only pauses the program, never the page. In the page the clock is real; in test runs without a page a virtual clock runs and `sleep` takes no time.'],
    example: { code: 'import time\nstart = time.perf_counter()\nfor i in range(3, 0, -1):\n    print(i)\n    time.sleep(0.5)\nprint("Los!", round(time.perf_counter() - start, 1), "Sekunden")' },
    notes: ['Time zone: `localtime` uses the browser\'s offset, `timezone`/`tzname` are fixed to `0`/`"UTC"`. `strftime` knows only English names (`%A` → `Friday`).'],
    desc: {
      time: { sig: 'time()', text: 'Seconds since 1970 as a float.' }, sleep: 'Waits `secs` seconds (the program, not the page).', perf_counter: { sig: 'perf_counter()', text: 'Precise clock for measuring time.' },
      localtime: 'Date and time as a tuple.', strftime: 'Time as a string, e.g. `"%H:%M"`.',
    },
  },
  {
    id: 'datetime', title: 'datetime', group: G_STD, source: 'module', module: 'datetime', imports: 'import datetime', showMembers: ['date', 'datetime', 'timedelta', 'time'],
    intro: ['Dates, times, time spans and fixed time zones, computed in the Gregorian calendar like CPython.'],
    example: { code: 'from datetime import date, datetime, timedelta\nferien = date(2025, 7, 24)\nheute = date(2025, 6, 2)\nprint((ferien - heute).days, "Tage bis zu den Ferien")\nprint(ferien.strftime("%d.%m.%Y"), ferien.weekday(), ferien + timedelta(weeks=6))\nprint(datetime(2025, 6, 2, 8, 15).isoformat())' },
    notes: ['`datetime.now()` uses the page\'s clock (in test runs the virtual clock: 1 January 2000). Month and day names in `strftime` are English only, there is no time zone database (`zoneinfo` is missing), only `timezone(timedelta(…))`.'],
    desc: { date: 'A date (year, month, day).', datetime: 'Date with time.', timedelta: 'Time span; date ± time span gives a date.', time: 'Time of day without a date.', timezone: 'Fixed time zone with an offset.' },
  },
  {
    id: 'json', title: 'json', group: G_STD, source: 'module', module: 'json', imports: 'import json',
    intro: ['Reading and writing JSON, formatted exactly like CPython (`indent`, `sort_keys`, `ensure_ascii`, `separators`).'],
    example: { code: 'import json\ndaten = {"name": "Ada", "noten": [1, 2.5], "aktiv": True, "lehrer": None}\ntext = json.dumps(daten, indent=2, ensure_ascii=False)\nprint(text)\nprint(json.loads(text)["noten"][1])' },
    desc: { dumps: 'Python value → JSON string.', loads: 'JSON string → Python value.', dump: 'Writes to an open file.', load: 'Reads from an open file.' },
  },
  {
    id: 'statistics', title: 'statistics', group: G_STD, source: 'module', module: 'statistics', imports: 'import statistics',
    intro: ['Mean, median, mode, variance and standard deviation.'],
    example: { code: 'import statistics as st\nnoten = [2, 3, 1, 2, 4, 2]\nprint(st.mean(noten), st.median(noten), st.mode(noten))\nprint(round(st.stdev(noten), 3), st.multimode([1, 1, 2, 2]))' },
    notes: ['Computes with floats; there is no `Fraction`/`Decimal`. `quantiles`, `correlation` and `linear_regression` are missing (see numpy).'],
    desc: { mean: 'Arithmetic mean.', median: 'Median (middle of the sorted values).', mode: 'Most common value.', stdev: 'Sample standard deviation.', pstdev: 'Population standard deviation.', variance: 'Sample variance.' },
  },
  {
    id: 'collections', title: 'collections', group: G_STD, source: 'module', module: 'collections', imports: 'import collections', showMembers: true, inherited: false,
    intro: ['`Counter`, `defaultdict`, `deque`, `OrderedDict` and `namedtuple`.'],
    example: { code: 'from collections import Counter, defaultdict, deque, namedtuple\nprint(Counter("abrakadabra").most_common(2))\ngruppen = defaultdict(list)\nfor w in ["Apfel", "Birne", "Ananas"]:\n    gruppen[w[0]].append(w)\nprint(dict(gruppen))\nschlange = deque([1, 2, 3], maxlen=3)\nschlange.append(4)\nprint(schlange)\nPunkt = namedtuple("Punkt", "x y")\nprint(Punkt(2, 3).x)' },
    notes: ['The classes are written in Python and are not subclasses of `dict`: `isinstance(Counter(), dict)` is `False`. `ChainMap` and `UserDict` are missing.'],
    desc: { Counter: 'Counts items.', defaultdict: 'Dict that creates missing keys with `default_factory()`.', deque: 'Queue with fast appends and pops at both ends.', OrderedDict: 'Dict that can change its order.', namedtuple: 'Tuple class with named fields.' },
  },
  {
    id: 'itertools', title: 'itertools', group: G_STD, source: 'module', module: 'itertools', imports: 'import itertools',
    intro: ['Building blocks for loops: combinatorics, endless sequences, grouping.'],
    example: { code: 'import itertools\nprint(list(itertools.permutations("abc", 2)))\nprint(list(itertools.combinations(range(4), 2)))\nfor k, g in itertools.groupby("aaabbc"):\n    print(k, len(list(g)), end=" ")\nprint()\nprint(list(itertools.islice(itertools.count(10, 5), 4)))' },
    desc: { permutations: 'All orderings.', combinations: 'All selections without order.', product: 'Cartesian product.', groupby: 'Groups of equal neighbours.', count: 'Counts forever.', cycle: 'Repeats forever.', islice: 'Slice of an iterator.', accumulate: 'Running sums (or another function).', chain: 'Sequences one after another.' },
  },
  {
    id: 'functools', title: 'functools', group: G_STD, source: 'module', module: 'functools', imports: 'import functools',
    intro: ['`reduce`, `partial`, `lru_cache`/`cache`, `wraps`, `cmp_to_key`, `total_ordering`.'],
    example: { code: 'from functools import lru_cache, reduce, partial\n\n@lru_cache\ndef fib(n):\n    return n if n < 2 else fib(n - 1) + fib(n - 2)\n\nprint(fib(90))\nprint(reduce(lambda a, b: a * b, range(1, 6)))\nzweier = partial(int, base=2)\nprint(zweier("1011"))' },
    desc: { reduce: 'Combines a sequence into one value with a function.', lru_cache: 'Remembers the results of a function (decorator).', cache: 'Like `lru_cache` without a limit.', partial: 'Function with some arguments already fixed.' },
  },
  {
    id: 'string', title: 'string', group: G_STD, source: 'module', module: 'string', imports: 'import string',
    intro: ['Character classes as strings, and `capwords`.'],
    example: { code: 'import string\nprint(string.ascii_uppercase)\nprint(string.capwords("hallo schöne welt"))\nprint(sum(1 for c in "Python 3.12!" if c in string.digits))' },
    notes: ['`Template` and `Formatter` are missing.'],
  },
  {
    id: 'copy', title: 'copy', group: G_STD, source: 'module', module: 'copy', imports: 'import copy',
    intro: ['Shallow and deep copies of lists, dicts, sets and your own objects (respects `__copy__`/`__deepcopy__`).'],
    example: { code: 'import copy\nfeld = [[0, 0], [0, 0]]\nflach = copy.copy(feld)\ntief = copy.deepcopy(feld)\nfeld[0][0] = 9\nprint(flach[0][0], tief[0][0])' },
    desc: { copy: 'Shallow copy: the items themselves are shared.', deepcopy: 'Deep copy: all items are copied too.' },
  },
  {
    id: 'sys', title: 'sys', group: G_STD, source: 'module', module: 'sys', imports: 'import sys',
    intro: ['The parts of `sys` that school programs need: `exit`, `stdout`/`stderr`/`stdin`, `argv`, version information.'],
    example: { code: 'import sys\nprint(sys.version_info[:2], sys.platform)\nsys.stdout.write("ohne Zeilenumbruch")\nprint()\nif len(sys.argv) < 2:\n    print("Keine Argumente, Ende.")\n    sys.exit()\nprint("nie erreicht")' },
    notes: ['`setrecursionlimit` has no effect (the limit is 1000), `getsizeof` always returns 64, `sys.modules` and `sys.path` are empty.'],
    desc: { exit: 'Ends the program (`SystemExit`).', stdout: 'Standard output (`write`, `flush`).', stderr: 'Error output.', stdin: 'Input (`readline` asks like `input`).' },
  },
  {
    id: 're', title: 're', group: G_STD, source: 'module', module: 're', imports: 'import re', showMembers: ['Match', 'Pattern'],
    intro: ['Regular expressions with Python\'s syntax (named groups `(?P<name>…)`, `\\A`, `\\Z`, lookbehind, flags, verbose mode). Positions count characters as in Python.'],
    example: { code: 'import re\ntext = "Ada: 0171-555 12, Linus: 030 1234"\nprint(re.findall(r"\\d+", text))\nm = re.search(r"(?P<name>\\w+): (?P<nr>[\\d -]+)", text)\nprint(m.group("name"), m.span())\nprint(re.sub(r"\\s+", " ", "viel    zu   viel Platz"))\nprint(re.split(r"[,:]\\s*", text))' },
    notes: ['Runs on the browser\'s regex engine: possessive quantifiers, atomic groups and `\\G` are missing; patterns with extreme backtracking can be slow.'],
    desc: { search: 'First match anywhere in the string (or `None`).', match: 'Match at the start only.', fullmatch: 'Does the pattern match the whole string?', findall: 'All matches as a list.', finditer: 'All matches as `Match` objects.', sub: 'Replaces matches.', split: 'Splits at the matches.', compile: 'Compiled pattern for repeated use.' },
  },
  {
    id: 'pprint', title: 'pprint', group: G_STD, source: 'module', module: 'pprint', imports: 'import pprint',
    intro: ['Prints nested data readably, with the same line-breaking rules as CPython.'],
    example: { code: 'from pprint import pprint\nschule = {"klassen": {"7a": ["Ada", "Linus", "Grace"], "7b": ["Alan", "Barbara"]}, "raeume": list(range(101, 112))}\npprint(schule, width=50)' },
  },
  {
    id: 'textwrap', title: 'textwrap', group: G_STD, source: 'module', module: 'textwrap', imports: 'import textwrap',
    intro: ['Wrapping, shortening and indenting text.'],
    example: { code: 'import textwrap\nsatz = "Natter ist ein kleiner Python-Interpreter für den Unterricht im Browser."\nprint(textwrap.fill(satz, width=30))\nprint(textwrap.shorten(satz, width=30))\nprint(textwrap.indent("a\\nb", "> "))' },
  },

  // ------------------------------------------------------------------ drawing and games
  {
    id: 'turtle', title: 'turtle', group: G_DRAW, source: 'module', module: 'turtle', imports: 'import turtle', showMembers: ['Turtle', 'Screen'], sigFrom: ['Turtle', 'Screen'],
    hide: ['TNavigator', 'RawPen', 'Pen', 'ScrolledCanvas', 'Shape', 'Vec2D'],
    intro: ['Turtle graphics as in CPython: the same formulas, so the same positions and headings. The page draws (origin in the middle, y up), animates according to `speed()` and sends keys, clicks and timers to `mainloop()`.'],
    example: {
      code: 'import turtle\nt = turtle.Turtle()\nt.speed(0)\nt.color("darkgreen", "lightgreen")\nt.begin_fill()\nfor i in range(5):\n    t.forward(150)\n    t.right(144)\nt.end_fill()\nt.penup()\nt.goto(0, -60)\nt.write("Stern", align="center", font=("Arial", 16, "bold"))\nprint(t.position(), t.heading())\nturtle.done()',
    },
    notes: [
      'No real Tk canvas: `getcanvas()`/`cv` return `None`; `bgpic` and shapes from image files only work if the page knows the image.',
      '`undo` only undoes movements. Screen size before `setup()`: 960 × 810 like CPython, scaled down to the space on the page.',
    ],
    host: [
      'Keys (Tk names like `Left`, `space`), clicks and taps reach `onkey`/`onscreenclick` once `listen()` and `mainloop()`/`done()` run; `exitonclick()` ends with the next click.',
      '`textinput`/`numinput` open a dialog. The `turtle` shape is an image from the asset library, tinted with the fill colour.',
    ],
    desc: {
      Turtle: 'A new turtle (several are possible).', Screen: 'The drawing area (background, size, events).',
      forward: 'Moves forward.', back: 'Moves backward.', left: 'Turns left (degrees).', right: 'Turns right (degrees).', goto: 'Moves to the point (x, y).',
      penup: 'Lift the pen: draw nothing.', pendown: 'Lower the pen: draw.', pensize: 'Line width.', color: 'Pen and fill colour (names, `#rrggbb` or RGB).',
      circle: 'Circle or arc with a radius (counter-clockwise for a positive radius).', dot: 'Dot with diameter `size`.', begin_fill: 'Starts a filled shape.', end_fill: 'Fills the shape since `begin_fill`.',
      write: 'Writes text at the position.', speed: '1 (slow) to 10 (fast), 0 = no animation.', setheading: 'Heading in degrees (0 = right).', home: 'Back to the centre, facing right.',
      shape: 'Shape: `turtle`, `arrow`, `circle`, `square`, `triangle`, `classic`.', hideturtle: 'Hides the turtle.', stamp: 'Leaves a print of the shape.',
      bgcolor: 'Background colour.', tracer: '`tracer(0)` draws only on `update()` (fast).', onkey: 'Function for a key.', onscreenclick: 'Function for clicks (gets x, y).',
      ontimer: 'Function after `t` milliseconds.', mainloop: 'Waits for events until the end.', done: 'Same as `mainloop`.', setup: 'Window size.', setworldcoordinates: 'Your own coordinate system.',
      textinput: 'Asks for a string (dialog).', numinput: 'Asks for a number (dialog).', clear: 'Clears the turtle\'s drawing.', reset: 'Clears and resets.',
    },
  },
  {
    id: 'kara', title: 'Kara the ladybug', nav: 'kara', group: G_DRAW, source: 'kara', imports: 'import kara  (or no import)',
    intro: [
      'Kara walks on a meadow of cells, collects blueberries, avoids trees and pushes mushrooms. The commands are named as in the book (`move`, `turnLeft`, `treeFront` …) and work with `import kara` (`kara.move()`), with `from kara import *` or without any import: when a program starts with `world("""…""")`, the commands are already there.',
      'The meadow is a picture made of characters, one line of text per row. Kara faces right at the start. Lines may differ in length (missing cells are empty).',
    ],
    example: {
      run: 'kara', title: 'Collecting the berries in a row',
      code: 'world("""\n########\n#@ . ..#\n########\n""")\n\nwhile not treeFront():\n    if onBerry():\n        removeBerry()\n    move()\nif onBerry():\n    removeBerry()',
    },
    notes: [
      '`treeFront()`, `treeLeft()` and `treeRight()` are also true at the edge of the meadow (the edge acts like a tree).',
      'Mushrooms can be pushed like crates in Sokoban: `move()` against a mushroom pushes it one cell further if the cell behind is free (no tree, no mushroom, no edge). The usual goal is to push all mushrooms onto berries (`*`).',
    ],
    host: ['The page draws with the images of the `kara` pack of the asset library and animates every step (0.3 s by default). Without the library it draws simple shapes.'],
    desc: {
      world: 'Sets up the meadow (characters below). Must come before all other commands.', move: 'One cell forward (pushes a mushroom).', turnLeft: 'Quarter turn to the left.', turnRight: 'Quarter turn to the right.',
      putBerry: 'Puts a blueberry on the cell.', removeBerry: 'Picks up the blueberry from the cell.', onBerry: 'Is Kara on a blueberry?', treeFront: 'Is there a tree (or the edge) in front?',
      treeLeft: 'Is there a tree (or the edge) on the left?', treeRight: 'Is there a tree (or the edge) on the right?', mushroomFront: 'Is there a mushroom in front?',
    },
    chars: { '#': 'tree', '.': 'blueberry', '$': 'mushroom', '*': 'mushroom on a blueberry', '@': 'Kara (facing right)', '+': 'Kara on a blueberry', ' ': 'empty cell' },
  },
  {
    id: 'pgzero', title: 'Pygame Zero', group: G_DRAW, source: 'pgzero', imports: 'import pgzrun  (or no import)',
    intro: [
      'Games with the API of [Pygame Zero 1.2](https://pygame-zero.readthedocs.io/): write `draw()` and `update()`, move `Actor`s, read keys, play sounds. The game logic computes like the real Pygame Zero (compared with pgzero 1.2.1 and pygame 2), plus the popular extensions from pgzhelper (`scale`, `flip_x`, `images`/`animate`, `move_towards` …).',
      'A game starts like `pgzrun game.py`: if the program has `def draw()` or `def update()` (or `WIDTH`/`HEIGHT` and `Actor`/`screen`), it knows all the names below without an import. With `import pgzrun` and `pgzrun.go()` at the end it works the same; code after `go()` runs when the window is closed.',
      'Window: `WIDTH`, `HEIGHT` (default 800 × 600) and `TITLE` as global variables. Images are found by their name without extension: first in the project folder `images/` (sounds `sounds/`, music `music/`, fonts `fonts/`), then in the [asset library](#assets).',
    ],
    example: {
      run: 'pgzero', title: 'Collecting coins',
      code: 'import random\n\nWIDTH = 480\nHEIGHT = 320\nTITLE = "Münzjagd"\n\nheldin = Actor("heroine_idle_1", (240, 260))\nmuenze = Actor("pf_coin_1", (100, 80))\npunkte = 0\n\ndef draw():\n    screen.fill("skyblue")\n    heldin.draw()\n    muenze.draw()\n    screen.draw.text("Punkte: " + str(punkte), (10, 10), fontsize=32, color="white")\n\ndef update():\n    global punkte\n    if keyboard.left:\n        heldin.x -= 5\n    if keyboard.right:\n        heldin.x += 5\n    muenze.y += 2\n    if heldin.colliderect(muenze):\n        punkte += 1\n        sounds.coin.play()\n        neu()\n    elif muenze.top > HEIGHT:\n        neu()\n\ndef neu():\n    muenze.pos = (random.randint(20, WIDTH - 20), -20)\n\ndef on_mouse_down(pos):\n    heldin.x = pos[0]',
      note: 'The images `heroine_idle_1`, `pf_coin_1` and the sound `coin` come from the asset library, without uploading any files.',
    },
    notes: [
      '`keys`, `keymods` and `mouse` are plain numbers instead of IntEnum (`print` is the same, `repr` differs).',
      'Callbacks of `clock` stay alive (Pygame Zero forgets `lambda` callbacks); an error in a callback stops the game with an error message.',
      'Image subfolders only via `images.load("folder/name")`. Missing: `music.get_pos`, pixel, circle and OBB collisions and sprite sheets of pgzhelper, `screen.surface` (always `None`).',
    ],
    host: [
      'Fixed rate: 60 frames per second (`update(dt)` with `dt = 1/60`), at most 4 frames are caught up; a hidden tab pauses. If a frame needs too many instructions (endless loop), the game ends with the line of the loop.',
      'Sound only after the first touch, click or key press (a browser rule); until then the game shows a hint to tap or click for sound.',
      'On phones a finger acts like the left mouse button; the page can show a button bar (◀ ▶ ▲ ▼, jump = space).',
    ],
    hooks: {
      draw: { text: 'Draws the picture. Runs after `update` and after events; the canvas is not cleared automatically (`screen.clear()` or `screen.fill()`).' },
      update: { params: ['dt'], text: 'Game logic, 60 times per second. `dt` (seconds passed) may be left out.' },
      on_mouse_down: { text: 'Mouse button pressed or finger down; `button` is `mouse.LEFT`, `mouse.RIGHT` …' },
      on_mouse_up: { text: 'Mouse button released.' },
      on_mouse_move: { text: 'Mouse moved; `rel` is the movement, `buttons` the pressed buttons.' },
      on_key_down: { text: 'Key pressed; `key` is e.g. `keys.SPACE`, `unicode` the character.' },
      on_key_up: { text: 'Key released.' },
      on_music_end: { text: 'A music track has ended.' },
    },
    desc: {
      Actor: 'A game character made from an image: position (`x`, `y`, `pos`, `center`, `topleft` …), `angle`, `scale`, collisions, `draw()`.',
      Rect: 'Rectangle with integers like `pygame.Rect`.', ZRect: 'Rectangle with floats.',
      screen: 'The canvas: `fill`, `clear`, `blit` and the drawing commands in `screen.draw`.',
      keyboard: 'Pressed keys: `keyboard.left`, `keyboard.space`, `keyboard.a`, `keyboard[keys.LEFT]`.',
      keys: 'Key codes (`keys.LEFT`, `keys.SPACE`, `keys.A` …).', keymods: 'Modifier keys (`keymods.SHIFT` …).', mouse: 'Mouse buttons (`mouse.LEFT` …).',
      sounds: 'Sounds by name: `sounds.coin.play()`.', music: 'Background music: `music.play("name")`.', images: 'Images by name: `images.pf_coin_1` (for `blit` and sizes).',
      clock: 'Timers: `clock.schedule(f, 2.0)`, `clock.schedule_interval(f, 1.0)`.', animate: 'Animates attributes: `animate(figure, pos=(100, 50), duration=1, tween="bounce_end")`.',
      tone: 'Generates tones: `tone.play("A4", 0.5)`.', exit: 'Ends the game.',
    },
    members: {
      Actor: {
        draw: 'Draws the actor.', colliderect: 'Does it overlap a rectangle or another actor?', collidepoint: 'Is the point inside the actor?',
        distance_to: 'Distance to a point or actor.', angle_to: 'Angle to a point or actor (degrees, counter-clockwise).',
        image: 'Name of the image (assigning changes the image).', angle: 'Rotation in degrees.', pos: 'Position of the anchor (default: centre).',
        scale: 'Scaling factor (pgzhelper).', opacity: 'Opacity 0 to 1.', images: 'List of image names for `next_image()`/`animate()` (pgzhelper).',
        move_towards: 'Moves `dist` towards the target (pgzhelper).', point_towards: 'Turns towards the target (pgzhelper).',
      },
      screen: { fill: 'Fills with a colour (name, `(r, g, b)` or `#rrggbb`), with `gcolor` as a gradient.', clear: 'Makes the canvas black.', blit: 'Draws an image at `pos` (top-left corner).' },
      'screen.draw': {
        text: 'Text at `pos` (or `center=`, `topright=` …) with `fontsize`, `color`, `width`, `align`, `owidth`/`ocolor` (outline), `shadow`, `gcolor`, `alpha`, `angle` like ptext.',
        textbox: 'Text as large as possible inside a rectangle.', line: 'Line from `start` to `end`.', circle: 'Circle outline.', filled_circle: 'Filled circle.', rect: 'Rectangle outline.', filled_rect: 'Filled rectangle.',
      },
      Sound: { play: 'Plays the sound (`loops`, `maxtime`, `fade_ms`).', stop: 'Stops the sound.', set_volume: 'Volume 0 to 1.' },
      music: { play: 'Plays a track in a loop.', play_once: 'Plays a track once.', stop: 'Stops the music.', set_volume: 'Volume 0 to 1.', fadeout: 'Fades out over `seconds`.' },
    },
    subObjects: [['screen.draw', 'screen.draw'], ['Sound', null, ['pgzero_audio', 'Sound']]],
  },
  {
    id: 'assets', title: 'Asset library', group: G_DRAW, source: 'assets',
    intro: [
      'About {images} images in one consistent style plus short sounds, free to use (CC0). A program only names them, without uploading files: `Actor("heroine_run_1")`, `screen.blit("pf_grass_mid", (0, 416))`, `sounds.coin.play()`. Kara and the turtle shape use the same library.',
      'Only what the program mentions is loaded. A string like `"heroine_run_" + str(i)` loads all images whose name starts that way. Your own file with the same name in the project folder `images/` wins. The [sprite gallery](../sprites/) shows all images and sounds with previews, sorted by game type; the packs live in `packages/assets` (`gametypes.json`, `catalog.json`).',
    ],
    notesTitle: 'Names',
    notes: ['Lower case, ASCII, unique across all packs. Animation frames end in `_1`, `_2` … (`heroine_run_1` to `heroine_run_8`); characters face right unless the name says `_left`. Names in the book pack are German (`ente`, `kueken`, `boot`) because the book uses them.'],
  },

  // ------------------------------------------------------------------ forms, data, net
  {
    id: 'guizero', title: 'Forms with guizero', nav: 'guizero', group: G_DATA, source: 'module', module: 'guizero', imports: 'from guizero import App, Text, PushButton',
    showMembers: ['App', 'Window', 'Box', 'TitleBox', 'Text', 'TextBox', 'PushButton', 'CheckBox', 'ButtonGroup', 'Combo', 'ListBox', 'Slider', 'Picture', 'Waffle', 'Drawing', 'MenuBar'], inherited: false,
    hide: ['EventData', 'EventCallback', 'EventManager', 'ScheduleMixin', 'DestroyMixin', 'EnableMixin', 'FocusMixin', 'DisplayMixin', 'TextMixin', 'ColorMixin', 'SizeMixin', 'LayoutMixin', 'EventsMixin', 'Base', 'Component', 'Container', 'BaseWindow', 'Widget', 'TextWidget', 'ContainerWidget', 'ContainerTextWidget', 'ListBoxWidget', 'ListBoxScrollbar', 'WafflePixel', 'RadioButton', 'utilities', 'system_config', 'TclError'],
    common: { title: 'All widgets also have', classes: ['ScheduleMixin', 'DestroyMixin', 'EnableMixin', 'FocusMixin', 'DisplayMixin', 'ColorMixin', 'SizeMixin', 'LayoutMixin', 'EventsMixin', 'Component'] },
    intro: [
      'Windows with buttons, text boxes and lists through the API of [guizero 1.6](https://lawsie.github.io/guizero/). Programs run as the guizero documentation shows them; defaults, warnings and error messages match the real guizero.',
      'The page draws the widgets as real HTML elements. Layout `auto` works like Tk `pack`, layout `grid` is a grid that grows with its content (`grid=[column, row]`, also `[column, row, width, height]`).',
    ],
    example: {
      run: 'forms', title: 'Counter',
      code: 'from guizero import App, Text, PushButton, Box\n\napp = App(title="Zähler", width=240, height=160)\nanzeige = Text(app, text="0", size=40)\nknoepfe = Box(app, layout="grid")\n\ndef plus():\n    anzeige.value = int(anzeige.value) + 1\n\ndef null():\n    anzeige.value = 0\n\nPushButton(knoepfe, text="+1", command=plus, grid=[0, 0])\nPushButton(knoepfe, text="Null", command=null, grid=[1, 0])\napp.display()',
    },
    notes: [
      'No tkinter behind it: `.tk` is a small stand-in, `add_tk_widget` does not work. Errors in callbacks end the program (Tk would only print them).',
      'Images (`Picture`, `PushButton(image=…)`, `Drawing.image`) come from the project files: PNG, GIF, JPEG, BMP, WebP, SVG.',
    ],
    host: [
      'On narrow screens windows fill the width and several windows become tabs. Sizes as in guizero: text widgets in characters and lines, containers and windows in pixels.',
      'Dialogs (`info`, `yesno`, `question`, `select_file`, `select_color` …) appear as a card over the windows; `select_file` shows the project\'s files. Timers (`after`, `repeat`) run in real time.',
    ],
    desc: {
      App: 'The main window; `display()` shows it and waits for events.', Window: 'Another window.', Box: 'Invisible container for grouping.', TitleBox: 'Container with a border and title.',
      Text: 'A text (`value`).', TextBox: 'Input field (`value`, `multiline`, `hide_text` for passwords).', PushButton: 'Button; `command` is called on click.', CheckBox: 'Box to tick (`value` 0/1).',
      ButtonGroup: 'Choice among options (radio buttons).', Combo: 'Drop-down list.', ListBox: 'List, also with multiple selection.', Slider: 'Slider.', Picture: 'An image from the project.',
      Waffle: 'Grid of cells, e.g. for pixel pictures and games.', Drawing: 'Drawing area: lines, ovals, rectangles, polygons, text, images.', MenuBar: 'Menu bar.',
      info: 'Message with OK.', yesno: 'Yes/no question, returns `True`/`False`.', question: 'Asks for a string.', select_file: 'Choose a file of the project.', select_color: 'Choose a colour.',
    },
  },
  {
    id: 'numpy', title: 'numpy', group: G_DATA, source: 'module', module: ['numpy', 'numpy.random', 'numpy.linalg'], imports: 'import numpy as np', showMembers: ['ndarray'],
    hide: ['float32', 'float16', 'double', 'int32', 'int16', 'int8', 'uint8', 'uint16', 'uint32', 'uint64', 'intp', 'bool_', 'float64', 'int64', 'dtype', 'random', 'linalg'],
    intro: [
      'An honest subset of numpy 2: arrays with broadcasting, arithmetic, statistics, sorting, random numbers, some linear algebra. What exists prints the same digits as numpy (compared with numpy 2.5): output format, statistics and `numpy.random` with the same seed.',
      'dtypes: `int64`, `float64`, `bool` and strings. Slices and `.T` are views as in numpy (changing them changes the original); mask and list indexes return copies.',
    ],
    example: { code: 'import numpy as np\na = np.arange(1, 7).reshape(2, 3)\nprint(a)\nprint(a.sum(axis=0), a.mean(), a[a > 2])\nx = np.linspace(0, 1, 5)\nprint(x ** 2, np.round(np.sin(x), 3))\nrng = np.random.default_rng(42)\nprint(rng.integers(1, 7, size=5))' },
    notes: [
      'Results without an axis (`a.sum()`, `a[0]`) are Python numbers, not numpy scalars: `print` is the same, `repr` inside lists differs, `a.sum() / 0` is a `ZeroDivisionError`.',
      'Missing: complex numbers, real 32-bit types (`int32`, `float32` become 64 bit), object and structured arrays, several axes at once, `...` as an index, `out=`/`where=`, `np.fft`, `linalg.eig/svd/lstsq`, file I/O (`loadtxt`, `save`), `split`, `roll`, `pad`.',
      'Warnings like `RuntimeWarning: divide by zero` appear once per line in the error output and the program goes on (like numpy).',
    ],
    desc: {
      array: 'Array from a (nested) list.', arange: 'Like `range`, as an array (also floats).', linspace: '`num` evenly spaced values from `start` to `stop`.',
      zeros: 'Array of zeros.', ones: 'Array of ones.', reshape: 'New shape, same data.', where: 'Chooses element-wise from `x` or `y`.',
      sum: { sig: 'sum(a, axis=None, keepdims=False)', text: 'Sum (pairwise like numpy, same digits).' }, mean: { sig: 'mean(a, axis=None)', text: 'Mean.' }, std: { sig: 'std(a, axis=None, ddof=0)', text: 'Standard deviation.' },
      sqrt: { sig: 'sqrt(x)', text: 'Square root per element (correctly rounded).' }, sin: { sig: 'sin(x)', text: 'Sine per element.' }, sort: 'Sorted copy (stable).', unique: 'Sorted distinct values, optionally with counts.',
      polyfit: 'Least-squares polynomial of degree `deg`.', histogram: 'Counts in bins.', dot: 'Dot product / matrix product (also `a @ b`).',
      default_rng: 'New random generator (PCG64) – with a seed, the same numbers as numpy.', seed: { sig: 'seed(seed)', text: 'Seed of the legacy generator (MT19937 like numpy).' },
      rand: { sig: 'rand(d0, d1, …)', text: 'Uniform numbers in [0, 1).' }, randint: { sig: 'randint(low, high=None, size=None)', text: 'Random integers from `low` to below `high`.' }, normal: { sig: 'normal(loc=0.0, scale=1.0, size=None)', text: 'Normally distributed numbers.' },
      solve: 'Solves the linear system `a x = b`.', det: 'Determinant.', inv: 'Inverse matrix.',
    },
  },
  {
    id: 'pyplot', title: 'Plots with matplotlib.pyplot', nav: 'matplotlib.pyplot', group: G_DATA, source: 'module', module: 'matplotlib.pyplot', imports: 'import matplotlib.pyplot as plt', showMembers: ['Axes', 'Figure'],
    intro: [
      'Function graphs, scatter plots, bars, histograms and pie charts like matplotlib 3: the same axes, ticks, colours, legends and positions. `plt.show()` shows the plot as SVG in the page and the program goes on at once; `plt.savefig("plot.svg")` offers it for download.',
      'The object-oriented style works too: `fig, ax = plt.subplots()`, `ax.plot(…)`, `axs[0, 1]`, `ax.set(title=…)`.',
    ],
    example: {
      run: 'plot', showOutput: false,
      code: 'import numpy as np\nimport matplotlib.pyplot as plt\n\nx = np.linspace(0, 2 * np.pi, 100)\nplt.plot(x, np.sin(x), label="sin")\nplt.plot(x, np.cos(x), "r--", label="cos")\nplt.title("Sinus und Kosinus")\nplt.xlabel("x")\nplt.legend()\nplt.grid(True)\nplt.show()',
      note: 'Natter drew the image below while this page was built.',
    },
    notes: [
      'Always SVG (even `savefig("plot.png")` holds SVG). Missing: logarithmic axes, `imshow`, `contour`, `colorbar`, `boxplot`, polar and 3-D axes, `twinx`, colormaps (except viridis for `scatter(c=…)`), `rcParams`, animations; the placeholders below raise `NotImplementedError` with a tip.',
      'Maths in text is basic only: `$x^2$`, `$t_0$`, Greek letters. `tight_layout()` does nothing.',
    ],
    desc: {
      plot: { sig: 'plot(x, y, fmt="", **kwargs)', text: 'Lines and markers; format strings like `"r--o"`, `color`, `linewidth`, `marker`, `label`.' },
      scatter: { sig: 'scatter(x, y, s=None, c=None, **kwargs)', text: 'Scatter plot, colour and size per point.' }, bar: { sig: 'bar(x, height, width=0.8, **kwargs)', text: 'Bar chart, categories as strings.' },
      barh: { sig: 'barh(y, width, **kwargs)', text: 'Horizontal bar chart.' }, hist: { sig: 'hist(x, bins=10, **kwargs)', text: 'Histogram (`bins`, `density`, `cumulative`, `histtype`).' }, pie: { sig: 'pie(x, labels=None, autopct=None, **kwargs)', text: 'Pie chart.' },
      show: 'Shows the open figures.', savefig: 'Saves the figure (as SVG).', title: 'Title.', xlabel: 'Label of the x axis.', ylabel: 'Label of the y axis.',
      legend: 'Legend from the `label`s (`loc="best"` like matplotlib).', grid: 'Grid lines.', xlim: 'Range of the x axis.', ylim: 'Range of the y axis.', subplots: 'Figure with a grid of axes: `fig, axs = plt.subplots(2, 2)`.',
      figure: { sig: 'figure(figsize=(6.4, 4.8), dpi=100)', text: 'New figure (640 × 480 pixels by default).' }, text: 'Text at a position.', annotate: 'Text with an arrow.', axhline: 'Horizontal line.', axvline: 'Vertical line.',
    },
  },
  {
    id: 'requests', title: 'requests and CORS', nav: 'requests', group: G_DATA, source: 'module', module: 'requests', imports: 'import requests', showMembers: ['Response', 'Session'],
    hide: ['exceptions', 'codes'],
    intro: [
      'Fetching data from the web as with the requests package: `requests.get(url).json()`. The page performs the request with `fetch`; the program waits meanwhile.',
      'Why some addresses fail (CORS): a browser only lets a web page read answers from servers that explicitly allow it (header `Access-Control-Allow-Origin`). Open data APIs such as Open-Meteo, Wikipedia and many JSON APIs allow it; ordinary web pages usually do not. When the browser blocks a request, Natter raises `ConnectionError` with exactly this explanation. Remedies: use a source that allows CORS, put the data into the project as a file, or run the program on your own computer with CPython.',
    ],
    example: {
      run: 'http', showOutput: false, httpAnswer: '{"current_weather": {"temperature": 17.4, "windspeed": 9.2}}',
      code: 'import requests\n\nantwort = requests.get("https://api.open-meteo.com/v1/forecast", params={\n    "latitude": 52.52, "longitude": 13.41, "current_weather": "true"})\nantwort.raise_for_status()\nwetter = antwort.json()["current_weather"]\nprint("Berlin:", wetter["temperature"], "°C, Wind", wetter["windspeed"], "km/h")',
    },
    notes: [
      'Text only: `response.content` (bytes), file uploads, streaming and cookies are missing. Only `http://` and `https://`; timeout 30 s when `timeout` is not given.',
      'Headers that browsers forbid (`User-Agent`, `Cookie` …) are silently dropped by them.',
    ],
    desc: {
      get: 'GET request; `params` are appended to the address.', post: 'POST request with form data (`data`) or JSON (`json`).', request: 'Request with any method.',
      Response: 'Answer: `status_code`, `ok`, `text`, `json()`, `headers`, `url`.', Session: 'Shared headers and parameters for several requests.',
      ConnectionError: 'Server unreachable or blocked by the browser (CORS).', HTTPError: 'Raised by `raise_for_status()` for status 400 to 599.', Timeout: 'No answer in time.',
    },
    members: { Response: { json: 'Answer text parsed as JSON.', raise_for_status: 'Raises `HTTPError` if the status is an error.', ok: 'Status below 400?' } },
  },
];
