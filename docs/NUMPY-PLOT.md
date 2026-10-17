# numpy und matplotlib.pyplot (Teilmenge)

Natter bringt eine **ehrliche Teilmenge** von numpy und matplotlib.pyplot für den Unterricht mit: Arrays, Statistik, Zufall, Funktionsgraphen, Balken, Histogramme. Was es gibt, verhält sich wie numpy 2.x und matplotlib 3.x (verglichen mit numpy 2.5.4 und matplotlib 3.11.2); was fehlt, steht unten.

```python
import numpy as np
import matplotlib.pyplot as plt      # auch: from matplotlib import pyplot as plt

x = np.linspace(0, 2 * np.pi, 100)
plt.plot(x, np.sin(x), 'r--', label='sin')
plt.legend()
plt.show()                           # SVG an den Host
```

## Aufbau

| Teil | Datei | Aufgabe |
|---|---|---|
| `_np` (nativ) | `stdlib/numpy.js`, `npformat.js`, `nprandom.js`, `npziggurat.js` | Arrays, Rechnen, Ausgabe, Zufall |
| `numpy`, `numpy.random`, `numpy.linalg` | `stdlib/py/numpy.js` | Python-Schicht: Namen von numpy, `vectorize` u. a. |
| `_plot` (nativ) | `stdlib/plot.js` | Figuren, Achsen, Ticks, Legende, SVG |
| `matplotlib`, `matplotlib.pyplot` | `stdlib/py/pyplot.js` | Zustandsmaschine von pyplot (`plt.plot` → `gca().plot`) |

- `ndarray` ist eine eingebaute Klasse (`numpy.ndarray`); die Zahlen liegen in einem `Float64Array` mit Form, Schrittweiten und Versatz. Slices und `.T` sind **Sichten** wie in numpy (`b = a[1:3]; b[0] = 9` ändert `a`), Masken- und Listen-Indizes liefern Kopien.
- dtypes: `int64`, `float64`, `bool` und Texte (`<U5`). Ganze Zahlen sind bis 2^53 exakt; andere Namen (`int32`, `float32`, `uint8` …) werden als `int64`/`float64` angenommen.
- Ergebnisse ohne Achse (`a.sum()`, `a[0]`) sind **Python-Zahlen** (`int`, `float`, `bool`), keine numpy-Skalare. `print(x)` sieht gleich aus; nur `repr` in Listen unterscheidet sich (`[1, 2]` statt `[np.int64(1), np.int64(2)]`).
- Import mit Punkt: `import a.b`, `import a.b as c`, `from a import b` (lädt das Untermodul `a.b`) gehen jetzt allgemein (`vm.importModule`), auch `import os.path`.
- Neu in der Sprache: der Operator `@` und `@=` (`__matmul__`), und Vergleiche geben das Ergebnis von `__eq__`/`__lt__` … unverändert zurück (für Arrays ein Array statt `True`/`False`). `copy.copy`/`copy.deepcopy` beachten `__copy__`/`__deepcopy__`.

## Host-Schnittstelle für Diagramme

`plt.show()` hält das Programm einmal **pro offener Figur** an:

```js
task.wait = { kind: 'plot', svg: '<svg …>…</svg>', width: 640, height: 480 }
```

Der Host zeigt das SVG und setzt mit `vm.resume(task, null)` fort (sofort, oder erst, wenn das Fenster geschlossen wurde – das entscheidet der Host). Danach sind die Figuren geschlossen (wie in matplotlib). `plt.savefig("bild.png")` und `fig.savefig(…)` senden dasselbe mit `file: "bild.png"` und lassen die Figur offen; was der Host damit macht (Download, Datei im Projekt), ist seine Sache.

- **Größe:** `figsize` × `dpi` in Pixeln, Standard 6,4 × 4,8 Zoll bei 100 dpi = **640 × 480**. Das SVG hat `width`, `height` und `viewBox`, lässt sich also frei skalieren (`<div>` mit `innerHTML`, oder `<img src="data:image/svg+xml,…">`).
- **Schrift:** `font-family="DejaVu Sans, …, sans-serif"`. Die Textbreiten (Legende, Beschriftungen) sind mit DejaVu Sans gerechnet; mit dieser Webfont sieht das Bild am genauesten aus.
- **IDs:** Clip-Pfade heißen nach einem Hash des Inhalts – mehrere Diagramme auf einer Seite stören sich nicht.
- **Ohne Host** (`runToEnd`): die Bilder landen in `result.plots` (und bei `opts.plot(wait)`), das Programm läuft weiter.
- **Ohne `show()`:** `renderOpenFigures(vm)` (aus dem Kern) liefert `[{ svg, width, height, num }]` der noch offenen Figuren, z. B. um sie am Programmende zu zeigen.
- Deterministisch: dasselbe Programm ergibt Byte für Byte dasselbe SVG.

## Warnungen und Fehler

