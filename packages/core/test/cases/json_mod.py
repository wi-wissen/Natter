import json

data = {"name": "Ada", "age": 36, "langs": ["py", "js"], "ok": True, "none": None, "pi": 3.5, "nested": {"a": [1, 2, {"b": []}]}}
s = json.dumps(data)
print(s)
print(json.dumps(data, indent=2))
print(json.dumps(data, sort_keys=True, separators=(",", ":")))
print(json.dumps("ä\n\"x\"", ensure_ascii=False), json.dumps("ä\n"), json.dumps([1.0, 2, 1e20, True]))
print(json.loads(s) == data, json.loads("[1, 2.5, \"x\", null, true]"), json.loads('{"a": {"b": 1e2}}'))
print(json.loads('"\\u00e4\\n"'), json.loads(" 12 "), json.loads("-0.5"))
for bad in ["{", "[1,]", "nope", ""]:
    try:
        json.loads(bad)
    except json.JSONDecodeError as e:
        print("JSONDecodeError", e.msg, e.pos)
    except ValueError as e:
        print("ValueError", e)
try:
    json.dumps({1, 2})
except TypeError as e:
    print("TypeError", e)
