# __new__, __init_subclass__, __setattr__/__delattr__, object.__setattr__, function attributes
class Einzel:
    _inst = None
    def __new__(cls, *args):
        if cls._inst is None:
            cls._inst = super().__new__(cls)
        return cls._inst
    def __init__(self, n):
        self.n = n
a = Einzel(1); b = Einzel(2)
print(a is b, a.n, Einzel.__new__ is not None)
class Zahl:
    def __new__(cls, x):
        return 42
print(Zahl(3))
class Basis:
    alle = []
    def __init_subclass__(cls, **kw):
        super().__init_subclass__(**kw)
        Basis.alle.append(cls.__name__)
class A(Basis): pass
class B(A): pass
print(Basis.alle)
class Fest:
    def __init__(self):
        object.__setattr__(self, "x", 1)
    def __setattr__(self, name, value):
        raise AttributeError("nein: " + name)
    def __delattr__(self, name):
        raise AttributeError("loeschen nein: " + name)
f = Fest()
print(f.x)
for code in ["f.x = 2", "del f.x", "setattr(f, 'y', 3)"]:
    try:
        exec_ok = False
        if code == "f.x = 2": f.x = 2
        elif code == "del f.x": del f.x
        else: setattr(f, "y", 3)
    except AttributeError as e:
        print("AttributeError", e)
class Log:
    def __setattr__(self, name, value):
        print("set", name, value)
        super().__setattr__(name, value)
l = Log(); l.a = 5; print(l.a, vars(l))
def g(a: int, *r: str, b: "x" = 1, **k: float) -> list[int]: pass
print(g.__annotations__)
g.info = "hallo"; print(g.info)
try:
    object.__new__(5)
except TypeError as e:
    print(e)
