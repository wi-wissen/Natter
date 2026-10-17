#!/usr/bin/env python3
"""Golden data for Natter's matplotlib.pyplot subset: layout facts of real matplotlib figures.

Usage (needs matplotlib and numpy, e.g. in a venv):
  python3 scripts/gen-plot-golden.py        # writes packages/core/test/data/plot-golden.json

For every case and every axes it records what Natter must reproduce: the axes box in pixels (origin top left),
the view limits, the visible ticks with their labels, the offset texts ('1e6', '+1e3'), the colours of the
artists in the order they were added and the legend box in pixels. Text is measured with DejaVu Sans
(matplotlib's default font). The test (packages/core/test/plot.test.js) runs without matplotlib.
"""
import json
import os
import sys

import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import colors as mcolors  # noqa: E402
from matplotlib.collections import PathCollection, PolyCollection  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402
from matplotlib.patches import Rectangle, Wedge  # noqa: E402

plt.rcParams['font.family'] = 'DejaVu Sans'

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'packages', 'core', 'test', 'data', 'plot-golden.json')

CASES = []


def case(name, src):
    CASES.append((name, src.strip('\n') + '\n'))


case('lines and legend', '''
x = np.linspace(0, 10, 50)
plt.plot(x, np.sin(x), label='sin')
plt.plot(x, np.cos(x), 'r--o', label='cos')
plt.scatter([1, 2], [0.5, 0.2])
plt.title('Title')
plt.xlabel('x')
plt.ylabel('y')
plt.legend()
''')
case('simple list', '''
plt.plot([1, 2, 3, 4], [1, 4, 9, 16])
''')
case('only y', '''
plt.plot([3, 1, 4, 1, 5, 9, 2, 6])
''')
case('parabola negative', '''
x = np.linspace(-3, 3, 61)
plt.plot(x, x ** 2 - 4, 'g')
plt.grid(True)
plt.axhline(0, color='k')
plt.axvline(0, color='k', linestyle='--')
''')
case('large numbers offset', '''
x = np.arange(10)
plt.plot(x, 1e6 + x * 10)
''')
case('scientific', '''
plt.plot([0, 1, 2], [1e-7, 3e-7, 2e-7])
''')
case('big values', '''
plt.plot([2000, 2005, 2010, 2015, 2020], [8.1e9, 7.9e9, 8.3e9, 8.6e9, 9.0e9])
''')
case('years', '''
plt.plot([1990, 2000, 2010, 2020], [5.3, 6.1, 6.9, 7.8], marker='o')
''')
case('small range', '''
plt.plot([0, 1], [100.001, 100.002])
''')
case('bar categories', '''
plt.bar(['Mo', 'Di', 'Mi', 'Do', 'Fr'], [3, 7, 2, 5, 4])
plt.title('Bars')
''')
case('bar numbers colors', '''
plt.bar([1, 2, 3], [10, -5, 7], color=['red', 'green', 'blue'], width=0.5)
''')
case('barh', '''
plt.barh(['A', 'B', 'C'], [5, 3, 8], color='orange')
''')
case('hist', '''
data = np.random.RandomState(1).randn(500)
n, bins, patches = plt.hist(data, bins=20, edgecolor='black')
''')
case('hist default bins', '''
plt.hist([1, 2, 2, 3, 3, 3, 4, 4, 5, 9])
''')
case('hist density', '''
plt.hist(np.random.RandomState(3).normal(170, 8, 300), bins=15, density=True, alpha=0.5, label='Größe')
plt.legend()
''')
case('scatter', '''
rs = np.random.RandomState(0)
plt.scatter(rs.rand(30) * 100, rs.rand(30) * 50, color='purple', label='Punkte')
plt.scatter([10, 20], [5, 6], marker='x', label='zwei')
plt.legend(loc='lower right')
''')
case('pie', '''
plt.pie([30, 20, 50], labels=['A', 'B', 'C'], autopct='%1.1f%%')
''')
case('subplots 2x2', '''
fig, ax = plt.subplots(2, 2)
x = np.linspace(0, 2 * np.pi, 100)
ax[0, 0].plot(x, np.sin(x))
ax[0, 1].plot(x, np.cos(x), 'r')
ax[1, 0].bar([1, 2, 3], [3, 1, 2])
ax[1, 1].scatter([1, 2, 3], [3, 1, 2])
ax[0, 0].set_title('sin')
''')
case('subplots 1x2 figsize', '''
fig, (a, b) = plt.subplots(1, 2, figsize=(10, 4))
a.plot([1, 2, 3], [2, 4, 1])
b.hist([1, 1, 2, 3, 3, 3], bins=3)
''')
case('subplot 211', '''
plt.subplot(211)
plt.plot([1, 2, 3])
plt.subplot(212)
plt.plot([3, 2, 1], 'k:')
''')
case('limits and ticks', '''
plt.plot([0, 10], [0, 1])
plt.xlim(-5, 15)
plt.ylim(0, 2)
plt.xticks([0, 5, 10])
''')
case('fill between', '''
x = np.linspace(0, 1, 20)
plt.fill_between(x, x ** 2, x, alpha=0.3)
plt.plot(x, x)
''')
case('legend positions', '''
x = np.arange(10)
plt.plot(x, x, label='steigend')
plt.plot(x, 9 - x, label='fallend')
plt.plot(x, np.full(10, 4.5), label='konstant')
plt.legend()
''')
case('legend upper left', '''
plt.plot([1, 2, 3], [3, 2, 1], label='a')
plt.plot([1, 2, 3], [1, 2, 3], label='b')
plt.legend(loc='upper left')
''')
case('colors', '''
for i, c in enumerate(['b', 'g', 'r', 'c', 'm', 'y', 'k', 'C3', 'tab:orange', '#123456', 'navy', '0.5']):
    plt.plot([0, 1], [i, i + 1], color=c)
''')
case('cycle', '''
for i in range(12):
    plt.plot([0, 1], [i, i])
plt.bar([0], [1])
''')
case('fractions', '''
plt.plot([0.001, 0.002, 0.003], [0.5, 0.25, 0.125])
''')
case('negative values', '''
plt.plot([-1000, -500, 0], [-3, -2, -7])
''')
case('constant', '''
plt.plot([1, 2, 3], [5, 5, 5])
''')
case('single point', '''
plt.plot([2], [3], 'o')
''')
case('figsize small', '''
plt.figure(figsize=(3, 2))
plt.plot([0, 100], [0, 1])
''')


