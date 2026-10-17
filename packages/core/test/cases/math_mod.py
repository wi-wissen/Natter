import math

print(math.sin(1), math.cos(1), math.tan(1), math.asin(0.5), math.acos(0.5), math.atan(1), math.atan2(1, 2))
print(math.sinh(1), math.cosh(1), math.tanh(0.5), math.asinh(1), math.acosh(2), math.atanh(0.5))
print(math.exp(1), math.exp(0), math.exp(-1), math.expm1(1e-5), math.exp2(10), math.exp(0.5))
print(math.log(10), math.log(2, 8), math.log(100, 10), math.log2(1024), math.log10(1000), math.log1p(1e-5), math.log(math.e))
print(math.sqrt(2), math.sqrt(16), math.cbrt(8), math.pow(2, 10), math.pow(2, 0.5), math.pow(10, -2))
print(math.pi, math.e, math.tau, math.inf, -math.inf, math.nan)
print(math.degrees(math.pi), math.radians(180), math.degrees(1), math.radians(45))
print(math.floor(2.7), math.floor(-2.1), math.ceil(2.1), math.ceil(-2.9), math.trunc(2.9), math.trunc(-2.9), math.floor(5), math.ceil(7))
print(math.fabs(-3), math.factorial(5), math.factorial(0), math.factorial(25), math.comb(10, 3), math.perm(5, 2), math.perm(4))
print(math.gcd(12, 18), math.gcd(0, 5), math.gcd(12, 18, 24), math.gcd(), math.lcm(4, 6), math.lcm(2, 3, 4), math.isqrt(17), math.isqrt(10 ** 20))
print(math.hypot(3, 4), math.hypot(1, 1), math.hypot(5, 12, 84), math.dist((0, 0), (3, 4)), math.dist((1, 2), (4, 6)), math.hypot(1e200, 1e200), math.hypot(0.1, 0.2))
print(math.isclose(0.1 + 0.2, 0.3), math.isclose(1, 1.1), math.isclose(1, 1.1, rel_tol=0.2), math.isclose(0, 1e-12, abs_tol=1e-9))
print(math.isfinite(1.0), math.isfinite(math.inf), math.isinf(-math.inf), math.isnan(math.nan), math.isnan(1))
print(math.copysign(3, -1), math.copysign(-3.5, 2), math.fmod(7, 3), math.fmod(-7, 3), math.modf(2.75), math.modf(-0.5), math.ldexp(1, 10), math.ldexp(0.5, -3))
print(math.fsum([0.1] * 10), sum([0.1] * 10), math.fsum([1, 2, 3]), math.prod([1, 2, 3, 4]), math.prod([]), math.prod([2, 3], start=10))
print(round(math.sin(math.pi), 10), math.sin(math.pi / 2), math.cos(math.pi), math.sin(0), math.sin(-0.0), math.cos(0))
print([round(math.sin(x / 10), 6) for x in range(0, 40, 7)])
print([math.log(x) for x in (0.5, 1, 7.5, 100)])
print([math.exp(x) for x in (-5, -0.1, 2, 10, 20.5)])
print([math.sqrt(x) for x in range(2, 8)])
print([math.atan2(y, x) for y, x in ((1, 1), (-1, 1), (1, -1), (0, -1), (-0.0, -1))])
print(2.5 ** 2, 2 ** 0.5, 10 ** -2, 1.1 ** 10, 2 ** -3, 0.5 ** 3, (-2) ** 3, (-2.0) ** 2, 9 ** 0.5, 2 ** 100, 3.0 ** 4)
for expr in ("math.sqrt(-1)", "math.log(0)", "math.log(-1)", "math.exp(1000)", "math.asin(2)", "math.factorial(-1)", "math.sin(math.inf)", "math.pow(0, -1)", "math.atanh(1)", "math.fmod(1, 0)"):
    try:
        print(expr, eval(expr) if False else None)
    except Exception:
        pass
