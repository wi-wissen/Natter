// Curated German text of the command reference: intros, examples, notes and short descriptions.
// Names, parameters, members, constants and lists come from the interpreter (scripts/build-reference.mjs); every
// name described here must exist there, every example must run, every `ok` snippet must run and every `no` snippet
// must fail – otherwise the build (and its test) reports a problem. Text: plain text, `code` in backticks, [links](url).

export const PAGE = {
  description: 'Befehlsreferenz von Natter: Sprache, eingebaute Funktionen, Standardmodule, turtle, Kara, Pygame Zero, guizero, numpy, matplotlib, requests und Dateien – erzeugt aus dem Quelltext.',
  intro: [
    'Alles, was ein Programm in Natter benutzen kann: die Sprache, die eingebauten Funktionen, die Standardmodule, turtle, Kara, Pygame Zero, Formulare mit guizero, numpy, Diagramme, requests und Dateien. Zu jedem Modul ein kurzes Beispiel, das so läuft.',
    'Natter will normales Python sein: Was hier steht, verhält sich wie in CPython 3.12 (und wie die echten Bibliotheken). Wo es abweicht oder etwas fehlt, steht es dabei. Suchen mit der Taste `/`.',
  ],
};

const G_BASE = 'Grundlagen';
const G_STD = 'Standardmodule';
const G_DRAW = 'Zeichnen und Spiele';
const G_DATA = 'Formulare, Daten, Netz';

const CPYTHON_BUILTINS = ['abs', 'aiter', 'all', 'anext', 'any', 'ascii', 'bin', 'bool', 'breakpoint', 'bytearray', 'bytes', 'callable', 'chr',
  'classmethod', 'compile', 'complex', 'delattr', 'dict', 'dir', 'divmod', 'enumerate', 'eval', 'exec', 'filter', 'float', 'format', 'frozenset',
  'getattr', 'globals', 'hasattr', 'hash', 'help', 'hex', 'id', 'input', 'int', 'isinstance', 'issubclass', 'iter', 'len', 'list', 'locals', 'map',
  'max', 'memoryview', 'min', 'next', 'object', 'oct', 'open', 'ord', 'pow', 'print', 'property', 'range', 'repr', 'reversed', 'round', 'set',
  'setattr', 'slice', 'sorted', 'staticmethod', 'str', 'sum', 'super', 'tuple', 'type', 'vars', 'zip', '__import__'];

