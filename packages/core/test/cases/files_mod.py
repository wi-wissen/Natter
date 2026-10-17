import os

with open("notes.txt", "w") as f:
    print(f.write("eins\nzwei\n"), f.name, f.mode, f.closed)
    print("drei", file=f)
    f.writelines(["vier\n", "funf\n"])
print(f.closed)
with open("notes.txt") as f:
    print(f.readline(), end="")
    print(repr(f.read(4)), f.tell())
    print(f.readlines())
    print(f.read() == "", f.readline() == "")
with open("notes.txt") as f:
    for i, line in enumerate(f, 1):
        print(i, line.rstrip())
with open("notes.txt", "a") as f:
    f.write("sechs")
print(open("notes.txt").read().splitlines())
with open("notes.txt", "r+") as f:
    f.write("EINS")
    f.seek(0)
    print(f.read(8))
    f.seek(0, 2)
    print(f.tell())
with open("neu.txt", "x") as f:
    f.write("x")
try:
    open("neu.txt", "x")
except FileExistsError as e:
    print("FileExistsError", e)
try:
    open("fehlt.txt")
except FileNotFoundError as e:
    print("FileNotFoundError", e)
try:
    open("notes.txt").write("x")
except Exception as e:
    print(type(e).__name__, e)
try:
    with open("notes.txt", "w") as f:
        f.read()
except Exception as e:
    print(type(e).__name__, e)
f = open("notes.txt")
f.close()
try:
    f.read()
except ValueError as e:
    print("ValueError", e)
os.makedirs("a/b")
with open("a/b/c.txt", "w") as f:
    f.write("deep")
print(sorted(os.listdir(".")), os.listdir("a"), os.path.exists("a/b/c.txt"), os.path.isdir("a"), os.path.isfile("a"))
print(os.path.join("a", "b", "c.txt"), os.path.basename("a/b/c.txt"), os.path.dirname("a/b/c.txt"), os.path.splitext("a/b.c.txt"), os.path.split("a/b/c"))
print(os.path.normpath("a//b/../c/./d"), os.path.join("a", "/b"), os.path.getsize("a/b/c.txt"))
os.rename("neu.txt", "alt.txt")
os.remove("alt.txt")
print(sorted(os.listdir(".")))
try:
    os.remove("alt.txt")
except FileNotFoundError as e:
    print(e)
try:
    open("a")
except IsADirectoryError as e:
    print("IsADirectoryError", e)
try:
    open("fehlt/x.txt", "w")
except FileNotFoundError as e:
    print("FileNotFoundError", e)
print([(d, sorted(n), sorted(fs)) for d, n, fs in os.walk(".")])
