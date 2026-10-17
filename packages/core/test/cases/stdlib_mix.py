import itertools
import functools
import string
import statistics
from itertools import count, cycle, islice, chain, product, permutations, combinations, accumulate, groupby, zip_longest, takewhile, dropwhile, starmap, repeat, pairwise, compress, filterfalse, combinations_with_replacement
from functools import reduce, partial, lru_cache, total_ordering, cmp_to_key

print(list(islice(count(5), 4)), list(islice(count(0, 3), 3)), list(islice(cycle("ab"), 5)), list(repeat("x", 3)))
print(list(chain([1, 2], (3,), "ab")), list(chain.from_iterable([[1], [2, 3]])))
print(list(islice(range(10), 2, 8, 3)), list(islice("abcdef", 3)), list(islice("abcdef", 1, None)))
print(list(product([1, 2], "ab")), list(product([0, 1], repeat=2)))
print(list(permutations([1, 2, 3])), list(permutations("abc", 2)))
print(list(combinations([1, 2, 3, 4], 2)), list(combinations_with_replacement("ab", 2)))
print(list(accumulate([1, 2, 3, 4])), list(accumulate([1, 2, 3], lambda a, b: a * b)), list(accumulate([1, 2], initial=10)))
for k, g in groupby("aabbbc"):
    print(k, list(g))
print([(k, len(list(g))) for k, g in groupby([1, 1, 2, 3, 3, 3])])
print(list(zip_longest([1, 2, 3], "ab")), list(zip_longest([1], [2, 3], fillvalue=0)))
print(list(takewhile(lambda x: x < 3, [1, 2, 3, 1])), list(dropwhile(lambda x: x < 3, [1, 2, 3, 1])))
print(list(starmap(pow, [(2, 3), (3, 2)])), list(pairwise([1, 2, 3, 4])), list(compress("abcd", [1, 0, 1, 0])), list(filterfalse(lambda x: x % 2, range(6))))
print(sum(1 for _ in itertools.permutations(range(4))), len(list(combinations(range(6), 3))))

print(reduce(lambda a, b: a + b, [1, 2, 3, 4]), reduce(lambda a, b: a * b, [1, 2, 3], 10), reduce(max, [3, 9, 2]))
add5 = partial(lambda a, b: a + b, 5)
print(add5(10), partial(print, "hello", sep="-")("a"))


@lru_cache(maxsize=None)
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)


print(fib(60), fib.cache_info())


@functools.cache
def sq(n):
    return n * n


print(sq(4), sq(4))


@total_ordering
class Version:
    def __init__(self, n):
        self.n = n

    def __eq__(self, other):
        return self.n == other.n

    def __lt__(self, other):
        return self.n < other.n


print(Version(1) < Version(2), Version(1) <= Version(1), Version(3) > Version(2), Version(1) >= Version(2))
print(sorted([3, 1, 2], key=cmp_to_key(lambda a, b: b - a)))

print(string.ascii_lowercase, string.digits, string.ascii_uppercase[:3], string.punctuation, repr(string.whitespace), len(string.printable))
print(string.capwords("hello big   world"), string.hexdigits)

data = [2, 4, 4, 4, 5, 5, 7, 9]
print(statistics.mean(data), statistics.mean([1, 2]), statistics.mean([1.5, 2.5]), statistics.median(data), statistics.median([3, 1, 2]), statistics.median([1, 2, 3, 4]))
print(statistics.mode(data), statistics.multimode([1, 1, 2, 2, 3]), statistics.pstdev(data), statistics.stdev(data), statistics.pvariance(data), statistics.variance(data))
print(statistics.fmean([1, 2, 3, 4]), statistics.median_low([1, 2, 3, 4]), statistics.median_high([1, 2, 3, 4]))
try:
    statistics.mean([])
except statistics.StatisticsError as e:
    print("StatisticsError", e)
