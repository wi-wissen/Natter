// _fileio: open() and text file objects on top of the file system of the VM (_fs).
export default String.raw`
import _fs


class UnsupportedOperation(OSError, ValueError):
    pass


class TextFile:
    def __init__(self, path, mode, encoding=None):
        self.name = path
        self.mode = mode
        self.encoding = encoding or "UTF-8"
        self.closed = False
        plus = "+" in mode
        kind = mode.replace("+", "").replace("t", "")
        if kind not in ("r", "w", "a", "x"):
            raise ValueError("invalid mode: " + repr(mode))
        self._read = kind == "r" or plus
        self._write = kind != "r" or plus
        self._append = kind == "a"
        if kind == "r":
            self._buf = _fs.read(path).replace(chr(13) + chr(10), chr(10))
        elif kind == "w":
            self._buf = ""
            _fs.write(path, "")
        elif kind == "x":
            if _fs.exists(path):
                raise FileExistsError("[Errno 17] File exists: " + repr(path))
            self._buf = ""
            _fs.write(path, "")
        else:
            self._buf = _fs.read(path) if _fs.isfile(path) else ""
            if not _fs.isfile(path):
                _fs.write(path, "")
        self._pos = len(self._buf) if kind == "a" else 0

    def _check(self):
        if self.closed:
            raise ValueError("I/O operation on closed file.")

    def read(self, size=-1):
        self._check()
        if not self._read:
            raise UnsupportedOperation("not readable")
        if size is None or size < 0:
            out = self._buf[self._pos:]
        else:
            out = self._buf[self._pos:self._pos + size]
        self._pos += len(out)
        return out

    def readline(self, size=-1):
        self._check()
        if not self._read:
            raise UnsupportedOperation("not readable")
        i = self._buf.find(chr(10), self._pos)
        end = len(self._buf) if i < 0 else i + 1
        if size is not None and size >= 0:
            end = min(end, self._pos + size)
        out = self._buf[self._pos:end]
        self._pos = end
        return out

    def readlines(self, hint=-1):
        out = []
        while True:
            line = self.readline()
            if line == "":
                return out
            out.append(line)

    def __iter__(self):
        self._check()
        return self

    def __next__(self):
        line = self.readline()
        if line == "":
            raise StopIteration
        return line

    def write(self, text):
        self._check()
        if not self._write:
            raise UnsupportedOperation("not writable")
        if not isinstance(text, str):
            raise TypeError("write() argument must be str, not " + type(text).__name__)
        if self._append:
            self._pos = len(self._buf)
        self._buf = self._buf[:self._pos] + text + self._buf[self._pos + len(text):]
        self._pos += len(text)
        _fs.write(self.name, self._buf)
        return len(text)

    def writelines(self, lines):
        for line in lines:
            self.write(line)

    def seek(self, offset, whence=0):
        self._check()
        if whence == 0:
            self._pos = offset
        elif whence == 1:
            self._pos += offset
        else:
            self._pos = len(self._buf) + offset
        if self._pos < 0:
            raise ValueError("negative seek value " + str(self._pos))
        return self._pos

    def tell(self):
        self._check()
        return self._pos

    def truncate(self, size=None):
        self._check()
        if not self._write:
            raise UnsupportedOperation("File not open for writing")
        if size is None:
            size = self._pos
        self._buf = self._buf[:size]
        _fs.write(self.name, self._buf)
        return size

    def flush(self):
        self._check()

    def readable(self):
        return self._read

    def writable(self):
        return self._write

    def seekable(self):
        return True

    def close(self):
        self.closed = True

    def __enter__(self):
        self._check()
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()
        return False

    def __repr__(self):
        return "<_io.TextIOWrapper name=" + repr(self.name) + " mode=" + repr(self.mode) + " encoding='UTF-8'>"


def open(file, mode="r", buffering=-1, encoding=None, errors=None, newline=None, closefd=True, opener=None):
    if not isinstance(file, str):
        raise TypeError("expected str, bytes or os.PathLike object, not " + type(file).__name__)
    if "b" in mode:
        raise ValueError("binary files are not supported here, use text mode")
    return TextFile(file, mode, encoding)
`;
