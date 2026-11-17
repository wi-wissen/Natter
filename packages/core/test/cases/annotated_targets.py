# Annotated assignments to attributes and items
from typing import Optional


class Knoten:
    anzahl: int = 0

    def __init__(self, wert: int) -> None:
        self.wert: int = wert
        self.next: Optional["Knoten"] = None
        self.prev: "Knoten | None" = None
        self.markiert: bool
        Knoten.anzahl += 1


a = Knoten(1)
a.next: Knoten = Knoten(2)
print(a.wert, a.next.wert, a.prev, Knoten.anzahl)
print(hasattr(a, "markiert"))
d = {}
d["x"]: int = 5
werte: list[int] = [1, 2]
werte[0]: int = 7
print(d, werte)
