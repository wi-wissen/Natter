// matplotlib.pyplot (a subset for school): the state-machine functions call the Axes and Figure objects of the
// native module _plot (stdlib/plot.js); show() hands each figure as SVG to the host (task.wait.kind === 'plot').

export const matplotlib = String.raw`
__version__ = "3.11.2"
rcParams = {}


def use(backend, force=True):
    pass
`;

export const pyplot = String.raw`
import _plot
from _plot import Figure, Axes, figure, gcf, gca, sca, close, clf


class _AxesArray:
    """The grid of axes from subplots(): ax[0], ax[0, 1], ax.flat, for row in ax …"""

    def __init__(self, rows, shape):
        self._rows = rows
        self.shape = shape
        self.ndim = len(shape)
        self.size = len(self.flat)

    @property
    def flat(self):
        if self.ndim == 1:
            return list(self._rows)
        return [a for row in self._rows for a in row]

    def flatten(self):
        return self.flat

    ravel = flatten

    def __getitem__(self, key):
        if isinstance(key, tuple):
            r, c = key
            return self._rows[r][c]
        if self.ndim == 1:
            return self._rows[key]
        return _AxesArray(self._rows[key], (len(self._rows[key]),)) if not isinstance(key, slice) else _AxesArray(self._rows[key], (len(self._rows[key]), self.shape[1]))

    def __iter__(self):
        if self.ndim == 1:
            return iter(self._rows)
        return iter([_AxesArray(row, (len(row),)) for row in self._rows])

    def __len__(self):
        return len(self._rows)

    def __repr__(self):
        return "array(" + repr(self._rows) + ", dtype=object)"


def subplots(nrows=1, ncols=1, *, sharex=False, sharey=False, squeeze=True, figsize=None, dpi=None, **kwargs):
    fig = figure(figsize=figsize, dpi=dpi)
    rows = [[fig.add_subplot(nrows, ncols, r * ncols + c + 1) for c in range(ncols)] for r in range(nrows)]
    if squeeze and nrows == 1 and ncols == 1:
        return fig, rows[0][0]
    if squeeze and (nrows == 1 or ncols == 1):
        return fig, _AxesArray([a for row in rows for a in row], (nrows * ncols,))
    return fig, _AxesArray(rows, (nrows, ncols))


def subplot(*args, **kwargs):
    return _plot.subplot(*args, **kwargs)


def show(*args, **kwargs):
    for svg, width, height in _plot.render_all():
        _plot.show(svg, width, height)


def savefig(fname, **kwargs):
    svg, width, height = _plot.render(gcf())
    _plot.show(svg, width, height, str(fname))


def plot(*args, **kwargs):
    return gca().plot(*args, **kwargs)


def scatter(*args, **kwargs):
    return gca().scatter(*args, **kwargs)


def bar(*args, **kwargs):
    return gca().bar(*args, **kwargs)


def barh(*args, **kwargs):
    return gca().barh(*args, **kwargs)


def hist(*args, **kwargs):
    return gca().hist(*args, **kwargs)


def pie(*args, **kwargs):
    return gca().pie(*args, **kwargs)


def errorbar(*args, **kwargs):
    return gca().errorbar(*args, **kwargs)


def fill_between(*args, **kwargs):
    return gca().fill_between(*args, **kwargs)


def axhline(y=0, xmin=0, xmax=1, **kwargs):
    return gca().axhline(y, xmin, xmax, **kwargs)


def axvline(x=0, ymin=0, ymax=1, **kwargs):
    return gca().axvline(x, ymin, ymax, **kwargs)


def text(x, y, s, **kwargs):
    return gca().text(x, y, s, **kwargs)


def annotate(text, xy, xytext=None, **kwargs):
    return gca().annotate(text, xy, xytext=xytext, **kwargs)


def title(label, **kwargs):
    gca().set_title(label, **kwargs)


def suptitle(t, **kwargs):
    gcf().suptitle(t)


def xlabel(xlabel, **kwargs):
    gca().set_xlabel(xlabel, **kwargs)


def ylabel(ylabel, **kwargs):
    gca().set_ylabel(ylabel, **kwargs)


def xlim(*args, **kwargs):
    if not args and not kwargs:
        return gca().get_xlim()
    return gca().set_xlim(*args, **kwargs)


def ylim(*args, **kwargs):
    if not args and not kwargs:
        return gca().get_ylim()
    return gca().set_ylim(*args, **kwargs)


def xticks(ticks=None, labels=None, **kwargs):
    ax = gca()
    if ticks is not None or labels is not None:
        ax.set_xticks(ticks, labels)
    if "rotation" in kwargs:
        ax.tick_params(axis="x", rotation=kwargs["rotation"])
    return ax.get_xticks()


def yticks(ticks=None, labels=None, **kwargs):
    ax = gca()
    if ticks is not None or labels is not None:
        ax.set_yticks(ticks, labels)
    if "rotation" in kwargs:
        ax.tick_params(axis="y", rotation=kwargs["rotation"])
    return ax.get_yticks()


def legend(*args, **kwargs):
    return gca().legend(*args, **kwargs)


def grid(visible=None, which="major", axis="both", **kwargs):
    gca().grid(visible, axis=axis, **kwargs)


def axis(*args, **kwargs):
    return gca().axis(*args, **kwargs)


def tight_layout(**kwargs):
    pass


def subplots_adjust(**kwargs):
    gcf().subplots_adjust(**kwargs)


def cla():
    gca().cla()


def get_fignums():
    return _plot.fignums()


def ion():
    pass


def ioff():
    pass


def pause(interval):
    import time
    time.sleep(interval)


def _unsupported(name, hint):
    def unsupported(*args, **kwargs):
        raise NotImplementedError("Natter's matplotlib has no " + name + "() (yet). " + hint)
    return unsupported


xscale = _unsupported("xscale", "Logarithmic axes are not supported.")
yscale = _unsupported("yscale", "Logarithmic axes are not supported.")
semilogx = _unsupported("semilogx", "Logarithmic axes are not supported.")
semilogy = _unsupported("semilogy", "Logarithmic axes are not supported.")
loglog = _unsupported("loglog", "Logarithmic axes are not supported.")
imshow = _unsupported("imshow", "Images are not supported.")
contour = _unsupported("contour", "Contour plots are not supported.")
contourf = _unsupported("contourf", "Contour plots are not supported.")
colorbar = _unsupported("colorbar", "Colour bars are not supported.")
boxplot = _unsupported("boxplot", "Use hist() or plot the quartiles from np.percentile().")
violinplot = _unsupported("violinplot", "Use hist().")
stem = _unsupported("stem", "Use plot() with markers.")
step = _unsupported("step", "Use plot() or hist(histtype='step').")
quiver = _unsupported("quiver", "Vector fields are not supported.")
polar = _unsupported("polar", "Polar plots are not supported.")
stackplot = _unsupported("stackplot", "Use fill_between().")
twinx = _unsupported("twinx", "Second axes are not supported.")
`;
