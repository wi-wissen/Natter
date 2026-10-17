// os and os.path on the file system of the VM (all paths are relative to the project folder).
export default String.raw`
import _fs
import posixpath as path

sep = "/"
linesep = chr(10)
name = "posix"
curdir = "."
pardir = ".."
environ = {}


def getcwd():
    return "/"


def listdir(p="."):
    return _fs.listdir(p)


def remove(p):
    _fs.remove(p)


unlink = remove


def mkdir(p, mode=511):
    _fs.mkdir(p, False)


def makedirs(p, mode=511, exist_ok=False):
    if _fs.isdir(p):
        if exist_ok:
            return
        raise FileExistsError("[Errno 17] File exists: " + repr(p))
    _fs.mkdir(p, True)


def rmdir(p):
    _fs.rmdir(p)


def rename(a, b):
    _fs.rename(a, b)


def getenv(key, default=None):
    return environ.get(key, default)


def walk(top):
    names = listdir(top)
    dirs = [n for n in names if path.isdir(path.join(top, n))]
    files = [n for n in names if not path.isdir(path.join(top, n))]
    yield top, dirs, files
    for d in dirs:
        for item in walk(path.join(top, d)):
            yield item
`;
