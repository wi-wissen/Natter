s = "Hallo Welt"
print(s.upper(), s.lower(), s.title(), len(s), s[0], s[-1], s[2:5], s[::2], s[::-1])
print(s.split(), "a,b,,c".split(","), "  x  y  ".split(), "a b c".split(" ", 1))
print("-".join(["a", "b", "c"]), s.replace("l", "L"), s.replace("l", "L", 1))
print(s.startswith("Ha"), s.endswith("x"), s.find("W"), s.find("z"), s.count("l"), "W" in s)
print("  pad  ".strip() + "|", "xxhixx".strip("x"), "  a".lstrip(), "b  ".rstrip() + "|")
print("42".isdigit(), "abc".isalpha(), "Abc".isupper(), "abc".islower(), "a1".isalnum())
print("{} und {}".format("Holz", "Stein"), "{1} {0}".format("a", "b"), "{name}: {n:>4}".format(name="Gold", n=7))
print("%s hat %d Holz" % ("Anna", 12), "%.1f%%" % 99.5, "%5s|%-5s|" % ("a", "b"))
print(repr("it's"), repr('say "hi"'), repr("a\nb"), str(12), str(None), str(True))
print("ab" * 3, "x" + "y", "abc" < "abd", "Z" < "a")
print("hallo".center(11, "*"), "7".zfill(3), "-7".zfill(4), "ab".ljust(4, ".") + "|", "ab".rjust(4))
print(chr(65), ord("A"), ord("ä"), "Ärger".lower(), "straße".upper())
name = "Bertram"
wood = 12
print(f"{name} hat {wood} Holz", f"{name!r}", f"{wood=}", f"{{literal}}", f"{wood * 2 + 1}")
print(f"{'nested'}", f"{[1, 2][0]}", f"{ {'a': 1}['a'] }")
words = ["Burg", "Farm", "Mine"]
print(", ".join(w.lower() for w in words))
print(list("abc"), sorted("cba"), "".join(reversed("abc")))
print("Zeile1\nZeile2".splitlines(), "a\tb")
