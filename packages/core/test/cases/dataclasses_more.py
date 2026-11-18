from __future__ import annotations
# dataclasses: errors, ClassVar, init=False, inheritance, string annotations
import re
import dataclasses
from dataclasses import dataclass, field, fields, asdict, astuple, replace, InitVar, KW_ONLY
from typing import ClassVar, Optional

def versuch(f):
    try:
        r = f()
        print("ok", r)
    except Exception as e:
        print(type(e).__name__, e)

@dataclass
class Schueler:
    name: str
    noten: list[int] = field(default_factory=list, metadata={"einheit": "Punkte"})
    klasse: Optional[str] = None
    anzahl: ClassVar[int] = 0
    def schnitt(self) -> float:
        return sum(self.noten) / len(self.noten) if self.noten else 0.0
s = Schueler("Ada", [1, 2, 3])
print(s, s.schnitt(), Schueler.anzahl, fields(s)[1].metadata, fields(s)[1].metadata["einheit"])
print(re.sub("0x[0-9a-f]+", "0x…", repr(fields(Schueler)[0])))
print(Schueler.__dataclass_params__)
print(dataclasses.InitVar[int], InitVar[list[int]])
def lokal():
    @dataclass
    class Innen:
        a: int = 1
    return Innen()
print(lokal())
versuch(lambda: Schueler())
versuch(lambda: Schueler("a", [], "b", 4))
versuch(lambda: fields(1))
versuch(lambda: asdict(Schueler))
versuch(lambda: astuple(5))
versuch(lambda: replace(1))
versuch(lambda: field(default=1, default_factory=list))
def mk(body):
    def g():
        ns = {}
        return body()
    return g
def bad1():
    @dataclass
    class A:
        a: KW_ONLY
        b: KW_ONLY
versuch(bad1)
def bad2():
    @dataclass
    class A:
        x = field(default=1)
versuch(bad2)
def bad3():
    @dataclass(frozen=True)
    class A:
        x: int = 0
    @dataclass
    class B(A):
        y: int = 1
versuch(bad3)
def bad4():
    @dataclass
    class A:
        x: int = 0
    @dataclass(frozen=True)
    class B(A):
        y: int = 1
versuch(bad4)
def bad5():
    @dataclass(order=True, eq=False)
    class A:
        x: int = 0
versuch(bad5)
def bad6():
    @dataclass(order=True)
    class A:
        x: int = 0
        def __lt__(self, o): return True
versuch(bad6)
def bad7():
    @dataclass(unsafe_hash=True)
    class A:
        x: int = 0
        def __hash__(self): return 1
versuch(bad7)
def bad8():
    @dataclass
    class A:
        x: ClassVar[list] = field(default_factory=list)
versuch(bad8)
@dataclass
class Opt:
    a: int
    b: int = field(init=False, default=7)
    c: list = field(init=False, default_factory=list)
    d: int = field(default=4, compare=False, hash=True)
o = Opt(1); print(o, o.b, o.c, Opt.b, hasattr(Opt, "c"), Opt.d)
versuch(lambda: replace(o, b=2))
@dataclass
class IV:
    a: int
    f: InitVar[int]
    def __post_init__(self, f):
        self.a += f
versuch(lambda: replace(IV(1, 2)))
print(replace(IV(1, 2), f=10))
@dataclass
class Eigen:
    a: int
    def __repr__(self): return "Eigen!"
print(Eigen(1), Eigen(1) == Eigen(1), Eigen.__match_args__)
@dataclass(frozen=True)
class F:
    x: int
@dataclass(frozen=True)
class G(F):
    y: int = 0
g = G(1, 2); print(g, hash(g) == hash(G(1, 2)), {g: 1}[G(1, 2)])
versuch(lambda: setattr(g, "z", 1))
@dataclass
class Bruch:
    zaehler: int
    nenner: int = 1
    def __post_init__(self):
        if self.nenner == 0:
            raise ValueError("Nenner darf nicht 0 sein")
    def __add__(self, o):
        return Bruch(self.zaehler * o.nenner + o.zaehler * self.nenner, self.nenner * o.nenner)
print(Bruch(1, 2) + Bruch(1, 3))
versuch(lambda: Bruch(1, 0))
print(asdict(Schueler("B", [[1], (2, 3)] if False else [4])), astuple(Schueler("C")))
print(Schueler.__init__.__qualname__, Schueler.__repr__.__name__, Schueler.__annotations__)
print(dataclasses.is_dataclass(Schueler), dataclasses.MISSING is dataclasses.MISSING)
