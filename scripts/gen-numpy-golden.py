#!/usr/bin/env python3
"""Golden data for Natter's numpy subset: runs small programs in real numpy and records what they print.

Usage (needs numpy, e.g. in a venv):
  python3 scripts/gen-numpy-golden.py        # writes packages/core/test/data/numpy-golden.json

Each case: {"name", "src", "out", "warnings", "approx"}. `out` is stdout; an exception at the end is appended as
"<Kind>: <message>" (the type name without module, e.g. AxisError). `warnings` lists the RuntimeWarning
messages in order (Natter prints them on stderr). `approx` cases may differ in the last digits (BLAS, LAPACK):
the test compares their numbers with a relative tolerance.
The test (packages/core/test/numpy.test.js) runs without numpy.
"""
import contextlib
import io
import json
import os
import sys
import warnings

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'packages', 'core', 'test', 'data', 'numpy-golden.json')

CASES = []


def case(name, src, approx=False):
    CASES.append((name, src.strip('\n') + '\n', approx))


# ---------- creation and printing ----------
case('array basics', '''
import numpy as np
a = np.array([1, 2, 3])
print(a)
print(repr(a))
print(a.shape, a.ndim, a.size, a.dtype, len(a))
b = np.array([[1, 2], [3, 4]])
print(b)
print(repr(b))
print(b.shape, b.dtype)
print(np.array([1.5, 2, 3]))
print(np.array([True, False, True]), np.array([True, False]).dtype)
print(repr(np.array([True, False])))
print(np.array([1, 2.5]).dtype, np.array([True, 2]).dtype)
''')
case('float printing', '''
import numpy as np
for v in [[0.1, 0.2, 0.3], [1.0, 2.0], [1/3, 2/3], [-1.5, 2.25, 100.0], [1e-5, 1.0], [1e8, 1.0], [123456789.0],
          [0.0001, 0.5], [0.00001234, 0.5], [1e-20, 1e20], [-0.0, 0.0], [np.nan, 1.5], [np.inf, -np.inf, 2.0],
          [np.nan], [np.inf], [3.14159265358979, 2.718281828], [1e16, 1], [0.1 + 0.2], [1/7, 100/7, 1000/7],
          [2.5e-3, 1.25], [999.9999999999], [1e-300], [5e-324], [1.7976931348623157e308], [0.001953125, 1.0]]:
    a = np.array(v)
    print(a)
    print(repr(a))
''')
case('int printing', '''
import numpy as np
print(np.array([1, -20, 300]))
print(repr(np.array([-1, 10000000000])))
print(np.array([[1, 22], [333, -4]]))
print(np.arange(-5, 5))
''')
case('empty and 0-d', '''
import numpy as np
print(np.array([]), repr(np.array([])))
print(repr(np.zeros((0, 3))), np.zeros((0, 3)).shape)
print(repr(np.zeros((2, 0))))
a = np.array(5)
print(a, repr(a), a.shape, a.ndim)
print(np.array(2.5), repr(np.array(1/3)))
print(repr(np.array([], dtype=int)))
''')
case('line wrapping', '''
import numpy as np
print(np.arange(30))
print(repr(np.arange(30)))
print(np.linspace(0, 1, 20))
print(repr(np.linspace(0, 1, 30)))
print(np.arange(40.0).reshape(2, 20))
print(repr(np.arange(40).reshape(4, 10) * 1000))
print(np.arange(24).reshape(2, 3, 4))
print(repr(np.arange(24).reshape(2, 3, 4)))
''')
case('summarised', '''
import numpy as np
print(np.arange(2000))
print(repr(np.arange(2000)))
print(np.arange(1001.0))
print(np.arange(5000).reshape(50, 100))
print(repr(np.arange(3000.0).reshape(1000, 3)))
''')
case('creation functions', '''
import numpy as np
print(np.zeros(3), np.ones(3), np.zeros((2, 3)), np.ones((2, 2), dtype=int))
print(np.full(3, 7), np.full((2, 2), 1.5), np.eye(3), np.eye(2, dtype=int), np.identity(2))
print(np.arange(5), np.arange(2, 10, 3), np.arange(0, 1, 0.1), np.arange(1.5, 4), np.arange(10, 0, -2))
print(repr(np.arange(0, 1, 0.1)))
print(np.arange(0, 2, 0.3), np.arange(-1, 1, 0.25))
print(np.linspace(0, 1, 11), np.linspace(0, 10, 4), np.linspace(-1, 1, 7), np.linspace(1, 2, 5, endpoint=False))
print(repr(np.linspace(0, 2 * np.pi, 8)))
print(np.zeros_like(np.array([1, 2])), np.ones_like(np.array([1.5])), np.full_like(np.array([1, 2]), 9))
print(np.empty(0), np.array([1, 2], dtype=float), np.array([1.7, -1.7], dtype=int), np.array([0, 2], dtype=bool))
print(np.array(range(4)), np.array((1, 2)), np.array([np.arange(2), np.arange(2)]))
print(np.arange(3, dtype=float), np.linspace(0, 1, 3, retstep=True))
''')

