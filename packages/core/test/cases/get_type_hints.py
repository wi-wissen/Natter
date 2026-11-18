from __future__ import annotations
# get_type_hints: string annotations resolved in the module (sys.modules), nested ForwardRefs, include_extras
from typing import get_type_hints, Optional, List, Dict, Callable, Annotated, NamedTuple
class Knoten:
    wert: int
    naechster: Optional[Knoten] = None
    kinder: List["Knoten"]
    tabelle: dict[str, list[int]] | None
    f: Callable[[int], str]
    a: Annotated[int, "meter"]
print(get_type_hints(Knoten))
print(get_type_hints(Knoten, include_extras=True)["a"])
def g(x: int, y: Dict[str, "Knoten"] = None) -> None: ...
print(get_type_hints(g))
try:
    get_type_hints(5)
except TypeError as e:
    print(e)
class P(NamedTuple):
    x: int
    y: "str" = ""
print(P(1), get_type_hints(P), P.__annotations__)