- numpy warnt bei Division durch 0, `sqrt(-1)`, `log(0)`, Überlauf … (`RuntimeWarning`), statt abzubrechen. Natter schreibt die Warnung auf **stderr** (`host.printErr`, in `runToEnd` in `errors`), **einmal je Programmzeile und Text** (wie Pythons Standardfilter): `line 3: RuntimeWarning: divide by zero encountered in divide`. Optional bekommt der Host `host.warning({ category, message, line })`.
- Fehler tragen numpys Typ und Text (`ValueError: operands could not be broadcast together with shapes (3,) (4,) `), `except ValueError as e: print(e)` zeigt genau ihn. `AxisError`, `LinAlgError`, `UFuncTypeError` sind echte Unterklassen (`ValueError`/`IndexError`, `ValueError`, `TypeError`).
- Für Lernende gibt es deutsche und englische Erklärungen zu den typischen Fehlern (`err.script.raised.np*` in `messages.js`): Formen passen nicht, Index außerhalb, zu viele Indizes, `reshape`, Wahrheitswert eines Arrays (`if a > 3:`), negative Hochzahl bei ganzen Zahlen, `a += 1.5` bei int-Arrays, singuläre Matrix, Texte statt Zahlen, x und y verschieden lang.

## Was es gibt

**numpy:** `array asarray copy zeros ones empty full eye identity zeros_like ones_like empty_like full_like arange linspace meshgrid` · `reshape ravel transpose squeeze expand_dims concatenate vstack hstack stack column_stack append flip repeat tile` · Operatoren `+ - * / // % ** @`, Vergleiche, `& | ^ ~`, `+= *= …` mit Broadcasting · `sqrt exp exp2 expm1 log log2 log10 log1p sin cos tan arcsin arccos arctan arctan2 sinh cosh tanh arcsinh arccosh arctanh hypot degrees radians deg2rad rad2deg abs absolute fabs floor ceil trunc rint fix round around sign square reciprocal cbrt power add subtract multiply divide floor_divide mod maximum minimum clip isnan isinf isfinite signbit logical_and logical_or logical_xor logical_not` · `sum prod mean std var min max amin amax argmin argmax ptp cumsum cumprod median percentile quantile average any all count_nonzero` (mit `axis`, `keepdims`, `ddof`) · `nansum nanmean nanstd nanvar nanmin nanmax nanmedian` · `sort argsort unique (return_counts, return_index, return_inverse) where nonzero argwhere bincount histogram diff interp isclose allclose array_equal` · `dot matmul outer trace diag polyfit polyval corrcoef cov` · `linalg.det inv solve norm` · `vectorize apply_along_axis fromfunction` · `set_printoptions(precision, threshold, edgeitems, linewidth, suppress)` · `pi e inf nan newaxis`.

ndarray: `shape size ndim dtype T flat itemsize nbytes`, `reshape flatten ravel copy tolist item astype fill transpose sort argsort sum … round clip dot nonzero`, Indizes `a[i]`, `a[i, j]`, `a[:, 1]`, `a[::-1]`, negative Indizes, Masken `a[a > 3]`, Listen `a[[0, 2]]`, `None`, Zuweisung in alle diese Formen, `len`, `for`, `in`.

Ausgabe: `print(a)` und `repr(a)` wie numpy: Stellen (8, kürzeste Darstellung), Exponentenschreibweise, Ausrichtung, Zeilenumbruch bei 75 Zeichen, `...` ab 1000 Elementen, `array([], dtype=float64)`, `shape=(…)`.

**numpy.random**, genau wie numpy: `seed rand randn random random_sample ranf sample randint random_integers uniform normal standard_normal exponential poisson binomial choice (auch p=, replace=False) shuffle permutation RandomState` mit MT19937 (Legacy) und `default_rng(seed)` → `Generator` mit PCG64/SeedSequence: `random integers uniform normal standard_normal choice shuffle permutation`. Gleicher Seed ⇒ dieselben Zahlen wie numpy. Ohne Seed kommt der Startwert aus dem (geseedeten) Zufall der VM.

**matplotlib.pyplot:** `figure(figsize, dpi) subplot(…) subplots(nrows, ncols, figsize) gca gcf sca close clf show savefig` · `plot` (Formatstrings wie `'r--o'`, `color linewidth/lw linestyle/ls marker markersize/ms markerfacecolor markeredgecolor label alpha zorder`, mehrere Linien, 2-D-y) · `scatter` (`s c color marker alpha edgecolors`, Farbe je Punkt) · `bar barh` (Kategorien als Texte, `width bottom align color edgecolor tick_label`) · `hist` (`bins range density weights cumulative histtype rwidth color edgecolor alpha label`, mehrere Datensätze) · `pie` (`labels autopct colors startangle explode counterclock`) · `errorbar fill_between axhline axvline text annotate` · `title suptitle xlabel ylabel xlim ylim xticks yticks legend(loc, ncol, title, fontsize) grid axis tight_layout subplots_adjust`. Achsen-Objekte (`fig, ax = plt.subplots()`) haben die `set_…`/`get_…`-Methoden dazu, `ax.set(title=…)`, `axs[0, 1]`, `axs.flat`. Farben: `C0`–`C9`, `b g r c m y k w`, `tab:…`, CSS-Namen, `#rrggbb`, Grauwerte `'0.5'`, Tupel. In Texten ein kleines Mathtext: `$x^2$`, `$t_0$`, `$\Delta$`, `$\alpha$`.

