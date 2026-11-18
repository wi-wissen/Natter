# Argument errors and __qualname__ in CPython's words
class A:
    def __init__(self, x, y=1, *, k, m=2):
        pass
for args, kw in [((), {"k": 1}), ((1, 2, 3), {"k": 1}), ((1,), {"z": 2, "k": 1}), ((1,), {"x": 2, "k": 1}), ((1,), {})]:
    try: A(*args, **kw)
    except TypeError as e: print(e)
def f(a, b, c): pass
try: f()
except TypeError as e: print(e)
def g(*, a, b): pass
try: g()
except TypeError as e: print(e)
def h(a): pass
for call in [lambda: h(1, 2), lambda: h(), lambda: g(1, a=1, b=2)]:
    try: call()
    except TypeError as e: print(e)
def aussen():
    def innen(): pass
    class Lokal:
        def m(self): pass
    return innen, Lokal
i, L = aussen()
print(i.__qualname__, L.__qualname__, L.m.__qualname__, A.__init__.__qualname__, A.__qualname__, (lambda: 0).__qualname__)
class O:
    class Innen:
        def m(self, x): pass
try: O.Innen().m()
except TypeError as e: print(e)
print(O.Innen.__qualname__, O.Innen, O.Innen.m.__qualname__)