# ---------- arithmetic ----------
case('arithmetic and broadcasting', '''
import numpy as np
a = np.array([1, 2, 3])
b = np.array([10, 20, 30])
print(a + b, a - b, a * b, b / a, b // a, b % 7, a ** 2, 2 ** a, -a, +a, abs(-a))
print(a + 1, a * 2.5, 1 - a, 10 / a, a / 2, a // 2, a % 2, a ** 0.5)
m = np.arange(6).reshape(2, 3)
print(m + a, m * np.array([[1], [10]]), m - 1, m.T + np.array([1, 2]))
print(np.array([1.5, -2.5]) // 1, np.array([-7, 7]) // 2, np.array([-7, 7]) % 3, np.array([-7.5, 7.5]) % 2)
print(np.array([True, False]) + np.array([True, True]), np.array([True, False]) * 3, np.array([True]) + 1.5)
print(np.array([2, 3]) ** np.array([3, 2]), np.array([2.0, 3]) ** -1, np.array([4]) ** 0)
print(a == 2, a != 2, a < 2, a >= 2, a == b / 10, 2 < a)
print((a > 1) & (a < 3), (a < 2) | (a > 2), ~(a > 1), np.array([6, 3]) & 5, np.array([6, 3]) | 1, np.array([6, 3]) ^ 1)
c = np.array([1.0, 2.0])
c += 1
c *= 3
c -= 0.5
c /= 2
print(c)
d = np.array([1, 2])
d += 3
d *= 2
print(d)
x = np.arange(4.0)
y = x[1:3]
y += 100
print(x)
''')
case('arithmetic errors', '''
import numpy as np
try:
    np.array([1, 2, 3]) + np.array([1, 2])
except ValueError as e:
    print("ValueError:", e)
try:
    np.ones((2, 3)) * np.ones((3, 2))
except ValueError as e:
    print("ValueError:", e)
try:
    np.array([2, 3]) ** -1
except ValueError as e:
    print("ValueError:", e)
try:
    np.array([True]) - np.array([False])
except TypeError as e:
    print("TypeError:", e)
try:
    d = np.array([1, 2])
    d += 1.5
except TypeError as e:
    print(type(e).__name__, e)
try:
    np.array([1.5]) & 1
except TypeError as e:
    print("TypeError:", e)
''')
case('division warnings', '''
import numpy as np
print(np.array([1.0, 0.0, -1.0]) / 0)
print(np.array([1, 0, -1]) / 0)
print(np.array([5, 0]) // 0, np.array([5, 0]) % 0)
print(np.array([5.0, 0]) // 0, np.array([5.0]) % 0)
print(np.sqrt(np.array([-1.0, 4.0])), np.log(np.array([0.0, 1.0, -1.0])))
print(np.array([1e308]) * 10, np.exp(np.array([1000.0])))
''')
case('ufuncs', '''
import numpy as np
x = np.array([0.0, 0.5, 1.0, 2.0, 10.0])
print(np.sqrt(x), np.exp(x), np.log(x + 1), np.log2(x + 1), np.log10(x + 1))
print(np.sin(x), np.cos(x), np.tan(x))
print(np.arcsin(x / 10), np.arccos(x / 10), np.arctan(x), np.arctan2(x, 2.0))
print(np.sinh(x), np.cosh(x), np.tanh(x))
print(np.degrees(np.pi), np.radians(180.0), np.deg2rad(np.array([90, 45])), np.rad2deg(np.array([1.0])))
y = np.array([-2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.7, -3.7])
print(np.floor(y), np.ceil(y), np.round(y), np.trunc(y), np.rint(y), np.abs(y), np.sign(y), np.absolute(y), np.fabs(y))
print(np.round(np.array([1.2345, 2.675, -0.125]), 2), np.round(np.array([1234.5, 1250]), -2), np.around(np.array([0.5, 1.5])))
print(np.floor(np.array([1, 2])), np.abs(np.array([-1, 2])), np.sign(np.array([-3, 0, 2])), np.square(np.array([3, -2])), np.square(y))
print(np.power(np.array([2, 3]), 3), np.power(2.0, np.array([0.5, -1])), np.exp2(np.array([3.0])))
print(np.maximum(np.array([1, 5]), np.array([3, 2])), np.minimum(np.array([1, 5]), 3), np.maximum(np.array([np.nan, 1]), 0))
print(np.clip(np.array([-5, 0, 5, 10]), 0, 6), np.clip(np.array([1.5, 9.0]), None, 2.0))
print(np.isnan(np.array([1.0, np.nan])), np.isinf(np.array([np.inf, 1.0])), np.isfinite(np.array([np.inf, np.nan, 1])))
print(np.sqrt(16), np.sin(0.0), np.exp(1), np.log(np.e), np.abs(-3), np.floor(2.7), np.sqrt(np.array(4.0)))
print(np.add(1, 2), np.multiply(np.array([1, 2]), 3), np.subtract(5, np.array([1, 2])), np.divide(1, 4), np.mod(7, 3), np.floor_divide(7, 2))
print(np.cbrt(np.array([27.0, -8.0])), np.reciprocal(np.array([2.0, 4.0])), np.expm1(np.array([1e-10])), np.log1p(np.array([1e-10])))
print(np.hypot(3.0, 4.0), np.logical_and(np.array([1, 0]), np.array([1, 1])), np.logical_or(np.array([0, 0]), np.array([0, 1])), np.logical_not(np.array([True, False])))
''')

