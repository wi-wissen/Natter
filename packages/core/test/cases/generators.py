def count_up(n):
    i = 1
    while i <= n:
        yield i
        i += 1


print(list(count_up(5)), sum(count_up(4)))
for x in count_up(3):
    print("x", x)


def fib():
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b


g = fib()
print([next(g) for _ in range(10)])


def take(n, it):
    out = []
    for x in it:
        if len(out) == n:
            break
        out.append(x)
    return out


print(take(5, fib()))


def squares(xs):
    for x in xs:
        yield x * x


print(list(squares([1, 2, 3])), list(squares(range(4))))


def chain(*its):
    for it in its:
        yield from it


print(list(chain([1, 2], (3, 4), "ab", range(2))))

gen = (x * x for x in range(5))
print(next(gen), next(gen), list(gen))
print(sum(x for x in range(10)), max(x % 7 for x in range(20)), any(x > 3 for x in [1, 2, 5]), all(x > 0 for x in [1, 2]))
print(sorted(x for x in "banana"), list(c.upper() for c in "abc" if c != "b"))
print(list((x, y) for x in range(2) for y in "ab"))
words = ["apple", "kiwi", "fig"]
print(list(len(w) for w in words), dict((w, len(w)) for w in words))
total = 10
print(sum(x * total for x in range(3)))


def echo():
    received = []
    while True:
        x = yield len(received)
        if x is None:
            break
        received.append(x)
    return received


e = echo()
print(next(e), e.send("a"), e.send("b"))
try:
    next(echo())
    g2 = echo()
    next(g2)
    g2.send(None)
except StopIteration:
    print("stopped")


def with_return():
    yield 1
    return "done"


w = with_return()
print(next(w))
try:
    next(w)
except StopIteration:
    print("end")

it = iter(count_up(2))
print(next(it), next(it), next(it, "default"))
print(type(count_up(1)).__name__, type(x for x in []).__name__)


class Tree:
    def __init__(self, v, kids=()):
        self.v = v
        self.kids = kids

    def walk(self):
        yield self.v
        for k in self.kids:
            yield from k.walk()

    def __iter__(self):
        return self.walk()


t = Tree(1, [Tree(2, [Tree(3)]), Tree(4)])
print(list(t), [v * 10 for v in t])


def lines():
    try:
        yield "a"
        yield "b"
    finally:
        print("cleanup")


print(list(lines()))


def bad():
    yield 1
    raise ValueError("generator failed")


try:
    for v in bad():
        print("got", v)
except ValueError as err:
    print(err)
print(list(zip(count_up(3), "xyz")), list(enumerate(count_up(2))), list(map(str, count_up(3))))
print(" ".join(str(i) for i in count_up(4)))
print(tuple(count_up(3)), set(count_up(3)) == {1, 2, 3}, 2 in count_up(3), len(list(count_up(6))))
