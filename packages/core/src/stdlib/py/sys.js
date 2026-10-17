// sys: the few parts of sys that a school program uses.
export default String.raw`
argv = [""]
maxsize = 9223372036854775807
version = "3.12.0 (Natter)"
version_info = (3, 12, 0, "final", 0)
platform = "browser"
byteorder = "little"
path = []
modules = {}


class _Stream:
    def __init__(self, err):
        self._err = err

    def write(self, text):
        if self._err:
            _write_err(text)
        else:
            print(text, end="")
        return len(text)

    def flush(self):
        pass

    def readline(self):
        return input() + chr(10)


from _sys import write_err as _write_err

stdout = _Stream(False)
stderr = _Stream(True)
stdin = _Stream(False)


def exit(code=None):
    raise SystemExit(code)


def getrecursionlimit():
    return 1000


def setrecursionlimit(n):
    pass


def getsizeof(obj):
    return 64
`;
