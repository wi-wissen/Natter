// itertools (written in Python; most functions are generators).
export default String.raw`
def count(start=0, step=1):
    n = start
    while True:
        yield n
        n += step


def cycle(iterable):
    saved = []
    for x in iterable:
        yield x
        saved.append(x)
    while saved:
        for x in saved:
            yield x


def repeat(obj, times=None):
    if times is None:
        while True:
            yield obj
    else:
        for _ in range(times):
            yield obj


class chain:
    def __init__(self, *iterables):
        self._source = self._gen(iterables)

    @staticmethod
    def _gen(iterables):
        for it in iterables:
            for x in it:
                yield x

    @classmethod
    def from_iterable(cls, iterables):
        c = cls()
        c._source = cls._gen(iterables)
        return c

    def __iter__(self):
        return self

    def __next__(self):
        return next(self._source)


def islice(iterable, *args):
    s = slice(*args)
    start = 0 if s.start is None else s.start
    stop = s.stop
    step = 1 if s.step is None else s.step
    if start < 0 or (stop is not None and stop < 0) or step <= 0:
        raise ValueError("Indices for islice() must be None or an integer: 0 <= x <= sys.maxsize.")
    i = 0
    nxt = start
    for x in iterable:
        if stop is not None and i >= stop:
            return
        if i == nxt:
            yield x
            nxt += step
        i += 1


def takewhile(predicate, iterable):
    for x in iterable:
        if predicate(x):
            yield x
        else:
            return


def dropwhile(predicate, iterable):
    dropping = True
    for x in iterable:
        if dropping and predicate(x):
            continue
        dropping = False
        yield x


def filterfalse(predicate, iterable):
    for x in iterable:
        if not (bool(x) if predicate is None else predicate(x)):
            yield x


def starmap(function, iterable):
    for args in iterable:
        yield function(*args)


def compress(data, selectors):
    for d, s in zip(data, selectors):
        if s:
            yield d


def accumulate(iterable, func=None, initial=None):
    total = initial
    first = initial is None
    if initial is not None:
        yield total
    for x in iterable:
        if first:
            total = x
            first = False
        else:
            total = total + x if func is None else func(total, x)
        yield total


def zip_longest(*iterables, fillvalue=None):
    lists = [list(it) for it in iterables]
    n = max([len(l) for l in lists]) if lists else 0
    for i in range(n):
        yield tuple(l[i] if i < len(l) else fillvalue for l in lists)


def pairwise(iterable):
    items = list(iterable)
    for i in range(len(items) - 1):
        yield (items[i], items[i + 1])


def product(*iterables, repeat=1):
    pools = [tuple(p) for p in iterables] * repeat
    result = [[]]
    for pool in pools:
        result = [r + [x] for r in result for x in pool]
    for r in result:
        yield tuple(r)


def permutations(iterable, r=None):
    pool = tuple(iterable)
    n = len(pool)
    r = n if r is None else r
    if r > n:
        return
    indices = list(range(n))
    cycles = list(range(n, n - r, -1))
    yield tuple(pool[i] for i in indices[:r])
    while n:
        for i in reversed(range(r)):
            cycles[i] -= 1
            if cycles[i] == 0:
                indices[i:] = indices[i + 1:] + indices[i:i + 1]
                cycles[i] = n - i
            else:
                j = cycles[i]
                indices[i], indices[-j] = indices[-j], indices[i]
                yield tuple(pool[i] for i in indices[:r])
                break
        else:
            return


def combinations(iterable, r):
    pool = tuple(iterable)
    n = len(pool)
    if r > n:
        return
    indices = list(range(r))
    yield tuple(pool[i] for i in indices)
    while True:
        for i in reversed(range(r)):
            if indices[i] != i + n - r:
                break
        else:
            return
        indices[i] += 1
        for j in range(i + 1, r):
            indices[j] = indices[j - 1] + 1
        yield tuple(pool[i] for i in indices)


def combinations_with_replacement(iterable, r):
    pool = tuple(iterable)
    n = len(pool)
    if not n and r:
        return
    indices = [0] * r
    yield tuple(pool[i] for i in indices)
    while True:
        for i in reversed(range(r)):
            if indices[i] != n - 1:
                break
        else:
            return
        indices[i:] = [indices[i] + 1] * (r - i)
        yield tuple(pool[i] for i in indices)


def groupby(iterable, key=None):
    items = list(iterable)
    i = 0
    while i < len(items):
        k = items[i] if key is None else key(items[i])
        group = []
        while i < len(items) and (items[i] if key is None else key(items[i])) == k:
            group.append(items[i])
            i += 1
        yield k, iter(group)


def tee(iterable, n=2):
    items = list(iterable)
    return tuple(iter(items) for _ in range(n))
`;
