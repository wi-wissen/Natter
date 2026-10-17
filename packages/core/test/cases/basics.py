a = 1
b = 2.5
print(a + b, a / 2, 7 // 2, -7 // 2, 7 % -3, 2 ** 10, 2 ** -1)
xs = [i * i for i in range(10) if i % 2 == 0]
print(xs, len(xs), sum(xs), max(xs))
d = {"holz": 10, "stein": 5}
for k, v in d.items():
    print(f"{k:>6}: {v:03d}")
def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)
print([fib(i) for i in range(15)])
def make_adder(n):
    return lambda x: x + n
add5 = make_adder(5)
print(add5(3), sorted([3, 1, 2], reverse=True), sorted(["b", "a", "C"], key=str.lower))
print(0.1 + 0.2, 1e16, 1.5e-7, 3.0, -0.0, round(2.5), round(3.5), round(0.125, 2))
print("%5.2f|%d|%s" % (3.14159, 42, "x"), "{} {:.3f}".format("pi", 3.14159))
t = (1, 2, 3)
x, *rest = t
print(x, rest, t[::-1], "hallo"[1:4])
i = 0
while True:
    i += 1
    if i > 5:
        break
else:
    print("nie")
print(i, 10 < i < 3, 1 < 2 < 3)
print(type(1), type(1.0), type("x"), isinstance(True, int))