# ---------- indexing ----------
case('indexing', '''
import numpy as np
a = np.arange(10)
print(a[0], a[-1], a[2:5], a[::2], a[::-1], a[-3:], a[5:2:-1], a[:0], a[100:])
m = np.arange(12).reshape(3, 4)
print(m[1], m[1, 2], m[-1, -1], m[:, 1], m[1, :], m[:2, 1:3], m[::2, ::-1], m[1][2])
print(m[[0, 2]], m[:, [0, 3]], m[[0, 1], [1, 2]], m[np.array([2, 0])], a[[1, 1, 3]])
print(a[a > 6], a[a % 2 == 0], m[m > 5], m[m[:, 0] > 2], m[:, m[0] > 1], a[(a > 2) & (a < 6)])
print(m[None, 0], m[:, None, 0].shape, m[1, None].shape, a[np.array([True] * 10)])
print(m[1:, [1]], m[[1], 1:], m[-2], m[0, [-1, -2]])
b = a[2:6]
b[0] = 100
print(a)
c = a[[1, 2]]
c[0] = -1
print(a)
v = m.T
print(v, v.shape, m.T[0])
print(m.ravel(), m.flatten(), m.reshape(2, 6), m.reshape(-1), m.reshape(4, -1), m.reshape((6, 2)).shape)
''')
case('setitem', '''
import numpy as np
a = np.zeros(5)
a[1] = 3
a[2:4] = 7
a[-1] = 2.5
print(a)
a[a > 2] = 0
print(a)
m = np.zeros((3, 3), dtype=int)
m[1, :] = 5
m[:, 2] = np.array([1, 2, 3])
m[0, 0] = 9.9
m[[0, 2], [1, 1]] = -1
print(m)
m[m < 0] += 10
print(m)
b = np.arange(6)
b[1:] = b[:-1]
print(b)
b[:] = 0
b[::2] = [1, 2, 3]
print(b)
c = np.arange(4.0)
c[c > 1] = np.array([10.0, 20.0])
print(c)
''')
case('index errors', '''
import numpy as np
a = np.arange(5)
m = np.zeros((2, 3))
for f in [lambda: a[5], lambda: a[-6], lambda: m[2, 0], lambda: m[0, 3], lambda: a[1, 2], lambda: m[0, 0, 0],
          lambda: a[np.array([True, False])], lambda: a[1.5], lambda: a[np.array([1.0])], lambda: a.reshape(3, 2),
          lambda: np.arange(6).reshape(4, -1), lambda: m[[0, 1], [0, 1, 2]], lambda: a[[10]]]:
    try:
        print(f())
    except Exception as e:
        print(type(e).__name__ + ":", e)
try:
    a[:2] = np.array([1, 2, 3])
except ValueError as e:
    print("ValueError:", e)
try:
    a[0] = np.nan
except ValueError as e:
    print("ValueError:", e)
''')
case('truth and iteration', '''
import numpy as np
a = np.array([1, 2, 3])
for x in a:
    print(x)
for row in np.arange(4).reshape(2, 2):
    print(row, list(row))
print(list(a), a.tolist(), np.arange(4).reshape(2, 2).tolist(), np.array([1.5]).tolist(), np.array([True]).tolist())
print(3 in a, 7 in a, len(np.zeros((4, 2))), bool(np.array([0])), bool(np.array([2])))
print(np.array([1.5]).item(), np.arange(6).reshape(2, 3).item(4), a.astype(float), np.array([1.9, -1.9]).astype(int), a.astype(bool))
try:
    if a > 1:
        pass
except ValueError as e:
    print("ValueError:", e)
try:
    bool(np.array([]))
except ValueError as e:
    print("ValueError:", e)
print(a.copy(), np.copy(a), a.T, a.dtype == np.int64, a.dtype == float, str(a.dtype), repr(a.dtype), np.array([1.0]).dtype == 'float64')
''')

