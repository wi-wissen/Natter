// _calendar: dates of the proleptic Gregorian calendar and strftime (shared by datetime and time).
export default String.raw`
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
_DIM = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
_DBM = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]


def is_leap(y):
    return y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)


def days_in_month(y, m):
    if m == 2 and is_leap(y):
        return 29
    return _DIM[m]


def days_before_year(y):
    y = y - 1
    return y * 365 + y // 4 - y // 100 + y // 400


def days_before_month(y, m):
    return _DBM[m] + (1 if m > 2 and is_leap(y) else 0)


def ymd_to_ord(y, m, d):
    """Day number: 0001-01-01 is day 1."""
    return days_before_year(y) + days_before_month(y, m) + d


def ord_to_ymd(n):
    n -= 1
    n400, n = divmod(n, 146097)
    year = n400 * 400 + 1
    n100, n = divmod(n, 36524)
    n4, n = divmod(n, 1461)
    n1, n = divmod(n, 365)
    year += n100 * 100 + n4 * 4 + n1
    if n1 == 4 or n100 == 4:
        return year - 1, 12, 31
    leap = n1 == 3 and (n4 != 24 or n100 == 3)
    month = (n + 50) >> 5
    preceding = _DBM[month] + (1 if month > 2 and leap else 0)
    if preceding > n:
        month -= 1
        preceding -= _DIM[month] + (1 if month == 2 and leap else 0)
    return year, month, n - preceding + 1


def weekday(y, m, d):
    """Monday is 0."""
    return (ymd_to_ord(y, m, d) + 6) % 7


def yearday(y, m, d):
    return days_before_month(y, m) + d


def week_number(y, m, d, first_weekday):
    """%U (first_weekday 6: Sunday) and %W (0: Monday)."""
    yd = yearday(y, m, d) - 1
    wd = (weekday(y, m, d) - first_weekday) % 7
    return (yd + 7 - wd) // 7


def iso_calendar(y, m, d):
    ordinal = ymd_to_ord(y, m, d)
    wd = weekday(y, m, d)
    thursday = ordinal - wd + 3
    ty, _, _ = ord_to_ymd(thursday)
    week = (thursday - ymd_to_ord(ty, 1, 1)) // 7 + 1
    return ty, week, wd + 1


def _pad(n, width, fill="0"):
    s = str(n)
    return fill * (width - len(s)) + s


def strftime(fmt, y, m, d, hh, mi, ss, us, tzname="", utcoffset=None):
    out = []
    i = 0
    n = len(fmt)
    while i < n:
        c = fmt[i]
        if c != "%" or i + 1 >= n:
            out.append(c)
            i += 1
            continue
        i += 1
        code = fmt[i]
        strip = False
        if code == "-" and i + 1 < n:
            strip = True
            i += 1
            code = fmt[i]
        i += 1
        wd = weekday(y, m, d)
        if code == "Y":
            s = str(y)
        elif code == "y":
            s = _pad(y % 100, 2)
        elif code == "m":
            s = _pad(m, 2)
        elif code == "d":
            s = _pad(d, 2)
        elif code == "e":
            s = _pad(d, 2, " ")
        elif code == "H":
            s = _pad(hh, 2)
        elif code == "I":
            s = _pad(hh % 12 or 12, 2)
        elif code == "M":
            s = _pad(mi, 2)
        elif code == "S":
            s = _pad(ss, 2)
        elif code == "f":
            s = _pad(us, 6)
        elif code == "j":
            s = _pad(yearday(y, m, d), 3)
        elif code == "a":
            s = DAYS[wd][:3]
        elif code == "A":
            s = DAYS[wd]
        elif code == "b" or code == "h":
            s = MONTHS[m - 1][:3]
        elif code == "B":
            s = MONTHS[m - 1]
        elif code == "p":
            s = "AM" if hh < 12 else "PM"
        elif code == "w":
            s = str((wd + 1) % 7)
        elif code == "u":
            s = str(wd + 1)
        elif code == "U":
            s = _pad(week_number(y, m, d, 6), 2)
        elif code == "W":
            s = _pad(week_number(y, m, d, 0), 2)
        elif code == "V":
            s = _pad(iso_calendar(y, m, d)[1], 2)
        elif code == "G":
            s = str(iso_calendar(y, m, d)[0])
        elif code == "Z":
            s = tzname
        elif code == "z":
            if utcoffset is None:
                s = ""
            else:
                sign = "-" if utcoffset < 0 else "+"
                total = abs(utcoffset)
                s = sign + _pad(total // 3600, 2) + _pad(total % 3600 // 60, 2)
        elif code == "c":
            s = DAYS[wd][:3] + " " + MONTHS[m - 1][:3] + " " + _pad(d, 2, " ") + " " + _pad(hh, 2) + ":" + _pad(mi, 2) + ":" + _pad(ss, 2) + " " + str(y)
        elif code == "x":
            s = _pad(m, 2) + "/" + _pad(d, 2) + "/" + _pad(y % 100, 2)
        elif code == "X":
            s = _pad(hh, 2) + ":" + _pad(mi, 2) + ":" + _pad(ss, 2)
        elif code == "D":
            s = _pad(m, 2) + "/" + _pad(d, 2) + "/" + _pad(y % 100, 2)
        elif code == "F":
            s = str(y) + "-" + _pad(m, 2) + "-" + _pad(d, 2)
        elif code == "T":
            s = _pad(hh, 2) + ":" + _pad(mi, 2) + ":" + _pad(ss, 2)
        elif code == "R":
            s = _pad(hh, 2) + ":" + _pad(mi, 2)
        elif code == "n":
            s = chr(10)
        elif code == "t":
            s = chr(9)
        elif code == "%":
            s = "%"
        else:
            s = "%" + code
        if strip:
            s = s.lstrip("0 ") or "0"
        out.append(s)
    return "".join(out)


def strptime(text, fmt):
    """Returns (y, m, d, hh, mi, ss, us, offset or None)."""
    y, mo, d, hh, mi, ss, us = 1900, 1, 1, 0, 0, 0, 0
    pm = None
    offset = None
    pos = 0
    i = 0
    n = len(fmt)

    def number(maxlen):
        nonlocal pos
        start = pos
        while pos < len(text) and pos - start < maxlen and text[pos].isdigit():
            pos += 1
        if pos == start:
            raise ValueError("time data " + repr(text) + " does not match format " + repr(fmt))
        return int(text[start:pos])

    def name(options):
        nonlocal pos
        for k in range(len(options)):
            for option in (options[k], options[k][:3]):
                if text[pos:pos + len(option)].lower() == option.lower():
                    pos += len(option)
                    return k
        raise ValueError("time data " + repr(text) + " does not match format " + repr(fmt))

    while i < n:
        c = fmt[i]
        if c != "%":
            if c.isspace():
                while pos < len(text) and text[pos].isspace():
                    pos += 1
            elif pos < len(text) and text[pos] == c:
                pos += 1
            else:
                raise ValueError("time data " + repr(text) + " does not match format " + repr(fmt))
            i += 1
            continue
        i += 1
        code = fmt[i]
        i += 1
        if code == "Y":
            y = number(4)
        elif code == "y":
            v = number(2)
            y = 2000 + v if v < 69 else 1900 + v
        elif code == "m":
            mo = number(2)
        elif code == "d":
            d = number(2)
        elif code == "H":
            hh = number(2)
        elif code == "I":
            hh = number(2)
        elif code == "M":
            mi = number(2)
        elif code == "S":
            ss = number(2)
        elif code == "f":
            start = pos
            v = number(6)
            us = v * 10 ** (6 - (pos - start))
        elif code == "j":
            yd = number(3)
            mo = 1
            d = yd
        elif code == "b" or code == "B":
            mo = name(MONTHS) + 1
        elif code == "a" or code == "A":
            name(DAYS)
        elif code == "p":
            word = text[pos:pos + 2].upper()
            if word == "AM":
                pm = False
            elif word == "PM":
                pm = True
            else:
                raise ValueError("time data " + repr(text) + " does not match format " + repr(fmt))
            pos += 2
        elif code == "z":
            if text[pos:pos + 1] == "Z":
                offset = 0
                pos += 1
            else:
                sign = -1 if text[pos:pos + 1] == "-" else 1
                pos += 1
                h = number(2)
                if text[pos:pos + 1] == ":":
                    pos += 1
                m2 = number(2)
                offset = sign * (h * 3600 + m2 * 60)
        elif code == "%":
            if text[pos:pos + 1] != "%":
                raise ValueError("time data " + repr(text) + " does not match format " + repr(fmt))
            pos += 1
        else:
            raise ValueError("'" + code + "' is a bad directive in format " + repr(fmt))
    if pos != len(text):
        raise ValueError("unconverted data remains: " + text[pos:])
    if pm is not None:
        hh = hh % 12 + (12 if pm else 0)
    if "j" in fmt and "%j" in fmt:
        yy, mm, dd = ord_to_ymd(ymd_to_ord(y, 1, 1) + d - 1)
        return yy, mm, dd, hh, mi, ss, us, offset
    return y, mo, d, hh, mi, ss, us, offset
`;
