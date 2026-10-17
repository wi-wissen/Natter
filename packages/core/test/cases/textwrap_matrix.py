import textwrap

texts = ["", "word", "Hello world, this is a test of the wrapping code.", "A  double  spaced   text with  gaps", "Supercalifragilisticexpialidocious is long",
         "well-known twenty-one self-aware state-of-the-art thing", "tab\tseparated\ttext here\tand more", "first line\nsecond line is a bit longer\n\nthird", "   leading spaces and trailing   ",
         "ä ö ü ß are wide chars in some fonts but not here, Übergrößenträger", "a b c d e f g h i j k l m n o p q r s t u v w x y z", "x" * 30]
for t in texts:
    for w in (6, 10, 17, 30, 70):
        try:
            print(w, textwrap.wrap(t, w), textwrap.fill(t, w, initial_indent="> ", subsequent_indent="  "))
            print(textwrap.wrap(t, w, break_long_words=False), textwrap.wrap(t, w, break_on_hyphens=False), textwrap.wrap(t, w, drop_whitespace=False))
            print(textwrap.wrap(t, w, max_lines=2), textwrap.shorten(t, w))
        except Exception as e:
            print(w, repr(t), "ERR", type(e).__name__, e)
for t in ["    a\n    b", "\ta\n\t b", "  a\n b", "a\n  b", "\n\n  a\n\n  b\n  ", "  a\n\tb", ""]:
    print(repr(textwrap.dedent(t)), repr(textwrap.indent(t, "# ")), repr(textwrap.indent(t, "+", lambda l: True)))
