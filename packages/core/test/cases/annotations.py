# __annotations__ of modules, classes and functions (evaluated as in CPython 3.13)
class A:
    x: int = 1
    y: "str"
    def m(self, __a: int, *args: str, k: float = 2, **kw: bool) -> None:
        z: int = 3
        return z
class B(A):
    pass
class C:
    pass
print(A.__annotations__, B.__annotations__, C.__annotations__, "__annotations__" in vars(B) if False else "")
print(A.m.__annotations__)
def f(): pass
print(f.__annotations__)
f.extra = 5
print(f.extra)
q: int
print(__annotations__)
import math
print(hasattr(math, "__annotations__"))
