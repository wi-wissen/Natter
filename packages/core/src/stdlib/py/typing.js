// typing: the names that type hints use, like CPython 3.13. Natter does not check hints, so these only have to exist,
// be subscriptable (List[int], Optional[str], Dict[str, int] …), print like CPython's (typing.List[int]) and answer
// isinstance()/issubclass() the way CPython does (isinstance([], List), isinstance(1, Union[int, str])).
export default String.raw`
import collections as _collections
from types import GenericAlias as _GenericAlias

TYPE_CHECKING = False
_NoneType = type(None)


class _OrMixin:
    # List[int] | None, T | None … make a typing.Union, as in CPython
    def __or__(self, other):
        return Union[self, other]

    def __ror__(self, other):
        return Union[other, self]


def _type_repr(obj):
    if isinstance(obj, type):
        r = repr(obj)
        return r[8:-2]
    if type(obj).__name__ == "function":
        return obj.__name__
    if isinstance(obj, list):
        return "[" + ", ".join([_type_repr(a) for a in obj]) + "]"
    return repr(obj)


class _EllipsisHint:
    # Natter's ... is None, so Callable[..., int] and Tuple[int, ...] arrive with None in that place
    def __repr__(self):
        return "..."


_ELLIPSIS = _EllipsisHint()


class ForwardRef(_OrMixin):
    def __init__(self, arg):
        if not isinstance(arg, str):
            raise TypeError("Forward reference must be a string -- got " + repr(arg))
        self.__forward_arg__ = arg

    def __repr__(self):
        return "ForwardRef(" + repr(self.__forward_arg__) + ")"

    def __eq__(self, other):
        return isinstance(other, ForwardRef) and self.__forward_arg__ == other.__forward_arg__

    def __hash__(self):
        return hash(self.__forward_arg__)


def _hint(arg):
    if arg is None:
        return _NoneType
    if isinstance(arg, str):
        return ForwardRef(arg)
    return arg


def _as_tuple(params):
    if isinstance(params, tuple):
        return params
    return (params,)


def _has_typevar(args):
    for a in args:
        if isinstance(a, TypeVar):
            return True
        if isinstance(a, _Alias) and _has_typevar(a.__args__):
            return True
        if isinstance(a, list) and _has_typevar(a):
            return True
    return False


def _subst(a, table):
    if isinstance(a, TypeVar):
        return table.get(a, a)
    if isinstance(a, list):
        return [_subst(x, table) for x in a]
    if isinstance(a, _Alias) and _has_typevar(a.__args__):
        return a._with([_subst(x, table) for x in a.__args__])
    return a


def _typevars(args):
    out = []
    for a in args:
        if isinstance(a, TypeVar):
            if a not in out:
                out.append(a)
        elif isinstance(a, _Alias):
            for t in _typevars(a.__args__):
                if t not in out:
                    out.append(t)
        elif isinstance(a, list):
            for t in _typevars(a):
                if t not in out:
                    out.append(t)
    return out


# ------------------------------------------------------------------ checks for isinstance() (collections.abc)

_ITERATORS = ("iterator", "generator", "map", "filter", "zip", "enumerate", "reversed")
_COLLECTIONS = ("list", "tuple", "dict", "set", "frozenset", "str", "range", "dict_keys", "dict_values", "dict_items")


def _methods(cls, names):
    for n in names:
        if not hasattr(cls, n):
            return False
    return True


def _builtin(t):
    return repr(t).startswith("<class '") and not repr(t).startswith("<class '__main__.")


def _abc(builtins, methods):
    def check(cls):
        if _builtin(cls):
            return cls.__name__ in builtins
        return bool(methods) and _methods(cls, methods)
    return check


def _hashable(cls):
    return cls.__name__ not in ("list", "dict", "set", "dict_keys", "dict_values", "dict_items") or not _builtin(cls)


_CHECKS = {
    "Iterable": _abc(_COLLECTIONS + _ITERATORS, ("__iter__",)),
    "Iterator": _abc(_ITERATORS, ("__iter__", "__next__")),
    "Generator": _abc(("generator",), ("__iter__", "__next__", "send", "throw")),
    "Sized": _abc(_COLLECTIONS, ("__len__",)),
    "Container": _abc(_COLLECTIONS, ("__contains__",)),
    "Collection": _abc(_COLLECTIONS, ("__len__", "__iter__", "__contains__")),
    "Reversible": _abc(("list", "tuple", "dict", "str", "range", "dict_keys", "dict_values", "dict_items"), ("__reversed__", "__iter__")),
    "Sequence": _abc(("list", "tuple", "str", "range"), ()),
    "MutableSequence": _abc(("list",), ()),
    "Mapping": _abc(("dict",), ()),
    "MutableMapping": _abc(("dict",), ()),
    "AbstractSet": _abc(("set", "frozenset", "dict_keys", "dict_items"), ()),
    "MutableSet": _abc(("set",), ()),
    "Hashable": _hashable,
}

_ABSTRACT = {
    "Callable": "'__call__'",
    "Iterable": "'__iter__'",
    "Iterator": "'__next__'",
    "Generator": "'send', 'throw'",
    "Sequence": "'__getitem__', '__len__'",
    "MutableSequence": "'__delitem__', '__getitem__', '__len__', '__setitem__', 'insert'",
    "Mapping": "'__getitem__', '__iter__', '__len__'",
    "MutableMapping": "'__delitem__', '__getitem__', '__iter__', '__len__', '__setitem__'",
    "Collection": "'__contains__', '__iter__', '__len__'",
    "Hashable": "'__hash__'",
    "Sized": "'__len__'",
    "Reversible": "'__iter__', '__reversed__'",
    "Container": "'__contains__'",
    "AbstractSet": "'__contains__', '__iter__', '__len__'",
    "MutableSet": "'__contains__', '__iter__', '__len__', 'add', 'discard'",
}
_ABC_NAMES = {"AbstractSet": "Set"}


# ------------------------------------------------------------------ the special forms and aliases

class _Alias(_OrMixin):
    # List, Dict, Iterable …: bare (args None) or subscripted (List[int])
    def __init__(self, name, origin, args=None, nparams=-1, inst=None, check=None):
        self._name = name
        self.__origin__ = origin
        self._args = args
        self._nparams = nparams
        self._inst = inst
        self._check = check
        self.__args__ = () if args is None else tuple(args)

    def _with(self, args):
        return _Alias(self._name, self.__origin__, args, self._nparams, self._inst, self._check)

    def __getitem__(self, params):
        if self._args is not None:
            vars = _typevars(self.__args__)
            if not vars:
                raise TypeError(repr(self) + " is not a generic class")
            params = _as_tuple(params)
            if len(params) != len(vars):
                raise TypeError("Too " + ("many" if len(params) > len(vars) else "few") + " arguments for " + repr(self) + "; actual " + str(len(params)) + ", expected " + str(len(vars)))
            table = {}
            for i in range(len(vars)):
                table[vars[i]] = _hint(params[i])
            return self._with([_subst(a, table) for a in self.__args__])
        if self._name == "Callable":
            if not isinstance(params, tuple) or len(params) != 2:
                raise TypeError("Callable must be used as Callable[[arg, ...], result].")
            args, result = params
            if args is None:
                return _Alias(self._name, self.__origin__, [_ELLIPSIS, _hint(result)], -1, self._inst, self._check)
            if not isinstance(args, list):
                raise TypeError("Callable[args, result]: args must be a list. Got " + _type_repr(args))
            return _Alias(self._name, self.__origin__, [[_hint(a) for a in args], _hint(result)], -1, self._inst, self._check)
        if self._name == "Tuple" and params == ():
            return self._with([()])
        params = _as_tuple(params)
        if self._name == "Tuple" and len(params) == 2 and params[1] is None:
            return self._with([_hint(params[0]), _ELLIPSIS])
        if self._nparams >= 0 and len(params) != self._nparams:
            raise TypeError("Too " + ("many" if len(params) > self._nparams else "few") + " arguments for " + repr(self) + "; actual " + str(len(params)) + ", expected " + str(self._nparams))
        return self._with([_hint(a) for a in params])

    @property
    def __parameters__(self):
        return tuple(_typevars(self.__args__))

    def __repr__(self):
        if self._args is None:
            return "typing." + self._name
        if self._name == "Callable":
            return "typing.Callable[" + _type_repr(self._args[0]) + ", " + _type_repr(self._args[1]) + "]"
        if self._name == "Tuple" and self._args == [()]:
            return "typing.Tuple[()]"
        return "typing." + self._name + "[" + ", ".join([_type_repr(a) for a in self._args]) + "]"

    def __eq__(self, other):
        if not isinstance(other, _Alias):
            return NotImplemented
        return self._name == other._name and self.__args__ == other.__args__

    def __hash__(self):
        return hash((self._name, self.__args__))

    def __call__(self, *args, **kwargs):
        if self._inst is not None:
            return self._inst(*args, **kwargs)
        if self._name in _ABSTRACT:
            plural = "s" if "," in _ABSTRACT[self._name] else ""
            raise TypeError("Can't instantiate abstract class " + _ABC_NAMES.get(self._name, self._name) + " without an implementation for abstract method" + plural + " " + _ABSTRACT[self._name])
        raise TypeError("Type " + self._name + " cannot be instantiated; use " + self.__origin__.__name__ + "() instead")

    def _test(self, cls):
        if self._check is not None:
            return self._check(cls)
        return issubclass(cls, self.__origin__)

    def __instancecheck__(self, obj):
        if self._args is not None:
            raise TypeError("Subscripted generics cannot be used with class and instance checks")
        if self._name == "Callable":
            return callable(obj)
        if self._name == "Hashable":
            try:
                hash(obj)
                return True
            except TypeError:
                return False
        return isinstance(obj, self.__origin__) if self._check is None else self._test(type(obj))

    def __subclasscheck__(self, cls):
        if self._args is not None:
            raise TypeError("Subscripted generics cannot be used with class and instance checks")
        if not isinstance(cls, type):
            raise TypeError("issubclass() arg 1 must be a class")
        return self._test(cls)


class _UnionAlias(_OrMixin):
    def __init__(self, args):
        self.__args__ = args
        self.__origin__ = Union

    def __repr__(self):
        a = self.__args__
        if len(a) == 2 and _NoneType in a:
            other = a[0] if a[1] is _NoneType else a[1]
            return "typing.Optional[" + _type_repr(other) + "]"
        return "typing.Union[" + ", ".join([_type_repr(x) for x in a]) + "]"

    def __eq__(self, other):
        if not isinstance(other, _UnionAlias) and type(other).__name__ != "UnionType":
            return NotImplemented
        return set(self.__args__) == set(other.__args__)

    def __hash__(self):
        return hash(frozenset(self.__args__))

    def __getitem__(self, params):
        vars = _typevars(self.__args__)
        if not vars:
            raise TypeError(repr(self) + " is not a generic class")
        params = _as_tuple(params)
        table = {}
        for i in range(len(vars)):
            table[vars[i]] = _hint(params[i])
        return Union[tuple([_subst(a, table) for a in self.__args__])]

    def __call__(self, *args, **kwargs):
        raise TypeError("Cannot instantiate typing.Union")

    def __instancecheck__(self, obj):
        for a in self.__args__:
            if isinstance(a, _Alias) and a._args is not None or not isinstance(a, (type, _Alias, _UnionAlias)):
                raise TypeError("Subscripted generics cannot be used with class and instance checks")
        for a in self.__args__:
            if isinstance(obj, a):
                return True
        return False

    def __subclasscheck__(self, cls):
        for a in self.__args__:
            if issubclass(cls, a):
                return True
        return False


class _SpecialForm(_OrMixin):
    # Any, Union, Optional, Literal, ClassVar …
    def __init__(self, name, getitem=None):
        self._name = name
        self._getitem = getitem

    def __repr__(self):
        return "typing." + self._name

    def __getitem__(self, params):
        if self._getitem is None:
            raise TypeError(repr(self) + " is not subscriptable")
        return self._getitem(self, params)

    def __call__(self, *args, **kwargs):
        if self._name == "Any":
            raise TypeError("Any cannot be instantiated")
        raise TypeError("Cannot instantiate typing." + self._name)

    def __instancecheck__(self, obj):
        raise TypeError("typing." + self._name + " cannot be used with isinstance()")

    def __subclasscheck__(self, cls):
        if self._name == "Any":
            return False
        raise TypeError("typing." + self._name + " cannot be used with issubclass()")


class _Generic(_OrMixin):
    # Literal['a', 1], ClassVar[int], Annotated[int, 'x'] …: printed with repr() of the arguments
    def __init__(self, name, args, text):
        self._name = name
        self.__args__ = args
        self._text = text

    def __repr__(self):
        return "typing." + self._name + "[" + self._text + "]"

    def __eq__(self, other):
        if not isinstance(other, _Generic):
            return NotImplemented
        return self._name == other._name and self.__args__ == other.__args__

    def __hash__(self):
        return hash((self._name, self.__args__))

    def __call__(self, *args, **kwargs):
        raise TypeError("Cannot instantiate typing." + self._name)

    def __instancecheck__(self, obj):
        raise TypeError("Subscripted generics cannot be used with class and instance checks")


def _union(form, params):
    if params == ():
        raise TypeError("Cannot take a Union of no types.")
    args = []
    for p in _as_tuple(params):
        p = _hint(p)
        if isinstance(p, _UnionAlias) or type(p).__name__ == "UnionType":
            more = p.__args__
        else:
            more = (p,)
        for a in more:
            if a not in args:
                args.append(a)
    if len(args) == 1:
        return args[0]
    return _UnionAlias(tuple(args))


def _optional(form, params):
    if isinstance(params, tuple):
        raise TypeError("typing.Optional requires a single type. Got " + repr(params) + ".")
    return _union(form, (params, None))


def _literal(form, params):
    args = _as_tuple(params)
    return _Generic("Literal", args, ", ".join([repr(a) for a in args]))


def _one(form, params):
    if isinstance(params, tuple):
        raise TypeError(repr(form) + " accepts only single type.")
    p = _hint(params)
    return _Generic(form._name, (p,), _type_repr(p))


def _annotated(form, params):
    if not isinstance(params, tuple) or len(params) < 2:
        raise TypeError("Annotated[...] should be used with at least two arguments (a type and an annotation).")
    t = _hint(params[0])
    return _Generic("Annotated", params, _type_repr(t) + ", " + ", ".join([repr(a) for a in params[1:]]))


Any = _SpecialForm("Any")
NoReturn = _SpecialForm("NoReturn")
Never = _SpecialForm("Never")
Self = _SpecialForm("Self")
LiteralString = _SpecialForm("LiteralString")
TypeAlias = _SpecialForm("TypeAlias")
Union = _SpecialForm("Union", _union)
Optional = _SpecialForm("Optional", _optional)
Literal = _SpecialForm("Literal", _literal)
ClassVar = _SpecialForm("ClassVar", _one)
Final = _SpecialForm("Final", _one)
Annotated = _SpecialForm("Annotated", _annotated)
Required = _SpecialForm("Required", _one)
NotRequired = _SpecialForm("NotRequired", _one)
ReadOnly = _SpecialForm("ReadOnly", _one)

List = _Alias("List", list, nparams=1)
Dict = _Alias("Dict", dict, nparams=2)
Set = _Alias("Set", set, nparams=1)
FrozenSet = _Alias("FrozenSet", frozenset, nparams=1)
Tuple = _Alias("Tuple", tuple)
Type = _Alias("Type", type, nparams=1)
Callable = _Alias("Callable", None, check=callable)
Deque = _Alias("Deque", _collections.deque, nparams=1, inst=_collections.deque)
DefaultDict = _Alias("DefaultDict", _collections.defaultdict, nparams=2, inst=_collections.defaultdict)
OrderedDict = _Alias("OrderedDict", _collections.OrderedDict, nparams=2, inst=_collections.OrderedDict)
Counter = _Alias("Counter", _collections.Counter, nparams=1, inst=_collections.Counter)
ChainMap = _Alias("ChainMap", None, nparams=2)
Text = str

Iterable = _Alias("Iterable", None, nparams=1, check=_CHECKS["Iterable"])
Iterator = _Alias("Iterator", None, nparams=1, check=_CHECKS["Iterator"])
Sized = _Alias("Sized", None, nparams=0, check=_CHECKS["Sized"])
Container = _Alias("Container", None, nparams=1, check=_CHECKS["Container"])
Collection = _Alias("Collection", None, nparams=1, check=_CHECKS["Collection"])
Reversible = _Alias("Reversible", None, nparams=1, check=_CHECKS["Reversible"])
Sequence = _Alias("Sequence", None, nparams=1, check=_CHECKS["Sequence"])
MutableSequence = _Alias("MutableSequence", None, nparams=1, check=_CHECKS["MutableSequence"])
Mapping = _Alias("Mapping", None, nparams=2, check=_CHECKS["Mapping"])
MutableMapping = _Alias("MutableMapping", None, nparams=2, check=_CHECKS["MutableMapping"])
AbstractSet = _Alias("AbstractSet", None, nparams=1, check=_CHECKS["AbstractSet"])
MutableSet = _Alias("MutableSet", None, nparams=1, check=_CHECKS["MutableSet"])
Hashable = _Alias("Hashable", None, nparams=0, check=_CHECKS["Hashable"])
Generator = _Alias("Generator", None, nparams=3, check=_CHECKS["Generator"])


class TypeVar(_OrMixin):
    def __init__(self, name, *constraints, bound=None, covariant=False, contravariant=False):
        if len(constraints) == 1:
            raise TypeError("A single constraint is not allowed")
        self.__name__ = name
        self.__constraints__ = tuple(constraints)
        self.__bound__ = _hint(bound) if bound is not None else None
        self.__covariant__ = covariant
        self.__contravariant__ = contravariant

    def __repr__(self):
        if self.__covariant__:
            return "+" + self.__name__
        if self.__contravariant__:
            return "-" + self.__name__
        return "~" + self.__name__

    def __call__(self, *args, **kwargs):
        raise TypeError("'TypeVar' object is not callable")


class _GenericClassAlias(_OrMixin):
    # Stapel[int] for a class Stapel(Generic[T])
    def __init__(self, cls, args):
        self.__origin__ = cls
        self.__args__ = args

    def __repr__(self):
        return _type_repr(self.__origin__) + "[" + ", ".join([_type_repr(a) for a in self.__args__]) + "]"

    def __call__(self, *args, **kwargs):
        return self.__origin__(*args, **kwargs)

    def __eq__(self, other):
        if not isinstance(other, _GenericClassAlias):
            return NotImplemented
        return self.__origin__ is other.__origin__ and self.__args__ == other.__args__

    def __hash__(self):
        return hash(self.__args__)

    def __instancecheck__(self, obj):
        raise TypeError("Subscripted generics cannot be used with class and instance checks")


class Generic:
    def __class_getitem__(cls, params):
        if cls is Generic or cls is Protocol:
            return cls
        return _GenericClassAlias(cls, tuple([_hint(p) for p in _as_tuple(params)]))


class Protocol(Generic):
    pass


def runtime_checkable(cls):
    return cls


def get_origin(tp):
    if isinstance(tp, (_UnionAlias,)):
        return Union
    if type(tp).__name__ == "UnionType":
        return type(tp)
    if type(tp).__name__ == "GenericAlias":
        return tp.__origin__
    if isinstance(tp, _Generic):
        return {"Literal": Literal, "ClassVar": ClassVar, "Final": Final, "Annotated": Annotated,
                "Required": Required, "NotRequired": NotRequired, "ReadOnly": ReadOnly}[tp._name]
    if isinstance(tp, _GenericClassAlias):
        return tp.__origin__
    if isinstance(tp, _Alias):
        return tp.__origin__ if tp.__origin__ is not None else tp
    if tp is Generic:
        return Generic
    return None


def get_args(tp):
    if isinstance(tp, _Alias) and tp._name == "Callable" and tp._args is not None:
        return (tp._args[0], tp._args[1])
    if isinstance(tp, _Alias) and tp._name == "Tuple" and tp._args == [()]:
        return ()
    if isinstance(tp, (_Alias, _UnionAlias, _Generic, _GenericClassAlias)):
        return tuple(tp.__args__)
    if type(tp).__name__ in ("UnionType", "GenericAlias"):
        return tuple(tp.__args__)
    return ()


class NewType:
    def __init__(self, name, tp):
        self.__name__ = name
        self.__supertype__ = tp

    def __repr__(self):
        return "__main__." + self.__name__

    def __call__(self, x):
        return x


def cast(typ, val):
    return val


def assert_type(val, typ):
    return val


def overload(func):
    return func


def final(f):
    return f


def no_type_check(arg):
    return arg


# ------------------------------------------------------------------ NamedTuple, TypedDict

_NT_PROHIBITED = ("__new__", "__init__", "__slots__", "__getnewargs__", "_fields", "_field_defaults", "_make", "_replace", "_asdict", "_source")
_NT_SPECIAL = ("__module__", "__name__", "__qualname__", "__annotations__", "__dict__", "__weakref__", "__doc__", "__init_subclass__")


def _make_nmtuple(name, types, defaults=()):
    fields = [n for n, t in types]
    nm_tpl = _collections.namedtuple(name, fields, defaults=defaults)
    nm_tpl.__annotations__ = {n: _hint(t) for n, t in types}
    return nm_tpl


class NamedTuple:
    # class Punkt(NamedTuple): x: int … or NamedTuple("Punkt", [("x", int)]); the class is not a tuple here
    def __new__(cls, *args, **kwargs):
        if cls is not NamedTuple:
            raise TypeError("NamedTuple cannot be instantiated")
        if len(args) == 2:
            typename, fields = args
        elif len(args) == 1:
            typename, fields = args[0], None
        else:
            raise TypeError("NamedTuple() missing 1 required positional argument: 'typename'")
        if fields is None:
            fields = list(kwargs.items())
        return _make_nmtuple(typename, list(fields))

    def __init_subclass__(cls, **kwargs):
        if NamedTuple not in cls.__bases__:
            return
        own = dict(cls.__dict__)
        types = cls.__annotations__
        default_names = []
        for field_name in types:
            if field_name in own:
                default_names.append(field_name)
            elif default_names:
                raise TypeError("Non-default namedtuple field " + field_name + " cannot follow default field" + ("s" if len(default_names) > 1 else "") + " " + ", ".join(default_names))
        for key in own:
            if key in _NT_PROHIBITED:
                raise AttributeError("Cannot overwrite NamedTuple attribute " + key)
        nm_tpl = _make_nmtuple(cls.__name__, list(types.items()), [own[n] for n in default_names])
        cls.__annotations__ = nm_tpl.__annotations__
        for key, val in nm_tpl.__dict__.items():
            if key in _NT_SPECIAL:
                continue
            if key in own and key not in types:
                continue
            setattr(cls, key, val)
        cls.__new__.__qualname__ = cls.__qualname__ + ".__new__"


def _td_unwrap(t):
    # Required[int] → (int, True), NotRequired[int] → (int, False), else (t, None)
    if isinstance(t, _Generic) and t._name in ("Required", "NotRequired", "ReadOnly"):
        inner, flag = _td_unwrap(t.__args__[0])
        if t._name == "Required":
            return inner, True
        if t._name == "NotRequired":
            return inner, False
        return inner, flag
    return t, None


def _td_fill(cls, own, total):
    annotations = {}
    required = set()
    optional = set()
    for base in cls.__bases__:
        if base is TypedDict or TypedDict not in base.__mro__:
            continue
        annotations.update(base.__annotations__)
        required.update(base.__required_keys__)
        optional.update(base.__optional_keys__)
    for key, value in own.items():
        inner, flag = _td_unwrap(value)
        is_required = total if flag is None else flag
        if is_required:
            required.add(key)
            optional.discard(key)
        else:
            optional.add(key)
            required.discard(key)
    annotations.update(own)
    cls.__annotations__ = annotations
    cls.__required_keys__ = frozenset(required)
    cls.__optional_keys__ = frozenset(optional)
    cls.__total__ = total


class TypedDict:
    # class Film(TypedDict): titel: str … ; Film(...) makes a plain dict, as in CPython
    def __new__(cls, *args, **kwargs):
        if cls is TypedDict:
            if not args:
                raise TypeError("TypedDict() missing 1 required positional argument: 'typename'")
            typename = args[0]
            fields = args[1] if len(args) > 1 else {}
            total = kwargs.get("total", True)

            class _TD(TypedDict):
                pass

            _TD.__name__ = typename
            _TD.__qualname__ = typename
            _td_fill(_TD, {k: _hint(v) for k, v in dict(fields).items()}, total)
            return _TD
        return dict(*args, **kwargs)

    @classmethod
    def __natter_instancecheck__(cls, obj):
        raise TypeError("TypedDict does not support instance and class checks")

    def __init_subclass__(cls, total=True, **kwargs):
        for base in cls.__bases__:
            if base is not TypedDict and TypedDict not in base.__mro__:
                raise TypeError("cannot inherit from both a TypedDict type and a non-TypedDict base class")
        _td_fill(cls, dict(cls.__annotations__), total)


def is_typeddict(tp):
    return isinstance(tp, type) and tp is not TypedDict and TypedDict in tp.__mro__


# ------------------------------------------------------------------ get_type_hints

def _eval_hint(text, names, module=None):
    # the strings of string annotations: names, dots, [], | and literals (Natter has no eval)
    import re as _re
    tokens = _re.findall(r"\s*(\.\.\.|[A-Za-z_][A-Za-z_0-9]*|\d+|'[^']*'|\"[^\"]*\"|[\[\],.|()])", text)
    pos = [0]

    def peek():
        return tokens[pos[0]] if pos[0] < len(tokens) else None

    def take():
        t = tokens[pos[0]]
        pos[0] += 1
        return t

    def atom():
        t = take()
        if t == "(":
            if peek() == ")":
                take()
                return ()
            v = union()
            take()
            return v
        if t == "[":
            items = []
            while peek() != "]":
                items.append(union())
                if peek() == ",":
                    take()
            take()
            return items
        if t[0] in "'\"":
            return t[1:-1]
        if t[0].isdigit():
            return int(t)
        if t == "...":
            return None
        if t == "None":
            return None
        if t in ("True", "False"):
            return t == "True"
        if t in names:
            v = names[t]
        elif module is not None and hasattr(module, t):
            v = getattr(module, t)
        else:
            raise NameError("name '" + t + "' is not defined")
        while peek() in (".", "["):
            if take() == ".":
                v = getattr(v, take())
            else:
                items = [union()]
                while peek() == ",":
                    take()
                    if peek() == "]":
                        break
                    items.append(union())
                take()
                v = v[items[0] if len(items) == 1 else tuple(items)]
        return v

    def union():
        v = atom()
        while peek() == "|":
            take()
            v = v | atom()
        return v

    return union()


def get_type_hints(obj, globalns=None, localns=None, include_extras=False):
    names = {"int": int, "float": float, "str": str, "bool": bool, "list": list, "dict": dict, "tuple": tuple,
             "set": set, "frozenset": frozenset, "type": type, "object": object, "range": range}
    names.update(_TYPING_NAMES)
    # names of the module that made obj (sys.modules), unless globalns is given, as in CPython
    module = None
    if globalns is None:
        import sys as _sys
        module = _sys.modules.get(getattr(obj, "__module__", None) or "")
    else:
        names.update(globalns)
    if localns:
        names.update(localns)

    def resolve(v):
        if v is None:
            return _NoneType
        if isinstance(v, ForwardRef):
            v = v.__forward_arg__
        while isinstance(v, str):
            v = _eval_hint(v, names, module)
            if isinstance(v, ForwardRef):
                v = v.__forward_arg__
        if v is None:
            return _NoneType
        v = inner_refs(v)
        if not include_extras:
            inner, flag = _td_unwrap(v)
            if isinstance(inner, _Generic) and inner._name == "Annotated":
                inner = inner.__args__[0]
            v = inner
        return v

    def inner_refs(v):
        # ForwardRef('Knoten') inside List[...], Optional[...] … gets resolved, too
        if isinstance(v, ForwardRef):
            return resolve(v)
        if isinstance(v, list):
            return [inner_refs(a) for a in v]
        if isinstance(v, _UnionAlias):
            return Union[tuple(inner_refs(a) for a in v.__args__)]
        if isinstance(v, _Alias) and v._args is not None:
            return v._with([inner_refs(a) for a in v._args])
        if isinstance(v, _GenericClassAlias):
            return _GenericClassAlias(v.__origin__, tuple(inner_refs(a) for a in v.__args__))
        if type(v).__name__ == "GenericAlias":
            return _GenericAlias(v.__origin__, tuple(inner_refs(a) for a in v.__args__))
        if type(v).__name__ == "UnionType":
            out = None
            for a in v.__args__:
                a = inner_refs(a)
                out = a if out is None else out | a
            return out
        return v

    hints = {}
    if isinstance(obj, type):
        for base in reversed(obj.__mro__):
            ann = base.__dict__.get("__annotations__", {}) if hasattr(base, "__dict__") else {}
            if base is obj and is_typeddict(obj):
                ann = obj.__annotations__
            for name, value in ann.items():
                hints[name] = resolve(value)
        return hints
    ann = getattr(obj, "__annotations__", None)
    if ann is None:
        raise TypeError(repr(obj) + " is not a module, class, method, or function.")
    for name, value in ann.items():
        hints[name] = resolve(value)
    return hints

_TYPING_NAMES = {
    "Any": Any, "Union": Union, "Optional": Optional, "List": List, "Dict": Dict, "Tuple": Tuple, "Set": Set,
    "FrozenSet": FrozenSet, "Callable": Callable, "Iterable": Iterable, "Iterator": Iterator, "Generator": Generator,
    "Sequence": Sequence, "Mapping": Mapping, "MutableSequence": MutableSequence, "MutableMapping": MutableMapping,
    "Type": Type, "ClassVar": ClassVar, "Final": Final, "Literal": Literal, "Annotated": Annotated,
    "Required": Required, "NotRequired": NotRequired, "ReadOnly": ReadOnly, "Deque": Deque, "DefaultDict": DefaultDict,
    "OrderedDict": OrderedDict, "Counter": Counter, "NoReturn": NoReturn, "Never": Never, "Self": Self, "Text": Text,
}
`;
