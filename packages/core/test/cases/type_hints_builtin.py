# list[int], int | None, types.GenericAlias/UnionType, collections classes with []
class K: pass
a = list[int]
print(a, dict[str, list[int]], tuple[int, ...], tuple[()], set[K], type[int], frozenset[str], tuple[int, str])
print(a.__origin__, a.__args__, a(), a([1, 2]), list[int] == list[int], list[int] == list[str], hash(list[int]) == hash(list[int]))
u = int | None
print(u, int | str | None, K | None, list[int] | None, int | int, (int | str) | (str | float), u.__args__)
print(isinstance(1, int | str), isinstance(None, int | None), isinstance("a", int | float), issubclass(bool, int | str))
print(type(u), type(a), type(u).__name__, type(a).__name__, (int | str) == (str | int))
for code in ["isinstance([], list[int])", "issubclass(list, list[int])", "int[str]", "None | None", "1 | int"]:
    try:
        print(eval(code) if False else None)
    except Exception as e:
        print(type(e).__name__, e)
try:
    isinstance([], list[int])
except TypeError as e:
    print(e)
try:
    issubclass(list, list[int])
except TypeError as e:
    print(e)
try:
    int[str]
except TypeError as e:
    print(e)
try:
    None | None
except TypeError as e:
    print(e)
try:
    1 | int
except TypeError as e:
    print(e)
def f(x: list[int] | None = None, *, y: dict[str, int | float]) -> tuple[int, ...]:
    return ()
print(f.__annotations__)
import collections, types
from collections import deque, Counter, defaultdict, OrderedDict
print(deque[int], Counter[str], defaultdict[str, list[int]], OrderedDict[str, int])
print(types.GenericAlias(list, (int,)), types.GenericAlias(list, int), types.NoneType, types.GenericAlias)
print(isinstance(list[int], types.GenericAlias), isinstance(int | str, types.UnionType), isinstance(len, types.BuiltinFunctionType), isinstance(lambda: 1, types.FunctionType))
print(deque[int]([1, 2]), type(int | str) is types.UnionType)
