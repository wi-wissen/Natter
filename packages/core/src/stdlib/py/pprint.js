// pprint: pretty printing of nested data (a port of the layout rules of CPython's pprint).
export default String.raw`
import re


def _sorted_items(d):
    try:
        return sorted(d.items())
    except TypeError:
        return sorted(d.items(), key=lambda kv: (type(kv[0]).__name__, repr(kv[0])))


def _sorted_set(s):
    try:
        return sorted(s)
    except TypeError:
        return sorted(s, key=lambda v: (type(v).__name__, repr(v)))


def _safe_repr(obj, sort_dicts, context=None):
    t = type(obj)
    if context is None:
        context = set()
    if t is str:
        return repr(obj)
    if t is dict:
        if not obj:
            return "{}"
        if id(obj) in context:
            return "{...}"
        context.add(id(obj))
        items = _sorted_items(obj) if sort_dicts else obj.items()
        parts = [_safe_repr(k, sort_dicts, context) + ": " + _safe_repr(v, sort_dicts, context) for k, v in items]
        context.discard(id(obj))
        return "{" + ", ".join(parts) + "}"
    if t is list or t is tuple:
        if not obj:
            return "[]" if t is list else "()"
        if id(obj) in context:
            return "[...]" if t is list else "(...)"
        context.add(id(obj))
        parts = [_safe_repr(v, sort_dicts, context) for v in obj]
        context.discard(id(obj))
        if t is list:
            return "[" + ", ".join(parts) + "]"
        return "(" + parts[0] + ",)" if len(parts) == 1 else "(" + ", ".join(parts) + ")"
    return repr(obj)


class PrettyPrinter:
    def __init__(self, indent=1, width=80, depth=None, stream=None, *, compact=False, sort_dicts=True, underscore_numbers=False):
        self._indent_per_level = indent
        self._width = width
        self._depth = depth
        self._stream = stream
        self._compact = compact
        self._sort_dicts = sort_dicts

    def pprint(self, obj):
        text = self.pformat(obj)
        if self._stream is None:
            print(text)
        else:
            self._stream.write(text + chr(10))

    def pformat(self, obj):
        out = []
        self._format(obj, out, 0, 0, set(), 0)
        return "".join(out)

    def isreadable(self, obj):
        return True

    def isrecursive(self, obj):
        return False

    def _repr(self, obj):
        return _safe_repr(obj, self._sort_dicts)

    def _format(self, obj, out, indent, allowance, context, level):
        rep = self._repr(obj)
        max_width = self._width - indent - allowance
        if len(rep) > max_width:
            t = type(obj)
            if t is dict or t is list or t is tuple or t is set or t is frozenset or t is str:
                if id(obj) in context:
                    out.append(rep)
                    return
                context.add(id(obj))
                level += 1
                if t is dict:
                    self._pprint_dict(obj, out, indent, allowance, context, level)
                elif t is list:
                    out.append("[")
                    self._format_items(obj, out, indent, allowance + 1, context, level)
                    out.append("]")
                elif t is tuple:
                    out.append("(")
                    end = ",)" if len(obj) == 1 else ")"
                    self._format_items(obj, out, indent, allowance + len(end), context, level)
                    out.append(end)
                elif t is str:
                    self._pprint_str(obj, out, indent, allowance, context, level)
                else:
                    self._pprint_set(obj, out, indent, allowance, context, level)
                context.discard(id(obj))
                return
        out.append(rep)

    def _pprint_dict(self, obj, out, indent, allowance, context, level):
        out.append("{")
        if self._indent_per_level > 1:
            out.append((self._indent_per_level - 1) * " ")
        if len(obj):
            items = _sorted_items(obj) if self._sort_dicts else list(obj.items())
            indent += self._indent_per_level
            delimnl = "," + chr(10) + " " * indent
            last_index = len(items) - 1
            for i in range(len(items)):
                key, ent = items[i]
                last = i == last_index
                rep = self._repr(key)
                out.append(rep)
                out.append(": ")
                self._format(ent, out, indent + len(rep) + 2, allowance + 1 if last else 1, context, level)
                if not last:
                    out.append(delimnl)
        out.append("}")

    def _pprint_set(self, obj, out, indent, allowance, context, level):
        if not len(obj):
            out.append(repr(obj))
            return
        if type(obj) is set:
            out.append("{")
            end = "}"
        else:
            out.append("frozenset({")
            end = "})"
            indent += len("frozenset") + 1
        self._format_items(_sorted_set(obj), out, indent, allowance + len(end), context, level)
        out.append(end)

    def _format_items(self, items, out, indent, allowance, context, level):
        indent += self._indent_per_level
        if self._indent_per_level > 1:
            out.append((self._indent_per_level - 1) * " ")
        delimnl = "," + chr(10) + " " * indent
        delim = ""
        width = max_width = self._width - indent + 1
        items = list(items)
        n = len(items)
        for k in range(n):
            ent = items[k]
            last = k == n - 1
            if last:
                max_width -= allowance
                width -= allowance
            if self._compact:
                rep = self._repr(ent)
                w = len(rep) + 2
                if width < w:
                    width = max_width
                    if delim:
                        delim = delimnl
                if width >= w:
                    width -= w
                    out.append(delim)
                    delim = ", "
                    out.append(rep)
                    continue
            out.append(delim)
            delim = delimnl
            self._format(ent, out, indent, allowance if last else 1, context, level)

    def _pprint_str(self, obj, out, indent, allowance, context, level):
        if not len(obj):
            out.append(repr(obj))
            return
        chunks = []
        lines = obj.splitlines(True)
        if level == 1:
            indent += 1
            allowance += 1
        max_width1 = max_width = self._width - indent
        rep = ""
        for i in range(len(lines)):
            line = lines[i]
            rep = repr(line)
            if i == len(lines) - 1:
                max_width1 -= allowance
            if len(rep) <= max_width1:
                chunks.append(rep)
            else:
                parts = re.findall(r"\S*\s*", line)
                parts.pop()
                max_width2 = max_width
                current = ""
                for j in range(len(parts)):
                    part = parts[j]
                    candidate = current + part
                    if j == len(parts) - 1 and i == len(lines) - 1:
                        max_width2 -= allowance
                    if len(repr(candidate)) > max_width2:
                        if current:
                            chunks.append(repr(current))
                        current = part
                    else:
                        current = candidate
                if current:
                    chunks.append(repr(current))
        if len(chunks) == 1:
            out.append(rep)
            return
        if level == 1:
            out.append("(")
        for i in range(len(chunks)):
            if i > 0:
                out.append(chr(10) + " " * indent)
            out.append(chunks[i])
        if level == 1:
            out.append(")")


def pformat(obj, indent=1, width=80, depth=None, *, compact=False, sort_dicts=True, underscore_numbers=False):
    return PrettyPrinter(indent=indent, width=width, depth=depth, compact=compact, sort_dicts=sort_dicts).pformat(obj)


def pprint(obj, stream=None, indent=1, width=80, depth=None, *, compact=False, sort_dicts=True, underscore_numbers=False):
    PrettyPrinter(indent=indent, width=width, depth=depth, stream=stream, compact=compact, sort_dicts=sort_dicts).pprint(obj)


def pp(obj, *args, sort_dicts=False, **kw):
    pprint(obj, *args, sort_dicts=sort_dicts, **kw)


def saferepr(obj):
    return _safe_repr(obj, True)


def isreadable(obj):
    return True


def isrecursive(obj):
    return False
`;
