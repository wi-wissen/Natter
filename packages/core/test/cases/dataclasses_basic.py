# dataclasses like CPython 3.13: init, repr, eq, order, frozen, hash, field(), InitVar, KW_ONLY, asdict, replace
from dataclasses import dataclass, field, fields, asdict, astuple, replace, is_dataclass, FrozenInstanceError, InitVar, KW_ONLY, MISSING
from typing import ClassVar, List
@dataclass
class P:
    x: int
    y: int = 0
p = P(1); print(p, p == P(1, 0), p != P(2), P(y=3, x=4))
for args, kw in [((), {}), ((1, 2, 3), {}), ((1,), {"z": 2}), ((1,), {"x": 2}), ((), {"y": 1})]:
    try: P(*args, **kw)
    except TypeError as e: print(e)
try: hash(p)
except TypeError as e: print(e)
@dataclass(order=True, frozen=True)
class V:
    a: int
    b: str = "z"
print(V(1) < V(2), V(1, "a") <= V(1, "b"), sorted([V(3), V(1), V(2)]), hash(V(1)) == hash(V(1)))
try: V(1).a = 5
except FrozenInstanceError as e: print(type(e).__name__, e, isinstance(e, AttributeError))
try: del V(1).a
except FrozenInstanceError as e: print(e)
try: V(1) < P(1)
except TypeError as e: print(e)
@dataclass
class L:
    items: List[int] = field(default_factory=list)
    n: int = field(default=3, repr=False)
    secret: str = field(default="s", compare=False)
    total: int = field(init=False, default=0)
    k: ClassVar[int] = 10
    def __post_init__(self):
        self.total = sum(self.items)
a = L([1, 2]); print(a, a.total, L.k, a == L([1, 2], secret="t"), [f.name for f in fields(a)])
print(asdict(a), astuple(a), replace(a, n=5), is_dataclass(a), is_dataclass(L), is_dataclass(1))
try:
    @dataclass
    class Bad:
        x: list = []
except ValueError as e: print(e)
try:
    @dataclass
    class Bad2:
        x: int = 1
        y: int
except TypeError as e: print(e)
@dataclass
class Q(P):
    z: int = 5
print(Q(1, 2), Q(1, 2, 3).z, [f.name for f in fields(Q)])
@dataclass(kw_only=True)
class K:
    a: int
    b: int = 2
print(K(a=1))
try: K(1)
except TypeError as e: print(e)
@dataclass
class M:
    a: int
    _: KW_ONLY
    b: int = 1
    c: int
print(M(1, c=3))
@dataclass
class I:
    a: int
    scale: InitVar[int] = 2
    def __post_init__(self, scale):
        self.a *= scale
print(I(3), [f.name for f in fields(I)])
@dataclass(repr=False, eq=False)
class N:
    a: int
print(N(1) == N(1), "object at" in repr(N(1)))
@dataclass
class Tree:
    kids: list = field(default_factory=list)
t = Tree(); t.kids.append(t); print(t)
@dataclass(unsafe_hash=True)
class H:
    a: int
print(hash(H(1)) == hash(H(1)), H.__eq__ is not None)
@dataclass
class Node:
    value: int
    next: "Node | None" = None
print(Node(1, Node(2)))
print(asdict(Node(1, Node(2))))
f0 = fields(P)[0]
print(f0.name, f0.type, f0.default is MISSING, f0.init, repr(MISSING)[:36])
print(P.__match_args__, P.__dataclass_fields__.keys())
@dataclass
class D:
    x: int
    def __eq__(self, o): return True
print(D(1) == D(2))
@dataclass(slots=True)
class S:
    a: int
print(S(1))
