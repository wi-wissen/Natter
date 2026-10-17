import textwrap

t = "Python is a programming language that lets you work quickly and integrate systems more effectively."
for w in (20, 40, 80):
    print(textwrap.wrap(t, w))
print(textwrap.fill(t, 30))
print(textwrap.fill(t, 30, initial_indent="* ", subsequent_indent="  "))
print(textwrap.shorten(t, 40), "|", textwrap.shorten("Hello  world!", width=12), "|", textwrap.shorten("Hello world", width=10))
print(textwrap.dedent("    a\n      b\n    c\n"), textwrap.dedent("\n  x\n\n  y"))
print(textwrap.indent("a\nb\n\nc", "> "))
print(textwrap.wrap("a-very-long-hyphenated-word-here and then more", 12), textwrap.wrap("Supercalifragilisticexpialidocious!", 10))
print(textwrap.wrap("one two three four five six", 9, max_lines=2), textwrap.wrap("", 10), textwrap.wrap("  lead and trail  ", 20))
print(textwrap.wrap("long word " * 3, 7, break_long_words=False))
