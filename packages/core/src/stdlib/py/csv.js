// csv: reader, writer, DictReader and DictWriter like CPython 3.13. The reader and the writer follow the state
// machine of CPython's _csv.c, DictReader and DictWriter are CPython's csv.py. Works on anything that yields lines
// (files from open(), lists of strings) and anything with write().
export default String.raw`
QUOTE_MINIMAL = 0
QUOTE_ALL = 1
QUOTE_NONNUMERIC = 2
QUOTE_NONE = 3
QUOTE_STRINGS = 4
QUOTE_NOTNULL = 5

__version__ = "1.0"

_field_limit = 131072


class Error(Exception):
    pass


def field_size_limit(new_limit=None):
    global _field_limit
    old = _field_limit
    if new_limit is not None:
        if not isinstance(new_limit, int):
            raise TypeError("limit must be an integer")
        _field_limit = new_limit
    return old


def _char(name, value, allow_none):
    if value is None and allow_none:
        return None
    if not isinstance(value, str):
        raise TypeError('"' + name + '" must be string, not ' + type(value).__name__)
    if len(value) != 1:
        raise TypeError('"' + name + '" must be a 1-character string')
    return value


class Dialect:
    # the checked dialect of a reader or writer (_csv.Dialect in CPython)
    def __init__(self, dialect, fmtparams):
        if isinstance(dialect, str):
            dialect = get_dialect(dialect)
        for name in fmtparams:
            if name not in _PARAMS:
                raise TypeError("this function got an unexpected keyword argument '" + name + "'")
        values = {}
        for name in _PARAMS:
            if name in fmtparams:
                values[name] = fmtparams[name]
            else:
                values[name] = getattr(dialect, name, None)
        quoting_set = "quoting" in fmtparams
        delimiter = "," if values["delimiter"] is None and "delimiter" not in fmtparams else values["delimiter"]
        quotechar = '"' if values["quotechar"] is None and "quotechar" not in fmtparams else values["quotechar"]
        lineterminator = "\r\n" if values["lineterminator"] is None and "lineterminator" not in fmtparams else values["lineterminator"]
        quoting = QUOTE_MINIMAL if values["quoting"] is None else values["quoting"]
        self.delimiter = _char("delimiter", delimiter, False)
        self.doublequote = True if values["doublequote"] is None else bool(values["doublequote"])
        self.escapechar = _char("escapechar", values["escapechar"], True)
        if lineterminator is None:
            raise TypeError("lineterminator must be set")
        if not isinstance(lineterminator, str):
            raise TypeError('"lineterminator" must be a string, not ' + type(lineterminator).__name__)
        self.lineterminator = lineterminator
        if not isinstance(quoting, int):
            raise TypeError('"quoting" must be an integer')
        if quoting not in (0, 1, 2, 3, 4, 5):
            raise TypeError('bad "quoting" value')
        self.quotechar = _char("quotechar", quotechar, True)
        if self.quotechar is None:
            if quoting_set and quoting != QUOTE_NONE:
                raise TypeError("quotechar must be set if quoting enabled")
            quoting = QUOTE_NONE
        self.quoting = quoting
        self.skipinitialspace = False if values["skipinitialspace"] is None else bool(values["skipinitialspace"])
        self.strict = False if values["strict"] is None else bool(values["strict"])
        if self.delimiter in ("\n", "\r"):
            raise ValueError("bad delimiter value")
        if self.quotechar in ("\n", "\r"):
            raise ValueError("bad quotechar value")
        if self.escapechar in ("\n", "\r"):
            raise ValueError("bad escapechar value")
        if self.delimiter == self.quotechar:
            raise ValueError("bad delimiter or quotechar value")
        if self.delimiter == self.escapechar:
            raise ValueError("bad delimiter or escapechar value")
        if self.escapechar is not None and self.escapechar == self.quotechar:
            raise ValueError("bad escapechar or quotechar value")
        if self.delimiter in self.lineterminator:
            raise ValueError("bad delimiter or lineterminator value")
        if self.quotechar is not None and self.quotechar in self.lineterminator:
            raise ValueError("bad quotechar or lineterminator value")
        if self.escapechar is not None and self.escapechar in self.lineterminator:
            raise ValueError("bad escapechar or lineterminator value")


_Format = Dialect


class Dialect:
    _name = ""
    _valid = False
    delimiter = None
    quotechar = None
    escapechar = None
    doublequote = None
    skipinitialspace = None
    lineterminator = None
    quoting = None
    strict = None

    def __init__(self):
        if self.__class__ != Dialect:
            self._valid = True
        _Format(self, {})


class excel(Dialect):
    delimiter = ","
    quotechar = '"'
    doublequote = True
    skipinitialspace = False
    lineterminator = "\r\n"
    quoting = QUOTE_MINIMAL


class excel_tab(excel):
    delimiter = "\t"


class unix_dialect(Dialect):
    delimiter = ","
    quotechar = '"'
    doublequote = True
    skipinitialspace = False
    lineterminator = "\n"
    quoting = QUOTE_ALL


_dialects = {"excel": excel, "excel-tab": excel_tab, "unix": unix_dialect}
_PARAMS = ("delimiter", "quotechar", "escapechar", "doublequote", "skipinitialspace", "lineterminator", "quoting", "strict")


def register_dialect(name, dialect=None, **fmtparams):
    if not isinstance(name, str):
        raise TypeError("dialect name must be a string")
    _dialects[name] = _Format(excel if dialect is None else dialect, fmtparams)


def unregister_dialect(name):
    if name not in _dialects:
        raise Error("unknown dialect")
    del _dialects[name]


def get_dialect(name):
    if name not in _dialects:
        raise Error("unknown dialect")
    d = _dialects[name]
    if isinstance(d, _Format):
        return d
    return _Format(d, {})


def list_dialects():
    return list(_dialects)


# States of the reader (as in _csv.c)
_START_RECORD = 0
_START_FIELD = 1
_ESCAPED_CHAR = 2
_IN_FIELD = 3
_IN_QUOTED_FIELD = 4
_ESCAPE_IN_QUOTED_FIELD = 5
_QUOTE_IN_QUOTED_FIELD = 6
_EAT_CRNL = 7
_AFTER_ESCAPED_CRNL = 8
_EOL = None  # end of a line from the iterator


class _Reader:
    def __init__(self, csvfile, dialect, fmtparams):
        self._lines = iter(csvfile)
        self.dialect = _Format(dialect, fmtparams)
        self.line_num = 0

    def __iter__(self):
        return self

    def _save_field(self):
        q = self.dialect.quoting
        field = self._field
        if self._unquoted and field == "" and (q == QUOTE_NOTNULL or q == QUOTE_STRINGS):
            value = None
        elif self._unquoted and field != "" and (q == QUOTE_NONNUMERIC or q == QUOTE_STRINGS):
            value = float(field)
        else:
            value = field
        self._fields.append(value)
        self._field = ""
        self._unquoted = True

    def _add_char(self, c):
        if len(self._field) >= _field_limit:
            raise Error("field larger than field limit (" + str(_field_limit) + ")")
        self._field += c

    def _process(self, c):
        d = self.dialect
        state = self._state
        if state == _START_RECORD:
            if c is _EOL:
                return
            if c == "\n" or c == "\r":
                self._state = _EAT_CRNL
                return
            state = _START_FIELD
        if state == _START_FIELD:
            if c is _EOL or c == "\n" or c == "\r":
                self._save_field()
                self._state = _START_RECORD if c is _EOL else _EAT_CRNL
            elif c == d.quotechar and d.quoting != QUOTE_NONE:
                self._unquoted = False
                self._state = _IN_QUOTED_FIELD
            elif c == d.escapechar:
                self._state = _ESCAPED_CHAR
            elif c == " " and d.skipinitialspace:
                self._state = _START_FIELD
            elif c == d.delimiter:
                self._save_field()
                self._state = _START_FIELD
            else:
                self._add_char(c)
                self._state = _IN_FIELD
            return
        if state == _ESCAPED_CHAR:
            if c == "\n" or c == "\r":
                self._add_char(c)
                self._state = _AFTER_ESCAPED_CRNL
                return
            if c is _EOL:
                c = "\n"
            self._add_char(c)
            self._state = _IN_FIELD
            return
        if state == _AFTER_ESCAPED_CRNL:
            if c is _EOL:
                return
            state = _IN_FIELD
        if state == _IN_FIELD:
            if c is _EOL or c == "\n" or c == "\r":
                self._save_field()
                self._state = _START_RECORD if c is _EOL else _EAT_CRNL
            elif c == d.escapechar:
                self._state = _ESCAPED_CHAR
            elif c == d.delimiter:
                self._save_field()
                self._state = _START_FIELD
            else:
                self._add_char(c)
                self._state = _IN_FIELD
            return
        if state == _IN_QUOTED_FIELD:
            if c is _EOL:
                pass
            elif c == d.escapechar:
                self._state = _ESCAPE_IN_QUOTED_FIELD
            elif c == d.quotechar and d.quoting != QUOTE_NONE:
                self._state = _QUOTE_IN_QUOTED_FIELD if d.doublequote else _IN_FIELD
            else:
                self._add_char(c)
            return
        if state == _ESCAPE_IN_QUOTED_FIELD:
            if c is _EOL:
                c = "\n"
            self._add_char(c)
            self._state = _IN_QUOTED_FIELD
            return
        if state == _QUOTE_IN_QUOTED_FIELD:
            if d.quoting != QUOTE_NONE and c == d.quotechar:
                self._add_char(c)
                self._state = _IN_QUOTED_FIELD
            elif c == d.delimiter:
                self._save_field()
                self._state = _START_FIELD
            elif c is _EOL or c == "\n" or c == "\r":
                self._save_field()
                self._state = _START_RECORD if c is _EOL else _EAT_CRNL
            elif not d.strict:
                self._add_char(c)
                self._state = _IN_FIELD
            else:
                raise Error("'" + d.delimiter + "' expected after '" + d.quotechar + "'")
            return
        if state == _EAT_CRNL:
            if c == "\n" or c == "\r":
                pass
            elif c is _EOL:
                self._state = _START_RECORD
            else:
                raise Error("new-line character seen in unquoted field - do you need to open the file with newline=''?")

    def __next__(self):
        self._fields = []
        self._field = ""
        self._unquoted = True
        self._state = _START_RECORD
        while True:
            try:
                line = next(self._lines)
            except StopIteration:
                if self._field != "" or self._state == _IN_QUOTED_FIELD:
                    if self.dialect.strict:
                        raise Error("unexpected end of data")
                    self._save_field()
                    break
                raise
            if not isinstance(line, str):
                raise Error("iterator should return strings, not " + type(line).__name__ + " (the file should be opened in text mode)")
            self.line_num += 1
            for c in line:
                self._process(c)
            self._process(_EOL)
            if self._state == _START_RECORD:
                break
        fields = self._fields
        self._fields = []
        return fields


def reader(csvfile, dialect="excel", **fmtparams):
    return _Reader(csvfile, dialect, fmtparams)


class _Writer:
    def __init__(self, csvfile, dialect, fmtparams):
        if not hasattr(csvfile, "write"):
            raise TypeError('argument 1 must have a "write" method')
        self._write = csvfile.write
        self.dialect = _Format(dialect, fmtparams)

    def _append(self, parts, text, quoted):
        d = self.dialect
        out = ""
        for c in text:
            if c == d.delimiter or c == d.escapechar or c == d.quotechar or c == "\n" or c == "\r" or c in d.lineterminator:
                want_escape = False
                if d.quoting == QUOTE_NONE:
                    want_escape = True
                else:
                    if c == d.quotechar:
                        if d.doublequote:
                            out += d.quotechar
                        else:
                            want_escape = True
                    elif c == d.escapechar:
                        want_escape = True
                    if not want_escape:
                        quoted = True
                if want_escape:
                    if d.escapechar is None:
                        raise Error("need to escape, but no escapechar set")
                    out += d.escapechar
            out += c
        if quoted:
            out = d.quotechar + out + d.quotechar
        parts.append(out)

    def writerow(self, row):
        d = self.dialect
        try:
            values = iter(row)
        except TypeError:
            raise Error("iterable expected, not " + type(row).__name__)
        parts = []
        for field in values:
            if d.quoting == QUOTE_NONNUMERIC:
                quoted = not isinstance(field, (int, float))
            elif d.quoting == QUOTE_ALL:
                quoted = True
            elif d.quoting == QUOTE_STRINGS:
                quoted = isinstance(field, str)
            elif d.quoting == QUOTE_NOTNULL:
                quoted = field is not None
            else:
                quoted = False
            if field is None:
                text = ""
            else:
                text = str(field)
            self._append(parts, text, quoted)
        if len(parts) == 1 and parts[0] == "":
            if d.quoting == QUOTE_NONE:
                raise Error("single empty field record must be quoted")
            parts = []
            self._append(parts, "", True)
        return self._write(d.delimiter.join(parts) + d.lineterminator)

    def writerows(self, rows):
        for row in rows:
            self.writerow(row)


def writer(csvfile, dialect="excel", **fmtparams):
    return _Writer(csvfile, dialect, fmtparams)


class DictReader:
    def __init__(self, f, fieldnames=None, restkey=None, restval=None, dialect="excel", *args, **kwds):
        if fieldnames is not None and iter(fieldnames) is fieldnames:
            fieldnames = list(fieldnames)
        self._fieldnames = fieldnames
        self.restkey = restkey
        self.restval = restval
        self.reader = reader(f, dialect, *args, **kwds)
        self.dialect = dialect
        self.line_num = 0

    def __iter__(self):
        return self

    @property
    def fieldnames(self):
        if self._fieldnames is None:
            try:
                self._fieldnames = next(self.reader)
            except StopIteration:
                pass
        self.line_num = self.reader.line_num
        return self._fieldnames

    @fieldnames.setter
    def fieldnames(self, value):
        self._fieldnames = value

    def __next__(self):
        if self.line_num == 0:
            self.fieldnames
        row = next(self.reader)
        self.line_num = self.reader.line_num
        while row == []:
            row = next(self.reader)
        d = dict(zip(self.fieldnames, row))
        lf = len(self.fieldnames)
        lr = len(row)
        if lf < lr:
            d[self.restkey] = row[lf:]
        elif lf > lr:
            for key in self.fieldnames[lr:]:
                d[key] = self.restval
        return d


class DictWriter:
    def __init__(self, f, fieldnames, restval="", extrasaction="raise", dialect="excel", *args, **kwds):
        if fieldnames is not None and iter(fieldnames) is fieldnames:
            fieldnames = list(fieldnames)
        self.fieldnames = fieldnames
        self.restval = restval
        extrasaction = extrasaction.lower()
        if extrasaction not in ("raise", "ignore"):
            raise ValueError("extrasaction (" + extrasaction + ") must be 'raise' or 'ignore'")
        self.extrasaction = extrasaction
        self.writer = writer(f, dialect, *args, **kwds)

    def writeheader(self):
        header = dict(zip(self.fieldnames, self.fieldnames))
        return self.writerow(header)

    def _dict_to_list(self, rowdict):
        if self.extrasaction == "raise":
            wrong_fields = [k for k in rowdict if k not in self.fieldnames]
            if wrong_fields:
                raise ValueError("dict contains fields not in fieldnames: " + ", ".join([repr(x) for x in wrong_fields]))
        return [rowdict.get(key, self.restval) for key in self.fieldnames]

    def writerow(self, rowdict):
        return self.writer.writerow(self._dict_to_list(rowdict))

    def writerows(self, rowdicts):
        for rowdict in rowdicts:
            self.writerow(rowdict)
`;
