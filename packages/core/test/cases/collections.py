xs = [3, 1, 4, 1, 5, 9, 2, 6]
xs.append(5)
xs.insert(0, 0)
print(xs, len(xs), xs.count(1), xs.index(4))
xs.remove(1)
print(xs.pop(), xs.pop(0), xs)
xs.sort()
print(xs)
xs.sort(reverse=True)
print(xs)
xs.reverse()
print(xs, xs[1:3], xs[-2:], xs[:2])
ys = xs.copy()
ys[0] = 99
print(xs[0], ys[0])
xs[1:3] = [7, 7, 7]
print(xs)
del xs[0]
del xs[-2:]
print(xs)
a = b = []
a.append(1)
print(b, a is b, [1] == [1], [1] is [1])
m = [[0] * 3 for _ in range(2)]
m[0][1] = 5
print(m)
t = (1, "zwei", 3.0)
print(t, t[1], len(t), t + (4,), t * 2, (1,), ())
p, q, r = t
print(p, q, r)
first, *middle, last = [1, 2, 3, 4, 5]
print(first, middle, last)
d = {"holz": 5, "stein": 3}
d["eisen"] = 1
d["holz"] += 10
print(d, len(d), "holz" in d, "gold" in d, d.get("gold"), d.get("gold", 0))
print(list(d.keys()), list(d.values()), list(d.items()))
print(d.pop("stein"), d)
d.setdefault("gold", 100)
d.update({"lehm": 7}, schwefel=2)
print(d)
for k in d:
    print(k, end=" ")
print()
del d["gold"]
print(sorted(d), sorted(d.items(), key=lambda kv: kv[1]))
squares = {n: n * n for n in range(5)}
print(squares, {1: "a", 1.0: "b", True: "c"})
print(list(range(5)), list(range(2, 10, 3)), list(range(10, 0, -3)), range(5)[2], len(range(0, 10, 3)))
print(list(enumerate("abc", 1)), list(zip([1, 2, 3], "ab")), list(map(lambda x: x * 2, [1, 2, 3])))
print(list(filter(lambda x: x % 2, range(10))), list(filter(None, [0, 1, "", "a"])))
print(any([0, 0, 1]), all([1, 1, 0]), any([]), all([]))
print(sorted([("b", 2), ("a", 2), ("c", 1)], key=lambda p: p[1]), sorted([3, 1, 2], key=lambda x: -x))
print(min(["Burg", "Am", "Zaun"], key=len), max({"a": 3, "b": 9}, key=lambda k: {"a": 3, "b": 9}[k]))
nested = [[1, 2], [3, 4]]
print([x for row in nested for x in row], [x * y for x in range(3) for y in range(3) if x != y])
print(sum(x for x in range(101)), list(reversed([1, 2, 3])))
x = 5
z = [x for x in range(3)]
print(x, z)
print(1 in [1, 2], 3 not in (1, 2), 2 in range(5), "a" in {"a": 1})
print([1, 2] < [1, 3], (1, 2) == (1, 2), [1, [2, 3]] == [1, [2, 3]])
