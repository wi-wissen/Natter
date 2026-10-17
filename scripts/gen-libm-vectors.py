#!/usr/bin/env python3
"""Generates test vectors for packages/core/src/libm.js from CPython's math module (glibc libm).

Usage:
  python3 scripts/gen-libm-vectors.py                      # writes packages/core/test/data/libm-vectors.json
  python3 scripts/gen-libm-vectors.py --count 200000 --out /some/where.json --seed 7

Format of the JSON file: {"meta": {...}, "fns": {"sin": {"arity": 1, "data": "<hex>"}, ...}}.
`data` is a concatenation of fixed-width records of 16 hex digits per Float64 (big-endian bit
pattern): the arguments, then the result of CPython. Arguments for which CPython raises an
exception (domain or range error) are not included.
"""
import argparse
import json
import math
import os
import platform
import random
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.join(HERE, '..', 'packages', 'core', 'test', 'data', 'libm-vectors.json')


def hexd(x):
    return struct.pack('>d', x).hex()


def bits(x):
    return struct.unpack('>Q', struct.pack('>d', x))[0]


def from_bits(b):
    return struct.unpack('>d', struct.pack('>Q', b & 0xFFFFFFFFFFFFFFFF))[0]


def nudge(x, k):
    """Neighbour of x, k ULP away (towards larger magnitude for k > 0)."""
    if x == 0 or math.isnan(x) or math.isinf(x):
        return x
    return from_bits(bits(x) + k)


class Gen:
    def __init__(self, seed):
        self.r = random.Random(seed)

    def u(self, a, b):
        return self.r.uniform(a, b)

    def sign(self):
        return self.r.choice((-1.0, 1.0))

    def logu(self, lo, hi):
        """Log-uniform magnitude in [lo, hi] (both > 0)."""
        return math.exp(self.r.uniform(math.log(lo), math.log(hi)))

    def expo(self, e_lo, e_hi):
        """Random double with a uniformly distributed binary exponent (and random mantissa)."""
        e = self.r.randint(e_lo, e_hi)
        return math.ldexp(1.0 + self.r.random(), e)

    def rand_bits(self):
        while True:
            x = from_bits(self.r.getrandbits(64))
            if math.isfinite(x):
                return x

    def near(self, x, k=8):
        return nudge(x, self.r.randint(-k, k))


SPECIAL = [0.0, -0.0, 1.0, -1.0, 0.5, -0.5, 2.0, -2.0, 3.0, 10.0, 100.0, 1e22, 1e300, math.pi, -math.pi,
           math.pi / 2, math.pi / 4, math.e, math.inf, -math.inf, math.nan, 5e-324, -5e-324,
           2.2250738585072014e-308, 1.7976931348623157e308, 2.0 ** -52, 1 - 2.0 ** -53, 1 + 2.0 ** -52]


