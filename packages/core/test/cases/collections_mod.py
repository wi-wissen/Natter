from collections import Counter, defaultdict, deque, OrderedDict, namedtuple

c = Counter("abracadabra")
print(c)
print(c.most_common(2), c["a"], c["z"], len(c), sorted(c), sum(c.values()))
print(sorted(c.items()), c.total(), sorted(c.elements()))
c.update("aab")
c["z"] += 5
print(c.most_common(3))
print(Counter([1, 1, 2, 3, 3, 3]), Counter(), Counter(a=2, b=1))
print(Counter("aab") + Counter("abc"), Counter("aab") - Counter("abc"))
print(Counter("aab") & Counter("abb"), Counter("aab") | Counter("abb"))
print(dict(Counter("hello")))
words = "the quick brown fox jumps over the lazy dog the end".split()
freq = Counter(words)
for w, n in freq.most_common(2):
    print(w, n)

d = defaultdict(list)
for word in ["apple", "avocado", "banana", "blueberry", "cherry"]:
    d[word[0]].append(word)
print(dict(d), sorted(d), len(d), "a" in d, "z" in d)
print(d["new"], len(d))
counts = defaultdict(int)
for ch in "mississippi":
    counts[ch] += 1
print(dict(counts), sorted(counts.items()))
print(defaultdict(int), d.default_factory)
nested = defaultdict(lambda: defaultdict(int))
nested["x"]["y"] += 2
print(nested["x"]["y"], dict(nested["x"]))

q = deque([1, 2, 3])
q.append(4)
q.appendleft(0)
print(q, len(q), q[0], q[-1], list(q))
print(q.popleft(), q.pop(), q)
q.extend([7, 8])
q.rotate(2)
print(q)
q.rotate(-1)
print(q, 7 in q, list(reversed(q)))
limited = deque(maxlen=3)
for i in range(6):
    limited.append(i)
print(limited, limited.maxlen)
try:
    deque().pop()
except IndexError as e:
    print("IndexError", e)

od = OrderedDict()
od["b"] = 1
od["a"] = 2
od["c"] = 3
od.move_to_end("b")
print(list(od), list(od.items()), od)
print(od.popitem(), od.popitem(last=False), len(od))

Point = namedtuple("Point", ["x", "y"])
p = Point(1, 2)
print(p, p.x, p.y, p[0], p[1], len(p), tuple(p), list(p))
x, y = p
print(x, y, p == Point(1, 2), p == (1, 2), p._asdict(), p._replace(x=10))
print(Point(y=5, x=4), Point._fields, type(p).__name__)
P3 = namedtuple("P3", "a b c", defaults=[0])
print(P3(1, 2), P3(1, 2, 3))
people = [Point(3, 1), Point(1, 2)]
print(sorted(people), max(people, key=lambda q: q.x))
print({Point(1, 2): "pt"}[Point(1, 2)])
