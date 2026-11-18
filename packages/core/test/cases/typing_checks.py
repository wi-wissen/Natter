# typing like CPython 3.13: printing, Union/Optional, isinstance, get_origin/get_args, errors
import typing
from typing import *
names = ["Any", "Union", "Optional", "List", "Dict", "Tuple", "Set", "FrozenSet", "Callable", "Iterable", "Iterator", "Generator", "Sequence", "Mapping", "Type", "ClassVar", "Final", "Literal", "NoReturn", "Self", "Deque", "DefaultDict", "Counter", "OrderedDict", "MutableSequence", "MutableMapping", "Collection", "Hashable", "Sized", "Reversible", "Container", "AbstractSet", "MutableSet", "Never", "LiteralString", "TypeAlias", "Annotated"]
for n in names:
    t = getattr(typing, n)
    try:
        r = t()
        print(n, "call ok", r)
    except TypeError as e:
        print(n, repr(t), "|", e)
class K: pass
def f(): pass
print(List[K], List[f], List[1], List[List], Dict[str, "K"], Tuple[()], Tuple[int])
print(Callable[[int, str], K], Callable[[], int])
print(Union[int, str] == Union[str, int], Union[int, str], Union[str, int], Union[int, int], Optional[Optional[int]], Union[int, Union[str, None]])
print(Optional[None], Union[None, int], Union[None, int, str])
print(List[int] == List[int], List[int] == List[str], hash(List[int]) == hash(List[int]), Union[int, str] == Union[int, str, int])
for t in [List, Dict, Set, Tuple, FrozenSet, Callable, Iterable, Iterator, Sequence, Mapping, Type, Union[int, str], Optional[int], Union[int, None], Generator, Deque, Counter, DefaultDict, OrderedDict, Hashable, Sized, Collection, Container, Reversible, AbstractSet, MutableSequence, MutableMapping, MutableSet, Any, List[int], Literal[1], ClassVar]:
    row = []
    for v in [[1], (1,), {}, set(), "s", 1, None, len, K, iter([]), (x for x in []), range(3), frozenset()]:
        try:
            row.append("T" if isinstance(v, t) else "F")
        except TypeError as e:
            row.append("E")
            err = str(e)
    print(repr(t), "".join(row), err if "E" in row else "")
for t in [List, Dict, Iterable, Union[int, str], Any]:
    try: print(issubclass(list, t), issubclass(int, t))
    except TypeError as e: print("E", e)
print(get_args(List[int]), get_args(List), get_args(Union[int, str]), get_args(Callable[[int], str]), get_args(Dict[str, int]), get_args(Literal[1, "a"]))
print(List[int].__origin__, List.__origin__ if False else "", Union[int, str].__args__, Optional[int].__args__)
T = TypeVar("T"); S = TypeVar("S", int, str); B = TypeVar("B", bound=int)
print(T, S, B, T.__name__, S.__constraints__, B.__bound__, List[T], Dict[T, S])
class Stapel(Generic[T]):
    pass
print(Stapel[int], Stapel[int]() is not None, type(Stapel[int]()).__name__, isinstance(Stapel(), Stapel))
class P(Protocol):
    def f(self) -> int: ...
print(P.__name__, List[int][0] if False else "")
try: List[int][str]
except TypeError as e: print(e)
try: Generic()
except TypeError as e: print(e)
try: Protocol()
except TypeError as e: print(e)
print(cast(List[int], "x"), cast("int", 3), TYPE_CHECKING)
print(NewType("UserId", int), NewType("UserId", int)(5))
print(Literal["a", 1], Literal[True], Final[int], ClassVar[int], Type[K], Annotated[int, "m"])
print(typing.List[typing.Optional[K]], Dict[str, Callable[[int], List[K]]])
print(get_origin(List[int]), get_origin(List), get_origin(Union[int, str]), get_origin(Optional[int]), get_origin(int), get_origin(Literal[1]))
print(Callable[..., int], Tuple[int, ...], get_args(Tuple[str, ...]) [0])
def f(cb: Callable[..., int]) -> Tuple[int, ...]:
    return (cb(),)
print(f(lambda: 3))
