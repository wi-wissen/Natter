s = {3, 1, 2}
print(sorted(s), len(s), 2 in s, 5 in s, 5 not in s)
e = set()
print(e, len(e), bool(e), bool(s))
t = set([1, 2, 2, 3, 3, 3])
print(t == {1, 2, 3}, sorted(t))
a = {1, 2, 3, 4}
b = {3, 4, 5}
print(sorted(a | b), sorted(a & b), sorted(a - b), sorted(a ^ b))
print(sorted(a.union(b)), sorted(a.intersection(b)), sorted(a.difference(b)), sorted(a.symmetric_difference(b)))
print({1, 2} <= {1, 2, 3}, {1, 2} < {1, 2}, {1, 2, 3} >= {2}, {1} > {2}, {1, 2}.issubset({1, 2, 3}), {1, 2, 3}.issuperset({1}), {1}.isdisjoint({2}))
s.add(10)
s.add(1)
s.discard(2)
s.discard(99)
s.remove(3)
print(sorted(s))
try:
    s.remove(99)
except KeyError as err:
    print("KeyError", err)
s.update([7, 8], {9})
print(sorted(s))
x = {1, 2, 3}
x |= {4}
x &= {1, 2, 4, 5}
x -= {1}
x ^= {2, 6}
print(sorted(x))
sq = {n * n for n in range(5)}
print(sorted(sq))
evens = {n for n in range(10) if n % 2 == 0}
print(sorted(evens))
words = ["a", "b", "a", "c", "b"]
print(sorted(set(words)), len(set(words)))
seen = set()
dups = []
for w in words:
    if w in seen:
        dups.append(w)
    seen.add(w)
print(dups)
f = frozenset([1, 2, 3])
print(f, sorted(f), f == {1, 2, 3}, 2 in f, len(f))
print(sorted(f | {9}), type(f | {9}).__name__)
d = {f: "frozen"}
print(d[frozenset([3, 2, 1])])
print(type(s).__name__, type(f).__name__, isinstance(s, set), isinstance(f, frozenset))
print(set("hello") == {"h", "e", "l", "o"}, sorted(set("hello")))
print({1, 2, 3}.pop() in {1, 2, 3})
print(sum({1, 2, 3}), max({4, 9, 2}), min({4, 9, 2}), sorted({3, 2, 1}, reverse=True), list(sorted({5, 4})))
print({(1, 2), (1, 2), (2, 1)} == {(2, 1), (1, 2)})
nested = {frozenset({1, 2}), frozenset({2, 1})}
print(len(nested))
print({1, 2, 3}, {"a"}, {1.5}, {None}, {True})
c = s.copy()
c.add(100)
print(100 in c, 100 in s)
try:
    {[1]}
except TypeError as err:
    print("TypeError", err)
print(set() == set(), set() == frozenset(), len({1, 1.0, True}))
print(sorted({x % 3 for x in range(10)}))