# ---------- reductions and statistics ----------
case('reductions', '''
import numpy as np
a = np.array([3, 1, 4, 1, 5, 9, 2, 6])
print(a.sum(), a.prod(), a.min(), a.max(), a.argmin(), a.argmax(), a.mean(), a.std(), a.var(), np.median(a))
print(np.sum(a), np.mean(a), np.std(a, ddof=1), np.var(a, ddof=1), np.ptp(a), a.cumsum(), np.cumprod(np.array([1, 2, 3, 4])))
m = np.array([[1.0, 2.0, 3.0], [4.0, 5.0, 6.5]])
print(m.sum(), m.sum(axis=0), m.sum(axis=1), m.mean(axis=0), m.mean(axis=1), m.max(axis=0), m.min(axis=1))
print(m.argmax(axis=0), m.argmin(axis=1), m.std(axis=0), m.var(axis=1), m.cumsum(axis=0), m.cumsum(axis=1), m.cumsum())
print(np.median(m), np.median(m, axis=0), np.median(m, axis=1), m.sum(axis=-1), m.sum(axis=1, keepdims=True))
print(np.any(a > 8), np.all(a > 0), (a > 5).any(), (a > 5).all(), np.any(m > 6, axis=0), np.count_nonzero(a > 2))
print(np.percentile(a, 50), np.percentile(a, [10, 25, 75, 90]), np.quantile(a, 0.3), np.percentile(m, 50, axis=0))
print(np.average(a), np.average(np.array([1, 2, 3]), weights=np.array([3, 1, 0])))
x = np.arange(0, 1, 0.1)
print(x.sum(), x.mean(), x.std(), x.var(), np.sum(np.linspace(0, 1, 1001)), np.linspace(0, 1, 1001).mean())
print(np.array([True, True, False]).sum(), np.array([True, False]).mean())
r = np.random.RandomState(42).rand(10000)
print(r.sum(), r.mean(), r.std(), np.median(r), np.percentile(r, 95))
print(np.array([1.0, np.nan]).sum(), np.array([1.0, np.nan]).max(), np.argmax(np.array([1.0, np.nan, 3])))
print(np.mean(np.array([[1, 2], [3, 4]]), axis=0), np.sum(np.array([[1, 2], [3, 4]]), axis=0))
''')
case('reduction errors', '''
import numpy as np
for f in [lambda: np.array([]).max(), lambda: np.array([]).argmax(), lambda: np.arange(3).sum(axis=1), lambda: np.percentile(np.arange(3), 120)]:
    try:
        print(f())
    except Exception as e:
        print(type(e).__name__ + ":", e)
print(np.array([]).sum(), np.array([]).mean())
''')
case('sorting and sets', '''
import numpy as np
a = np.array([3, 1, 4, 1, 5, 9, 2, 6])
print(np.sort(a), np.argsort(np.array([3.0, 1.0, 2.0])), np.sort(np.array([2.0, np.nan, 1.0])), a)
b = a.copy()
b.sort()
print(b, np.sort(np.array([[3, 1], [2, 4]])), np.sort(np.array([[3, 1], [2, 4]]), axis=0), np.sort(np.array([[3, 1], [2, 4]]), axis=None))
print(np.unique(a), np.unique(a, return_counts=True), np.unique(np.array([[1, 2], [2, 3]])))
v, idx, inv = np.unique(np.array([5, 3, 5, 1]), return_index=True, return_inverse=True)
print(v, idx, inv)
print(np.where(a > 3), np.where(a > 3, a, 0), np.where(a > 3, 1.5, -1), np.nonzero(np.array([0, 2, 0, 3])), np.argwhere(np.array([[0, 1], [1, 0]])))
print(np.where(np.arange(6).reshape(2, 3) > 2))
print(np.bincount(np.array([0, 1, 1, 3])), np.diff(np.array([1, 4, 9, 16])), np.diff(np.array([1, 4, 9, 16]), n=2))
print(np.interp(np.array([0.5, 1.5, 5.0]), np.array([0.0, 1.0, 2.0]), np.array([0.0, 10.0, 20.0])))
''')
case('joining', '''
import numpy as np
a = np.array([1, 2])
b = np.array([3, 4])
print(np.concatenate([a, b]), np.concatenate((a, b, a)), np.vstack([a, b]), np.hstack([a, b]), np.stack([a, b]), np.stack([a, b], axis=1))
m = np.ones((2, 2))
print(np.concatenate([m, m]), np.concatenate([m, m], axis=1), np.vstack([m, a]), np.hstack([m, np.zeros((2, 1))]), np.column_stack([a, b]))
print(np.append(a, 5), np.append(a, [5, 6]), np.append(m, m, axis=0).shape, np.concatenate([a, np.array([1.5])]))
try:
    np.concatenate([np.ones((2, 2)), np.ones((3, 3))])
except ValueError as e:
    print("ValueError:", e)
try:
    np.vstack([np.ones(2), np.ones(3)])
except ValueError as e:
    print("ValueError:", e)
print(np.expand_dims(a, 0).shape, np.squeeze(np.ones((1, 3, 1))).shape, np.transpose(np.arange(6).reshape(2, 3)))
x, y = np.meshgrid(np.array([1, 2, 3]), np.array([10, 20]))
print(x, y)
''')
case('linear algebra', '''
import numpy as np
A = np.array([[1, 2], [3, 4]])
B = np.array([[5, 6], [7, 8]])
v = np.array([1, 1])
print(A @ B, A @ v, v @ A, v @ v, np.dot(A, B), np.dot(v, v), A.dot(v), np.matmul(A, B), np.outer(v, np.array([1, 2, 3])))
F = np.array([[2.0, 1.0], [1.0, 3.0]])
print(F @ F, np.trace(A), np.diag(A), np.diag(np.array([1, 2])))
C = A.copy()
C @= B
print(C)
try:
    np.ones((2, 3)) @ np.ones((2, 3))
except ValueError as e:
    print("ValueError:", e)
try:
    np.dot(np.ones(3), np.ones(4))
except ValueError as e:
    print("ValueError:", e)
''')
case('linalg approx', '''
import numpy as np
A = np.array([[4.0, 7.0], [2.0, 6.0]])
print(np.linalg.det(A), np.linalg.inv(A), np.linalg.solve(A, np.array([1.0, 2.0])), np.linalg.norm(np.array([3.0, 4.0])), np.linalg.norm(A))
M = np.array([[2.0, -1.0, 0.0], [-1.0, 2.0, -1.0], [0.0, -1.0, 2.0]])
print(np.linalg.inv(M), np.linalg.det(M), np.linalg.inv(M) @ M)
print(np.round(np.linalg.inv(M) @ M, 6))
try:
    np.linalg.inv(np.array([[1.0, 2.0], [2.0, 4.0]]))
except np.linalg.LinAlgError as e:
    print("LinAlgError:", e)
x = np.array([0.0, 1, 2, 3, 4])
y = np.array([1.0, 3.1, 4.9, 7.2, 8.8])
print(np.polyfit(x, y, 1), np.polyfit(x, y, 2), np.polyval(np.array([2.0, 1.0]), 3), np.polyval(np.array([1, 0, -1]), x))
print(np.corrcoef(x, y), np.cov(x, y), np.corrcoef(np.array([[1.0, 2, 3], [2, 4, 7]])))
''', approx=True)
case('histogram', '''
import numpy as np
data = np.array([1, 2, 2, 3, 3, 3, 4, 4, 5, 9.5])
print(np.histogram(data))
print(np.histogram(data, bins=3))
print(np.histogram(data, bins=4, range=(0, 8)))
print(np.histogram(data, bins=[0, 2, 4, 10]))
print(np.histogram(np.array([1, 1, 1])))
print(np.histogram(np.random.RandomState(0).randn(1000), bins=5))
print(np.histogram(data, bins=3, density=True))
''')

