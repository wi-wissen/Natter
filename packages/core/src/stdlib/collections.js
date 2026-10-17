// collections: Counter, defaultdict, deque, OrderedDict, namedtuple (written in Python, wrapping the built-in types).
export default String.raw`
class _MapBase:
    """Behaviour shared by the dictionary-like classes below."""

    def __init__(self):
        self._d = {}

    def __len__(self):
        return len(self._d)

    def __iter__(self):
        return iter(list(self._d))

    def __contains__(self, key):
        return key in self._d

    def keys(self):
        return self._d.keys()

    def values(self):
        return self._d.values()

    def items(self):
        return self._d.items()

    def get(self, key, default=None):
        return self._d.get(key, default)

    def pop(self, key, *default):
        return self._d.pop(key, *default)

    def setdefault(self, key, default=None):
        return self._d.setdefault(key, default)

    def clear(self):
        self._d.clear()

    def copy(self):
        return self.__class__(self)

    def __delitem__(self, key):
        del self._d[key]

    def __setitem__(self, key, value):
        self._d[key] = value

    def __eq__(self, other):
        if isinstance(other, _MapBase):
            return self._d == other._d
        if isinstance(other, dict):
            return self._d == other
        return NotImplemented

    __hash__ = None

    def __bool__(self):
        return len(self._d) > 0


class defaultdict(_MapBase):
    def __init__(self, default_factory=None, *args):
        self._d = {}
        self.default_factory = default_factory
        if args:
            self.update(*args)

    def __getitem__(self, key):
        if key in self._d:
            return self._d[key]
        if self.default_factory is None:
            raise KeyError(key)
        value = self.default_factory()
        self._d[key] = value
        return value

    def update(self, other=(), **kw):
        if hasattr(other, "keys"):
            for k in other.keys():
                self._d[k] = other[k]
        else:
            for k, v in other:
                self._d[k] = v
        for k in kw:
            self._d[k] = kw[k]

    def copy(self):
        c = defaultdict(self.default_factory)
        c._d = dict(self._d)
        return c

    def __repr__(self):
        name = "None" if self.default_factory is None else repr(self.default_factory)
        return "defaultdict(" + name + ", " + repr(self._d) + ")"


class OrderedDict(_MapBase):
    def __init__(self, *args, **kw):
        self._d = {}
        self.update(*args, **kw)

    def __getitem__(self, key):
        return self._d[key]

    def update(self, other=(), **kw):
        if hasattr(other, "keys"):
            for k in other.keys():
                self._d[k] = other[k]
        else:
            for k, v in other:
                self._d[k] = v
        for k in kw:
            self._d[k] = kw[k]

    def move_to_end(self, key, last=True):
        value = self._d.pop(key)
        if last:
            self._d[key] = value
        else:
            rest = dict(self._d)
            self._d.clear()
            self._d[key] = value
            for k in rest:
                self._d[k] = rest[k]

    def popitem(self, last=True):
        if not self._d:
            raise KeyError("dictionary is empty")
        key = list(self._d)[-1 if last else 0]
        return key, self._d.pop(key)

    def __repr__(self):
        if not self._d:
            return "OrderedDict()"
        return "OrderedDict(" + repr(self._d) + ")"


class Counter(_MapBase):
    def __init__(self, iterable=None, **kw):
        self._d = {}
        self.update(iterable, **kw)

    def __getitem__(self, key):
        return self._d.get(key, 0)

    def __missing__(self, key):
        return 0

    def update(self, iterable=None, **kw):
        if iterable is not None:
            if hasattr(iterable, "keys"):
                for k in iterable.keys():
                    self._d[k] = self._d.get(k, 0) + iterable[k]
            else:
                for k in iterable:
                    self._d[k] = self._d.get(k, 0) + 1
        for k in kw:
            self._d[k] = self._d.get(k, 0) + kw[k]

    def subtract(self, iterable=None, **kw):
        if iterable is not None:
            if hasattr(iterable, "keys"):
                for k in iterable.keys():
                    self._d[k] = self._d.get(k, 0) - iterable[k]
            else:
                for k in iterable:
                    self._d[k] = self._d.get(k, 0) - 1
        for k in kw:
            self._d[k] = self._d.get(k, 0) - kw[k]

    def most_common(self, n=None):
        ranked = sorted(self._d.items(), key=lambda kv: -kv[1])
        return ranked if n is None else ranked[:n]

    def elements(self):
        for k in self._d:
            for _ in range(self._d[k]):
                yield k

    def total(self):
        return sum(self._d.values())

    def copy(self):
        return Counter(self._d)

    def __add__(self, other):
        r = Counter()
        for k in self._d:
            v = self._d[k] + other[k]
            if v > 0:
                r._d[k] = v
        for k in other.keys():
            if k not in self._d and other[k] > 0:
                r._d[k] = other[k]
        return r

    def __sub__(self, other):
        r = Counter()
        for k in self._d:
            v = self._d[k] - other[k]
            if v > 0:
                r._d[k] = v
        for k in other.keys():
            if k not in self._d and other[k] < 0:
                r._d[k] = -other[k]
        return r

    def __and__(self, other):
        r = Counter()
        for k in self._d:
            v = min(self._d[k], other[k])
            if v > 0:
                r._d[k] = v
        return r

    def __or__(self, other):
        r = Counter()
        for k in self._d:
            v = max(self._d[k], other[k])
            if v > 0:
                r._d[k] = v
        for k in other.keys():
            if k not in self._d and other[k] > 0:
                r._d[k] = other[k]
        return r

    def __repr__(self):
        if not self._d:
            return "Counter()"
        return "Counter(" + repr(dict(self.most_common())) + ")"


class deque:
    def __init__(self, iterable=(), maxlen=None):
        self.maxlen = maxlen
        self._items = []
        for x in iterable:
            self.append(x)

    def append(self, x):
        self._items.append(x)
        if self.maxlen is not None and len(self._items) > self.maxlen:
            self._items.pop(0)

    def appendleft(self, x):
        self._items.insert(0, x)
        if self.maxlen is not None and len(self._items) > self.maxlen:
            self._items.pop()

    def pop(self):
        if not self._items:
            raise IndexError("pop from an empty deque")
        return self._items.pop()

    def popleft(self):
        if not self._items:
            raise IndexError("pop from an empty deque")
        return self._items.pop(0)

    def extend(self, iterable):
        for x in list(iterable):
            self.append(x)

    def extendleft(self, iterable):
        for x in list(iterable):
            self.appendleft(x)

    def rotate(self, n=1):
        if self._items:
            n = n % len(self._items)
            if n:
                self._items = self._items[-n:] + self._items[:-n]

    def clear(self):
        self._items.clear()

    def count(self, x):
        return self._items.count(x)

    def index(self, x):
        return self._items.index(x)

    def remove(self, x):
        self._items.remove(x)

    def reverse(self):
        self._items.reverse()

    def copy(self):
        return deque(self._items, self.maxlen)

    def __len__(self):
        return len(self._items)

    def __iter__(self):
        return iter(list(self._items))

    def __reversed__(self):
        return iter(self._items[::-1])

    def __getitem__(self, i):
        return self._items[i]

    def __setitem__(self, i, v):
        self._items[i] = v

    def __delitem__(self, i):
        del self._items[i]

    def __contains__(self, x):
        return x in self._items

    def __bool__(self):
        return len(self._items) > 0

    def __eq__(self, other):
        return isinstance(other, deque) and self._items == other._items

    __hash__ = None

    def __repr__(self):
        if self.maxlen is None:
            return "deque(" + repr(self._items) + ")"
        return "deque(" + repr(self._items) + ", maxlen=" + str(self.maxlen) + ")"


def namedtuple(typename, field_names, defaults=None):
    if isinstance(field_names, str):
        field_names = field_names.replace(",", " ").split()
    fields = list(field_names)
    n = len(fields)
    defaults = [] if defaults is None else list(defaults)

    class _Tuple:
        _fields = tuple(fields)

        def __init__(self, *args, **kw):
            values = list(args)
            if len(values) > n:
                raise TypeError(typename + "() takes " + str(n + 1) + " positional arguments but " + str(len(values) + 1) + " were given")
            for name in fields[len(values):]:
                if name in kw:
                    values.append(kw.pop(name))
                elif len(fields) - fields.index(name) <= len(defaults):
                    values.append(defaults[len(defaults) - (len(fields) - fields.index(name))])
                else:
                    raise TypeError(typename + "() missing 1 required positional argument: '" + name + "'")
            for name in kw:
                raise TypeError(typename + "() got an unexpected keyword argument '" + name + "'")
            self._values = tuple(values)

        def __iter__(self):
            return iter(self._values)

        def __len__(self):
            return n

        def __getitem__(self, i):
            return self._values[i]

        def __eq__(self, other):
            if isinstance(other, _Tuple):
                return self._values == other._values
            if isinstance(other, tuple):
                return self._values == other
            return NotImplemented

        def __lt__(self, other):
            return tuple(self) < tuple(other)

        def __hash__(self):
            return hash(self._values)

        def __repr__(self):
            return typename + "(" + ", ".join(f + "=" + repr(v) for f, v in zip(fields, self._values)) + ")"

        def _asdict(self):
            return dict(zip(fields, self._values))

        def _replace(self, **kw):
            d = self._asdict()
            for k in kw:
                d[k] = kw[k]
            return _Tuple(**d)

    for i, name in enumerate(fields):
        setattr(_Tuple, name, property(lambda self, i=i: self._values[i]))
    _Tuple.__name__ = typename
    return _Tuple
`;
