import pprint

d = {"name": "Ada Lovelace", "born": 1815, "works": ["Notes on the Analytical Engine", "Sketch of the Analytical Engine"], "nested": {"b": [1, 2, 3], "a": {"x": 1}}}
pprint.pprint(d)
pprint.pprint(d, width=40)
pprint.pprint(list(range(40)))
pprint.pprint(list(range(40)), compact=True, width=60)
pprint.pprint({"b": 1, "a": 2, 3: 4} if False else {"b": 1, "a": 2})
pprint.pprint([("alpha", 1), ("beta", 2)] * 6)
pprint.pprint("word " * 30)
pprint.pprint(["short", "x" * 90])
pprint.pprint({i: "v" * i for i in range(1, 12)}, sort_dicts=False)
pprint.pprint(set(range(60)))
pprint.pprint(((1,), (1, 2), "a" * 80))
print(pprint.pformat({"z": [1, 2], "y": (3,)}, indent=4, width=20))
print(pprint.pformat([1, 2, 3]), pprint.pformat("x"), pprint.saferepr({"b": 1, "a": 2}))
pprint.pp({"b": 1, "a": 2})
