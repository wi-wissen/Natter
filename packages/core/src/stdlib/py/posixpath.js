// posixpath: os.path.
export default String.raw`
import _fs

sep = "/"
curdir = "."
pardir = ".."


def exists(p):
    return _fs.exists(p)


def isfile(p):
    return _fs.isfile(p)


def isdir(p):
    return _fs.isdir(p)


def join(a, *parts):
    out = a
    for p in parts:
        if p.startswith("/"):
            out = p
        elif out == "" or out.endswith("/"):
            out += p
        else:
            out += "/" + p
    return out


def split(p):
    i = p.rfind("/") + 1
    head, tail = p[:i], p[i:]
    if head and head != "/" * len(head):
        head = head.rstrip("/")
    return (head, tail)


def basename(p):
    return p[p.rfind("/") + 1:]


def dirname(p):
    return split(p)[0]


def splitext(p):
    sep_i = p.rfind("/")
    dot = p.rfind(".")
    if dot > sep_i:
        k = sep_i + 1
        while k < dot and p[k] == ".":
            k += 1
        if k < dot:
            return (p[:dot], p[dot:])
    return (p, "")


def normpath(p):
    if p == "":
        return "."
    absolute = p.startswith("/")
    out = []
    for part in p.split("/"):
        if part == "" or part == ".":
            continue
        if part == ".." and out and out[-1] != "..":
            out.pop()
        elif part == ".." and absolute:
            continue
        else:
            out.append(part)
    s = "/".join(out)
    if absolute:
        return "/" + s
    return s or "."


def abspath(p):
    return normpath(p if p.startswith("/") else "/" + p)


def isabs(p):
    return p.startswith("/")


def getsize(p):
    return len(_fs.read(p))
`;
