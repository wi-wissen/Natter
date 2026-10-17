def show(label, fn):
    try:
        fn()
        print(label, "ok")
    except Exception as e:
        print(label, "->", type(e).__name__ + ":", e)


show("div", lambda: 1 / 0)
show("floordiv", lambda: 1 // 0)
show("mod", lambda: 1 % 0)
show("fdiv", lambda: 1.0 / 0)
show("index", lambda: [1, 2][5])
show("strindex", lambda: "abc"[9])
show("tupleindex", lambda: (1,)[3])
show("key", lambda: {"a": 1}["b"])
show("int", lambda: int("abc"))
show("float", lambda: float("x"))
show("concat", lambda: "a" + 1)
show("add", lambda: 1 + "a")
show("none", lambda: None + 1)
show("listcat", lambda: [1] + 1)
show("name", lambda: undefined_name)
show("len", lambda: len(5))
show("attr", lambda: (1).foo)
show("nonefoo", lambda: None.foo)
show("call", lambda: (5)())
show("iter", lambda: iter(5))
show("unhash", lambda: {[1]: 2})
show("cmp", lambda: 1 < "a")
show("sortcmp", lambda: sorted([3, "a"]))
show("remove", lambda: [1].remove(7))
show("lindex", lambda: [1].index(7))
show("popempty", lambda: [].pop())
show("neg", lambda: -"a")
show("rangezero", lambda: range(1, 5, 0))
show("maxempty", lambda: max([]))
show("subscr", lambda: (5)[0])
show("strmul", lambda: "a" * "b")
show("intconv", lambda: int(None))


def f(x):
    return x


show("argcount", lambda: f(1, 2))
show("argmissing", lambda: f())
show("argkw", lambda: f(y=1))


class InsufficientFunds(Exception):
    def __init__(self, balance, needed):
        super().__init__("need " + str(needed) + " but have " + str(balance))
        self.balance = balance
        self.needed = needed


class Account:
    def __init__(self, balance):
        self.balance = balance

    def withdraw(self, amount):
        if amount > self.balance:
            raise InsufficientFunds(self.balance, amount)
        self.balance -= amount
        return self.balance


acc = Account(100)
try:
    acc.withdraw(30)
    acc.withdraw(100)
except InsufficientFunds as e:
    print("caught:", e, e.balance, e.needed, e.args)
else:
    print("no error")
finally:
    print("finally 1")

try:
    print("try")
except ValueError:
    print("never")
else:
    print("else")
finally:
    print("finally 2")


def order():
    out = []
    try:
        out.append("try")
        raise KeyError("k")
    except ValueError:
        out.append("value")
    except (TypeError, KeyError) as e:
        out.append("tuple " + repr(e))
    finally:
        out.append("fin")
    return out


print(order())


def with_return():
    try:
        return "from try"
    finally:
        print("cleanup runs")


print(with_return())


def finally_overrides():
    try:
        return 1
    finally:
        return 2


print(finally_overrides())

for i in range(4):
    try:
        if i == 1:
            continue
        if i == 3:
            break
        print("body", i)
    finally:
        print("fin", i)


def nested():
    try:
        try:
            raise ValueError("inner")
        except ValueError as e:
            print("inner handler", e)
            raise RuntimeError("outer") from e
    except RuntimeError as e:
        print("outer handler", e, type(e.__cause__).__name__, e.__cause__)


nested()


def reraise():
    try:
        try:
            1 / 0
        except ZeroDivisionError:
            print("log")
            raise
    except ArithmeticError as e:
        print("got", type(e).__name__, e)


reraise()


def deep(n):
    if n == 0:
        raise ValueError("bottom")
    deep(n - 1)


try:
    deep(5)
except ValueError as e:
    print("deep:", e)

try:
    raise ValueError
except ValueError as e:
    print(repr(e), e.args, str(e) == "")

try:
    raise ValueError("a", 2)
except Exception as e:
    print(repr(e), e.args, e)

print(issubclass(KeyError, LookupError), issubclass(ZeroDivisionError, Exception), isinstance(ValueError("x"), Exception))

try:
    [].pop()
except IndexError as e:
    print("IndexError", e)

it = iter([1])
next(it)
try:
    next(it)
except StopIteration:
    print("stop")

count = 0
while True:
    try:
        count += 1
        if count < 3:
            raise ValueError("again")
        print("done after", count)
        break
    except ValueError as e:
        print("retry:", e)

try:
    try:
        raise KeyError("x")
    finally:
        print("inner finally")
except KeyError as e:
    print("outer", e)


def gen_error(d, k):
    try:
        return d[k]
    except KeyError:
        return "missing " + k


print(gen_error({"a": 1}, "a"), gen_error({}, "b"))

try:
    raise TypeError("bad") from None
except TypeError as e:
    print(e.__cause__)

x = 10
try:
    x = int("12x")
except ValueError:
    x = -1
print(x)
try:
    import nothing_here
except ImportError as e:
    print(type(e).__name__, e)
