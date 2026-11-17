// csv: reader, writer, DictReader and DictWriter with the excel dialect (and excel-tab), like CPython's module.
// Works on anything that yields lines (files from open(), lists of strings) and anything with write().
export default String.raw`
QUOTE_MINIMAL = 0
QUOTE_ALL = 1
QUOTE_NONNUMERIC = 2
QUOTE_NONE = 3


class Error(Exception):
    pass


class Dialect:
    delimiter = ","
    quotechar = '"'
    escapechar = None
    doublequote = True
    skipinitialspace = False
    lineterminator = "\r\n"
    quoting = QUOTE_MINIMAL
    strict = False


class excel(Dialect):
    pass


class excel_tab(excel):
    delimiter = "\t"


class unix_dialect(Dialect):
    lineterminator = "\n"
    quoting = QUOTE_ALL


_dialects = {"excel": excel, "excel-tab": excel_tab, "unix": unix_dialect}


def register_dialect(name, dialect=None, **fmtparams):
    if dialect is None:
        dialect = excel
    _dialects[name] = _Format(dialect, fmtparams)


def unregister_dialect(name):
    if name not in _dialects:
        raise Error("unknown dialect")
    del _dialects[name]


def get_dialect(name):
    if name not in _dialects:
        raise Error("unknown dialect")
    return _dialects[name]


def list_dialects():
    return list(_dialects)


class _Format:
    def __init__(self, dialect, fmtparams):
        if isinstance(dialect, str):
            dialect = get_dialect(dialect)
        for name in ("delimiter", "quotechar", "escapechar", "doublequote", "skipinitialspace", "lineterminator", "quoting", "strict"):
            setattr(self, name, fmtparams.get(name, getattr(dialect, name)))
        for name in fmtparams:
            if not hasattr(Dialect, name):
                raise TypeError("'" + name + "' is an invalid keyword argument for this function")
        if not isinstance(self.delimiter, str) or len(self.delimiter) != 1:
            raise TypeError('"delimiter" must be a 1-character string')
        if self.quotechar is None and self.quoting != QUOTE_NONE:
            raise TypeError("quotechar must be set if quoting enabled")


class _Reader:
    def __init__(self, csvfile, dialect, fmtparams):
        self._lines = iter(csvfile)
        self.dialect = _Format(dialect, fmtparams)
        self.line_num = 0

    def __iter__(self):
        return self

    def __next__(self):
        d = self.dialect
        row = []
        field = ""
        quoted = False      # inside a quoted field
        was_quoted = False  # the current field started with a quote
        after_quote = False # just read a quote inside a quoted field
        escaped = False
        started = False     # something of the record was read
        while True:
            try:
                line = next(self._lines)
            except StopIteration:
                if not started:
                    raise
                if quoted and d.strict:
                    raise Error("unexpected end of data")
                row.append(self._value(field, was_quoted))
                return row
            if not isinstance(line, str):
                raise Error("iterator should return strings, not " + type(line).__name__ + " (the file should be opened in text mode)")
            self.line_num += 1
            i = 0
            n = len(line)
            while i < n:
                c = line[i]
                i += 1
                if escaped:
                    field += c
                    escaped = False
                    continue
                if quoted:
                    if after_quote:
                        after_quote = False
                        if c == d.quotechar and d.doublequote:
                            field += c
                            continue
                        quoted = False
                    else:
                        if c == d.escapechar:
                            escaped = True
                        elif c == d.quotechar:
                            after_quote = True
                        else:
                            field += c
                        continue
                if c == "\r" or c == "\n":
                    if not started and field == "":
                        if c == "\r" and i < n and line[i] == "\n":
                            continue
                        return []
                    row.append(self._value(field, was_quoted))
                    return row
                started = True
                if c == d.delimiter:
                    row.append(self._value(field, was_quoted))
                    field = ""
                    was_quoted = False
                    if d.skipinitialspace:
                        while i < n and line[i] == " ":
                            i += 1
                elif c == d.quotechar and field == "" and not was_quoted and d.quoting != QUOTE_NONE:
                    quoted = True
                    was_quoted = True
                elif c == d.escapechar:
                    escaped = True
                else:
                    if was_quoted and d.strict:
                        raise Error("'" + d.delimiter + "' expected after '" + d.quotechar + "'")
                    field += c
            if after_quote:
                after_quote = False
                quoted = False
            if not quoted:
                if not started:
                    return []
                row.append(self._value(field, was_quoted))
                return row

    def _value(self, field, was_quoted):
        if self.dialect.quoting == QUOTE_NONNUMERIC and not was_quoted:
            return float(field)
        return field


def reader(csvfile, dialect="excel", **fmtparams):
    return _Reader(csvfile, dialect, fmtparams)


class _Writer:
    def __init__(self, csvfile, dialect, fmtparams):
        self._file = csvfile
        self.dialect = _Format(dialect, fmtparams)

    def _field(self, value, only):
        d = self.dialect
        if value is None:
            text = ""
        elif isinstance(value, float):
            text = repr(value)
        else:
            text = str(value)
        if d.quoting == QUOTE_ALL:
            quote = True
        elif d.quoting == QUOTE_NONNUMERIC:
            quote = not isinstance(value, (int, float)) or isinstance(value, bool)
        elif d.quoting == QUOTE_NONE:
            quote = False
        else:
            quote = only and text == ""
            for c in text:
                if c == d.delimiter or c == d.quotechar or c == "\r" or c == "\n" or c in d.lineterminator:
                    quote = True
        if d.quotechar is not None and d.quotechar in text:
            if d.doublequote:
                text = text.replace(d.quotechar, d.quotechar + d.quotechar)
            elif d.escapechar is not None:
                text = text.replace(d.quotechar, d.escapechar + d.quotechar)
            else:
                raise Error("need to escape, but no escapechar set")
        if d.quoting == QUOTE_NONE:
            for c in (d.delimiter, "\r", "\n"):
                if c in text:
                    if d.escapechar is None:
                        raise Error("need to escape, but no escapechar set")
                    text = text.replace(c, d.escapechar + c)
        if quote:
            return d.quotechar + text + d.quotechar
        return text

    def writerow(self, row):
        if isinstance(row, str):
            raise Error("iterable expected, not str")
        try:
            values = list(row)
        except TypeError:
            raise Error("iterable expected, not " + type(row).__name__)
        parts = []
        for value in values:
            parts.append(self._field(value, len(values) == 1))
        return self._file.write(self.dialect.delimiter.join(parts) + self.dialect.lineterminator)

    def writerows(self, rows):
        for row in rows:
            self.writerow(row)


def writer(csvfile, dialect="excel", **fmtparams):
    return _Writer(csvfile, dialect, fmtparams)


class DictReader:
    def __init__(self, f, fieldnames=None, restkey=None, restval=None, dialect="excel", **kwds):
        self._fieldnames = fieldnames
        self.restkey = restkey
        self.restval = restval
        self.reader = reader(f, dialect, **kwds)
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

    def __next__(self):
        if self.line_num == 0:
            self.fieldnames
        row = next(self.reader)
        while row == []:
            row = next(self.reader)
        self.line_num = self.reader.line_num
        names = self.fieldnames
        d = dict(zip(names, row))
        if len(names) < len(row):
            d[self.restkey] = row[len(names):]
        elif len(names) > len(row):
            for key in names[len(row):]:
                d[key] = self.restval
        return d


class DictWriter:
    def __init__(self, f, fieldnames, restval="", extrasaction="raise", dialect="excel", **kwds):
        if extrasaction.lower() not in ("raise", "ignore"):
            raise ValueError("extrasaction (" + extrasaction + ") must be 'raise' or 'ignore'")
        self.fieldnames = fieldnames
        self.restval = restval
        self.extrasaction = extrasaction.lower()
        self.writer = writer(f, dialect, **kwds)

    def writeheader(self):
        return self.writer.writerow(self.fieldnames)

    def _row(self, rowdict):
        if self.extrasaction == "raise":
            wrong = []
            for k in rowdict:
                if k not in self.fieldnames:
                    wrong.append(repr(k))
            if wrong:
                raise ValueError("dict contains fields not in fieldnames: " + ", ".join(wrong))
        values = []
        for key in self.fieldnames:
            values.append(rowdict.get(key, self.restval))
        return values

    def writerow(self, rowdict):
        return self.writer.writerow(self._row(rowdict))

    def writerows(self, rowdicts):
        for rowdict in rowdicts:
            self.writerow(rowdict)
`;
