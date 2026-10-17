// textwrap: wrap, fill, dedent, indent, shorten.
export default String.raw`
def _split_words(text):
    chunks = []
    cur = ""
    ws = None
    for c in text:
        is_ws = c in " " + chr(9) + chr(10)
        if ws is None or is_ws == ws:
            cur += c
        else:
            chunks.append(cur)
            cur = c
        ws = is_ws
    if cur:
        chunks.append(cur)
    out = []
    for ch in chunks:
        if ch[0] not in " " + chr(9) + chr(10) and "-" in ch.strip("-") and not ch.startswith("-"):
            parts = ch.split("-")
            for k in range(len(parts) - 1):
                out.append(parts[k] + "-")
            if parts[-1]:
                out.append(parts[-1])
        else:
            out.append(ch)
    return out


def wrap(text, width=70, initial_indent="", subsequent_indent="", expand_tabs=True, replace_whitespace=True,
         fix_sentence_endings=False, break_long_words=True, drop_whitespace=True, break_on_hyphens=True,
         tabsize=8, max_lines=None, placeholder=" [...]"):
    if expand_tabs:
        text = text.expandtabs(tabsize)
    if replace_whitespace:
        text = "".join([" " if c in chr(9) + chr(10) + chr(11) + chr(12) + chr(13) else c for c in text])
    chunks = _split_words(text) if break_on_hyphens else [w for w in _split_keep(text)]
    chunks.reverse()
    lines = []
    while chunks:
        cur = []
        cur_len = 0
        indent = subsequent_indent if lines else initial_indent
        w = width - len(indent)
        if drop_whitespace and chunks[-1].strip() == "" and lines:
            del chunks[-1]
        while chunks:
            l = len(chunks[-1])
            if cur_len + l <= w:
                cur.append(chunks.pop())
                cur_len += l
            else:
                break
        if chunks and len(chunks[-1]) > w:
            space_left = w - cur_len if w >= 1 else 1
            if break_long_words:
                end = space_left
                chunk = chunks[-1]
                if break_on_hyphens and len(chunk) > space_left:
                    hyphen = chunk.rfind("-", 0, space_left)
                    if hyphen > 0 and any([c != "-" for c in chunk[:hyphen]]):
                        end = hyphen + 1
                cur.append(chunk[:end])
                chunks[-1] = chunk[end:]
            elif not cur:
                cur.append(chunks.pop())
            cur_len = sum([len(x) for x in cur])
        while drop_whitespace and cur and cur[-1].strip() == "":
            cur_len -= len(cur[-1])
            del cur[-1]
        if cur:
            if max_lines is None or len(lines) + 1 < max_lines or ((not chunks or drop_whitespace and len(chunks) == 1 and not chunks[0].strip()) and cur_len <= w):
                lines.append(indent + "".join(cur))
            else:
                done = False
                while cur:
                    if cur[-1].strip() and cur_len + len(placeholder) <= w:
                        cur.append(placeholder)
                        lines.append(indent + "".join(cur))
                        done = True
                        break
                    cur_len -= len(cur[-1])
                    del cur[-1]
                if not done:
                    if lines:
                        prev_line = lines[-1].rstrip()
                        if len(prev_line) + len(placeholder) <= width:
                            lines[-1] = prev_line + placeholder
                            break
                    lines.append(indent + placeholder.lstrip())
                break
    return lines


def _split_keep(text):
    out = []
    cur = ""
    ws = None
    for c in text:
        is_ws = c == " "
        if ws is None or is_ws == ws:
            cur += c
        else:
            out.append(cur)
            cur = c
        ws = is_ws
    if cur:
        out.append(cur)
    return out


def fill(text, width=70, **kw):
    return chr(10).join(wrap(text, width, **kw))


def shorten(text, width, **kw):
    kw.setdefault("placeholder", " [...]")
    text = " ".join(text.strip().split())
    lines = wrap(text, width, max_lines=1, **kw)
    return lines[0] if lines else ""


def dedent(text):
    lines = text.split(chr(10))
    margin = None
    for line in lines:
        if line.strip() == "":
            continue
        indent = line[:len(line) - len(line.lstrip(" " + chr(9)))]
        if margin is None:
            margin = indent
        elif indent.startswith(margin):
            pass
        elif margin.startswith(indent):
            margin = indent
        else:
            k = 0
            while k < len(margin) and k < len(indent) and margin[k] == indent[k]:
                k += 1
            margin = margin[:k]
    out = []
    for line in lines:
        if line.strip() == "":
            out.append("")
        elif margin:
            out.append(line[len(margin):])
        else:
            out.append(line)
    return chr(10).join(out)


def indent(text, prefix, predicate=None):
    out = []
    for line in text.splitlines(True):
        ok = predicate(line) if predicate else line.strip() != ""
        out.append(prefix + line if ok else line)
    return "".join(out)


class TextWrapper:
    def __init__(self, width=70, **kw):
        self.width = width
        self.kw = kw

    def wrap(self, text):
        return wrap(text, self.width, **self.kw)

    def fill(self, text):
        return fill(text, self.width, **self.kw)
`;
