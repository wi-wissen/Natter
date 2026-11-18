# typing: names for type hints
from typing import Any, Dict, List, Optional, Tuple, Union, Callable, TypeVar, Generic, Protocol, cast
import typing

T = TypeVar("T")


def erstes(werte: List[int]) -> Optional[int]:
    if werte:
        return werte[0]
    return None


def tabelle(d: Dict[str, Tuple[int, int]]) -> List[str]:
    return sorted(d)


print(erstes([3, 4]), erstes([]), tabelle({"b": (1, 2), "a": (3, 4)}))
print(List[int], Dict[str, int], Optional[str], Tuple[int, str])
print(List, Any, T, typing.TYPE_CHECKING)
print(cast(int, "3"))


class Stapel(Generic[T]):
    def __init__(self) -> None:
        self.daten: List[T] = []

    def push(self, x: T) -> None:
        self.daten.append(x)


class Form(Protocol):
    def flaeche(self) -> float:
        ...


s = Stapel()
s.push(1)
print(s.daten)
Zahl = Union[int, float]
f: Callable[[int], int] = abs
print(f(-2))
