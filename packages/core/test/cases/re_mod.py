import re

print(re.search(r"(\d+)-(\d+)", "Zimmer 12-34 frei").groups(), re.match(r"\w+", "Müller ist da").group())
print(re.findall(r"\d+", "a1b22c333"), re.findall(r"(\w)(\d)", "a1 b2 c3"), re.findall(r"(a)|b", "ab"))
print(re.sub(r"\s+", " ", "a   b \t c"), re.sub(r"(\w+)@(\w+)", r"\2 at \1", "me@home you@work"), re.sub("x*", "-", "abxd"))
print(re.sub(r"\d", lambda m: str(int(m.group()) * 2), "a1b2c3"), re.subn("a", "b", "banana", 2))
print(re.split(r"[,;]\s*", "a, b;c,d"), re.split(r"(,)", "a,b,c"), re.split(r"x*", "axbc"), re.split(",", "a,b,c", 1))
m = re.search(r"(?P<year>\d{4})-(?P<month>\d{2})", "Datum: 2024-05-17")
print(m.group("year"), m.group(2), m.groupdict(), m.span(), m.start("month"), m.end(), m)
print(re.fullmatch(r"\d+", "123"), re.fullmatch(r"\d+", "123a"), re.match(r"b", "abc"), re.search(r"b", "abc").span())
print(re.findall(r"^\w+", "eins\nzwei", re.M), re.findall(r"\w+$", "eins\nzwei\n"), re.findall(r"a.b", "a\nb a-b", re.S))
print(re.findall(r"\bab\b", "ab abends ab"), re.findall("[A-Z][a-z]+", "Hallo Welt, Ärger"), re.findall(r"[^\W\d_]+", "grün 3 äö"))
print(re.compile(r"A+", re.I).findall("aAbBaa"), re.compile(r"(\d)").groups, re.compile("a+"))
print(re.findall(r"(?i)hallo", "Hallo HALLO"), re.escape("a.b*c"), re.findall(r"\d{2,3}", "1 22 4444"))
print([m.group() for m in re.finditer(r"\w+", "ein Zwei drei")], re.findall(r"🐍+", "a🐍🐍b🐍"), re.search(r"b", "🐍b").start())
print(re.sub(r"(?P<a>\d)", r"<\g<a>>", "a1b2"), re.search(r"(a)(b)?", "ac").groups(), re.search(r"(a)(b)?", "ac").group(2))
print(re.search(r"^(.*)$", "abc\n").group(1), re.sub(r"$", "!", "abc\n"), re.findall(r"(?<=a)b", "ab cb"), re.findall(r"a(?!b)", "ab ac"))
print(re.match(r"(\w+) (\w+)", "Isaac Newton, physicist").expand(r"\2, \1"))
try:
    re.compile("(")
except re.error as e:
    print("error", type(e).__name__)
try:
    re.search(r"\d", 5)
except TypeError as e:
    print("TypeError")
