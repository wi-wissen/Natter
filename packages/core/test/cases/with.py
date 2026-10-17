class Tracker:
    def __init__(self, name, swallow=False):
        self.name = name
        self.swallow = swallow

    def __enter__(self):
        print("enter", self.name)
        return self

    def __exit__(self, exc_type, exc, tb):
        print("exit", self.name, exc_type.__name__ if exc_type else None, exc)
        return self.swallow


with Tracker("a") as t:
    print("body", t.name)

with Tracker("b"):
    print("no target")

try:
    with Tracker("c"):
        raise ValueError("inside")
except ValueError as e:
    print("outer caught", e)

with Tracker("d", swallow=True):
    raise KeyError("swallowed")
print("after d")

with Tracker("e") as e1, Tracker("f") as e2:
    print("both", e1.name, e2.name)


def f():
    with Tracker("g"):
        return "returned"


print(f())

for i in range(3):
    with Tracker("loop" + str(i)):
        if i == 0:
            continue
        if i == 1:
            break
        print("unreachable")
print("loop done")


def nested():
    with Tracker("outer"):
        with Tracker("inner"):
            return 42


print(nested())

try:
    with 5:
        pass
except TypeError as err:
    print(type(err).__name__)
try:
    with Tracker("h"):
        1 / 0
except ZeroDivisionError:
    print("zero")
