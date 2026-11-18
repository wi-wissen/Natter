# typing.NamedTuple and TypedDict (class and functional forms), | with typing objects
from typing import NamedTuple, TypedDict, Optional, get_type_hints
import typing
from collections import namedtuple
def versuch(f):
    try: print("ok", f())
    except Exception as e: print(type(e).__name__, e)
class Punkt(NamedTuple):
    x: int
    y: int = 0
    def laenge(self) -> float:
        return (self.x ** 2 + self.y ** 2) ** 0.5
p = Punkt(3, 4)
print(p, p.x, p[1], p.laenge(), len(p), list(p), p == (3, 4), p == Punkt(3, 4), tuple(p))
a, b = p; print(a, b)
print(Punkt._fields, Punkt._field_defaults, Punkt.__annotations__, p._asdict(), p._replace(y=9), Punkt._make([5, 6]))
print(Punkt(1), Punkt(y=2, x=1), hash(p) == hash((3, 4)), p < Punkt(4, 0), sorted([Punkt(2), Punkt(1, 5)]))
versuch(lambda: Punkt())
versuch(lambda: Punkt(1, 2, 3))
versuch(lambda: Punkt(1, z=2))
versuch(lambda: setattr(p, "x", 5))
print(isinstance(p, tuple), Punkt.__name__, repr(Punkt)[:20])
P2 = NamedTuple("P2", [("a", int), ("b", str)])
print(P2(1, "z"), P2._fields, P2.__annotations__)
P3 = namedtuple("P3", ["a", "b"], defaults=[2])
print(P3(1), P3._fields, P3._field_defaults, P3(1) == (1, 2))
def bad():
    class B(NamedTuple):
        x: int = 1
        y: int
versuch(bad)
def bad2():
    class B(NamedTuple):
        _x: int
versuch(bad2)
class Film(TypedDict):
    titel: str
    jahr: int
f = Film(titel="Blade", jahr=1982)
print(f, type(f), f["jahr"], Film.__annotations__, sorted(Film.__required_keys__), Film.__total__, sorted(Film.__optional_keys__))
f2: Film = {"titel": "X", "jahr": 1}
print(f2, Film({"titel": "Y"}))
class Teil(TypedDict, total=False):
    a: int
print(Teil(), Teil.__total__, sorted(Teil.__optional_keys__))
F3 = TypedDict("F3", {"a": int, "b": str})
print(F3(a=1, b="x"), F3.__annotations__)
versuch(lambda: isinstance({}, Film))
class Erweitert(Film):
    note: float
print(Erweitert(titel="t", jahr=1, note=2.0), sorted(Erweitert.__required_keys__), Erweitert.__annotations__)
from typing import List, TypeVar, Union, get_args, get_origin
T = TypeVar("T")
print(List[int] | None, Optional[int] | str, T | None, None | List[str], int | List[int], Union[int, str] == (int | str), get_origin(int | str), get_args(list[int] | None), get_origin(list[int]), Union[int | str, None])
