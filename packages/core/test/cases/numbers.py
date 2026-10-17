# Integers and floating-point numbers
print(7 / 2, 8 / 2, 1 / 3, 2 / 3, 10 / 4)
print(7 // 2, -7 // 2, 7 // -2, -7 // -2)
print(7 % 3, -7 % 3, 7 % -3, -7 % -3)
print(7.5 // 2, -7.5 // 2, 7.5 % 2, -7.5 % 2, 5.0 % -3)
print(2 ** 0, 2 ** 62 // 2 ** 40, 3 ** 4, (-2) ** 3, -2 ** 2)
print(2 ** -2, 10 ** -1, 1.5 ** 2, 2.0 ** 10)
print(0.1 * 3, 0.1 + 0.7, 1.1 * 1.1, 100.0, 1e22, 1e-5, 123456789.123)
print(1e15, 1e16, 12345678901234567.0, 0.0001, 0.00001)
print(int(3.9), int(-3.9), int("42"), int(" -17 "), int("ff", 16), int("101", 2))
print(float("3.25"), float(2), float("1e3"), float("inf"), float("-inf"))
print(abs(-5), abs(-2.5), abs(0), round(1.5), round(2.5), round(-0.5), round(-1.5))
print(round(3.14159, 2), round(2.675, 2), round(1234, -2), round(1250, -2), round(1350, -2))
print(divmod(17, 5), divmod(-17, 5), divmod(17.5, 5))
print(max(3, 7, 1), min([4, 2, 8]), max("abc"), min(3.5, 2), sum([1.5, 2.5, 3]))
print(True + True, True * 3, False - 1, 5 > 3 == True)
print(hex(255), bin(10), oct(8), hex(-16))
print(5 & 3, 5 | 3, 5 ^ 3, ~5, 1 << 10, 1024 >> 3, -16 >> 2)
print(1_000_000, 0x1F, 0o17, 0b1010)
print(f"{3.14159:.2f} {2.5:.0f} {3.5:.0f} {0.125:.2f} {1234567.891:,.2f} {0.5:%} {42:05d} {-42:+d}")
print(f"{12:>5}|{12:<5}|{12:^5}|{'x':*^7}|{3.0}|{1e20:.3e}|{0.000123:g}|{123456789:g}")
print(f"{1.5:.3}|{2.0:.3}|{1234567.0:.3}|{0.1:.1f}|{-0.0:.1f}")
print(3 == 3.0, 1 == True, 0.1 + 0.2 == 0.3, 2 < 2.5)
x = 10
x += 5
x -= 3
x *= 2
x //= 5
x **= 2
x %= 7
print(x)
y = 1.5
y /= 2
print(y)
import math
print(math.sqrt(16), math.sqrt(2), math.floor(-2.5), math.ceil(2.1), math.pi, math.isqrt(17), math.gcd(12, 18))
print(math.hypot(3, 4), math.trunc(-3.7), math.fabs(-2))
