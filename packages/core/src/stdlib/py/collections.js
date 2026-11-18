// collections: Counter, defaultdict, deque, OrderedDict, namedtuple (written in Python, wrapping the built-in types).
export default String.raw`
from types import GenericAlias as _GenericAlias


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
    __class_getitem__ = classmethod(_GenericAlias)

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
    __class_getitem__ = classmethod(_GenericAlias)

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
    __class_getitem__ = classmethod(_GenericAlias)

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
    __class_getitem__ = classmethod(_GenericAlias)

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


def _nt_names(names):
    q = ["'" + n + "'" for n in names]
    if len(q) == 1:
        return q[0]
    if len(q) == 2:
        return q[0] + " and " + q[1]
    return ", ".join(q[:-1]) + ", and " + q[-1]


def _nt_tuple(x):
    # the values of a tuple or of a named tuple, else None
    if isinstance(x, tuple):
        return x
    if hasattr(type(x), "_fields") and hasattr(x, "_nt_values"):
        return x._nt_values
    return None


def namedtuple(typename, field_names, *, rename=False, defaults=None, module=None):
    # like CPython's collections.namedtuple; the class is not a subclass of tuple here (Natter has no
    # subclasses of built-in types), but it behaves like one: indexing, unpacking, comparing, hashing
    import keyword as _keyword
    if isinstance(field_names, str):
        field_names = field_names.replace(",", " ").split()
    field_names = list(map(str, field_names))
    typename = str(typename)
    if rename:
        seen = set()
        for index, name in enumerate(field_names):
            if (not name.isidentifier() or _keyword.iskeyword(name) or name.startswith("_") or name in seen):
                field_names[index] = "_" + str(index)
            seen.add(name)
    for name in [typename] + field_names:
        if type(name) is not str:
            raise TypeError("Type names and field names must be strings")
        if not name.isidentifier():
            raise ValueError("Type names and field names must be valid identifiers: " + repr(name))
        if _keyword.iskeyword(name):
            raise ValueError("Type names and field names cannot be a keyword: " + repr(name))
    seen = set()
    for name in field_names:
        if name.startswith("_") and not rename:
            raise ValueError("Field names cannot start with an underscore: " + repr(name))
        if name in seen:
            raise ValueError("Encountered duplicate field name: " + repr(name))
        seen.add(name)
    field_defaults = {}
    if defaults is not None:
        defaults = tuple(defaults)
        if len(defaults) > len(field_names):
            raise TypeError("Got more default values than field names")
        field_defaults = dict(reversed(list(zip(reversed(field_names), reversed(defaults)))))
    fields = tuple(field_names)
    n = len(fields)
    qualname = typename + ".__new__"

    class _Tuple:
        _fields = fields
        _field_defaults = field_defaults
        __natter_tuple__ = True  # isinstance(p, tuple) is true, as for CPython's named tuples
        __match_args__ = fields

        def __new__(_cls, *args, **kwargs):
            values = list(args[:n])
            for k in kwargs:
                if k in fields:
                    if fields.index(k) < len(args):
                        raise TypeError(qualname + "() got multiple values for argument '" + k + "'")
                else:
                    raise TypeError(qualname + "() got an unexpected keyword argument '" + k + "'")
            if len(args) > n:
                top = n + 1
                low = top - len(field_defaults)
                sig = ("from " + str(low) + " to " + str(top)) if low != top else str(top)
                raise TypeError(qualname + "() takes " + sig + " positional argument" + ("s" if low != top or top != 1 else "") + " but " + str(len(args) + 1) + " were given")
            missing = []
            for name in fields[len(args):]:
                if name in kwargs:
                    values.append(kwargs[name])
                elif name in field_defaults:
                    values.append(field_defaults[name])
                else:
                    missing.append(name)
            if missing:
                raise TypeError(qualname + "() missing " + str(len(missing)) + " required positional argument" + ("s" if len(missing) != 1 else "") + ": " + _nt_names(missing))
            self = object.__new__(_cls)
            object.__setattr__(self, "_nt_values", tuple(values))
            return self

        @classmethod
        def _make(cls, iterable):
            values = tuple(iterable)
            if len(values) != n:
                raise TypeError("Expected " + str(n) + " arguments, got " + str(len(values)))
            self = object.__new__(cls)
            object.__setattr__(self, "_nt_values", values)
            return self

        def _replace(self, **kwds):
            result = self._make(kwds.pop(name) if name in kwds else value for name, value in zip(fields, self._nt_values))
            if kwds:
                raise TypeError("Got unexpected field names: " + repr(list(kwds)))
            return result

        def _asdict(self):
            return dict(zip(fields, self._nt_values))

        def __getnewargs__(self):
            return self._nt_values

        def __repr__(self):
            return self.__class__.__name__ + "(" + ", ".join(f + "=" + repr(v) for f, v in zip(fields, self._nt_values)) + ")"

        def __setattr__(self, name, value):
            if name in fields:
                raise AttributeError("can't set attribute")
            raise AttributeError("'" + type(self).__name__ + "' object has no attribute '" + name + "' and no __dict__ for setting new attributes")

        def __delattr__(self, name):
            if name in fields:
                raise AttributeError("can't delete attribute")
            raise AttributeError("'" + type(self).__name__ + "' object has no attribute '" + name + "'")

        def __iter__(self):
            return iter(self._nt_values)

        def __reversed__(self):
            return reversed(self._nt_values)

        def __len__(self):
            return n

        def __contains__(self, x):
            return x in self._nt_values

        def __getitem__(self, i):
            return self._nt_values[i]

        def count(self, x):
            return self._nt_values.count(x)

        def index(self, x, *args):
            return self._nt_values.index(x, *args)

        def __add__(self, other):
            o = _nt_tuple(other)
            if o is None:
                return NotImplemented
            return self._nt_values + o

        def __radd__(self, other):
            o = _nt_tuple(other)
            if o is None:
                return NotImplemented
            return o + self._nt_values

        def __mul__(self, k):
            return self._nt_values * k

        __rmul__ = __mul__

        def __eq__(self, other):
            o = _nt_tuple(other)
            return NotImplemented if o is None else self._nt_values == o

        def __ne__(self, other):
            o = _nt_tuple(other)
            return NotImplemented if o is None else self._nt_values != o

        def __lt__(self, other):
            o = _nt_tuple(other)
            return NotImplemented if o is None else self._nt_values < o

        def __le__(self, other):
            o = _nt_tuple(other)
            return NotImplemented if o is None else self._nt_values <= o

        def __gt__(self, other):
            o = _nt_tuple(other)
            return NotImplemented if o is None else self._nt_values > o

        def __ge__(self, other):
            o = _nt_tuple(other)
            return NotImplemented if o is None else self._nt_values >= o

        def __hash__(self):
            return hash(self._nt_values)

    for i, name in enumerate(fields):
        setattr(_Tuple, name, property(lambda self, i=i: self._nt_values[i]))
    _Tuple.__name__ = typename
    _Tuple.__qualname__ = typename
    _Tuple.__module__ = "__main__" if module is None else module
    _Tuple.__new__.__qualname__ = qualname
    return _Tuple
`;
