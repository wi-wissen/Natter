class Point:
    count = 0

    def __init__(self, x, y=0):
        self.x = x
        self.y = y
        Point.count += 1

    def move(self, dx, dy):
        self.x += dx
        self.y += dy
        return self

    def __repr__(self):
        return "Point(" + str(self.x) + ", " + str(self.y) + ")"

    def __eq__(self, other):
        return isinstance(other, Point) and self.x == other.x and self.y == other.y

    def __hash__(self):
        return hash((self.x, self.y))

    def __add__(self, other):
        return Point(self.x + other.x, self.y + other.y)

    def __lt__(self, other):
        return (self.x, self.y) < (other.x, other.y)


p = Point(1, 2)
q = Point(3)
print(p, q, Point.count)
print(p.move(1, 1))
print(p + q)
print(p == Point(2, 3), p != q, p == 5)
print(sorted([Point(3, 1), Point(1, 2), Point(2, 0)]))
print({p: "a"}[Point(2, 3)])
d2 = {}
d2[Point(1, 1)] = 1
d2[Point(1, 1)] += 1
print(len(d2), d2[Point(1, 1)])


class Animal:
    sound = "..."

    def __init__(self, name):
        self.name = name

    def speak(self):
        return self.name + " says " + self.sound

    def __str__(self):
        return "Animal " + self.name


class Dog(Animal):
    sound = "Woof"

    def __init__(self, name, trick):
        super().__init__(name)
        self.trick = trick

    def speak(self):
        return super().speak() + "!"


class Puppy(Dog):
    def __init__(self, name):
        super().__init__(name, "sit")

    def __str__(self):
        return "Puppy " + self.name + " / " + super().__str__()


a = Animal("Generic")
d = Dog("Rex", "roll")
pp = Puppy("Bit")
print(a.speak(), d.speak(), pp.speak())
print(a, d, pp)
print(isinstance(pp, Animal), isinstance(pp, Dog), isinstance(a, Dog), issubclass(Puppy, Animal))
print(type(pp).__name__, type(pp) == Puppy, type(pp) is Dog, pp.__class__.__name__)
print(hasattr(pp, "trick"), hasattr(a, "trick"), getattr(a, "nope", "dflt"))
setattr(a, "age", 7)
print(a.age, vars(a))


class Stack:
    def __init__(self):
        self.items = []

    def push(self, x):
        self.items.append(x)

    def pop(self):
        return self.items.pop()

    def __len__(self):
        return len(self.items)

    def __getitem__(self, i):
        return self.items[i]

    def __contains__(self, x):
        return x in self.items

    def __iter__(self):
        return iter(self.items)

    def __bool__(self):
        return len(self.items) > 0

    def __call__(self, n):
        return n * len(self)


s = Stack()
print(bool(s), len(s))
s.push(10)
s.push(20)
s.push(30)
print(bool(s), len(s), s[0], s[-1], 20 in s, 99 in s, list(s), s(2))
for item in s:
    print(item, end=" ")
print()
print(sum(s), max(s), [x * 2 for x in s])


class Temp:
    def __init__(self, c):
        self._c = c

    @property
    def celsius(self):
        return self._c

    @celsius.setter
    def celsius(self, v):
        self._c = v

    @property
    def fahrenheit(self):
        return self._c * 9 / 5 + 32

    @staticmethod
    def hello():
        return "hello"

    @classmethod
    def boiling(cls):
        return cls(100)


t = Temp(20)
print(t.celsius, t.fahrenheit)
t.celsius = 30
print(t.celsius, t.fahrenheit, Temp.hello(), Temp.boiling().celsius, t.hello())


class A:
    def who(self):
        return "A"


class B(A):
    def who(self):
        return "B" + super().who()


class C(A):
    def who(self):
        return "C" + super().who()


class D(B, C):
    def who(self):
        return "D" + super().who()


print(D().who(), [c.__name__ for c in D.__mro__])


class Counter:
    total = 0

    def __init__(self):
        Counter.total += 1
        self.id = Counter.total


c1, c2, c3 = Counter(), Counter(), Counter()
print(c1.id, c2.id, c3.id, Counter.total, c1.total)
c1.total = 99
print(c1.total, Counter.total, c2.total)


class Vec:
    def __init__(self, x, y):
        self.x, self.y = x, y

    def __neg__(self):
        return Vec(-self.x, -self.y)

    def __sub__(self, o):
        return Vec(self.x - o.x, self.y - o.y)

    def __mul__(self, k):
        return Vec(self.x * k, self.y * k)

    def __rmul__(self, k):
        return self * k

    def __iadd__(self, o):
        self.x += o.x
        self.y += o.y
        return self

    def __str__(self):
        return f"<{self.x}, {self.y}>"


v = Vec(1, 2)
print(-v, v - Vec(1, 1), v * 3, 3 * v)
v += Vec(10, 10)
print(v)
print(f"{v} and {Vec(0, 0)!s}")


def make_adder(n):
    class Adder:
        def add(self, x):
            return x + n

    return Adder()


print(make_adder(5).add(10))


def deco(cls):
    cls.tag = "decorated"
    return cls


@deco
class Tagged:
    pass


print(Tagged.tag, Tagged().tag)
x = Tagged()
x.extra = 1
del x.extra
print(hasattr(x, "extra"))
print(Point.__name__, str(Point(1, 2)))
