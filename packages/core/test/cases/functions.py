def greet(name, greeting="Hallo"):
    return f"{greeting}, {name}!"
print(greet("Anna"), greet("Ben", "Moin"), greet(greeting="Servus", name="Cem"))
def counter():
    count = 0
    def inc():
        nonlocal count
        count += 1
        return count
    return inc
c = counter()
c(); c()
print(c())
total = 0
def add(n):
    global total
    total += n
add(5); add(7)
print(total)
def outer():
    x = 1
    def middle():
        def inner():
            return x + 1
        return inner()
    return middle()
print(outer())
fns = [lambda n, i=i: n * i for i in range(4)]
print([f(10) for f in fns])
def fact(n):
    return 1 if n <= 1 else n * fact(n - 1)
print(fact(10), fact(20))
def apply(f, *args):
    return f(*args)
print(apply(max, 3, 9, 4))
def stats(xs):
    return min(xs), max(xs), sum(xs) / len(xs)
lo, hi, avg = stats([2, 4, 9])
print(lo, hi, avg)
def deco(f):
    def wrapper(x):
        return f(x) * 2
    return wrapper
@deco
def plus1(x):
    return x + 1
print(plus1(4))
def noreturn():
    pass
print(noreturn(), greet.__name__ if False else "ok")
def fizzbuzz(n):
    out = []
    for i in range(1, n + 1):
        if i % 15 == 0:
            out.append("FizzBuzz")
        elif i % 3 == 0:
            out.append("Fizz")
        elif i % 5 == 0:
            out.append("Buzz")
        else:
            out.append(str(i))
    return out
print(" ".join(fizzbuzz(15)))
def primes(n):
    sieve = [True] * (n + 1)
    sieve[0] = sieve[1] = False
    for i in range(2, int(n ** 0.5) + 1):
        if sieve[i]:
            for j in range(i * i, n + 1, i):
                sieve[j] = False
    return [i for i, p in enumerate(sieve) if p]
print(primes(50))
for i in range(3):
    for j in range(3):
        if j == 2:
            break
        if i == 1:
            continue
        print(i, j)
else:
    print("fertig")
n = 0
while n < 3:
    n += 1
else:
    print("while fertig", n)
def bubble(a):
    a = list(a)
    for i in range(len(a)):
        for j in range(len(a) - 1 - i):
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]
    return a
print(bubble([5, 2, 9, 1, 5, 6]))
assert 1 + 1 == 2, "Mathe kaputt"
print(callable(len), callable(5), isinstance(3, (int, float)), isinstance("x", int))
words = {}
for w in "der die das der die der".split():
    words[w] = words.get(w, 0) + 1
print(words)
