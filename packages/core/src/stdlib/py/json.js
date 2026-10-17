// json: dumps/loads (natives in _json) and dump/load for file objects.
export default String.raw`
from _json import dumps as _dumps, loads as _loads


def dumps(obj, *, skipkeys=False, ensure_ascii=True, indent=None, separators=None, default=None, sort_keys=False):
    item = key = None
    if separators is not None:
        item, key = separators
    return _dumps(obj, indent, sort_keys, ensure_ascii, item, key, default)


class JSONDecodeError(ValueError):
    def __init__(self, msg, doc, pos):
        before = doc[:pos]
        self.msg = msg
        self.doc = doc
        self.pos = pos
        self.lineno = before.count(chr(10)) + 1
        self.colno = pos - before.rfind(chr(10))
        ValueError.__init__(self, "%s: line %d column %d (char %d)" % (msg, self.lineno, self.colno, pos))


def loads(s, **kw):
    r = _loads(s)
    if not r[0]:
        raise JSONDecodeError(r[1], s, r[2])
    return r[1]


def dump(obj, fp, **kw):
    fp.write(dumps(obj, **kw))


def load(fp, **kw):
    return loads(fp.read(), **kw)
`;
