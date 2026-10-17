// numpy (a subset for school: arrays, element-wise maths, statistics, random numbers). The arrays and all loops
// live in the native module _np (stdlib/numpy.js, stdlib/nprandom.js); these modules only give them numpy's names.

export const numpy = String.raw`
from _np import *
import _np

__version__ = "2.5.4"
pi = 3.141592653589793
e = 2.718281828459045
euler_gamma = 0.5772156649015329
inf = float("inf")
nan = float("nan")
newaxis = None

# dtypes: Natter stores int64, float64 and bool; the other names are accepted as aliases
float32 = float64
float16 = float64
double = float64
int32 = int64
int16 = int64
int8 = int64
uint8 = int64
uint16 = int64
uint32 = int64
uint64 = int64
intp = int64
around = round
amin = min
amax = max


def vectorize(pyfunc, otypes=None):
    """Element-wise version of a Python function (a loop in Python, like numpy's)."""
    def wrapper(*args):
        arrays = [asarray(a) for a in args]
        if not arrays:
            return pyfunc()
        shape = arrays[0].shape
        flat = [a.ravel().tolist() if a.shape == shape else (a + zeros(shape, dtype=a.dtype)).ravel().tolist() for a in arrays]
        out = [pyfunc(*vals) for vals in zip(*flat)]
        if shape == ():
            return out[0]
        return array(out).reshape(shape)
    return wrapper


def apply_along_axis(func1d, axis, arr):
    arr = asarray(arr)
    if arr.ndim == 1:
        return func1d(arr)
    if axis < 0:
        axis += arr.ndim
    rows = arr if axis == 1 else arr.T
    return array([func1d(r) for r in rows])


def fromfunction(function, shape, dtype=float):
    grids = []
    n = len(shape)
    for k in range(n):
        s = [1] * n
        s[k] = shape[k]
        grids.append(arange(shape[k], dtype=dtype).reshape(tuple(s)) + zeros(shape, dtype=dtype))
    return function(*grids)


from numpy import random, linalg
`;

export const numpy_random = String.raw`
import _np
from _np import _RandomState as RandomState, _Generator as Generator

default_rng = _np._random_default_rng
seed = _np._random_seed
rand = _np._random_rand
randn = _np._random_randn
random = _np._random_random
random_sample = _np._random_random_sample
ranf = _np._random_ranf
sample = _np._random_sample
randint = _np._random_randint
random_integers = _np._random_random_integers
uniform = _np._random_uniform
normal = _np._random_normal
standard_normal = _np._random_standard_normal
exponential = _np._random_exponential
poisson = _np._random_poisson
binomial = _np._random_binomial
choice = _np._random_choice
shuffle = _np._random_shuffle
permutation = _np._random_permutation
`;

export const numpy_linalg = String.raw`
import _np
from _np import _LinAlgError as LinAlgError


def det(a):
    return _np._linalg_det(a)


def inv(a):
    return _np._linalg_inv(a)


def solve(a, b):
    return _np._linalg_solve(a, b)


def norm(x, ord=None, axis=None):
    if ord is not None or axis is not None:
        raise NotImplementedError("Natter: norm() supports only the default (Euclidean/Frobenius) norm")
    return _np._linalg_norm(x)
`;