# ---------- random ----------
case('legacy random', '''
import numpy as np
np.random.seed(42)
print(np.random.rand(), np.random.rand(3), np.random.rand(2, 2))
print(np.random.randn(4), np.random.randn())
print(np.random.randint(1, 7, size=10), np.random.randint(5), np.random.randint(0, 100, (2, 3)), np.random.randint(-5, 5, 4))
print(np.random.random(3), np.random.random_sample((2,)), np.random.uniform(-1, 1, 3), np.random.uniform(), np.random.normal(170, 10, 4))
print(np.random.choice([10, 20, 30]), np.random.choice(5, 3), np.random.choice(np.array([1.5, 2.5]), 4), np.random.choice(10, 4, replace=False))
print(np.random.choice(['a', 'b', 'c'] if False else 3, 5, p=[0.1, 0.6, 0.3]), np.random.choice(5, 3, replace=False, p=[0.1, 0.2, 0.3, 0.2, 0.2]))
x = np.arange(10)
np.random.shuffle(x)
print(x, np.random.permutation(5), np.random.permutation(np.array([1.5, 2.5, 3.5])))
l = [1, 2, 3, 4, 5]
np.random.shuffle(l)
print(l)
m = np.arange(6).reshape(3, 2)
np.random.shuffle(m)
print(m)
print(np.random.exponential(2.0, 3), np.random.poisson(3, 5), np.random.poisson(50, 3), np.random.binomial(10, 0.5, 6), np.random.binomial(100, 0.3, 4), np.random.binomial(1, 0.9, 5))
print(np.random.standard_normal(2), np.random.randint(0, 2**33, 2))
np.random.seed(0)
print(np.random.rand(3))
rs = np.random.RandomState(7)
print(rs.rand(2), rs.randint(10, size=5), rs.randn(2), rs.choice([1, 2, 3], 2))
np.random.seed(2024)
print(np.random.randint(1, 7, size=20))
''')
case('generator random', '''
import numpy as np
rng = np.random.default_rng(42)
print(rng.random(), rng.random(3), rng.integers(1, 7, size=10), rng.integers(5), rng.integers(0, 100, (2, 3)))
print(rng.normal(0, 1, 5), rng.standard_normal(3), rng.normal(), rng.uniform(-1, 1, 3))
print(rng.choice(5, 3), rng.choice([10, 20, 30]), rng.choice(10, 4, replace=False), rng.choice(3, 4, p=[0.2, 0.5, 0.3]))
x = np.arange(8)
rng.shuffle(x)
print(x, rng.permutation(6))
rng2 = np.random.default_rng(12345)
print(rng2.integers(0, 10, 20), rng2.random(2), rng2.normal(5, 2, 10000).mean())
print(np.random.default_rng(0).random(3), np.random.default_rng(2**40).random(2), np.random.default_rng(1).integers(0, 2**40, 3))
''')

