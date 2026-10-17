import sys

print("a", file=sys.stdout)
sys.stdout.write("b\n")
print("to err", file=sys.stderr)
print(sys.maxsize, sys.platform in ("linux", "browser"), type(sys.argv))
try:
    sys.exit(3)
except SystemExit as e:
    print("exit", e.code)
