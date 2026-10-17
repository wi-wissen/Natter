import pprint

data = [
    {}, [], (), set(), "", 1, "x" * 100, "word " * 40, "line one\nline two is a lot longer than the first line, really quite long, longer than that\nthree", list(range(30)),
    {"a": 1, "b": [1, 2, 3], "c": {"d": {"e": {"f": "g" * 40}}}}, [[1, 2, 3]] * 12, [(i, str(i) * 5) for i in range(12)], {i: [i] * 10 for i in range(5)},
    ((1, 2, 3), ("a" * 30, "b" * 30, "c" * 30)), {"k" * 20: "v" * 70}, [None, True, 1.5, "s", (1,), [2], {3: 4}] * 4, {"set": {1, 2, 3}, "fs": frozenset({"a" * 40, "b" * 40})},
    [{"name": "n%d" % i, "tags": ["x", "y"] * 4} for i in range(3)], ("only" * 30,), ["a" * 50, "b" * 50], {"z": 1, "a": 2, 10: 3, "m": 4} if False else {"z": 1, "a": 2, "m": 4},
]
for d in data:
    for kw in ({}, {"width": 30}, {"width": 100}, {"indent": 4, "width": 40}, {"compact": True, "width": 50}, {"sort_dicts": False, "width": 40}):
        print(pprint.pformat(d, **kw))
        print("--")
