// statistics: mean, median, mode, variance and friends (written in Python).
export default String.raw`
import math


class StatisticsError(ValueError):
    pass


def _fsum(values):
    """Sum of floats without rounding errors piling up (Shewchuk), like math.fsum."""
    partials = []
    for x in values:
        x = float(x)
        i = 0
        for y in partials:
            if abs(x) < abs(y):
                x, y = y, x
            hi = x + y
            lo = y - (hi - x)
            if lo:
                partials[i] = lo
                i += 1
            x = hi
        partials[i:] = [x]
    total = 0.0
    for p in reversed(partials):
        total = total + p
    return total


def _all_int(data):
    for x in data:
        if not isinstance(x, int):
            return False
    return True


def mean(data):
    data = list(data)
    n = len(data)
    if n < 1:
        raise StatisticsError("mean requires at least one data point")
    if _all_int(data):
        s = sum(data)
        return s // n if s % n == 0 else s / n
    return _fsum(data) / n


def fmean(data, weights=None):
    data = list(data)
    if not data:
        raise StatisticsError("fmean requires at least one data point")
    if weights is None:
        return _fsum(data) / len(data)
    return _fsum([x * w for x, w in zip(data, weights)]) / _fsum(weights)


def median(data):
    data = sorted(data)
    n = len(data)
    if n == 0:
        raise StatisticsError("no median for empty data")
    if n % 2 == 1:
        return data[n // 2]
    i = n // 2
    return (data[i - 1] + data[i]) / 2


def median_low(data):
    data = sorted(data)
    n = len(data)
    if n == 0:
        raise StatisticsError("no median for empty data")
    return data[(n - 1) // 2]


def median_high(data):
    data = sorted(data)
    n = len(data)
    if n == 0:
        raise StatisticsError("no median for empty data")
    return data[n // 2]


def multimode(data):
    counts = {}
    for x in data:
        counts[x] = counts.get(x, 0) + 1
    if not counts:
        return []
    best = max(counts.values())
    return [k for k in counts if counts[k] == best]


def mode(data):
    modes = multimode(data)
    if not modes:
        raise StatisticsError("no mode for empty data")
    return modes[0]


def _ss(data):
    m = mean(data)
    return _fsum([(x - m) ** 2 for x in data])


def _frac(num, den):
    g = math.gcd(num, den)
    num //= g
    den //= g
    return num // den if den == 1 else num / den


def _int_ss(data):
    """n times the sum of squared deviations, exactly (data are ints)."""
    n = len(data)
    s = sum(data)
    return n * sum(x * x for x in data) - s * s


def pvariance(data, mu=None):
    data = list(data)
    n = len(data)
    if n < 1:
        raise StatisticsError("pvariance requires at least one data point")
    if mu is None:
        if _all_int(data):
            return _frac(_int_ss(data), n * n)
        return _ss(data) / n
    return _fsum([(x - mu) ** 2 for x in data]) / n


def variance(data, xbar=None):
    data = list(data)
    n = len(data)
    if n < 2:
        raise StatisticsError("variance requires at least two data points")
    if xbar is None:
        if _all_int(data):
            return _frac(_int_ss(data), n * (n - 1))
        return _ss(data) / (n - 1)
    return _fsum([(x - xbar) ** 2 for x in data]) / (n - 1)


def pstdev(data, mu=None):
    return math.sqrt(pvariance(data, mu))


def stdev(data, xbar=None):
    return math.sqrt(variance(data, xbar))
`;
