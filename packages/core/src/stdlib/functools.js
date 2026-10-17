// functools (written in Python).
export default String.raw`
def reduce(function, iterable, *initial):
    it = iter(iterable)
    if initial:
        value = initial[0]
    else:
        try:
            value = next(it)
        except StopIteration:
            raise TypeError("reduce() of empty iterable with no initial value")
    for x in it:
        value = function(value, x)
    return value


class partial:
    def __init__(self, func, *args, **keywords):
        self.func = func
        self.args = args
        self.keywords = keywords

    def __call__(self, *args, **keywords):
        kw = dict(self.keywords)
        for k in keywords:
            kw[k] = keywords[k]
        return self.func(*self.args, *args, **kw)


def lru_cache(maxsize=128, typed=False):
    if callable(maxsize):
        return _cached(maxsize, None)

    def decorate(func):
        return _cached(func, maxsize)

    return decorate


def cache(func):
    return _cached(func, None)


class _cached:
    def __init__(self, func, maxsize):
        self.func = func
        self.maxsize = maxsize
        self._store = {}
        self.hits = 0
        self.misses = 0

    def __call__(self, *args, **kw):
        key = args + tuple(sorted(kw.items())) if kw else args
        if key in self._store:
            self.hits += 1
            value = self._store.pop(key)
            self._store[key] = value
            return value
        self.misses += 1
        value = self.func(*args, **kw)
        self._store[key] = value
        if self.maxsize is not None and len(self._store) > self.maxsize:
            oldest = list(self._store)[0]
            del self._store[oldest]
        return value

    def cache_clear(self):
        self._store.clear()
        self.hits = 0
        self.misses = 0

    def cache_info(self):
        return _CacheInfo(self.hits, self.misses, self.maxsize, len(self._store))


class _CacheInfo:
    def __init__(self, hits, misses, maxsize, currsize):
        self.hits = hits
        self.misses = misses
        self.maxsize = maxsize
        self.currsize = currsize

    def __repr__(self):
        return "CacheInfo(hits=" + str(self.hits) + ", misses=" + str(self.misses) + ", maxsize=" + str(self.maxsize) + ", currsize=" + str(self.currsize) + ")"


def wraps(wrapped):
    def decorate(wrapper):
        return wrapper

    return decorate


def cmp_to_key(mycmp):
    class K:
        def __init__(self, obj):
            self.obj = obj

        def __lt__(self, other):
            return mycmp(self.obj, other.obj) < 0

        def __gt__(self, other):
            return mycmp(self.obj, other.obj) > 0

        def __eq__(self, other):
            return mycmp(self.obj, other.obj) == 0

        __hash__ = None

    return K


def total_ordering(cls):
    def has(name):
        return hasattr(cls, name)

    if has("__lt__"):
        if not has("__gt__"):
            cls.__gt__ = lambda self, other: not (self < other) and self != other
        if not has("__le__"):
            cls.__le__ = lambda self, other: self < other or self == other
        if not has("__ge__"):
            cls.__ge__ = lambda self, other: not (self < other)
    elif has("__gt__"):
        if not has("__lt__"):
            cls.__lt__ = lambda self, other: not (self > other) and self != other
        if not has("__ge__"):
            cls.__ge__ = lambda self, other: self > other or self == other
        if not has("__le__"):
            cls.__le__ = lambda self, other: not (self > other)
    return cls
`;
