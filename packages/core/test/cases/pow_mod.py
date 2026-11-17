# pow() with three arguments
print(pow(4, 13, 497), pow(2, 10, 1000), pow(7, 0, 5), pow(7, 0, 1))
print(pow(-3, 3, 7), pow(3, 3, -7), pow(-3, 3, -7))
print(pow(3, -1, 7), pow(38, -1, 97), pow(2, -3, 11))
print(pow(123456789, 987654321, 10**20 + 39))
print(pow(2, 10, None), pow(base=2, exp=5, mod=7), pow(True, 5, 3))
e, d, n = 17, 2753, 3233          # small RSA
c = pow(65, e, n)
print(c, pow(c, d, n))
for args in [(2, 3, 0), (2, -1, 4), (2.0, 3, 5), (2, 3, 5.0)]:
    try:
        pow(*args)
    except (ValueError, TypeError) as err:
        print(type(err).__name__, err)
