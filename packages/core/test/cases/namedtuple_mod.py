# collections.namedtuple like CPython 3.13: checks, defaults, rename, _make/_replace, tuple behaviour
import collections
for bad in [("P", "1x"), ("P", "a class"), ("P", "_a"), ("P", "a a"), ("1P", "a")]:
    try: collections.namedtuple(*bad)
    except ValueError as e: print(e)
try: collections.namedtuple("P", "a", defaults=[1,2])
except TypeError as e: print(e)
P = collections.namedtuple("P", "a b")
p = P(1, 2)
for f in [lambda: p._replace(c=3), lambda: P._make([1]), lambda: setattr(p, "z", 1), lambda: setattr(p, "a", 1), lambda: P(), lambda: P(1, 2, 3), lambda: P(1, a=2), lambda: P(1, c=2)]:
    try: print(f())
    except Exception as e: print(type(e).__name__, e)
print(p + (3,), (0,) + p, p * 2, p.count(1), p.index(2), 2 in p, p[::-1], P(1,2) == (1,2), (1,2) == P(1,2), P(1,2) != (1,3), P(1,2) >= (1,2), (1, 3) > P(1, 2), repr(P), P.__qualname__, collections.namedtuple("R", "a b", rename=True)._fields, collections.namedtuple("R", "a def _x a", rename=True)._fields, P.__match_args__)
Q = collections.namedtuple("Q", ["x", "y", "z"], defaults=[0, 5])
print(Q(1), Q._field_defaults, Q._make((1, 2, 3)), Q(1)._asdict(), hash(Q(1, 0, 5)) == hash((1, 0, 5)), list(reversed(Q(1))), sorted([Q(2), Q(1, 9)]), {Q(1): "a"}[(1, 0, 5)] if False else "", max(Q(1), Q(0)), *Q(4))
x, *rest = Q(7); print(x, rest, len(Q(1)), Q(1, 2, 3)[1:], P(1, 2) == Q(1, 2, 0), str(P(3, "a")))
