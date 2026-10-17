// re: regular expressions (the matching itself is done by the native _re).
export default String.raw`
import _re

I = IGNORECASE = 2
L = LOCALE = 4
M = MULTILINE = 8
S = DOTALL = 16
U = UNICODE = 32
X = VERBOSE = 64
A = ASCII = 256
NOFLAG = 0


class PatternError(Exception):
    def __init__(self, msg, pattern=None, pos=None):
        Exception.__init__(self, msg)
        self.msg = msg
        self.pattern = pattern
        self.pos = pos


error = PatternError


def _flags(flags):
    return int(flags)


class Match:
    def __init__(self, pattern, string, spans, pos, endpos):
        self.re = pattern
        self.string = string
        self._spans = spans
        self.pos = pos
        self.endpos = endpos
        self.lastindex = None
        best = 0
        for g in range(1, len(spans) // 2):
            if spans[2 * g] >= 0 and spans[2 * g + 1] >= best:
                best = spans[2 * g + 1]
                self.lastindex = g
        self.lastgroup = None
        for name, k in pattern.groupindex.items():
            if k == self.lastindex:
                self.lastgroup = name

    def _index(self, g):
        if isinstance(g, str):
            if g not in self.re.groupindex:
                raise IndexError("no such group")
            return self.re.groupindex[g]
        if not isinstance(g, int) or g < 0 or g > self.re.groups:
            raise IndexError("no such group")
        return g

    def group(self, *groups):
        if not groups:
            groups = (0,)
        out = []
        for g in groups:
            k = self._index(g)
            a, b = self._spans[2 * k], self._spans[2 * k + 1]
            out.append(None if a < 0 else self.string[a:b])
        return out[0] if len(out) == 1 else tuple(out)

    def __getitem__(self, g):
        return self.group(g)

    def groups(self, default=None):
        out = []
        for k in range(1, self.re.groups + 1):
            v = self.group(k)
            out.append(default if v is None else v)
        return tuple(out)

    def groupdict(self, default=None):
        out = {}
        for name in self.re.groupindex:
            v = self.group(name)
            out[name] = default if v is None else v
        return out

    def start(self, g=0):
        return self._spans[2 * self._index(g)]

    def end(self, g=0):
        return self._spans[2 * self._index(g) + 1]

    def span(self, g=0):
        k = self._index(g)
        return (self._spans[2 * k], self._spans[2 * k + 1])

    def expand(self, template):
        return _expand(template, self)

    def __bool__(self):
        return True

    def __repr__(self):
        return "<re.Match object; span=%r, match=%r>" % (self.span(), self.group())


def _expand(template, m):
    if "\\" not in template:
        return template
    out = []
    i = 0
    n = len(template)
    while i < n:
        c = template[i]
        if c != "\\" or i + 1 >= n:
            out.append(c)
            i += 1
            continue
        i += 1
        c = template[i]
        if c == "g":
            j = template.find(">", i)
            if template[i + 1:i + 2] != "<" or j < 0:
                raise error("missing < at position " + str(i + 1))
            name = template[i + 2:j]
            ref = int(name) if name.isdigit() else name
            try:
                v = m.group(ref)
            except IndexError:
                raise error("unknown group name '" + name + "'" if not name.isdigit() else "invalid group reference " + name)
            out.append(v or "")
            i = j + 1
        elif c.isdigit():
            j = i + 1
            if j < n and template[j].isdigit() and c != "0":
                j += 1
            ref = int(template[i:j])
            if c == "0":
                out.append(chr(0))
            else:
                try:
                    v = m.group(ref)
                except IndexError:
                    raise error("invalid group reference " + str(ref))
                out.append(v or "")
            i = j
        elif c == "n":
            out.append(chr(10)); i += 1
        elif c == "t":
            out.append(chr(9)); i += 1
        elif c == "r":
            out.append(chr(13)); i += 1
        elif c == "\\":
            out.append("\\"); i += 1
        elif c.isalpha():
            raise error("bad escape \\" + c + " at position " + str(i - 1))
        else:
            out.append("\\" + c); i += 1
    return "".join(out)


class Pattern:
    def __init__(self, pattern, flags):
        info = _re.info(pattern, flags)
        if info[0] is None:
            raise error(info[1], pattern)
        self.pattern = pattern
        self.flags = flags
        self.groups = info[0]
        d = {}
        names = info[1]
        for k in range(0, len(names), 2):
            d[names[k]] = names[k + 1]
        self.groupindex = d

    def _run(self, string, pos, endpos, mode):
        if not isinstance(string, str):
            raise TypeError("expected string or bytes-like object, got '" + type(string).__name__ + "'")
        n = len(string)
        if pos < 0:
            pos = 0
        if pos > n:
            pos = n
        if endpos is None or endpos > n:
            end = None
        else:
            end = max(endpos, 0)
        spans = _re.run(self.pattern, self.flags, string, pos, end, mode)
        if spans is None:
            return None
        return Match(self, string, spans, pos, n if end is None else end)

    def search(self, string, pos=0, endpos=None):
        return self._run(string, pos, endpos, 0)

    def match(self, string, pos=0, endpos=None):
        return self._run(string, pos, endpos, 1)

    def fullmatch(self, string, pos=0, endpos=None):
        return self._run(string, pos, endpos, 2)

    def finditer(self, string, pos=0, endpos=None):
        pos0 = pos
        n = len(string)
        while pos <= n:
            m = self._run(string, pos, endpos, 0)
            if m is None:
                return
            yield m
            a, b = m.span()
            pos = b if b > a else b + 1

    def findall(self, string, pos=0, endpos=None):
        out = []
        for m in self.finditer(string, pos, endpos):
            if self.groups == 0:
                out.append(m.group())
            elif self.groups == 1:
                out.append(m.group(1) or "")
            else:
                out.append(m.groups(""))
        return out

    def subn(self, repl, string, count=0):
        out = []
        last = 0
        k = 0
        for m in self.finditer(string):
            if count and k >= count:
                break
            a, b = m.span()
            out.append(string[last:a])
            out.append(repl(m) if callable(repl) else _expand(repl, m))
            last = b
            k += 1
        out.append(string[last:])
        return ("".join(out), k)

    def sub(self, repl, string, count=0):
        return self.subn(repl, string, count)[0]

    def split(self, string, maxsplit=0):
        out = []
        last = 0
        k = 0
        for m in self.finditer(string):
            if maxsplit and k >= maxsplit:
                break
            a, b = m.span()
            if a == b and (a == 0 or a == len(string)) and False:
                continue
            out.append(string[last:a])
            if self.groups:
                out.extend(m.groups())
            last = b
            k += 1
        out.append(string[last:])
        return out

    def __repr__(self):
        f = ""
        names = [("re.IGNORECASE", 2), ("re.MULTILINE", 8), ("re.DOTALL", 16), ("re.VERBOSE", 64), ("re.ASCII", 256)]
        parts = [n for n, v in names if self.flags & v]
        if parts:
            f = ", " + "|".join(parts)
        return "re.compile(" + repr(self.pattern) + f + ")"


_cache = {}


def compile(pattern, flags=0):
    if isinstance(pattern, Pattern):
        return pattern
    if not isinstance(pattern, str):
        raise TypeError("first argument must be string or compiled pattern")
    key = (pattern, int(flags))
    p = _cache.get(key)
    if p is None:
        if len(_cache) > 100:
            _cache.clear()
        p = Pattern(pattern, int(flags))
        _cache[key] = p
    return p


def search(pattern, string, flags=0):
    return compile(pattern, flags).search(string)


def match(pattern, string, flags=0):
    return compile(pattern, flags).match(string)


def fullmatch(pattern, string, flags=0):
    return compile(pattern, flags).fullmatch(string)


def findall(pattern, string, flags=0):
    return compile(pattern, flags).findall(string)


def finditer(pattern, string, flags=0):
    return compile(pattern, flags).finditer(string)


def sub(pattern, repl, string, count=0, flags=0):
    return compile(pattern, flags).sub(repl, string, count)


def subn(pattern, repl, string, count=0, flags=0):
    return compile(pattern, flags).subn(repl, string, count)


def split(pattern, string, maxsplit=0, flags=0):
    return compile(pattern, flags).split(string, maxsplit)


def escape(pattern):
    special = "()[]{}?*+-|^$\\.&~# " + chr(9) + chr(10) + chr(13) + chr(11) + chr(12)
    return "".join(["\\" + c if c in special else c for c in pattern])


def purge():
    _cache.clear()
`;