Ticks und Grenzen rechnet Natter wie matplotlib (AutoLocator/MaxNLocator, 5 % Rand, „klebende“ Null bei Balken, ScalarFormatter mit Versatz `+1e6` und `1e−7`, Unicode-Minus), die Legende sucht mit `loc='best'` den Platz wie matplotlib.

## Was es nicht gibt

- **numpy:** komplexe Zahlen, `int32`/`float32` als echte Typen (werden 64 bit), Überlauf-Wrap bei `int64`, Objekt-Arrays, strukturierte Arrays, mehrere Achsen auf einmal (`axis=(0, 1)`), `...` (Ellipsis) als Index, `out=`/`where=` bei ufuncs, `np.seterr`/`errstate`, Datum/Zeit, `np.char`, `np.ma`, `np.fft`, `linalg.eig/svd/lstsq`, Rechnen mit Text-Arrays (nur Vergleichen, Sortieren, `+`), Datei-Ein/Ausgabe (`loadtxt`, `save`), `broadcast_to`, `take`, `put`, `roll`, `pad`, `split` …
- **numpy.random:** `Generator.exponential`/`poisson`/`binomial`, `beta`, `gamma`, `multivariate_normal`, `get_state`/`set_state`.
- **matplotlib:** logarithmische Achsen (`xscale`, `semilogy`, `loglog`), `imshow`, `contour`, `colorbar`, `boxplot`, `violinplot`, `stem`, `step`, `quiver`, Polar- und 3-D-Achsen, `twinx`, Zeitachsen, Colormaps (außer viridis für `scatter(c=Zahlen)`), Schraffuren, `rcParams`, Animationen, PNG/PDF (immer SVG). Diese Namen sind teils als Platzhalter da und melden `NotImplementedError` mit Hinweis. `tight_layout()` tut nichts. Mathtext nur wie oben.
- Pixelgleichheit mit matplotlib: Linien, Farben, Ticks, Beschriftungen und Positionen stimmen, Kantenglättung, Pfeile von `annotate` und gedrehte Beschriftungen sind angenähert.

## Abweichungen im Detail

- **Skalare:** siehe oben (Python-Zahlen). Deshalb ist z. B. `a.sum() / 0` ein `ZeroDivisionError` statt `inf` mit Warnung.
- **Transzendente Funktionen** (`sin`, `exp`, `log` …) sind korrekt gerundet (`libm.js`). numpy selbst nutzt je nach Prozessor eigene SIMD-Routinen und weicht dort teils um 1 ULP ab (gemessen: `exp` 5 %, `tanh` 25 % der Werte); in den ersten 8 Stellen der Ausgabe sieht man das praktisch nie.
- `sum`/`mean`/`std` rechnen mit numpys paarweiser Summation – gleiche Ziffern wie numpy. `dot`, `@`, `linalg.*`, `polyfit`, `corrcoef` rechnen ohne BLAS/LAPACK; die letzten Stellen können abweichen.
- `argsort`/`sort` sind stabil (numpy: quicksort, bei gleichen Werten evtl. andere Reihenfolge der Indizes).
- `histogram`, `percentile` (Methode `linear`), `median`, `round` (numpy-Rundung, nicht Pythons), `arange`, `linspace` folgen numpys Rechenweg.

## Geschwindigkeit

Gemessen mit `runToEnd` in Node (Laptop-Klasse): `np.arange(10**6).sum()` 15 ms · `rand(10**6)` + Maske 150 ms · `np.sort` von 10⁶ Zahlen 0,9 s · `@` 200×200 16 ms · Python-Schleife über 10⁵ Elemente 90 ms · `plt.plot` 10⁵ Punkte + `show()` 0,6 s (SVG 1,3 MB) · `hist` von 10⁶ Werten 1,8 s. Transzendente Funktionen kosten 3–9 µs je Element (korrekt gerundet mit BigInt): `np.sin` über 10⁶ Werte ≈ 4 s, über 10⁴ Werte 40 ms. `x ** 2`, `** 0.5`, `** -1` nehmen wie numpy den schnellen Weg.

Größe: die neuen Module sind zusammen etwa 150 KB minifiziert, 57 KB gzip (`numpy` 30 KB, `plot` 20 KB, Zufall mit Ziggurat-Tabellen 13 KB).

## Tests

- `packages/core/test/numpy.test.js`: Programme aus `test/data/numpy-golden.json` müssen dieselbe Ausgabe (und dieselben Warnungen) wie numpy liefern; dazu Importformen, Fehlertexte, Sichten, Geschwindigkeit.
- `packages/core/test/plot.test.js`: Achsenbox, Grenzen, sichtbare Ticks und Beschriftungen, Versatztext, Farben und Legendenbox aus `test/data/plot-golden.json` müssen mit matplotlib übereinstimmen; dazu die Host-Schnittstelle.
- Golden-Daten neu erzeugen (numpy und matplotlib nötig, z. B. in einer venv): `python3 scripts/gen-numpy-golden.py`, `python3 scripts/gen-plot-golden.py`. Die Tests selbst laufen ohne Python.
