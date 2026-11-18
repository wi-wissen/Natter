// dataclasses like CPython 3.13 (Lib/dataclasses.py). CPython writes __init__, __repr__, __eq__ … as source text and
// runs it with exec(); Natter has no exec, so these are closures that do the same, with the same error messages
// (the argument errors of the generated __init__ are CPython's).
export default String.raw`
import copy as _copy

__all__ = ["dataclass", "field", "Field", "FrozenInstanceError", "InitVar", "KW_ONLY", "MISSING",
           "fields", "asdict", "astuple", "replace", "is_dataclass"]


class FrozenInstanceError(AttributeError):
    pass


class _HAS_DEFAULT_FACTORY_CLASS:
    def __repr__(self):
        return "<factory>"


_HAS_DEFAULT_FACTORY = _HAS_DEFAULT_FACTORY_CLASS()


class _MISSING_TYPE:
    pass


MISSING = _MISSING_TYPE()


class _KW_ONLY_TYPE:
    pass


KW_ONLY = _KW_ONLY_TYPE()


class _MappingProxy:
    # types.MappingProxyType: a read-only view of a dict
    def __init__(self, d):
        self._d = d

    def __getitem__(self, key):
        return self._d[key]

    def __len__(self):
        return len(self._d)

    def __iter__(self):
        return iter(self._d)

    def __contains__(self, key):
        return key in self._d

    def get(self, key, default=None):
        return self._d.get(key, default)

    def keys(self):
        return self._d.keys()

    def values(self):
        return self._d.values()

    def items(self):
        return self._d.items()

    def __eq__(self, other):
        return self._d == other

    def __repr__(self):
        return "mappingproxy(" + repr(self._d) + ")"

    def __str__(self):
        return str(self._d)


_EMPTY_METADATA = _MappingProxy({})


class _FIELD_BASE:
    def __init__(self, name):
        self.name = name

    def __repr__(self):
        return self.name


_FIELD = _FIELD_BASE("_FIELD")
_FIELD_CLASSVAR = _FIELD_BASE("_FIELD_CLASSVAR")
_FIELD_INITVAR = _FIELD_BASE("_FIELD_INITVAR")

_FIELDS = "__dataclass_fields__"
_PARAMS = "__dataclass_params__"
_POST_INIT_NAME = "__post_init__"


def _type_repr(t):
    if isinstance(t, type):
        r = repr(t)[8:-2]
        return r[9:] if r.startswith("builtins.") else r
    return repr(t)


class InitVar:
    def __init__(self, type):
        self.type = type

    def __repr__(self):
        return "dataclasses.InitVar[" + _type_repr(self.type) + "]"

    def __class_getitem__(cls, type):
        return InitVar(type)


class Field:
    def __init__(self, default, default_factory, init, repr, hash, compare, metadata, kw_only):
        self.name = None
        self.type = None
        self.default = default
        self.default_factory = default_factory
        self.init = init
        self.repr = repr
        self.hash = hash
        self.compare = compare
        self.metadata = _EMPTY_METADATA if metadata is None else _MappingProxy(metadata)
        self.kw_only = kw_only
        self._field_type = None

    def __repr__(self):
        return ("Field("
                + "name=" + repr(self.name) + ","
                + "type=" + repr(self.type) + ","
                + "default=" + repr(self.default) + ","
                + "default_factory=" + repr(self.default_factory) + ","
                + "init=" + repr(self.init) + ","
                + "repr=" + repr(self.repr) + ","
                + "hash=" + repr(self.hash) + ","
                + "compare=" + repr(self.compare) + ","
                + "metadata=" + repr(self.metadata) + ","
                + "kw_only=" + repr(self.kw_only) + ","
                + "_field_type=" + str(self._field_type)
                + ")")


class _DataclassParams:
    def __init__(self, init, repr, eq, order, unsafe_hash, frozen, match_args, kw_only, slots, weakref_slot):
        self.init = init
        self.repr = repr
        self.eq = eq
        self.order = order
        self.unsafe_hash = unsafe_hash
        self.frozen = frozen
        self.match_args = match_args
        self.kw_only = kw_only
        self.slots = slots
        self.weakref_slot = weakref_slot

    def __repr__(self):
        return ("_DataclassParams("
                + "init=" + repr(self.init) + ","
                + "repr=" + repr(self.repr) + ","
                + "eq=" + repr(self.eq) + ","
                + "order=" + repr(self.order) + ","
                + "unsafe_hash=" + repr(self.unsafe_hash) + ","
                + "frozen=" + repr(self.frozen) + ","
                + "match_args=" + repr(self.match_args) + ","
                + "kw_only=" + repr(self.kw_only) + ","
                + "slots=" + repr(self.slots) + ","
                + "weakref_slot=" + repr(self.weakref_slot)
                + ")")


def field(*, default=MISSING, default_factory=MISSING, init=True, repr=True, hash=None, compare=True, metadata=None, kw_only=MISSING):
    if default is not MISSING and default_factory is not MISSING:
        raise ValueError("cannot specify both default and default_factory")
    return Field(default, default_factory, init, repr, hash, compare, metadata, kw_only)


def _fields_in_init_order(fields):
    return (tuple(f for f in fields if f.init and not f.kw_only),
            tuple(f for f in fields if f.init and f.kw_only))


def _own(cls, name):
    return name in cls.__dict__


def _set_new_attribute(cls, name, value):
    if _own(cls, name):
        return True
    setattr(cls, name, value)
    return False


def _method(cls, name, fn):
    fn.__name__ = name
    fn.__qualname__ = cls.__qualname__ + "." + name
    return fn


def _is_classvar(a_type):
    try:
        import typing
    except ImportError:
        return False
    if a_type is typing.ClassVar:
        return True
    if isinstance(a_type, str):
        t = a_type.strip()
        return t == "ClassVar" or t.startswith("ClassVar[") or t == "typing.ClassVar" or t.startswith("typing.ClassVar[")
    return getattr(a_type, "_name", None) == "ClassVar" and type(a_type).__name__ == "_Generic"


def _is_initvar(a_type):
    if a_type is InitVar or isinstance(a_type, InitVar):
        return True
    if isinstance(a_type, str):
        t = a_type.strip()
        return t == "InitVar" or t.startswith("InitVar[") or t.startswith("dataclasses.InitVar")
    return False


def _is_kw_only(a_type):
    if a_type is KW_ONLY:
        return True
    return isinstance(a_type, str) and a_type.strip() in ("KW_ONLY", "dataclasses.KW_ONLY")


def _unhashable_default(value):
    if type(value) in (list, dict, set):
        return True
    try:
        return type(value).__hash__ is None
    except AttributeError:
        return False


def _get_field(cls, a_name, a_type, default_kw_only):
    default = getattr(cls, a_name, MISSING)
    if isinstance(default, Field):
        f = default
    else:
        f = field(default=default)
    f.name = a_name
    f.type = a_type
    f._field_type = _FIELD
    if _is_classvar(a_type):
        f._field_type = _FIELD_CLASSVAR
    if f._field_type is _FIELD and _is_initvar(a_type):
        f._field_type = _FIELD_INITVAR
    if f._field_type in (_FIELD_CLASSVAR, _FIELD_INITVAR):
        if f.default_factory is not MISSING:
            raise TypeError("field " + f.name + " cannot have a default factory")
    if f._field_type in (_FIELD, _FIELD_INITVAR):
        if f.kw_only is MISSING:
            f.kw_only = default_kw_only
    else:
        if f.kw_only is not MISSING:
            raise TypeError("field " + f.name + " is a ClassVar but specifies kw_only")
    if f._field_type is _FIELD and _unhashable_default(f.default):
        raise ValueError("mutable default " + repr(type(f.default)) + " for field " + f.name + " is not allowed: use default_factory")
    return f


def _names(names):
    q = ["'" + n + "'" for n in names]
    if len(q) == 1:
        return q[0]
    if len(q) == 2:
        return q[0] + " and " + q[1]
    return ", ".join(q[:-1]) + ", and " + q[-1]


def _bind(qualname, std, kwonly, args, kwargs):
    # what CPython does when it calls a function with the signature (self, *std, *, *kwonly); self is not in args
    values = {}
    names = [f.name for f in std]
    for i in range(min(len(args), len(std))):
        values[names[i]] = args[i]
    kwnames = [f.name for f in kwonly]
    for k in kwargs:
        if k in names:
            if k in values:
                raise TypeError(qualname + "() got multiple values for argument '" + k + "'")
        elif k not in kwnames:
            raise TypeError(qualname + "() got an unexpected keyword argument '" + k + "'")
        values[k] = kwargs[k]
    if len(args) > len(std):
        top = len(std) + 1
        low = top - len([f for f in std if f.default is not MISSING or f.default_factory is not MISSING])
        sig = ("from " + str(low) + " to " + str(top)) if low != top else str(top)
        many = low != top or top != 1
        given = len(args) + 1
        kwgiven = len([k for k in kwargs if k in kwnames])
        text = qualname + "() takes " + sig + " positional argument" + ("s" if many else "") + " but " + str(given)
        if kwgiven:
            text += " positional argument" + ("s" if given != 1 else "") + " (and " + str(kwgiven) + " keyword-only argument" + ("s" if kwgiven != 1 else "") + ")"
        text += " were given" if given != 1 or kwgiven else " was given"
        raise TypeError(text)
    for kind, group in (("positional", std), ("keyword-only", kwonly)):
        missing = []
        for f in group:
            if f.name in values:
                continue
            if f.default_factory is not MISSING:
                values[f.name] = _HAS_DEFAULT_FACTORY
            elif f.default is not MISSING:
                values[f.name] = f.default
            else:
                missing.append(f.name)
        if missing:
            raise TypeError(qualname + "() missing " + str(len(missing)) + " required " + kind + " argument" + ("s" if len(missing) != 1 else "") + ": " + _names(missing))
    return values


def _init_fn(cls, fields, std_fields, kw_only_fields, frozen, has_post_init):
    seen_default = None
    for f in std_fields:
        if f.init:
            if not (f.default is MISSING and f.default_factory is MISSING):
                seen_default = f
            elif seen_default:
                raise TypeError("non-default argument " + repr(f.name) + " follows default argument " + repr(seen_default.name))
    qualname = cls.__qualname__ + ".__init__"
    initvars = [f for f in fields if f._field_type is _FIELD_INITVAR]

    def __init__(self, *args, **kwargs):
        values = _bind(qualname, std_fields, kw_only_fields, args, kwargs)
        for f in fields:
            if f._field_type is _FIELD_INITVAR:
                continue
            if f.init:
                value = values[f.name]
                if value is _HAS_DEFAULT_FACTORY:
                    value = f.default_factory()
            elif f.default_factory is not MISSING:
                value = f.default_factory()
            else:
                continue
            if frozen:
                object.__setattr__(self, f.name, value)
            else:
                setattr(self, f.name, value)
        if has_post_init:
            extra = []
            for f in initvars:
                v = values.get(f.name, f.default)
                extra.append(v)
            self.__post_init__(*extra)

    return _method(cls, "__init__", __init__)


_repr_running = set()


def _repr_fn(cls, fields):
    def __repr__(self):
        key = id(self)
        if key in _repr_running:
            return "..."
        _repr_running.add(key)
        try:
            parts = [f.name + "=" + repr(getattr(self, f.name)) for f in fields]
            return self.__class__.__qualname__ + "(" + ", ".join(parts) + ")"
        finally:
            _repr_running.discard(key)

    return _method(cls, "__repr__", __repr__)


def _eq_fn(cls, fields):
    def __eq__(self, other):
        if self is other:
            return True
        if other.__class__ is self.__class__:
            result = True
            for f in fields:
                result = getattr(self, f.name) == getattr(other, f.name)
                if not result:
                    return result
            return result
        return NotImplemented

    return _method(cls, "__eq__", __eq__)


def _cmp_fn(cls, name, op, fields):
    def compare(self, other):
        if other.__class__ is self.__class__:
            a = tuple(getattr(self, f.name) for f in fields)
            b = tuple(getattr(other, f.name) for f in fields)
            if op == "<":
                return a < b
            if op == "<=":
                return a <= b
            if op == ">":
                return a > b
            return a >= b
        return NotImplemented

    return _method(cls, name, compare)


def _hash_fn(cls, fields):
    def __hash__(self):
        return hash(tuple(getattr(self, f.name) for f in fields))

    return _method(cls, "__hash__", __hash__)


def _frozen_get_del_attr(cls, fields):
    names = tuple(f.name for f in fields)

    def __setattr__(self, name, value):
        if type(self) is cls or name in names:
            raise FrozenInstanceError("cannot assign to field " + repr(name))
        super(cls, self).__setattr__(name, value)

    def __delattr__(self, name):
        if type(self) is cls or name in names:
            raise FrozenInstanceError("cannot delete field " + repr(name))
        super(cls, self).__delattr__(name)

    return (_method(cls, "__setattr__", __setattr__), _method(cls, "__delattr__", __delattr__))


def _hash_action(cls, fields, unsafe_hash, eq, frozen, has_explicit_hash):
    # the table in CPython's dataclasses.py
    if not unsafe_hash and not eq:
        return
    if not unsafe_hash and eq and not frozen:
        if not has_explicit_hash:
            cls.__hash__ = None
        return
    if not unsafe_hash and eq and frozen:
        if not has_explicit_hash:
            cls.__hash__ = _hash_fn(cls, [f for f in fields if (f.compare if f.hash is None else f.hash)])
        return
    if has_explicit_hash:
        raise TypeError("Cannot overwrite attribute __hash__ in class " + cls.__name__)
    cls.__hash__ = _hash_fn(cls, [f for f in fields if (f.compare if f.hash is None else f.hash)])


def _process_class(cls, init, repr, eq, order, unsafe_hash, frozen, match_args, kw_only, slots, weakref_slot):
    fields = {}
    all_frozen_bases = None
    any_frozen_base = False
    has_dataclass_bases = False
    for b in cls.__mro__[-1:0:-1]:
        base_fields = getattr(b, _FIELDS, None)
        if base_fields is not None:
            has_dataclass_bases = True
            for f in base_fields.values():
                fields[f.name] = f
            if all_frozen_bases is None:
                all_frozen_bases = True
            current_frozen = getattr(b, _PARAMS).frozen
            all_frozen_bases = all_frozen_bases and current_frozen
            any_frozen_base = any_frozen_base or current_frozen

    cls_annotations = cls.__annotations__
    cls_fields = []
    kw_only_seen = False
    for name, a_type in cls_annotations.items():
        if _is_kw_only(a_type):
            if kw_only_seen:
                raise TypeError(repr_(name) + " is KW_ONLY, but KW_ONLY has already been specified")
            kw_only_seen = True
            kw_only = True
        else:
            cls_fields.append(_get_field(cls, name, a_type, kw_only))
    for f in cls_fields:
        fields[f.name] = f
        if isinstance(getattr(cls, f.name, None), Field):
            if f.default is MISSING:
                delattr(cls, f.name)
            else:
                setattr(cls, f.name, f.default)
    for name, value in cls.__dict__.items():
        if isinstance(value, Field) and name not in cls_annotations:
            raise TypeError(repr_(name) + " is a field but has no type annotation")

    if has_dataclass_bases:
        if any_frozen_base and not frozen:
            raise TypeError("cannot inherit non-frozen dataclass from a frozen one")
        if all_frozen_bases is False and frozen:
            raise TypeError("cannot inherit frozen dataclass from a non-frozen one")

    setattr(cls, _FIELDS, fields)
    setattr(cls, _PARAMS, _DataclassParams(init, repr, eq, order, unsafe_hash, frozen, match_args, kw_only, slots, weakref_slot))

    class_hash = cls.__dict__.get("__hash__", MISSING)
    has_explicit_hash = not (class_hash is MISSING or (class_hash is None and "__eq__" in cls.__dict__))

    if order and not eq:
        raise ValueError("eq must be true if order is true")

    all_init_fields = [f for f in fields.values() if f._field_type in (_FIELD, _FIELD_INITVAR)]
    std_init_fields, kw_only_init_fields = _fields_in_init_order(all_init_fields)

    if init:
        has_post_init = hasattr(cls, _POST_INIT_NAME)
        _set_new_attribute(cls, "__init__", _init_fn(cls, all_init_fields, std_init_fields, kw_only_init_fields, frozen, has_post_init))

    field_list = [f for f in fields.values() if f._field_type is _FIELD]

    if repr:
        _set_new_attribute(cls, "__repr__", _repr_fn(cls, [f for f in field_list if f.repr]))

    if eq:
        _set_new_attribute(cls, "__eq__", _eq_fn(cls, [f for f in field_list if f.compare]))

    if order:
        cmp_fields = [f for f in field_list if f.compare]
        for name, op in (("__lt__", "<"), ("__le__", "<="), ("__gt__", ">"), ("__ge__", ">=")):
            if _set_new_attribute(cls, name, _cmp_fn(cls, name, op, cmp_fields)):
                raise TypeError("Cannot overwrite attribute " + name + " in class " + cls.__name__ + " Consider using functools.total_ordering")

    if frozen:
        for fn in _frozen_get_del_attr(cls, field_list):
            if _set_new_attribute(cls, fn.__name__, fn):
                raise TypeError("Cannot overwrite attribute " + fn.__name__ + " in class " + cls.__name__)

    _hash_action(cls, field_list, bool(unsafe_hash), bool(eq), bool(frozen), has_explicit_hash)

    if match_args:
        _set_new_attribute(cls, "__match_args__", tuple(f.name for f in std_init_fields))

    return cls


def repr_(x):
    return repr(x)


def dataclass(cls=None, *, init=True, repr=True, eq=True, order=False, unsafe_hash=False, frozen=False,
              match_args=True, kw_only=False, slots=False, weakref_slot=False):
    def wrap(cls):
        return _process_class(cls, init, repr, eq, order, unsafe_hash, frozen, match_args, kw_only, slots, weakref_slot)

    if cls is None:
        return wrap
    return wrap(cls)


def fields(class_or_instance):
    try:
        fields = getattr(class_or_instance, _FIELDS)
    except AttributeError:
        raise TypeError("must be called with a dataclass type or instance") from None
    return tuple(f for f in fields.values() if f._field_type is _FIELD)


def _is_dataclass_instance(obj):
    return hasattr(type(obj), _FIELDS)


def is_dataclass(obj):
    cls = obj if isinstance(obj, type) else type(obj)
    return hasattr(cls, _FIELDS)


_ATOMIC_TYPES = (type(None), bool, int, float, str)


def _asdict_inner(obj, dict_factory):
    if type(obj) in _ATOMIC_TYPES:
        return obj
    if hasattr(type(obj), _FIELDS):
        if dict_factory is dict:
            return {f.name: _asdict_inner(getattr(obj, f.name), dict) for f in fields(obj)}
        return dict_factory([(f.name, _asdict_inner(getattr(obj, f.name), dict_factory)) for f in fields(obj)])
    if type(obj) is list:
        return [_asdict_inner(v, dict_factory) for v in obj]
    if type(obj) is dict:
        return {_asdict_inner(k, dict_factory): _asdict_inner(v, dict_factory) for k, v in obj.items()}
    if type(obj) is tuple:
        return tuple([_asdict_inner(v, dict_factory) for v in obj])
    if hasattr(obj, "_fields") and hasattr(obj, "_replace"):
        return obj.__class__(*[_asdict_inner(v, dict_factory) for v in obj])
    if isinstance(obj, (list, tuple)):
        return type(obj)(_asdict_inner(v, dict_factory) for v in obj)
    if isinstance(obj, dict):
        return type(obj)((_asdict_inner(k, dict_factory), _asdict_inner(v, dict_factory)) for k, v in obj.items())
    return _copy.deepcopy(obj)


def asdict(obj, *, dict_factory=dict):
    if not _is_dataclass_instance(obj):
        raise TypeError("asdict() should be called on dataclass instances")
    return _asdict_inner(obj, dict_factory)


def _astuple_inner(obj, tuple_factory):
    if type(obj) in _ATOMIC_TYPES:
        return obj
    if hasattr(type(obj), _FIELDS):
        return tuple_factory([_astuple_inner(getattr(obj, f.name), tuple_factory) for f in fields(obj)])
    if hasattr(obj, "_fields") and hasattr(obj, "_replace"):
        return obj.__class__(*[_astuple_inner(v, tuple_factory) for v in obj])
    if isinstance(obj, (list, tuple)):
        return type(obj)(_astuple_inner(v, tuple_factory) for v in obj)
    if isinstance(obj, dict):
        return type(obj)((_astuple_inner(k, tuple_factory), _astuple_inner(v, tuple_factory)) for k, v in obj.items())
    return _copy.deepcopy(obj)


def astuple(obj, *, tuple_factory=tuple):
    if not _is_dataclass_instance(obj):
        raise TypeError("astuple() should be called on dataclass instances")
    return _astuple_inner(obj, tuple_factory)


def replace(obj, **changes):
    if not _is_dataclass_instance(obj):
        raise TypeError("replace() should be called on dataclass instances")
    for f in getattr(obj, _FIELDS).values():
        if f._field_type is _FIELD_CLASSVAR:
            continue
        if not f.init:
            if f.name in changes:
                raise TypeError("field " + f.name + " is declared with init=False, it cannot be specified with replace()")
            continue
        if f.name not in changes:
            if f._field_type is _FIELD_INITVAR and f.default is MISSING:
                raise TypeError("InitVar " + repr(f.name) + " must be specified with replace()")
            changes[f.name] = getattr(obj, f.name)
    return obj.__class__(**changes)
`;
