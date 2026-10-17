def show(*args, **kwargs):
    return f"{args} {sorted(kwargs.items())}"
print(show(1, 2, a=3, b=4), show(), show(*[5, 6], **{"z": 1}))
def head(first, *rest):
    return first, rest
print(head(1, 2, 3), head("x"))
print(2 ** 100, 2 ** 64 - 1, -(2 ** 70), 10 ** 20 // 7, 10 ** 20 % 7, (2 ** 80) / 2 ** 79)
big = 1
for i in range(1, 30):
    big *= i
print(big, big // 10 ** 20, len(str(big)), big > 10 ** 30, big == big + 0)
print(int("123456789012345678901234567890") + 1, hex(2 ** 70), f"{2 ** 70:,}")
print(abs(-(2 ** 60)), 2 ** 53 + 1, 9007199254740993 - 2)
data = {"b": 2, "a": 1, "c": 3}
print(sorted(data, key=data.get), {k: v * 10 for k, v in data.items() if v > 1})
pairs = [(1, "b"), (0, "a"), (1, "a"), (0, "b")]
print(sorted(pairs), sorted(pairs, key=lambda p: p[0]), sorted(pairs, key=lambda p: p[0], reverse=True))
grid = [[x * y for x in range(4)] for y in range(3)]
for row in grid:
    print(" ".join(f"{v:2d}" for v in row))
def memo_fib():
    cache = {}
    def fib(n):
        if n in cache:
            return cache[n]
        r = n if n < 2 else fib(n - 1) + fib(n - 2)
        cache[n] = r
        return r
    return fib
print(memo_fib()(90))
stack = []
for ch in "(()(()))":
    if ch == "(":
        stack.append(ch)
    else:
        stack.pop()
print(len(stack) == 0)
s = "Kronland"
print(s[100:], s[-100:2], s[::3], list(range(10))[::-2], [1, 2, 3][5:])
matrix = [[1, 2], [3, 4]]
transposed = [list(col) for col in zip(*matrix)]
print(transposed)
counter = {}
for letter in "mississippi":
    counter[letter] = counter.get(letter, 0) + 1
print(counter, max(counter, key=counter.get))
print(list(map(str, [1, 2.5, None, True])), list(map(lambda a, b: a + b, [1, 2], [10, 20])))
nums = [5, 3, 8]
nums += [1]
nums *= 2
print(nums, 3 * [0], [0] * 0)
x = y = z = 0
x, y = y + 1, x + 2
print(x, y, z)
a, (b, c) = 1, (2, 3)
print(a, b, c)
print(None is None, [] is not None, not [], not 0.0, bool("False"))
print(divmod(-7, 2), -7 // 2.0, 7 % 0.5, 1e300 * 1e10, -1e300 * 1e10)
print(float("nan") != float("nan"), 0.1 + 0.2 > 0.3, round(0.5), round(1.5), round(-2.5))
print(str(1e-7), str(123e-10), repr(1/3), 2/3, 100/3, 1e100)
print("%d%%" % 50, "%-6.2f|" % 3.14159, "%+d" % 5, "%x" % 255, "%r" % "a", "%s" % [1, 2])
print("a{}b".format(1), "{:*>6}".format("x"), "{0}{0}".format("ab"), "{:.1%}".format(0.256))
words = "the quick brown fox".split()
print(sorted(words, key=len), [w[::-1] for w in words], "".join(w[0] for w in words).upper())