def hexcolor(c):
    return mcolors.to_hex(c, keep_alpha=False)


def summary(fig):
    fig.canvas.draw()
    r = fig.canvas.get_renderer()
    H = fig.bbox.height
    out = []
    for ax in fig.axes:
        b = ax.get_window_extent(r)
        xlim = [float(v) for v in ax.get_xlim()]
        ylim = [float(v) for v in ax.get_ylim()]

        def vis(axis, lim):
            lo, hi = min(lim), max(lim)
            ticks, labels = [], []
            for loc, t in zip(axis.get_majorticklocs(), axis.get_majorticklabels()):
                eps = 1e-10 * (hi - lo)
                if lo - eps <= loc <= hi + eps:
                    ticks.append(float(loc))
                    labels.append(t.get_text())
            return ticks, labels

        xt, xl = vis(ax.xaxis, xlim)
        yt, yl = vis(ax.yaxis, ylim)
        colors = []
        containers = {id(c[0]): c for c in ax.containers if len(c)}
        for ch in ax._children:
            if isinstance(ch, Line2D):
                colors.append(hexcolor(ch.get_color()))
            elif isinstance(ch, PathCollection):
                colors.append(hexcolor(ch.get_facecolor()[0]))
            elif isinstance(ch, PolyCollection):
                pass
            elif isinstance(ch, Rectangle) and id(ch) in containers:
                colors.append(hexcolor(ch.get_facecolor()))
            elif isinstance(ch, Wedge):
                colors.append(hexcolor(ch.get_facecolor()))
        leg = ax.get_legend()
        legend = None
        if leg is not None:
            lb = leg.get_window_extent(r)
            legend = [round(lb.x0, 2), round(H - lb.y1, 2), round(lb.x1, 2), round(H - lb.y0, 2)]
        out.append({
            'box': [round(b.x0, 2), round(H - b.y1, 2), round(b.x1, 2), round(H - b.y0, 2)],
            'xlim': xlim, 'ylim': ylim, 'xticks': xt, 'xlabels': xl, 'yticks': yt, 'ylabels': yl,
            'xoffset': ax.xaxis.get_offset_text().get_text(), 'yoffset': ax.yaxis.get_offset_text().get_text(),
            'colors': colors, 'legend': legend,
        })
    return out


def main():
    import numpy as np
    data = {'meta': {'matplotlib': matplotlib.__version__, 'python': sys.version.split()[0]}, 'cases': []}
    for name, src in CASES:
        plt.close('all')
        exec(compile(src, '<case>', 'exec'), {'np': np, 'plt': plt, '__name__': '__main__'})
        figs = [plt.figure(n) for n in plt.get_fignums()]
        data['cases'].append({'name': name, 'src': src, 'figures': [summary(f) for f in figs]})
    with open(OUT, 'w') as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print(f'{len(CASES)} cases -> {os.path.relpath(OUT)}')


if __name__ == '__main__':
    main()