export const SECTIONS = [
  // ------------------------------------------------------------------ language
  {
    id: 'sprache', title: 'Die Sprache', group: G_BASE, source: 'language',
    intro: ['Natter übersetzt Python 3 in Bytecode und führt ihn in Zeitscheiben aus. Die Tabelle zeigt, was geht, mit einem Beispiel, und was nicht geht, mit der Meldung, die Natter dann zeigt. Jede Zeile ist beim Erzeugen dieser Seite gelaufen.'],
    rows: [
      { area: 'Grundlagen', de: 'Ganze Zahlen beliebiger Größe, Kommazahlen, Texte, `True`/`False`, `None`; `if`/`elif`/`else`, `while`, `for` (auch mit `else`), `break`, `continue`, `pass`, Mehrfachzuweisung `a, b = b, a`, Vergleichsketten `1 < x < 5`, `x if c else y`.',
        ok: 'for i in range(3):\n    if i == 1:\n        continue\n    print(i, 2 ** 70)',
        not: '`match`/`case` und der Walross-Operator `:=` fehlen.', no: ['x = 3\nmatch x:\n    case 3:\n        print("drei")', 'if (n := 5) > 3:\n    print(n)'] },
      { area: 'Zahlen', de: 'Rechnen wie CPython: `//` und `%` mit Vorzeichen wie Python, `round()` rundet halbe auf gerade, ganze Zahlen werden ab 2^53 zu großen Zahlen, Kommazahlen haben dieselben Stellen wie CPython.',
        ok: 'print(round(2.5), -7 // 2, -7 % 3, 2 ** 100, 0.1 + 0.2)',
        not: 'Komplexe Zahlen fehlen.', no: ['print(1 + 2j)'] },
      { area: 'Texte', de: 'f-Strings mit Formatangaben, `%`-Formatierung, `str.format`, Slices, `in`, alle üblichen Textmethoden (siehe [Methoden](#methoden)).',
        ok: 'n = "Ada"\nprint(f"{n:>5}|{3.14159:.2f}|{1234567:,}", "%d%%" % 5, "{} {}".format(1, 2))',
        not: 'Keine Bytes: `b"…"`, `str.encode()` und Binärdateien fehlen; die Funktion `format()` fehlt (die Methode `str.format` und f-Strings gehen).', no: ['print(b"abc")', 'print(format(255, "x"))'] },
      { area: 'Listen, Tupel, Dicts, Mengen', de: 'Indizes und Slices (auch negativ und mit Schritt), Listen-, Dict- und Mengen-Abstraktionen, Entpacken mit `*rest`, `set`/`frozenset` mit allen Mengenoperationen, `del`.',
        ok: 'a, *rest = [3, 1, 2]\nprint(a, rest, [x * x for x in rest], {x % 2 for x in rest}, {k: len(k) for k in ["ab", "c"]})',
        not: '`dict | dict` fehlt (nimm `update`).', no: ['print({"a": 1} | {"b": 2})'] },
      { area: 'Funktionen', de: '`def` mit Standardwerten, `*args`, `**kwargs`, Parameter nur mit Namen nach `*`, `lambda`, Closures, `global`, `nonlocal`, Dekoratoren, Rekursion bis Tiefe 1000 wie CPython.',
        ok: 'def gruss(name, *, laut=False, **extra):\n    t = "Hallo " + name\n    return t.upper() if laut else t\nprint(gruss("Ada", laut=True), (lambda x: x * 2)(21))',
        not: 'Parameter nur nach Position (`/`) fehlen.', no: ['def f(a, /, b):\n    return a + b'] },
      { area: 'Klassen', de: '`class` mit Vererbung (auch mehrfach, MRO wie CPython), `super()`, `@property` mit Setter, `@classmethod`, `@staticmethod`, Operatoren über `__add__`, `__eq__`, `__lt__`, `__getitem__`, `__len__`, `__iter__`, `__call__`, `__getattr__` …',
        ok: 'class Tier:\n    def __init__(self, name):\n        self.name = name\n    def __str__(self):\n        return "Tier " + self.name\nclass Hund(Tier):\n    def __init__(self, name):\n        super().__init__(name)\nprint(Hund("Bello"))',
        not: 'Keine Unterklassen von eingebauten Typen (`class L(list)`), keine Metaklassen; `__setattr__` und `__slots__` haben keine Wirkung.',
        no: ['class L(list):\n    pass', 'class M(type):\n    pass\nclass A(metaclass=M):\n    pass'],
        same: [{ code: 'class A:\n    def __setattr__(self, k, v):\n        print("gerufen")\nA().x = 1\nprint("fertig")', output: 'fertig\n' }] },
      { area: 'Ausnahmen', de: '`try`/`except`/`else`/`finally`, `raise`, `raise … from …`, eigene Ausnahmeklassen, alle üblichen eingebauten Ausnahmen. Fehler kommen mit Zeile, Aufrufstapel und einem Hinweis auf Deutsch oder Englisch.',
        ok: 'class ZuKlein(Exception):\n    pass\ntry:\n    raise ZuKlein("unter 0")\nexcept ZuKlein as e:\n    print("Fehler:", e)\nfinally:\n    print("fertig")',
        not: 'Ausnahmegruppen (`except*`) fehlen.', no: ['try:\n    pass\nexcept* ValueError:\n    pass'] },
      { area: 'Generatoren, with', de: '`yield`, `yield from`, Generator-Ausdrücke (faul), `with` mit eigenen Kontextmanagern (`__enter__`/`__exit__`).',
        ok: 'def zaehle(n):\n    yield from range(n)\nprint(sum(x * x for x in zaehle(4)))',
        not: '`async`/`await` und Threads fehlen.', no: ['async def f():\n    pass'] },
      { area: 'Ein- und Ausgabe', de: '`input()` hält das Programm an, bis die Antwort da ist; `print` mit `sep`, `end`, `file=sys.stderr`.',
        ok: 'name = input("Wie heißt du? ")\nprint("Hallo", name, sep=", ", end="!\\n")' },
      { area: 'Module', de: '`import` von Standardmodulen und eigenen Dateien des Projekts (`hilfe.py`, Pakete mit `__init__.py`, `from . import x`), `import a.b`, `import x as y`, `from x import *`.',
        ok: 'import math as m\nfrom os import path\nprint(m.floor(2.7), path.join("a", "b"))',
        not: 'Module, die es nicht gibt (siehe Liste links), melden `ModuleNotFoundError`.', no: ['import tkinter'] },
      { area: 'Typhinweise', de: 'Werden gelesen und ignoriert, so laufen Programme aus Büchern.',
        ok: 'def doppelt(x: int) -> int:\n    return 2 * x\nzahlen: list = [1, 2]\nprint(doppelt(4), zahlen)',
        not: 'Das Modul `typing` fehlt (Hinweise wie `List[int]` brauchen es nicht, wenn man `list` schreibt).', no: ['from typing import List'] },
      { area: 'Nicht vorhanden', de: 'Bewusst weggelassen, weil es im Unterricht kaum gebraucht wird oder die Seite unsicher machen würde.',
        not: '`eval`, `exec`, `dir`, `globals`; `...` ist gleich `None`.', no: ['print(eval("1 + 2"))', 'print(dir())'],
        same: [{ code: 'print(...)', output: 'None\n' }] },
    ],
  },

  // ------------------------------------------------------------------ builtins
  {
    id: 'builtins', title: 'Eingebaute Funktionen', nav: 'Eingebaute Funktionen', group: G_BASE, source: 'builtins', cpythonBuiltins: CPYTHON_BUILTINS,
    intro: ['Diese Namen kennt jedes Programm ohne `import`. Die Parameter stehen so, wie Natter sie prüft; `x=…` heißt: darf fehlen.'],
    example: {
      code: 'zahlen = [5, 3, 8, 1]\nprint(len(zahlen), sum(zahlen), min(zahlen), max(zahlen))\nprint(sorted(zahlen, reverse=True))\nfor i, z in enumerate(zahlen, start=1):\n    print(i, z, end="; ")\nprint()\nprint(list(zip("abc", range(3))), round(3.14159, 2), abs(-4), divmod(17, 5))',
    },
    notes: [
      '`print(..., file=sys.stderr)` schreibt in die Fehlerausgabe (die Konsole zeigt sie rot).',
      '`hash()` und `id()` liefern feste Zahlen, die sich von CPython unterscheiden; `pow` hat keinen dritten Parameter (Modulo).',
      '`type()` mit drei Argumenten (Klassen erzeugen) und `zip(strict=True)` fehlen.',
    ],
    desc: {
      print: { sig: 'print(*objects, sep=" ", end="\\n", file=None, flush=False)', de: 'Gibt Werte aus, getrennt durch `sep`, am Ende `end`.' },
      input: 'Fragt eine Zeile ab. Das Programm wartet, bis die Antwort eingegeben ist; das Ergebnis ist immer ein Text.',
      len: 'Anzahl der Elemente eines Textes, einer Liste, eines Dicts …',
      range: { sig: 'range(stop) / range(start, stop, step=1)', de: 'Zahlenfolge für `for`-Schleifen, ohne `stop`.' },
      int: 'Ganze Zahl aus Text oder Kommazahl (schneidet ab); mit `base` aus Text in dieser Basis.',
      float: 'Kommazahl aus Text oder Zahl (auch `"inf"`, `"nan"`).',
      str: 'Text aus einem Wert (wie bei `print`).',
      bool: 'Wahrheitswert: `0`, `""`, leere Sammlungen und `None` sind `False`.',
      list: 'Neue Liste, z. B. aus einem Text, `range` oder Generator.',
      tuple: 'Neues Tupel.',
      dict: { sig: 'dict(**kwargs) / dict(iterable)', de: 'Neues Dictionary.' },
      set: 'Neue Menge (doppelte Werte fallen weg).',
      abs: 'Betrag.',
      round: 'Rundet auf `ndigits` Stellen; genau halbe Werte auf die gerade Zahl (`round(2.5) == 2`) wie CPython.',
      min: { sig: 'min(iterable, key=None, default=…) / min(a, b, …)', de: 'Kleinster Wert.' },
      max: { sig: 'max(iterable, key=None, default=…) / max(a, b, …)', de: 'Größter Wert.' },
      sum: 'Summe; Kommazahlen genau wie CPython (`sum([0.1] * 10) == 1.0`).',
      sorted: 'Neue, sortierte Liste (stabil), optional mit `key` und `reverse`.',
      reversed: 'Iterator rückwärts.',
      enumerate: 'Paare `(nummer, element)`.',
      zip: { sig: 'zip(*iterables)', de: 'Fasst mehrere Folgen paarweise zusammen (endet bei der kürzesten).' },
      map: { sig: 'map(function, *iterables)', de: 'Wendet eine Funktion auf jedes Element an.' },
      filter: 'Behält die Elemente, für die die Funktion wahr ist (`None`: die wahren Elemente).',
      type: 'Typ eines Werts, z. B. `<class \'int\'>`.',
      isinstance: 'Ist der Wert vom Typ (oder einem der Typen im Tupel)?',
      open: 'Öffnet eine Textdatei des Projekts, siehe [Dateien](#dateien).',
      chr: 'Zeichen zu einer Unicode-Nummer.',
      ord: 'Unicode-Nummer eines Zeichens.',
      divmod: 'Ganzzahliger Quotient und Rest als Tupel.',
      pow: 'Potenz `base ** exp`.',
      hex: 'Text in Hexadezimal, z. B. `0xff`.',
      bin: 'Text in Binär, z. B. `0b101`.',
      any: 'Ist mindestens ein Element wahr?',
      all: 'Sind alle Elemente wahr?',
      slice: { sig: 'slice(stop) / slice(start, stop, step=None)', de: 'Slice-Objekt für `a[s]`.' },
      next: 'Nächstes Element eines Iterators (oder `default`).',
      iter: 'Iterator über eine Sammlung.',
      getattr: 'Attribut über seinen Namen lesen (mit `default`, falls es fehlt).',
      hasattr: 'Gibt es das Attribut?',
      setattr: 'Attribut über seinen Namen setzen.',
      vars: 'Attribute eines Objekts als Dict.',
      super: 'Zugriff auf die Methoden der Oberklasse (meist ohne Argumente: `super().__init__()`).',
    },
  },

  // ------------------------------------------------------------------ methods
  {
    id: 'methoden', title: 'Methoden der eingebauten Typen', nav: 'Methoden (str, list …)', group: G_BASE, source: 'methods',
    types: ['str', 'list', 'tuple', 'dict', 'set', 'frozenset'],
    intro: ['Methoden von Texten, Listen, Tupeln, Dicts und Mengen. Alle verhalten sich wie in CPython. `int` und `float` haben keine Methoden (z. B. fehlen `bit_length` und `is_integer`).'],
    example: {
      code: 'satz = "  Natter ist eine kleine Schlange  "\nwoerter = satz.strip().split()\nprint(woerter, "-".join(woerter).upper())\nprint(satz.count("e"), satz.find("klein"), satz.replace("klein", "groß").strip())\nzahlen = [3, 1, 2]\nzahlen.append(5)\nzahlen.sort()\nprint(zahlen, zahlen.index(5), zahlen.pop())\nalter = {"Ada": 36}\nalter.setdefault("Linus", 21)\nfor name, jahre in alter.items():\n    print(name, alter.get(name), jahre)',
    },
    notes: ['`str.encode`, `str.partition`, `str.maketrans`/`translate`, `str.removeprefix`/`removesuffix`, `list.sort` nur mit `key` und `reverse`, `dict.fromkeys` und `dict.popitem` fehlen, wenn sie unten nicht stehen.'],
    members: {
      str: {
        split: 'Teilt an `sep` (ohne: an Leerraum).', join: 'Verbindet die Texte einer Liste mit diesem Text dazwischen.',
        strip: 'Entfernt Leerraum (oder `chars`) an beiden Enden.', replace: 'Ersetzt `old` durch `new`.',
        find: 'Position von `sub` oder `-1`.', format: 'Setzt Werte in `{}` ein.', upper: 'In Großbuchstaben.', lower: 'In Kleinbuchstaben.',
        startswith: 'Beginnt der Text mit `prefix` (auch Tupel)?', isdigit: 'Nur Ziffern?', count: 'Wie oft kommt `sub` vor?',
      },
      list: {
        append: 'Hängt ein Element an.', insert: 'Fügt an Position `index` ein.', pop: 'Entfernt das letzte (oder das an `index`) und gibt es zurück.',
        remove: 'Entfernt das erste Element mit diesem Wert.', sort: 'Sortiert die Liste selbst (stabil), `key=`, `reverse=`.', index: 'Position des ersten Vorkommens.',
      },
      dict: { get: 'Wert zu `key` oder `default`.', items: 'Paare `(schlüssel, wert)`.', keys: 'Die Schlüssel.', values: 'Die Werte.', setdefault: 'Wert zu `key`; fehlt er, wird `default` eingetragen.', pop: 'Entfernt `key` und gibt den Wert zurück.', update: 'Übernimmt die Einträge eines anderen Dicts.' },
      set: { add: 'Fügt ein Element hinzu.', discard: 'Entfernt ein Element, falls vorhanden.', union: 'Vereinigung (auch `a | b`).', intersection: 'Schnitt (auch `a & b`).', difference: 'Differenz (auch `a - b`).' },
    },
  },

  // ------------------------------------------------------------------ files
  {
    id: 'dateien', title: 'Dateien, os und os.path', nav: 'Dateien (open, os)', group: G_BASE, source: 'module', module: ['_fileio', 'os', 'os.path'],
    labels: { _fileio: 'open() und Dateiobjekte' }, showMembers: ['TextFile'], hide: ['UnsupportedOperation'],
    intro: [
      'Ein Programm sieht die Dateien seines Projekts als Ordner. `open()` liest und schreibt Textdateien, `os` und `os.path` listen, prüfen, benennen um und löschen. Pfade sind relativ zum Projektordner (`/` ist der Projektordner).',
      'Die Dateien liegen im Speicher. Wo sie dauerhaft bleiben (Ordner, ZIP, Speicher des Browsers), entscheidet die Seite, die Natter einbettet: Sie bekommt jede Änderung gemeldet (`onFileChange`).',
    ],
    example: {
      code: 'with open("noten.txt", "w") as f:\n    f.write("Ada,1\\nLinus,2\\n")\n\nwith open("noten.txt") as f:\n    for zeile in f:\n        name, note = zeile.strip().split(",")\n        print(name, "hat eine", note)\n\nimport os\nprint(os.listdir("."), os.path.getsize("noten.txt"))',
      showFiles: true,
    },
    notes: [
      'Nur Textdateien (Modi `r`, `w`, `a`, `x`, mit `+`); `"rb"`/`"wb"` melden `ValueError`. Kodierung ist immer UTF-8, Zeilenenden werden zu `\\n`.',
      '`os.environ` ist leer, `os.getcwd()` ist `"/"`; `os.walk` geht, `os.path.getsize` zählt Zeichen.',
      '`pathlib`, `shutil`, `csv` und `sqlite3` fehlen (CSV mit `split(",")` lesen).',
    ],
    desc: {
      open: 'Öffnet eine Textdatei. `mode`: `"r"` lesen, `"w"` neu schreiben, `"a"` anhängen, `"x"` nur neu anlegen, mit `+` beides.',
      listdir: 'Namen in einem Ordner (sortiert).', exists: 'Gibt es die Datei oder den Ordner?', join: 'Setzt Pfadteile mit `/` zusammen.',
      remove: 'Löscht eine Datei.', mkdir: 'Legt einen Ordner an.', makedirs: 'Legt Ordner samt Zwischenordnern an.', rename: 'Benennt um oder verschiebt.',
      isfile: 'Ist es eine Datei?', isdir: 'Ist es ein Ordner?', splitext: 'Teilt in Name und Endung.', basename: 'Letzter Teil des Pfads.',
    },
    members: { TextFile: { read: 'Liest den Rest (oder `size` Zeichen).', readline: 'Liest eine Zeile samt `\\n`.', readlines: 'Alle Zeilen als Liste.', write: 'Schreibt einen Text, gibt die Zahl der Zeichen zurück.', close: 'Schließt die Datei (macht `with` von selbst).' } },
  },

  // ------------------------------------------------------------------ stdlib
  {
    id: 'math', title: 'math', group: G_STD, source: 'module', module: 'math', imports: 'import math',
    intro: ['Alle Funktionen von `math`, die in der Schule vorkommen. Sie rechnen auf jedem Gerät gleich: `sin`, `exp`, `log` … sind in Natter selbst geschrieben (nach fdlibm, `hypot` und `dist` exakt gerundet), statt die Funktionen des Browsers zu nehmen, die je nach Gerät in der letzten Stelle abweichen.'],
    example: { code: 'import math\nprint(math.sqrt(2), math.pi)\nprint(math.sin(math.radians(30)), math.floor(-2.5), math.ceil(2.1))\nprint(math.gcd(12, 18), math.factorial(10), math.comb(49, 6))\nprint(math.hypot(3, 4), math.log(8, 2), math.isclose(0.1 + 0.2, 0.3))' },
    notes: ['Ergebnisse stimmen mit CPython überein (bis auf seltene Abweichungen in der letzten Stelle bei Funktionen, die CPython von der C-Bibliothek nimmt).'],
    desc: {
      sqrt: { sig: 'sqrt(x)', de: 'Quadratwurzel.' }, sin: { sig: 'sin(x)', de: 'Sinus (Bogenmaß).' }, cos: { sig: 'cos(x)', de: 'Kosinus (Bogenmaß).' }, tan: { sig: 'tan(x)', de: 'Tangens (Bogenmaß).' },
      asin: { sig: 'asin(x)', de: 'Arkussinus.' }, acos: { sig: 'acos(x)', de: 'Arkuskosinus.' }, atan: { sig: 'atan(x)', de: 'Arkustangens.' }, atan2: 'Winkel des Punkts (x, y), beachtet den Quadranten.',
      exp: { sig: 'exp(x)', de: 'e hoch x.' }, log: 'Natürlicher Logarithmus oder zur Basis `base`.', log10: { sig: 'log10(x)', de: 'Zehnerlogarithmus.' }, log2: { sig: 'log2(x)', de: 'Zweierlogarithmus.' },
      pow: 'Potenz als Kommazahl.', floor: { sig: 'floor(x)', de: 'Abrunden zur ganzen Zahl.' }, ceil: { sig: 'ceil(x)', de: 'Aufrunden zur ganzen Zahl.' }, trunc: { sig: 'trunc(x)', de: 'Nachkommastellen abschneiden.' },
      degrees: { sig: 'degrees(x)', de: 'Bogenmaß in Grad.' }, radians: { sig: 'radians(x)', de: 'Grad in Bogenmaß.' }, hypot: { sig: 'hypot(*coordinates)', de: 'Länge des Vektors (Pythagoras), exakt gerundet.' },
      dist: 'Abstand zweier Punkte.', gcd: { sig: 'gcd(*integers)', de: 'Größter gemeinsamer Teiler.' }, lcm: { sig: 'lcm(*integers)', de: 'Kleinstes gemeinsames Vielfaches.' }, factorial: 'Fakultät n!.',
      comb: 'Anzahl der Möglichkeiten, k aus n zu wählen.', isqrt: 'Ganzzahlige Wurzel.', isclose: 'Sind zwei Kommazahlen fast gleich?', fabs: { sig: 'fabs(x)', de: 'Betrag als Kommazahl.' },
      pi: 'Die Kreiszahl π.', e: 'Die eulersche Zahl.', inf: 'Unendlich.',
    },
  },
  {
    id: 'random', title: 'random', group: G_STD, source: 'module', module: 'random', imports: 'import random',
    intro: ['Zufallszahlen aus dem eigenen Generator der VM. Ohne Startwert kommt er aus dem sicheren Zufall des Browsers, jeder Lauf ist anders; mit `random.seed(…)` oder einem festen Startwert der Seite ist jeder Lauf gleich.'],
    example: { code: 'import random\nrandom.seed(7)\nprint(random.randint(1, 6), random.choice(["Stein", "Schere", "Papier"]))\nkarten = list(range(1, 11))\nrandom.shuffle(karten)\nprint(karten, random.sample(karten, 3))\nprint(round(random.random(), 3), round(random.uniform(1, 2), 3))' },
    notes: ['Der Generator ist ein anderer als in CPython (sfc32 statt Mersenne Twister): Derselbe Startwert ergibt in Natter immer dieselben Zahlen, aber nicht dieselben wie in CPython. (`numpy.random` dagegen liefert genau die Zahlen von numpy.)'],
    desc: {
      random: 'Kommazahl 0 ≤ x < 1.', randint: 'Ganze Zahl von `a` bis einschließlich `b`.', randrange: 'Zufälliges Element von `range(start, stop, step)`.',
      choice: 'Ein zufälliges Element.', choices: '`k` Elemente mit Zurücklegen, optional gewichtet.', sample: '`k` verschiedene Elemente ohne Zurücklegen.',
      shuffle: 'Mischt eine Liste an Ort und Stelle.', uniform: 'Kommazahl zwischen `a` und `b`.', gauss: 'Normalverteilt mit Mittelwert `mu` und Streuung `sigma`.', seed: 'Setzt den Startwert (Zahl oder Text; `None`: zufällig).',
    },
  },
  {
    id: 'time', title: 'time', group: G_STD, source: 'module', module: 'time', imports: 'import time',
    intro: ['Uhr und Warten. `time.sleep()` hält nur das Programm an, nie die Seite. In der Seite ist die Uhr echt; in Testläufen ohne Seite läuft eine virtuelle Uhr, `sleep` kostet dort keine Zeit.'],
    example: { code: 'import time\nstart = time.perf_counter()\nfor i in range(3, 0, -1):\n    print(i)\n    time.sleep(0.5)\nprint("Los!", round(time.perf_counter() - start, 1), "Sekunden")' },
    notes: ['Zeitzone: `localtime` beachtet den Versatz des Browsers, `timezone`/`tzname` sind fest `0`/`"UTC"`. `strftime` kennt nur englische Namen (`%A` → `Friday`).'],
    desc: {
      time: { sig: 'time()', de: 'Sekunden seit 1970 als Kommazahl.' }, sleep: 'Wartet `secs` Sekunden (das Programm, nicht die Seite).', perf_counter: { sig: 'perf_counter()', de: 'Genaue Uhr für Zeitmessungen.' },
      localtime: 'Datum und Uhrzeit als Tupel.', strftime: 'Zeit als Text, z. B. `"%H:%M"`.',
    },
  },
  {
    id: 'datetime', title: 'datetime', group: G_STD, source: 'module', module: 'datetime', imports: 'import datetime', showMembers: ['date', 'datetime', 'timedelta', 'time'],
    intro: ['Datum, Uhrzeit, Zeitspannen und feste Zeitzonen, gerechnet im gregorianischen Kalender wie CPython.'],
    example: { code: 'from datetime import date, datetime, timedelta\nferien = date(2025, 7, 24)\nheute = date(2025, 6, 2)\nprint((ferien - heute).days, "Tage bis zu den Ferien")\nprint(ferien.strftime("%d.%m.%Y"), ferien.weekday(), ferien + timedelta(weeks=6))\nprint(datetime(2025, 6, 2, 8, 15).isoformat())' },
    notes: ['`datetime.now()` nimmt die Uhr der Seite (in Testläufen die virtuelle Uhr: 1. 1. 2000). Monats- und Tagesnamen bei `strftime` nur auf Englisch, keine Zeitzonen-Datenbank (`zoneinfo` fehlt), nur `timezone(timedelta(…))`.'],
    desc: { date: 'Ein Datum (Jahr, Monat, Tag).', datetime: 'Datum mit Uhrzeit.', timedelta: 'Zeitspanne; Datum ± Zeitspanne ergibt ein Datum.', time: 'Uhrzeit ohne Datum.', timezone: 'Feste Zeitzone mit Versatz.' },
  },
  {
    id: 'json', title: 'json', group: G_STD, source: 'module', module: 'json', imports: 'import json',
    intro: ['JSON lesen und schreiben, mit derselben Formatierung wie CPython (`indent`, `sort_keys`, `ensure_ascii`, `separators`).'],
    example: { code: 'import json\ndaten = {"name": "Ada", "noten": [1, 2.5], "aktiv": True, "lehrer": None}\ntext = json.dumps(daten, indent=2, ensure_ascii=False)\nprint(text)\nprint(json.loads(text)["noten"][1])' },
    desc: { dumps: 'Python-Wert → JSON-Text.', loads: 'JSON-Text → Python-Wert.', dump: 'In eine geöffnete Datei schreiben.', load: 'Aus einer geöffneten Datei lesen.' },
  },
  {
    id: 'statistics', title: 'statistics', group: G_STD, source: 'module', module: 'statistics', imports: 'import statistics',
    intro: ['Mittelwert, Median, Modus, Varianz und Standardabweichung.'],
    example: { code: 'import statistics as st\nnoten = [2, 3, 1, 2, 4, 2]\nprint(st.mean(noten), st.median(noten), st.mode(noten))\nprint(round(st.stdev(noten), 3), st.multimode([1, 1, 2, 2]))' },
    notes: ['Rechnet mit Kommazahlen; `Fraction`/`Decimal` gibt es nicht. `quantiles`, `correlation` und `linear_regression` fehlen (siehe numpy).'],
    desc: { mean: 'Arithmetisches Mittel.', median: 'Median (Mitte der sortierten Werte).', mode: 'Häufigster Wert.', stdev: 'Standardabweichung der Stichprobe.', pstdev: 'Standardabweichung der Grundgesamtheit.', variance: 'Varianz der Stichprobe.' },
  },
  {
    id: 'collections', title: 'collections', group: G_STD, source: 'module', module: 'collections', imports: 'import collections', showMembers: true, inherited: false,
    intro: ['`Counter`, `defaultdict`, `deque`, `OrderedDict` und `namedtuple`.'],
    example: { code: 'from collections import Counter, defaultdict, deque, namedtuple\nprint(Counter("abrakadabra").most_common(2))\ngruppen = defaultdict(list)\nfor w in ["Apfel", "Birne", "Ananas"]:\n    gruppen[w[0]].append(w)\nprint(dict(gruppen))\nschlange = deque([1, 2, 3], maxlen=3)\nschlange.append(4)\nprint(schlange)\nPunkt = namedtuple("Punkt", "x y")\nprint(Punkt(2, 3).x)' },
    notes: ['Die Klassen sind in Python geschrieben und keine Unterklassen von `dict`: `isinstance(Counter(), dict)` ist `False`. `ChainMap` und `UserDict` fehlen.'],
    desc: { Counter: 'Zählt Elemente.', defaultdict: 'Dict, das fehlende Schlüssel mit `default_factory()` anlegt.', deque: 'Schlange mit schnellem Anfügen und Entnehmen an beiden Enden.', OrderedDict: 'Dict, das seine Reihenfolge ändern kann.', namedtuple: 'Tupel-Klasse mit benannten Feldern.' },
  },
  {
    id: 'itertools', title: 'itertools', group: G_STD, source: 'module', module: 'itertools', imports: 'import itertools',
    intro: ['Bausteine für Schleifen: Kombinatorik, Endlosfolgen, Gruppieren.'],
    example: { code: 'import itertools\nprint(list(itertools.permutations("abc", 2)))\nprint(list(itertools.combinations(range(4), 2)))\nfor k, g in itertools.groupby("aaabbc"):\n    print(k, len(list(g)), end=" ")\nprint()\nprint(list(itertools.islice(itertools.count(10, 5), 4)))' },
    desc: { permutations: 'Alle Anordnungen.', combinations: 'Alle Auswahlen ohne Reihenfolge.', product: 'Kartesisches Produkt.', groupby: 'Gruppen gleicher Nachbarn.', count: 'Endlos zählen.', cycle: 'Endlos wiederholen.', islice: 'Ausschnitt eines Iterators.', accumulate: 'Laufende Summen (oder andere Funktion).', chain: 'Folgen hintereinander.' },
  },
  {
    id: 'functools', title: 'functools', group: G_STD, source: 'module', module: 'functools', imports: 'import functools',
    intro: ['`reduce`, `partial`, `lru_cache`/`cache`, `wraps`, `cmp_to_key`, `total_ordering`.'],
    example: { code: 'from functools import lru_cache, reduce, partial\n\n@lru_cache\ndef fib(n):\n    return n if n < 2 else fib(n - 1) + fib(n - 2)\n\nprint(fib(90))\nprint(reduce(lambda a, b: a * b, range(1, 6)))\nzweier = partial(int, base=2)\nprint(zweier("1011"))' },
    desc: { reduce: 'Fasst eine Folge mit einer Funktion zu einem Wert zusammen.', lru_cache: 'Merkt sich Ergebnisse einer Funktion (Dekorator).', cache: 'Wie `lru_cache` ohne Grenze.', partial: 'Funktion mit schon festgelegten Argumenten.' },
  },
  {
    id: 'string', title: 'string', group: G_STD, source: 'module', module: 'string', imports: 'import string',
    intro: ['Zeichenklassen als Texte und `capwords`.'],
    example: { code: 'import string\nprint(string.ascii_uppercase)\nprint(string.capwords("hallo schöne welt"))\nprint(sum(1 for c in "Python 3.12!" if c in string.digits))' },
    notes: ['`Template` und `Formatter` fehlen.'],
  },
  {
    id: 'copy', title: 'copy', group: G_STD, source: 'module', module: 'copy', imports: 'import copy',
    intro: ['Flache und tiefe Kopien von Listen, Dicts, Mengen und eigenen Objekten (beachtet `__copy__`/`__deepcopy__`).'],
    example: { code: 'import copy\nfeld = [[0, 0], [0, 0]]\nflach = copy.copy(feld)\ntief = copy.deepcopy(feld)\nfeld[0][0] = 9\nprint(flach[0][0], tief[0][0])' },
    desc: { copy: 'Flache Kopie: die Elemente selbst werden geteilt.', deepcopy: 'Tiefe Kopie: auch alle Elemente werden kopiert.' },
  },
  {
    id: 'sys', title: 'sys', group: G_STD, source: 'module', module: 'sys', imports: 'import sys',
    intro: ['Die Teile von `sys`, die Schulprogramme brauchen: `exit`, `stdout`/`stderr`/`stdin`, `argv`, Versionsangaben.'],
    example: { code: 'import sys\nprint(sys.version_info[:2], sys.platform)\nsys.stdout.write("ohne Zeilenumbruch")\nprint()\nif len(sys.argv) < 2:\n    print("Keine Argumente, Ende.")\n    sys.exit()\nprint("nie erreicht")' },
    notes: ['`setrecursionlimit` hat keine Wirkung (die Grenze ist 1000), `getsizeof` liefert immer 64, `sys.modules` und `sys.path` sind leer.'],
    desc: { exit: 'Beendet das Programm (`SystemExit`).', stdout: 'Standardausgabe (`write`, `flush`).', stderr: 'Fehlerausgabe.', stdin: 'Eingabe (`readline` fragt wie `input`).' },
  },
  {
    id: 're', title: 're', group: G_STD, source: 'module', module: 're', imports: 'import re', showMembers: ['Match', 'Pattern'],
    intro: ['Reguläre Ausdrücke mit der Syntax von Python (benannte Gruppen `(?P<name>…)`, `\\A`, `\\Z`, Lookbehind, Flags, ausführlicher Modus). Positionen zählen in Zeichen wie in Python.'],
    example: { code: 'import re\ntext = "Ada: 0171-555 12, Linus: 030 1234"\nprint(re.findall(r"\\d+", text))\nm = re.search(r"(?P<name>\\w+): (?P<nr>[\\d -]+)", text)\nprint(m.group("name"), m.span())\nprint(re.sub(r"\\s+", " ", "viel    zu   viel Platz"))\nprint(re.split(r"[,:]\\s*", text))' },
    notes: ['Läuft auf der Regex-Maschine des Browsers: Possessive Quantoren, atomare Gruppen und `\\G` fehlen; bei extrem rückverfolgenden Mustern kann es langsam werden.'],
    desc: { search: 'Erste Fundstelle irgendwo im Text (oder `None`).', match: 'Fundstelle nur am Anfang.', fullmatch: 'Passt das Muster auf den ganzen Text?', findall: 'Alle Fundstellen als Liste.', finditer: 'Alle Fundstellen als `Match`-Objekte.', sub: 'Ersetzt Fundstellen.', split: 'Teilt an den Fundstellen.', compile: 'Übersetztes Muster zum mehrfachen Gebrauch.' },
  },
  {
    id: 'pprint', title: 'pprint', group: G_STD, source: 'module', module: 'pprint', imports: 'import pprint',
    intro: ['Verschachtelte Daten übersichtlich ausgeben, mit denselben Umbruchregeln wie CPython.'],
    example: { code: 'from pprint import pprint\nschule = {"klassen": {"7a": ["Ada", "Linus", "Grace"], "7b": ["Alan", "Barbara"]}, "raeume": list(range(101, 112))}\npprint(schule, width=50)' },
  },
  {
    id: 'textwrap', title: 'textwrap', group: G_STD, source: 'module', module: 'textwrap', imports: 'import textwrap',
    intro: ['Texte umbrechen, kürzen, einrücken.'],
    example: { code: 'import textwrap\nsatz = "Natter ist ein kleiner Python-Interpreter für den Unterricht im Browser."\nprint(textwrap.fill(satz, width=30))\nprint(textwrap.shorten(satz, width=30))\nprint(textwrap.indent("a\\nb", "> "))' },
  },

  // ------------------------------------------------------------------ drawing and games
  {
    id: 'turtle', title: 'turtle', group: G_DRAW, source: 'module', module: 'turtle', imports: 'import turtle', showMembers: ['Turtle', 'Screen'], sigFrom: ['Turtle', 'Screen'],
    hide: ['TNavigator', 'RawPen', 'Pen', 'ScrolledCanvas', 'Shape', 'Vec2D'],
    intro: ['Schildkrötengrafik wie in CPython: dieselben Formeln, also dieselben Positionen und Winkel. Die Seite zeichnet (Ursprung in der Mitte, y nach oben), animiert nach `speed()` und schickt Tasten, Klicks und Zeitgeber an `mainloop()`.'],
    example: {
      code: 'import turtle\nt = turtle.Turtle()\nt.speed(0)\nt.color("darkgreen", "lightgreen")\nt.begin_fill()\nfor i in range(5):\n    t.forward(150)\n    t.right(144)\nt.end_fill()\nt.penup()\nt.goto(0, -60)\nt.write("Stern", align="center", font=("Arial", 16, "bold"))\nprint(t.position(), t.heading())\nturtle.done()',
    },
    notes: [
      'Keine echte Tk-Leinwand: `getcanvas()`/`cv` liefern `None`; `bgpic` und eigene Formen über Bilddateien gehen nur, wenn die Seite das Bild kennt.',
      '`undo` nimmt nur Bewegungen zurück. Bildschirmgröße vor `setup()`: 960 × 810 wie CPython, verkleinert auf den Platz der Seite.',
    ],
    host: [
      'Tasten (Tk-Namen wie `Left`, `space`), Klicks und Antippen gehen an `onkey`/`onscreenclick`, sobald `listen()` und `mainloop()`/`done()` laufen; `exitonclick()` endet mit dem nächsten Klick.',
      '`textinput`/`numinput` öffnen einen Dialog. Die Schildkröte `turtle` ist ein Bild aus der Bildbibliothek, mit der Füllfarbe eingefärbt.',
    ],
    desc: {
      Turtle: 'Eine neue Schildkröte (mehrere sind möglich).', Screen: 'Die Zeichenfläche (Hintergrund, Größe, Ereignisse).',
      forward: 'Geht vorwärts.', back: 'Geht rückwärts.', left: 'Dreht nach links (Grad).', right: 'Dreht nach rechts (Grad).', goto: 'Geht zum Punkt (x, y).',
      penup: 'Stift heben: nichts zeichnen.', pendown: 'Stift senken: zeichnen.', pensize: 'Strichbreite.', color: 'Stift- und Füllfarbe (Namen, `#rrggbb` oder RGB).',
      circle: 'Kreis oder Kreisbogen mit Radius (links herum bei positivem Radius).', dot: 'Punkt mit Durchmesser `size`.', begin_fill: 'Beginnt eine Fläche.', end_fill: 'Füllt die Fläche seit `begin_fill`.',
      write: 'Schreibt Text an die Position.', speed: '1 (langsam) bis 10 (schnell), 0 = ohne Animation.', setheading: 'Blickrichtung in Grad (0 = rechts).', home: 'Zurück zur Mitte, Blick nach rechts.',
      shape: 'Form: `turtle`, `arrow`, `circle`, `square`, `triangle`, `classic`.', hideturtle: 'Schildkröte ausblenden.', stamp: 'Abdruck der Form hinterlassen.',
      bgcolor: 'Hintergrundfarbe.', tracer: '`tracer(0)` zeichnet erst bei `update()` (schnell).', onkey: 'Funktion für eine Taste.', onscreenclick: 'Funktion für Klicks (bekommt x, y).',
      ontimer: 'Funktion nach `t` Millisekunden.', mainloop: 'Wartet auf Ereignisse bis zum Ende.', done: 'Wie `mainloop`.', setup: 'Fenstergröße.', setworldcoordinates: 'Eigenes Koordinatensystem.',
      textinput: 'Fragt einen Text ab (Dialog).', numinput: 'Fragt eine Zahl ab (Dialog).', clear: 'Löscht die Zeichnung der Schildkröte.', reset: 'Löscht und setzt zurück.',
    },
  },
  {
    id: 'kara', title: 'Kara, der Marienkäfer', nav: 'kara', group: G_DRAW, source: 'kara', imports: 'import kara  (oder ohne Import)',
    intro: [
      'Kara läuft auf einer Wiese aus Feldern, sammelt Blaubeeren, weicht Bäumen aus und schiebt Pilze. Die Befehle heißen wie im Buch (`move`, `turnLeft`, `treeFront` …) und gehen mit `import kara` (`kara.move()`), mit `from kara import *` oder ganz ohne Import: Beginnt ein Programm mit `world("""…""")`, sind die Befehle schon da.',
      'Die Wiese ist ein Bild aus Zeichen, eine Textzeile je Reihe. Kara schaut am Anfang nach rechts. Zeilen dürfen verschieden lang sein (fehlende Felder sind leer).',
    ],
    example: {
      run: 'kara', title: 'Beeren auf einer Reihe einsammeln',
      code: 'world("""\n########\n#@ . ..#\n########\n""")\n\nwhile not treeFront():\n    if onBerry():\n        removeBerry()\n    move()\nif onBerry():\n    removeBerry()',
    },
    notes: [
      '`treeFront()`, `treeLeft()` und `treeRight()` sind auch am Rand der Wiese wahr (der Rand wirkt wie ein Baum).',
      'Pilze lassen sich wie Kisten in Sokoban schieben: `move()` gegen einen Pilz schiebt ihn ein Feld weiter, wenn dahinter frei ist (kein Baum, kein Pilz, kein Rand). Ziel ist meist, alle Pilze auf Beeren zu schieben (`*`).',
    ],
    host: ['Die Seite zeichnet mit den Bildern des Pakets `kara` der Bildbibliothek und animiert jeden Schritt (Standard 0,3 s). Fehlt die Bibliothek, zeichnet sie einfache Formen.'],
    desc: {
      world: 'Legt die Wiese fest (Zeichen siehe unten). Muss vor allen anderen Befehlen kommen.', move: 'Ein Feld vorwärts (schiebt einen Pilz).', turnLeft: 'Vierteldrehung nach links.', turnRight: 'Vierteldrehung nach rechts.',
      putBerry: 'Legt eine Blaubeere auf das Feld.', removeBerry: 'Nimmt die Blaubeere vom Feld.', onBerry: 'Steht Kara auf einer Blaubeere?', treeFront: 'Ist vorne ein Baum (oder der Rand)?',
      treeLeft: 'Ist links ein Baum (oder der Rand)?', treeRight: 'Ist rechts ein Baum (oder der Rand)?', mushroomFront: 'Ist vorne ein Pilz?',
    },
    chars: { '#': 'Baum', '.': 'Blaubeere', '$': 'Pilz', '*': 'Pilz auf einer Blaubeere', '@': 'Kara (schaut nach rechts)', '+': 'Kara auf einer Blaubeere', ' ': 'leeres Feld' },
  },
  {
    id: 'pgzero', title: 'Pygame Zero', group: G_DRAW, source: 'pgzero', imports: 'import pgzrun  (oder ohne Import)',
    intro: [
      'Spiele mit der API von [Pygame Zero 1.2](https://pygame-zero.readthedocs.io/): `draw()` und `update()` schreiben, `Actor` bewegen, Tasten abfragen, Klänge abspielen. Die Spiellogik rechnet wie das echte Pygame Zero (verglichen mit pgzero 1.2.1 und pygame 2); dazu kommen die beliebten Erweiterungen aus pgzhelper (`scale`, `flip_x`, `images`/`animate`, `move_towards` …).',
      'Ein Spiel startet wie `pgzrun spiel.py`: Hat das Programm `def draw()` oder `def update()` (oder `WIDTH`/`HEIGHT` und `Actor`/`screen`), kennt es alle Namen unten ohne Import. Mit `import pgzrun` und `pgzrun.go()` am Ende geht es genauso; Code nach `go()` läuft, wenn das Fenster geschlossen wird.',
      'Fenster: `WIDTH`, `HEIGHT` (Standard 800 × 600) und `TITLE` als globale Variablen. Bilder werden über ihren Namen ohne Endung gefunden: zuerst im Projektordner `images/` (Klänge `sounds/`, Musik `music/`, Schriften `fonts/`), dann in der [Bildbibliothek](#bilder).',
    ],
    example: {
      run: 'pgzero', title: 'Münzen sammeln',
      code: 'import random\n\nWIDTH = 480\nHEIGHT = 320\nTITLE = "Münzjagd"\n\nheldin = Actor("heroine_idle_1", (240, 260))\nmuenze = Actor("pf_coin_1", (100, 80))\npunkte = 0\n\ndef draw():\n    screen.fill("skyblue")\n    heldin.draw()\n    muenze.draw()\n    screen.draw.text("Punkte: " + str(punkte), (10, 10), fontsize=32, color="white")\n\ndef update():\n    global punkte\n    if keyboard.left:\n        heldin.x -= 5\n    if keyboard.right:\n        heldin.x += 5\n    muenze.y += 2\n    if heldin.colliderect(muenze):\n        punkte += 1\n        sounds.coin.play()\n        neu()\n    elif muenze.top > HEIGHT:\n        neu()\n\ndef neu():\n    muenze.pos = (random.randint(20, WIDTH - 20), -20)\n\ndef on_mouse_down(pos):\n    heldin.x = pos[0]',
      note: 'Die Bilder `heroine_idle_1`, `pf_coin_1` und der Klang `coin` kommen aus der Bildbibliothek, ohne Dateien hochzuladen.',
    },
    notes: [
      '`keys`, `keymods` und `mouse` sind einfache Zahlen statt IntEnum (`print` gleich, `repr` anders).',
      'Rückrufe von `clock` bleiben am Leben (Pygame Zero vergisst `lambda`-Rückrufe); ein Fehler in einem Rückruf hält das Spiel mit Fehlermeldung an.',
      'Unterordner von Bildern nur über `images.load("ordner/name")`. Es fehlen: `music.get_pos`, Pixel-, Kreis- und OBB-Kollisionen und Spritesheets von pgzhelper, `screen.surface` (immer `None`).',
    ],
    host: [
      'Fester Takt: 60 Bilder pro Sekunde (`update(dt)` mit `dt = 1/60`), höchstens 4 Bilder werden nachgeholt; ein verdeckter Tab pausiert. Braucht ein Bild zu viele Befehle (Endlosschleife), endet das Spiel mit der Zeile der Schleife.',
      'Ton erst nach der ersten Berührung, dem ersten Klick oder Tastendruck (Regel der Browser); bis dahin zeigt das Spiel „Ton an: tippen oder klicken“.',
      'Auf dem Handy wirkt ein Finger wie die linke Maustaste; die Seite kann eine Knopfleiste (◀ ▶ ▲ ▼, Sprung = Leertaste) einblenden.',
    ],
    hooks: {
      draw: { de: 'Zeichnet das Bild. Läuft nach `update` und nach Ereignissen; die Leinwand wird nicht von selbst gelöscht (`screen.clear()` oder `screen.fill()`).' },
      update: { params: ['dt'], de: 'Spiellogik, 60-mal pro Sekunde. `dt` (vergangene Sekunden) darf fehlen.' },
      on_mouse_down: { de: 'Maustaste gedrückt oder Finger aufgesetzt; `button` ist `mouse.LEFT`, `mouse.RIGHT` …' },
      on_mouse_up: { de: 'Maustaste losgelassen.' },
      on_mouse_move: { de: 'Maus bewegt; `rel` ist die Verschiebung, `buttons` die gedrückten Tasten.' },
      on_key_down: { de: 'Taste gedrückt; `key` ist z. B. `keys.SPACE`, `unicode` das Zeichen.' },
      on_key_up: { de: 'Taste losgelassen.' },
      on_music_end: { de: 'Ein Musikstück ist zu Ende.' },
    },
    desc: {
      Actor: 'Eine Spielfigur aus einem Bild: Position (`x`, `y`, `pos`, `center`, `topleft` …), `angle`, `scale`, Kollisionen, `draw()`.',
      Rect: 'Rechteck mit ganzen Zahlen wie `pygame.Rect`.', ZRect: 'Rechteck mit Kommazahlen.',
      screen: 'Die Leinwand: `fill`, `clear`, `blit` und die Zeichenbefehle in `screen.draw`.',
      keyboard: 'Gedrückte Tasten: `keyboard.left`, `keyboard.space`, `keyboard.a`, `keyboard[keys.LEFT]`.',
      keys: 'Tastencodes (`keys.LEFT`, `keys.SPACE`, `keys.A` …).', keymods: 'Umschalttasten (`keymods.SHIFT` …).', mouse: 'Maustasten (`mouse.LEFT` …).',
      sounds: 'Klänge über ihren Namen: `sounds.coin.play()`.', music: 'Hintergrundmusik: `music.play("name")`.', images: 'Bilder über ihren Namen: `images.pf_coin_1` (für `blit` und Größen).',
      clock: 'Zeitgeber: `clock.schedule(f, 2.0)`, `clock.schedule_interval(f, 1.0)`.', animate: 'Animiert Attribute: `animate(figur, pos=(100, 50), duration=1, tween="bounce_end")`.',
      tone: 'Erzeugt Töne: `tone.play("A4", 0.5)`.', exit: 'Beendet das Spiel.',
    },
    members: {
      Actor: {
        draw: 'Zeichnet die Figur.', colliderect: 'Überlappt sie ein Rechteck oder einen anderen Actor?', collidepoint: 'Liegt der Punkt in der Figur?',
        distance_to: 'Abstand zu einem Punkt oder Actor.', angle_to: 'Winkel zu einem Punkt oder Actor (Grad, gegen den Uhrzeigersinn).',
        image: 'Name des Bilds (zuweisen wechselt das Bild).', angle: 'Drehung in Grad.', pos: 'Position des Ankers (Standard: Mitte).',
        scale: 'Vergrößerung (pgzhelper).', opacity: 'Deckkraft 0 bis 1.', images: 'Liste von Bildnamen für `next_image()`/`animate()` (pgzhelper).',
        move_towards: 'Bewegt sich um `dist` auf das Ziel zu (pgzhelper).', point_towards: 'Dreht sich zum Ziel (pgzhelper).',
      },
      screen: { fill: 'Füllt mit einer Farbe (Name, `(r, g, b)` oder `#rrggbb`), mit `gcolor` als Verlauf.', clear: 'Macht die Leinwand schwarz.', blit: 'Zeichnet ein Bild an `pos` (linke obere Ecke).' },
      'screen.draw': {
        text: 'Text an `pos` (oder `center=`, `topright=` …) mit `fontsize`, `color`, `width`, `align`, `owidth`/`ocolor` (Umriss), `shadow`, `gcolor`, `alpha`, `angle` wie ptext.',
        textbox: 'Text so groß wie möglich in ein Rechteck.', line: 'Linie von `start` nach `end`.', circle: 'Kreisumriss.', filled_circle: 'Gefüllter Kreis.', rect: 'Rechteckumriss.', filled_rect: 'Gefülltes Rechteck.',
      },
      Sound: { play: 'Spielt den Klang (`loops`, `maxtime`, `fade_ms`).', stop: 'Hält den Klang an.', set_volume: 'Lautstärke 0 bis 1.' },
      music: { play: 'Spielt ein Stück in Schleife.', play_once: 'Spielt ein Stück einmal.', stop: 'Hält die Musik an.', set_volume: 'Lautstärke 0 bis 1.', fadeout: 'Blendet über `seconds` aus.' },
    },
    subObjects: [['screen.draw', 'screen.draw'], ['Sound', null, ['pgzero_audio', 'Sound']]],
  },
  {
    id: 'bilder', title: 'Bildbibliothek', group: G_DRAW, source: 'assets',
    intro: [
      'Rund {images} Bilder in einem einheitlichen Stil und kurze Klänge, frei verwendbar (CC0). Ein Programm nennt nur den Namen, ohne Dateien hochzuladen: `Actor("heroine_run_1")`, `screen.blit("pf_grass_mid", (0, 416))`, `sounds.coin.play()`. Kara und die Schildkröte von turtle nutzen dieselbe Bibliothek.',
      'Geladen wird nur, was im Programm vorkommt. Ein Text wie `"heroine_run_" + str(i)` lädt alle Bilder, deren Name so beginnt. Eine eigene Datei im Projektordner `images/` mit demselben Namen gewinnt. Alle Bilder mit Vorschau zeigt die [Galerie auf python.jetzt](https://python.jetzt/bilder.html); die Pakete stehen in `packages/assets` (`gametypes.json`, `catalog.json`).',
    ],
    notesTitle: 'Namen',
    notes: ['Klein, ASCII, eindeutig über alle Pakete. Animationen enden auf `_1`, `_2` … (`heroine_run_1` bis `heroine_run_8`), Figuren schauen nach rechts, außer der Name sagt `_left`.'],
  },

  // ------------------------------------------------------------------ forms, data, net
  {
    id: 'guizero', title: 'Formulare mit guizero', nav: 'guizero', group: G_DATA, source: 'module', module: 'guizero', imports: 'from guizero import App, Text, PushButton',
    showMembers: ['App', 'Window', 'Box', 'TitleBox', 'Text', 'TextBox', 'PushButton', 'CheckBox', 'ButtonGroup', 'Combo', 'ListBox', 'Slider', 'Picture', 'Waffle', 'Drawing', 'MenuBar'], inherited: false,
    hide: ['EventData', 'EventCallback', 'EventManager', 'ScheduleMixin', 'DestroyMixin', 'EnableMixin', 'FocusMixin', 'DisplayMixin', 'TextMixin', 'ColorMixin', 'SizeMixin', 'LayoutMixin', 'EventsMixin', 'Base', 'Component', 'Container', 'BaseWindow', 'Widget', 'TextWidget', 'ContainerWidget', 'ContainerTextWidget', 'ListBoxWidget', 'ListBoxScrollbar', 'WafflePixel', 'RadioButton', 'utilities', 'system_config', 'TclError'],
    common: { title: 'Alle Widgets haben außerdem', classes: ['ScheduleMixin', 'DestroyMixin', 'EnableMixin', 'FocusMixin', 'DisplayMixin', 'ColorMixin', 'SizeMixin', 'LayoutMixin', 'EventsMixin', 'Component'] },
    intro: [
      'Fenster mit Knöpfen, Textfeldern und Listen über die API von [guizero 1.6](https://lawsie.github.io/guizero/). Programme laufen so, wie die Doku von guizero sie zeigt; Voreinstellungen, Warnungen und Fehlermeldungen entsprechen dem echten guizero.',
      'Die Seite zeichnet die Widgets als echte HTML-Elemente. Layout `auto` wie Tk `pack`, Layout `grid` als Gitter, das mit dem Inhalt wächst (`grid=[spalte, zeile]`, auch `[spalte, zeile, breite, höhe]`).',
    ],
    example: {
      run: 'forms', title: 'Zähler',
      code: 'from guizero import App, Text, PushButton, Box\n\napp = App(title="Zähler", width=240, height=160)\nanzeige = Text(app, text="0", size=40)\nknoepfe = Box(app, layout="grid")\n\ndef plus():\n    anzeige.value = int(anzeige.value) + 1\n\ndef null():\n    anzeige.value = 0\n\nPushButton(knoepfe, text="+1", command=plus, grid=[0, 0])\nPushButton(knoepfe, text="Null", command=null, grid=[1, 0])\napp.display()',
    },
    notes: [
      'Kein tkinter dahinter: `.tk` ist ein kleiner Ersatz, `add_tk_widget` geht nicht. Fehler in Rückruffunktionen beenden das Programm (Tk würde sie nur ausgeben).',
      'Bilder (`Picture`, `PushButton(image=…)`, `Drawing.image`) kommen aus den Projektdateien: PNG, GIF, JPEG, BMP, WebP, SVG.',
    ],
    host: [
      'Auf schmalen Bildschirmen füllen Fenster die Breite, mehrere Fenster werden zu Tabs. Größen: Text-Widgets in Zeichen und Zeilen, Container und Fenster in Pixeln (wie guizero).',
      'Dialoge (`info`, `yesno`, `question`, `select_file`, `select_color` …) liegen als Karte über den Fenstern; `select_file` zeigt die Dateien des Projekts. Zeitgeber (`after`, `repeat`) laufen in echter Zeit.',
    ],
    desc: {
      App: 'Das Hauptfenster; `display()` zeigt es und wartet auf Ereignisse.', Window: 'Ein weiteres Fenster.', Box: 'Unsichtbarer Container zum Gruppieren.', TitleBox: 'Container mit Rahmen und Titel.',
      Text: 'Ein Text (`value`).', TextBox: 'Eingabefeld (`value`, `multiline`, `hide_text` für Passwörter).', PushButton: 'Knopf; `command` wird beim Klick gerufen.', CheckBox: 'Kästchen zum Ankreuzen (`value` 0/1).',
      ButtonGroup: 'Auswahl aus Optionen (Radioknöpfe).', Combo: 'Aufklappliste.', ListBox: 'Liste, auch mit Mehrfachauswahl.', Slider: 'Schieberegler.', Picture: 'Ein Bild aus dem Projekt.',
      Waffle: 'Gitter aus Feldern, z. B. für Pixelbilder und Spiele.', Drawing: 'Zeichenfläche: Linien, Ovale, Rechtecke, Polygone, Text, Bilder.', MenuBar: 'Menüleiste.',
      info: 'Hinweis mit OK.', yesno: 'Frage mit Ja/Nein, gibt `True`/`False`.', question: 'Fragt einen Text ab.', select_file: 'Datei des Projekts wählen.', select_color: 'Farbe wählen.',
    },
  },
  {
    id: 'numpy', title: 'numpy', group: G_DATA, source: 'module', module: ['numpy', 'numpy.random', 'numpy.linalg'], imports: 'import numpy as np', showMembers: ['ndarray'],
    hide: ['float32', 'float16', 'double', 'int32', 'int16', 'int8', 'uint8', 'uint16', 'uint32', 'uint64', 'intp', 'bool_', 'float64', 'int64', 'dtype', 'random', 'linalg'],
    intro: [
      'Eine ehrliche Teilmenge von numpy 2: Arrays mit Broadcasting, Rechnen, Statistik, Sortieren, Zufall, etwas lineare Algebra. Was es gibt, gibt dieselben Ziffern aus wie numpy (verglichen mit numpy 2.5): Ausgabeformat, Statistik und `numpy.random` mit demselben Startwert.',
      'dtypes: `int64`, `float64`, `bool` und Texte. Slices und `.T` sind Sichten wie in numpy (Ändern ändert das Original), Masken- und Listen-Indizes liefern Kopien.',
    ],
    example: { code: 'import numpy as np\na = np.arange(1, 7).reshape(2, 3)\nprint(a)\nprint(a.sum(axis=0), a.mean(), a[a > 2])\nx = np.linspace(0, 1, 5)\nprint(x ** 2, np.round(np.sin(x), 3))\nrng = np.random.default_rng(42)\nprint(rng.integers(1, 7, size=5))' },
    notes: [
      'Ergebnisse ohne Achse (`a.sum()`, `a[0]`) sind Python-Zahlen, keine numpy-Skalare: `print` gleich, `repr` in Listen anders, `a.sum() / 0` ist `ZeroDivisionError`.',
      'Es fehlen: komplexe Zahlen, echte 32-bit-Typen (`int32`, `float32` werden 64 bit), Objekt- und strukturierte Arrays, mehrere Achsen auf einmal, `...` als Index, `out=`/`where=`, `np.fft`, `linalg.eig/svd/lstsq`, Datei-Ein/Ausgabe (`loadtxt`, `save`), `split`, `roll`, `pad`.',
      'Warnungen wie `RuntimeWarning: divide by zero` erscheinen einmal je Zeile in der Fehlerausgabe, das Programm läuft weiter (wie numpy).',
    ],
    desc: {
      array: 'Array aus einer (verschachtelten) Liste.', arange: 'Wie `range`, als Array (auch Kommazahlen).', linspace: '`num` gleichmäßig verteilte Werte von `start` bis `stop`.',
      zeros: 'Array voller Nullen.', ones: 'Array voller Einsen.', reshape: 'Neue Form, dieselben Daten.', where: 'Wählt elementweise aus `x` oder `y`.',
      sum: { sig: 'sum(a, axis=None, keepdims=False)', de: 'Summe (paarweise wie numpy, gleiche Ziffern).' }, mean: { sig: 'mean(a, axis=None)', de: 'Mittelwert.' }, std: { sig: 'std(a, axis=None, ddof=0)', de: 'Standardabweichung.' },
      sqrt: { sig: 'sqrt(x)', de: 'Wurzel je Element (korrekt gerundet).' }, sin: { sig: 'sin(x)', de: 'Sinus je Element.' }, sort: 'Sortierte Kopie (stabil).', unique: 'Sortierte verschiedene Werte, optional mit Anzahlen.',
      polyfit: 'Ausgleichspolynom vom Grad `deg`.', histogram: 'Häufigkeiten in Klassen.', dot: 'Skalarprodukt / Matrixprodukt (auch `a @ b`).',
      default_rng: 'Neuer Zufallsgenerator (PCG64) – mit Startwert dieselben Zahlen wie numpy.', seed: { sig: 'seed(seed)', de: 'Startwert des alten Generators (MT19937 wie numpy).' },
      rand: { sig: 'rand(d0, d1, …)', de: 'Gleichverteilte Zahlen in [0, 1).' }, randint: { sig: 'randint(low, high=None, size=None)', de: 'Ganze Zufallszahlen von `low` bis unter `high`.' }, normal: { sig: 'normal(loc=0.0, scale=1.0, size=None)', de: 'Normalverteilte Zahlen.' },
      solve: 'Löst das lineare Gleichungssystem `a x = b`.', det: 'Determinante.', inv: 'Inverse Matrix.',
    },
  },
  {
    id: 'pyplot', title: 'Diagramme mit matplotlib.pyplot', nav: 'matplotlib.pyplot', group: G_DATA, source: 'module', module: 'matplotlib.pyplot', imports: 'import matplotlib.pyplot as plt', showMembers: ['Axes', 'Figure'],
    intro: [
      'Funktionsgraphen, Punktwolken, Balken, Histogramme und Kreisdiagramme wie matplotlib 3: dieselben Achsen, Ticks, Farben, Legenden und Positionen. `plt.show()` zeigt das Diagramm als SVG in der Seite, das Programm läuft sofort weiter; `plt.savefig("bild.svg")` bietet es zum Herunterladen an.',
      'Auch die objektorientierte Form geht: `fig, ax = plt.subplots()`, `ax.plot(…)`, `axs[0, 1]`, `ax.set(title=…)`.',
    ],
    example: {
      run: 'plot', showOutput: false,
      code: 'import numpy as np\nimport matplotlib.pyplot as plt\n\nx = np.linspace(0, 2 * np.pi, 100)\nplt.plot(x, np.sin(x), label="sin")\nplt.plot(x, np.cos(x), "r--", label="cos")\nplt.title("Sinus und Kosinus")\nplt.xlabel("x")\nplt.legend()\nplt.grid(True)\nplt.show()',
      note: 'Das Bild unten hat Natter beim Erzeugen dieser Seite gezeichnet.',
    },
    notes: [
      'Immer SVG (auch bei `savefig("bild.png")` ist der Inhalt SVG). Es fehlen logarithmische Achsen, `imshow`, `contour`, `colorbar`, `boxplot`, Polar- und 3-D-Achsen, `twinx`, Colormaps (außer viridis bei `scatter(c=…)`), `rcParams`, Animationen; die Platzhalter unten melden `NotImplementedError` mit einem Tipp.',
      'Mathe in Texten nur einfach: `$x^2$`, `$t_0$`, griechische Buchstaben. `tight_layout()` tut nichts.',
    ],
    desc: {
      plot: { sig: 'plot(x, y, fmt="", **kwargs)', de: 'Linien und Punkte; Formatstrings wie `"r--o"`, `color`, `linewidth`, `marker`, `label`.' },
      scatter: { sig: 'scatter(x, y, s=None, c=None, **kwargs)', de: 'Punktwolke, Farbe und Größe je Punkt.' }, bar: { sig: 'bar(x, height, width=0.8, **kwargs)', de: 'Säulendiagramm, Kategorien als Texte.' },
      barh: { sig: 'barh(y, width, **kwargs)', de: 'Balkendiagramm (waagerecht).' }, hist: { sig: 'hist(x, bins=10, **kwargs)', de: 'Histogramm (`bins`, `density`, `cumulative`, `histtype`).' }, pie: { sig: 'pie(x, labels=None, autopct=None, **kwargs)', de: 'Kreisdiagramm.' },
      show: 'Zeigt die offenen Diagramme.', savefig: 'Speichert das Diagramm (als SVG).', title: 'Titel.', xlabel: 'Beschriftung der x-Achse.', ylabel: 'Beschriftung der y-Achse.',
      legend: 'Legende aus den `label`s (`loc="best"` wie matplotlib).', grid: 'Gitterlinien.', xlim: 'Bereich der x-Achse.', ylim: 'Bereich der y-Achse.', subplots: 'Figur mit einem Gitter von Achsen: `fig, axs = plt.subplots(2, 2)`.',
      figure: { sig: 'figure(figsize=(6.4, 4.8), dpi=100)', de: 'Neue Figur (640 × 480 Pixel als Standard).' }, text: 'Text an einer Stelle.', annotate: 'Text mit Pfeil.', axhline: 'Waagerechte Linie.', axvline: 'Senkrechte Linie.',
    },
  },
  {
    id: 'requests', title: 'requests und CORS', nav: 'requests', group: G_DATA, source: 'module', module: 'requests', imports: 'import requests', showMembers: ['Response', 'Session'],
    hide: ['exceptions', 'codes'],
    intro: [
      'Daten aus dem Netz holen wie mit dem Paket requests: `requests.get(url).json()`. Die Seite führt die Anfrage mit `fetch` aus, das Programm wartet so lange.',
      'Warum manche Adressen nicht gehen (CORS): Ein Browser lässt eine Webseite nur Antworten von Servern lesen, die das ausdrücklich erlauben (Kopfzeile `Access-Control-Allow-Origin`). Offene Daten-Schnittstellen wie Open-Meteo, Wikipedia oder viele JSON-APIs erlauben es, normale Webseiten meist nicht. Blockiert der Browser, meldet Natter `ConnectionError` mit genau dieser Erklärung. Abhilfe: eine Quelle mit CORS nehmen, die Daten als Datei ins Projekt legen oder das Programm auf dem eigenen Rechner mit CPython laufen lassen.',
    ],
    example: {
      run: 'http', showOutput: false, httpAnswer: '{"current_weather": {"temperature": 17.4, "windspeed": 9.2}}',
      code: 'import requests\n\nantwort = requests.get("https://api.open-meteo.com/v1/forecast", params={\n    "latitude": 52.52, "longitude": 13.41, "current_weather": "true"})\nantwort.raise_for_status()\nwetter = antwort.json()["current_weather"]\nprint("Berlin:", wetter["temperature"], "°C, Wind", wetter["windspeed"], "km/h")',
    },
    notes: [
      'Nur Text: `response.content` (Bytes), Dateien hochladen, Streaming und Cookies fehlen. Nur `http://` und `https://`; Zeitüberschreitung 30 s, wenn `timeout` fehlt.',
      'Kopfzeilen, die Browser verbieten (`User-Agent`, `Cookie` …), werden von ihnen still weggelassen.',
    ],
    desc: {
      get: 'GET-Anfrage; `params` werden an die Adresse gehängt.', post: 'POST-Anfrage mit Formulardaten (`data`) oder JSON (`json`).', request: 'Anfrage mit beliebiger Methode.',
      Response: 'Antwort: `status_code`, `ok`, `text`, `json()`, `headers`, `url`.', Session: 'Gemeinsame Kopfzeilen und Parameter für mehrere Anfragen.',
      ConnectionError: 'Server nicht erreichbar oder vom Browser blockiert (CORS).', HTTPError: 'Von `raise_for_status()` bei Status 400 bis 599.', Timeout: 'Keine Antwort in der Zeit.',
    },
    members: { Response: { json: 'Antworttext als JSON gelesen.', raise_for_status: 'Löst `HTTPError` aus, wenn der Status ein Fehler ist.', ok: 'Status unter 400?' } },
  },
];