# ---------- misc ----------
case('misc', '''
import numpy as np
print(np.pi, np.e, np.inf, np.nan, -np.inf, np.newaxis is None)
print(np.allclose(np.array([1.0, 2.0]), np.array([1.0, 2.0000001])), np.allclose([1.0], [1.1]), np.isclose(np.array([1.0, 2.0]), 1.0))
print(np.array_equal(np.array([1, 2]), np.array([1, 2])), np.array_equal(np.array([1, 2]), np.array([1, 2, 3])))
print(np.isscalar(3.0), np.isscalar(np.array([1])), np.shape([[1, 2], [3, 4]]), np.size(np.zeros((2, 5))), np.ndim(5))
print(isinstance(np.array([1]), np.ndarray), type(np.array([1])))
print(np.float64(3), np.int64(2.7), np.array([1, 2], dtype=np.float64), np.array([1.5], dtype=np.int32).dtype)
f = np.vectorize(lambda x: x * 2 if x > 1 else 0)
print(f(np.array([1, 2, 3])))
np.set_printoptions(precision=3)
print(np.array([1 / 3, 2 / 3]), np.linspace(0, 1, 4))
np.set_printoptions(suppress=True)
print(np.array([1e-5, 1.0, 1000.5]))
np.set_printoptions(precision=8, suppress=False)
print(np.array([1e-5, 1.0]))
print(f"{np.array([1, 2])}", "{}".format(np.array([1.5])), str(np.array([[1, 2]])))
print(np.abs(np.array([-1.5])).dtype, np.sqrt(np.array([4])).dtype, (np.array([1, 2]) / 2).dtype, (np.array([1, 2]) // 2).dtype)
''')
case('type errors', '''
import numpy as np
for f in [lambda: np.array([1, 2]) + "a", lambda: len(np.array(5)), lambda: np.zeros((2, 2)).reshape(3, 3),
          lambda: np.array([[1, 2], [3]]), lambda: np.linspace(0, 1, 2.5), lambda: np.arange(3)(1), lambda: {np.array([1]): 1}]:
    try:
        print(f())
    except Exception as e:
        print(type(e).__name__ + ":", e)
''')


def run(src):
    out = io.StringIO()
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter('always')
        with contextlib.redirect_stdout(out):
            try:
                exec(compile(src, '<case>', 'exec'), {'__name__': '__main__'})
            except Exception as e:  # noqa: BLE001
                print(f'{type(e).__name__}: {e}')
    msgs = []
    for x in w:
        if issubclass(x.category, RuntimeWarning):
            msgs.append(str(x.message))
    return out.getvalue(), msgs


def main():
    data = {'meta': {'numpy': np.__version__, 'python': sys.version.split()[0]}, 'cases': []}
    for name, src, approx in CASES:
        out, warns = run(src)
        data['cases'].append({'name': name, 'src': src, 'out': out, 'warnings': warns, 'approx': approx})
    with open(OUT, 'w') as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print(f'{len(CASES)} cases -> {os.path.relpath(OUT)}')


if __name__ == '__main__':
    main()
