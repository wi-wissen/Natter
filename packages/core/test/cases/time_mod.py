import time

t0 = time.time()
time.sleep(0.5)
print(time.time() - t0 >= 0.5)
a = time.perf_counter()
time.sleep(1)
print(round(time.perf_counter() - a, 1) >= 1.0)
print(time.gmtime(0)[:6], time.gmtime(1700000000)[:8])
print(time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(1700000000)))
print(time.asctime(time.gmtime(1700000000)))
try:
    time.sleep(-1)
except ValueError as e:
    print("ValueError", e)
