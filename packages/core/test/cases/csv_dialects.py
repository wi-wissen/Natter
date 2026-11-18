# csv: dialect checks, quoting modes and errors like CPython 3.13
import csv, sys
cases = [dict(delimiter=""), dict(delimiter=";;"), dict(delimiter=None), dict(delimiter=1), dict(quotechar=None), dict(quotechar=""), dict(quotechar="ab"),
         dict(quotechar=None, quoting=3), dict(escapechar=""), dict(escapechar="ab"), dict(lineterminator=None), dict(lineterminator=""), dict(quoting=9), dict(quoting="a"),
         dict(delimiter='"'), dict(delimiter="\\", escapechar="\\"), dict(quotechar="\\", escapechar="\\"), dict(delimiter=" ", skipinitialspace=True),
         dict(delimiter="\n"), dict(quotechar="\r"), dict(escapechar="\n"), dict(lineterminator="a"), dict(lineterminator=","), dict(foo=1), dict(strict=1), dict(doublequote=0)]
for c in cases:
    try:
        r = csv.reader([], **c)
        print(c, "ok", r.dialect.delimiter, repr(r.dialect.quotechar), r.dialect.doublequote, r.dialect.strict)
    except Exception as e:
        print(c, type(e).__name__, e)
for d in ["nix", 5]:
    try: csv.reader([], d)
    except Exception as e: print(d, type(e).__name__, e)
print(csv.list_dialects(), csv.QUOTE_STRINGS, csv.QUOTE_NOTNULL, csv.field_size_limit())
print(list(csv.reader(['a,,"",b'], quoting=csv.QUOTE_NOTNULL)), list(csv.reader(['1,,"","b"'], quoting=csv.QUOTE_STRINGS)))
w = csv.writer(sys.stdout); w.writerow("abc"); print(w.writerow([1]), w.writerows([[2]]))
try: w.writerow(5)
except csv.Error as e: print(e)
try: list(csv.reader([5]))
except csv.Error as e: print(e)
try: list(csv.reader(['a\rb']))
except csv.Error as e: print(e)
try: list(csv.reader(['"a'], strict=True))
except csv.Error as e: print(e)
r = csv.reader(["a", "b"]); print(next(r), r.line_num, r.dialect.lineterminator == "\r\n", r.dialect.quoting)
class D(csv.Dialect):
    delimiter = ";"
    quotechar = '"'
    lineterminator = "\n"
    quoting = csv.QUOTE_MINIMAL
csv.register_dialect("semi", D)
csv.register_dialect("tab2", delimiter="\t")
print(list(csv.reader(["a;b"], "semi")), list(csv.reader(["a\tb"], "tab2")), csv.get_dialect("tab2").delimiter, sorted(csv.list_dialects()))
csv.writer(sys.stdout, D).writerow(["x;y", 1])
print(csv.excel.delimiter, csv.excel_tab.delimiter, csv.unix_dialect.quoting)
try: csv.get_dialect("x")
except csv.Error as e: print(e)
try: csv.unregister_dialect("x")
except csv.Error as e: print(e)
print(issubclass(csv.Error, Exception), csv.Error.__name__)
for q in [None, 0, 1, 3]:
    try:
        kw = {"quotechar": None} if q is None else {"quotechar": None, "quoting": q}
        print(q, csv.reader([], **kw).dialect.quoting)
    except Exception as e: print(q, type(e).__name__, e)
print(repr(csv.reader([], 5).dialect.delimiter))