def one_arg(name, g):
    """One random argument for a unary function, from a mix of distributions."""
    r = g.r
    k = r.random()
    S = g.sign

    def tiny():
        return S() * g.logu(1e-30, 1e-3)

    if name in ('exp', 'expm1'):
        if k < 0.30: return g.u(-5, 5)
        if k < 0.50: return g.u(-745.2, 710)
        if k < 0.60: return S() * g.logu(1e-18, 1)
        if k < 0.70: return g.near(g.u(-1, 1) * 0.6931471805599453 * r.randint(-1074, 1024), 4)
        if k < 0.80: return g.u(-745.2, -700)
        if k < 0.90: return g.u(700, 710)
        return S() * g.logu(1e-300, 1e3)
    if name in ('log', 'log2', 'log10'):
        if k < 0.25: return g.expo(-1074, 1023)
        if k < 0.45: return g.logu(1e-3, 1e3)
        if k < 0.60: return 1.0 + S() * g.logu(1e-16, 0.5)
        if k < 0.70: return g.near(2.0 ** r.randint(-1074, 1023), 3) if r.random() < 0.5 else g.near(10.0 ** r.randint(-300, 300), 3)
        if k < 0.80: return abs(from_bits(r.getrandbits(52)))  # subnormals
        if k < 0.90: return float(r.randint(1, 100000))
        return abs(g.rand_bits())
    if name == 'log1p':
        if k < 0.25: return S() * g.logu(1e-300, 0.5)
        if k < 0.50: return g.u(-1, 5)
        if k < 0.65: return -1.0 + g.logu(1e-16, 1)
        if k < 0.80: return g.expo(0, 1023)
        if k < 0.90: return float(r.randint(0, 100000))
        return S() * g.logu(1e-16, 1e-3)
    if name in ('sin', 'cos', 'tan'):
        if k < 0.20: return g.u(-10, 10)
        if k < 0.30: return g.u(-1000, 1000)
        if k < 0.40: return S() * g.logu(1e-300, 1e-2)
        if k < 0.55:
            q = r.randint(-2000000, 2000000) * (math.pi / 2)
            return g.near(q, 6)
        if k < 0.65: return g.near(float(r.randint(-100, 100)) * math.pi / 2, 20)
        if k < 0.80: return S() * g.expo(0, 1023)
        if k < 0.90: return g.near(S() * g.logu(1e3, 1e22) // (math.pi / 2) * (math.pi / 2), 4)
        return g.u(-1, 1)
    if name in ('asin', 'acos'):
        if k < 0.40: return g.u(-1, 1)
        if k < 0.60: return S() * (1.0 - g.logu(1e-16, 0.5))
        if k < 0.75: return S() * g.logu(1e-300, 1e-2)
        if k < 0.85: return g.near(S() * 1.0, 20)
        return g.u(-0.5, 0.5)
    if name == 'atan':
        if k < 0.30: return g.u(-5, 5)
        if k < 0.60: return S() * g.logu(1e-300, 1e300)
        if k < 0.80: return S() * g.logu(1e-3, 1e3)
        if k < 0.90: return S() * g.expo(0, 1023)
        return S() * g.logu(1e-12, 1e-3)
    if name in ('sinh', 'cosh', 'tanh'):
        if k < 0.30: return g.u(-5, 5)
        if k < 0.50: return g.u(-25, 25)
        if k < 0.65: return S() * g.logu(1e-300, 1e-1)
        if k < 0.80: return g.u(-711, 711) if name != 'tanh' else g.u(-40, 40)
        if k < 0.90: return S() * g.logu(1e-9, 1e-1)
        return g.u(700, 711) * S() if name != 'tanh' else g.u(15, 22) * S()
    if name == 'asinh':
        if k < 0.25: return S() * g.logu(1e-300, 1e-1)
        if k < 0.50: return g.u(-10, 10)
        if k < 0.80: return S() * g.logu(1e-3, 1e30)
        return S() * g.expo(0, 1023)
    if name == 'acosh':
        if k < 0.25: return 1.0 + g.logu(1e-16, 1)
        if k < 0.45: return g.u(1, 10)
        if k < 0.75: return g.logu(1, 1e30)
        if k < 0.90: return g.expo(0, 1023)
        return g.near(1.0, 40) if r.random() < 0.5 else 1.0 + g.u(0, 1e-8)
    if name == 'atanh':
        if k < 0.35: return g.u(-1, 1)
        if k < 0.55: return S() * (1.0 - g.logu(1e-16, 0.5))
        if k < 0.80: return S() * g.logu(1e-300, 1e-1)
        return S() * g.logu(1e-9, 0.9)
    raise KeyError(name)


def two_arg(name, g):
    r = g.r
    k = r.random()
    S = g.sign
    if name == 'atan2':
        if k < 0.25: return (g.u(-10, 10), g.u(-10, 10))
        if k < 0.50: return (S() * g.logu(1e-30, 1e30), S() * g.logu(1e-30, 1e30))
        if k < 0.65: return (S() * g.logu(1e-3, 1e3), S() * g.logu(1e-3, 1e3))
        if k < 0.75: return (S() * g.logu(1e-300, 1e-100), S() * g.logu(1e-3, 1e3))
        if k < 0.85: return (S() * g.logu(1e-3, 1e3), S() * g.logu(1e-300, 1e-100))
        if k < 0.92:
            x = S() * g.logu(1e-3, 1e3)
            return (g.near(x, 5), x)
        return (S() * g.expo(-1074, 1023), S() * g.expo(-1074, 1023))
    if name == 'pow':
        if k < 0.25: return (g.logu(1e-3, 1e3), g.u(-20, 20))
        if k < 0.40: return (g.logu(1e-300, 1e300), g.u(-3, 3))
        if k < 0.50: return (S() * g.logu(1e-3, 1e3), float(r.randint(-30, 30)))
        if k < 0.58: return (g.logu(1, 1e3), r.randint(-60, 60) / 2.0)
        if k < 0.66: return (1.0 + S() * g.logu(1e-16, 1e-3), S() * g.logu(1, 1e15))
        if k < 0.74: return (float(r.randint(2, 100000)), float(r.randint(2, 70)))
        if k < 0.80: return (float(r.randint(1, 2 ** 27)), float(r.randint(2, 3)))  # exact results, ties
        if k < 0.86: return (g.logu(1e-3, 1e3), S() * g.logu(1e-300, 1e-3))
        if k < 0.92: return (g.expo(-1074, 1023), g.u(-1, 1))
        if k < 0.96: return (g.logu(0.5, 2), g.u(-1500, 1500))
        return (S() * g.logu(1e-3, 1e3), float(r.randint(-5, 5)) / 2)
    raise KeyError(name)


UNARY = ['exp', 'expm1', 'log', 'log2', 'log10', 'log1p', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
         'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh']
BINARY = ['atan2', 'pow']


def build(name, arity, count, seed):
    g = Gen(seed * 1000 + sum(map(ord, name)))
    f = getattr(math, name)
    out = []
    seen = set()
    cases = []
    for s in SPECIAL:
        cases.append((s,) if arity == 1 else None)
    if arity == 2:
        cases = [(a, b) for a in SPECIAL[:12] for b in SPECIAL[:12]]
    n_special = len(cases)
    while len(cases) < count:
        cases.append((one_arg(name, g),) if arity == 1 else two_arg(name, g))
    for args in cases:
        key = tuple(hexd(a) for a in args)
        if key in seen:
            continue
        seen.add(key)
        try:
            res = f(*args)
        except (ValueError, OverflowError, ZeroDivisionError):
            continue
        out.append(''.join(key) + hexd(res))
    return ''.join(out), len(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--count', type=int, default=2000, help='random arguments per function')
    ap.add_argument('--out', default=DEFAULT_OUT)
    ap.add_argument('--seed', type=int, default=20240601)
    a = ap.parse_args()
    fns = {}
    for name in UNARY:
        data, n = build(name, 1, a.count, a.seed)
        fns[name] = {'arity': 1, 'count': n, 'data': data}
    for name in BINARY:
        data, n = build(name, 2, a.count, a.seed)
        fns[name] = {'arity': 2, 'count': n, 'data': data}
    meta = {'python': sys.version.split()[0], 'platform': platform.platform(), 'libc': ' '.join(platform.libc_ver()),
            'seed': a.seed, 'note': 'generated by scripts/gen-libm-vectors.py'}
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, 'w') as fh:
        json.dump({'meta': meta, 'fns': fns}, fh, separators=(',', ':'))
    print(a.out, os.path.getsize(a.out), 'bytes', {k: v['count'] for k, v in fns.items()})


if __name__ == '__main__':
    main()
