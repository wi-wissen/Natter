import re

patterns = [r"a", r"a*", r"a+?", r"(a|b)+", r"(?:ab)+", r"\d+", r"\D+", r"\w+", r"\W+", r"\s*", r"\S+", r"^a", r"a$", r"\ba", r"a\b",
            r"[abc]+", r"[^abc]+", r"[a-c\d]+", r"[\w.-]+@[\w.-]+", r"(a)(b)?", r"(?P<x>a)(?P=x)", r"(a)\1", r"a{2}", r"a{1,2}", r"a{,2}", r"x{", r"a|", r"(?=a)", r"(?!a)\w",
            r".", r".+", r"[.]", r"\.", r"(\d+)\.(\d+)", r"[A-Za-zÄÖÜäöüß]+", r"\bhaus\b", r"(?i)HAUS", r"\Aab", r"ab\Z", r"(?<=a)b", r"(?<!a)b", r"[]a]+", r"[a\]]+", r"\x41", r"\n", r"[\n]", r"\t+"]
texts = ["", "a", "aa", "aaa", "ab", "abab", "ba", "abc a1b22 ünï", "a.b a@b.c", "x{ 1.5 and 22.75", "Haus haus HAUS Hausmaus", "line1\nline2\n", "A\tB\t\tC", "ÄÖÜ äöü ß", "a1_b2 -x-", "  lead and trail  "]
for p in patterns:
    for t in texts:
        try:
            r = re.compile(p)
            m = r.search(t)
            print(repr(p), repr(t), r.findall(t), m and m.span(), m and m.groups(), bool(r.match(t)), bool(r.fullmatch(t)), re.sub(p, "<>", t), re.split(p, t))
        except Exception as e:
            print(repr(p), repr(t), "ERR", type(e).__name__)
for flags in (re.I, re.M, re.S, re.X, re.A, re.I | re.M):
    for p in (r"^a", r"a$", r"a.b", r"A", r"\w+", r"a b # c"):
        for t in ("a\nb", "A\nB", "ab\nab", "é a"):
            print(int(flags), repr(p), repr(t), re.findall(p, t, flags))
