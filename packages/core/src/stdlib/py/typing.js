// typing: the names that type hints use. Natter ignores annotations, so these only have to exist, be subscriptable
// (List[int], Optional[str], Dict[str, int] ...) and print like CPython's.
export default String.raw`
TYPE_CHECKING = False


def _name(x):
    if x is None:
        return "None"
    if isinstance(x, type):
        return x.__name__
    return repr(x)


class _Alias:
    def __init__(self, name, args):
        self._name = name
        if not isinstance(args, tuple):
            args = (args,)
        self.__args__ = args

    def __getitem__(self, args):
        return _Alias(self._name, args)

    def __repr__(self):
        parts = []
        for a in self.__args__:
            parts.append(_name(a))
        return "typing." + self._name + "[" + ", ".join(parts) + "]"

    def __call__(self, *args, **kwargs):
        raise TypeError("Type " + self._name + " cannot be instantiated")


class _Form:
    def __init__(self, name):
        self._name = name

    def __getitem__(self, args):
        return _Alias(self._name, args)

    def __repr__(self):
        return "typing." + self._name

    def __call__(self, *args, **kwargs):
        raise TypeError("Cannot instantiate typing." + self._name)


Any = _Form("Any")
Union = _Form("Union")
Optional = _Form("Optional")
List = _Form("List")
Dict = _Form("Dict")
Tuple = _Form("Tuple")
Set = _Form("Set")
FrozenSet = _Form("FrozenSet")
Callable = _Form("Callable")
Iterable = _Form("Iterable")
Iterator = _Form("Iterator")
Generator = _Form("Generator")
Sequence = _Form("Sequence")
Mapping = _Form("Mapping")
Type = _Form("Type")
ClassVar = _Form("ClassVar")
Final = _Form("Final")
Literal = _Form("Literal")
NoReturn = _Form("NoReturn")
Self = _Form("Self")


class TypeVar:
    def __init__(self, name, *constraints, bound=None):
        self.__name__ = name
        self.__constraints__ = constraints
        self.__bound__ = bound

    def __repr__(self):
        return "~" + self.__name__


class Generic:
    def __class_getitem__(cls, params):
        return cls


class Protocol:
    def __class_getitem__(cls, params):
        return cls


def cast(typ, val):
    return val


def overload(func):
    return func


def final(f):
    return f
`;
