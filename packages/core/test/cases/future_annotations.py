# from __future__ import annotations keeps hints as text (ast.unparse)
"""Doc."""
from __future__ import annotations
from typing import Optional
class Knoten:
    wert: int
    nachfolger: Optional[Knoten] = None
    def f(self, a: dict[str, list[int]], b: int | None = None, *c: tuple[int, ...]) -> Knoten | None: ...
    g: Callable[[int], str]
    h: Literal["a", 'b'] = "a"
    i: -1
    j: x.y[1:2, ::3]
print(Knoten.__annotations__)
print(Knoten.f.__annotations__)
