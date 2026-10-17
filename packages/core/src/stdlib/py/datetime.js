// datetime: date, time, datetime, timedelta and timezone (the parts of CPython's datetime a school program uses).
export default String.raw`
import _calendar
from _time import time as _now, tz_offset as _tz_offset

MINYEAR = 1
MAXYEAR = 9999


def _check_int(name, v):
    if not isinstance(v, int):
        raise TypeError("'" + type(v).__name__ + "' object cannot be interpreted as an integer")
    return v


class timedelta:
    def __init__(self, days=0, seconds=0, microseconds=0, milliseconds=0, minutes=0, hours=0, weeks=0):
        total = round((((weeks * 7 + days) * 24 + hours) * 60 + minutes) * 60 * 1000000 + seconds * 1000000 + milliseconds * 1000 + microseconds)
        d, rest = divmod(total, 86400000000)
        s, us = divmod(rest, 1000000)
        if abs(d) > 999999999:
            raise OverflowError("days=" + str(d) + "; must have magnitude <= 999999999")
        self.days = d
        self.seconds = s
        self.microseconds = us

    def _us(self):
        return (self.days * 86400 + self.seconds) * 1000000 + self.microseconds

    @staticmethod
    def _from_us(us):
        return timedelta(microseconds=us)

    def total_seconds(self):
        return self._us() / 1000000

    def __add__(self, other):
        if isinstance(other, timedelta):
            return timedelta._from_us(self._us() + other._us())
        return NotImplemented

    __radd__ = __add__

    def __sub__(self, other):
        if isinstance(other, timedelta):
            return timedelta._from_us(self._us() - other._us())
        return NotImplemented

    def __neg__(self):
        return timedelta._from_us(-self._us())

    def __pos__(self):
        return self

    def __abs__(self):
        return -self if self.days < 0 else self

    def __mul__(self, k):
        if isinstance(k, int):
            return timedelta._from_us(self._us() * k)
        if isinstance(k, float):
            return timedelta._from_us(round(self._us() * k))
        return NotImplemented

    __rmul__ = __mul__

    def __truediv__(self, other):
        if isinstance(other, timedelta):
            return self._us() / other._us()
        if isinstance(other, (int, float)):
            if other == 0:
                raise ZeroDivisionError("division by zero")
            return timedelta._from_us(round(self._us() / other))
        return NotImplemented

    def __floordiv__(self, other):
        if isinstance(other, timedelta):
            return self._us() // other._us()
        if isinstance(other, int):
            return timedelta._from_us(self._us() // other)
        return NotImplemented

    def __mod__(self, other):
        if isinstance(other, timedelta):
            return timedelta._from_us(self._us() % other._us())
        return NotImplemented

    def __eq__(self, other):
        if isinstance(other, timedelta):
            return self._us() == other._us()
        return NotImplemented

    def __lt__(self, other):
        if isinstance(other, timedelta):
            return self._us() < other._us()
        return NotImplemented

    def __le__(self, other):
        if isinstance(other, timedelta):
            return self._us() <= other._us()
        return NotImplemented

    def __gt__(self, other):
        if isinstance(other, timedelta):
            return self._us() > other._us()
        return NotImplemented

    def __ge__(self, other):
        if isinstance(other, timedelta):
            return self._us() >= other._us()
        return NotImplemented

    def __hash__(self):
        return hash(self._us())

    def __bool__(self):
        return self._us() != 0

    def __str__(self):
        mm, ss = divmod(self.seconds, 60)
        hh, mm = divmod(mm, 60)
        s = "%d:%02d:%02d" % (hh, mm, ss)
        if self.days:
            s = ("%d day%s, " % (self.days, "" if abs(self.days) == 1 else "s")) + s
        if self.microseconds:
            s += ".%06d" % self.microseconds
        return s

    def __repr__(self):
        parts = []
        if self.days:
            parts.append("days=%d" % self.days)
        if self.seconds:
            parts.append("seconds=%d" % self.seconds)
        if self.microseconds:
            parts.append("microseconds=%d" % self.microseconds)
        if not parts:
            parts.append("0")
        return "datetime.timedelta(" + ", ".join(parts) + ")"


timedelta.min = timedelta(-999999999)
timedelta.max = timedelta(days=999999999, hours=23, minutes=59, seconds=59, microseconds=999999)
timedelta.resolution = timedelta(microseconds=1)


class tzinfo:
    def utcoffset(self, dt):
        raise NotImplementedError("a tzinfo subclass must implement utcoffset()")

    def tzname(self, dt):
        raise NotImplementedError("a tzinfo subclass must implement tzname()")


class timezone(tzinfo):
    def __init__(self, offset, name=None):
        if not isinstance(offset, timedelta):
            raise TypeError("timezone() argument 1 must be datetime.timedelta, not " + type(offset).__name__)
        self._offset = offset
        self._name = name

    def utcoffset(self, dt):
        return self._offset

    def tzname(self, dt):
        if self._name is not None:
            return self._name
        secs = self._offset._us() // 1000000
        if secs == 0:
            return "UTC"
        sign = "-" if secs < 0 else "+"
        secs = abs(secs)
        return "UTC" + sign + "%02d:%02d" % (secs // 3600, secs % 3600 // 60)

    def __eq__(self, other):
        if isinstance(other, timezone):
            return self._offset == other._offset
        return NotImplemented

    def __hash__(self):
        return hash(self._offset)

    def __str__(self):
        return self.tzname(None)

    def __repr__(self):
        if self._name is None:
            if self._offset._us() == 0:
                return "datetime.timezone.utc"
            return "datetime.timezone(" + repr(self._offset) + ")"
        return "datetime.timezone(" + repr(self._offset) + ", " + repr(self._name) + ")"


timezone.utc = timezone(timedelta(0))


def _offset_text(td, sep):
    secs = td._us() // 1000000
    sign = "-" if secs < 0 else "+"
    secs = abs(secs)
    s = sign + "%02d%s%02d" % (secs // 3600, sep, secs % 3600 // 60)
    if secs % 60:
        s += sep + "%02d" % (secs % 60)
    return s


class date:
    def __init__(self, year, month, day):
        _check_int("year", year)
        _check_int("month", month)
        _check_int("day", day)
        if not 1 <= year <= 9999:
            raise ValueError("year " + str(year) + " is out of range")
        if not 1 <= month <= 12:
            raise ValueError("month must be in 1..12")
        if not 1 <= day <= _calendar.days_in_month(year, month):
            raise ValueError("day is out of range for month")
        self.year = year
        self.month = month
        self.day = day

    @classmethod
    def today(cls):
        return datetime.now().date()

    @classmethod
    def fromordinal(cls, n):
        y, m, d = _calendar.ord_to_ymd(n)
        return cls(y, m, d)

    @classmethod
    def fromtimestamp(cls, ts):
        return datetime.fromtimestamp(ts).date()

    @classmethod
    def fromisoformat(cls, text):
        try:
            return cls(int(text[0:4]), int(text[5:7]), int(text[8:10])) if len(text) == 10 and text[4] == "-" and text[7] == "-" else cls._bad(text)
        except ValueError:
            raise ValueError("Invalid isoformat string: " + repr(text))

    @classmethod
    def _bad(cls, text):
        raise ValueError("Invalid isoformat string: " + repr(text))

    def toordinal(self):
        return _calendar.ymd_to_ord(self.year, self.month, self.day)

    def weekday(self):
        return _calendar.weekday(self.year, self.month, self.day)

    def isoweekday(self):
        return self.weekday() + 1

    def isocalendar(self):
        return _calendar.iso_calendar(self.year, self.month, self.day)

    def isoformat(self):
        return "%04d-%02d-%02d" % (self.year, self.month, self.day)

    __str__ = isoformat

    def ctime(self):
        return self.strftime("%a %b %e 00:00:00 %Y")

    def strftime(self, fmt):
        return _calendar.strftime(fmt, self.year, self.month, self.day, 0, 0, 0, 0)

    def __format__(self, spec):
        return self.strftime(spec) if spec else str(self)

    def replace(self, year=None, month=None, day=None):
        return date(self.year if year is None else year, self.month if month is None else month, self.day if day is None else day)

    def timetuple(self):
        return (self.year, self.month, self.day, 0, 0, 0, self.weekday(), _calendar.yearday(self.year, self.month, self.day), -1)

    def __repr__(self):
        return "datetime.date(%d, %d, %d)" % (self.year, self.month, self.day)

    def __add__(self, other):
        if isinstance(other, timedelta):
            return date.fromordinal(self.toordinal() + other.days)
        return NotImplemented

    __radd__ = __add__

    def __sub__(self, other):
        if isinstance(other, timedelta):
            return date.fromordinal(self.toordinal() - other.days)
        if isinstance(other, date):
            return timedelta(days=self.toordinal() - other.toordinal())
        return NotImplemented

    def _key(self):
        return (self.year, self.month, self.day)

    def __eq__(self, other):
        if isinstance(other, date) and not isinstance(other, datetime):
            return self._key() == other._key()
        return NotImplemented

    def __lt__(self, other):
        if isinstance(other, date) and not isinstance(other, datetime):
            return self._key() < other._key()
        return NotImplemented

    def __le__(self, other):
        if isinstance(other, date) and not isinstance(other, datetime):
            return self._key() <= other._key()
        return NotImplemented

    def __gt__(self, other):
        if isinstance(other, date) and not isinstance(other, datetime):
            return self._key() > other._key()
        return NotImplemented

    def __ge__(self, other):
        if isinstance(other, date) and not isinstance(other, datetime):
            return self._key() >= other._key()
        return NotImplemented

    def __hash__(self):
        return hash(self._key())


date.min = date(1, 1, 1)
date.max = date(9999, 12, 31)
date.resolution = timedelta(days=1)


class time:
    def __init__(self, hour=0, minute=0, second=0, microsecond=0, tzinfo=None):
        if not 0 <= hour <= 23:
            raise ValueError("hour must be in 0..23")
        if not 0 <= minute <= 59:
            raise ValueError("minute must be in 0..59")
        if not 0 <= second <= 59:
            raise ValueError("second must be in 0..59")
        if not 0 <= microsecond <= 999999:
            raise ValueError("microsecond must be in 0..999999")
        self.hour = hour
        self.minute = minute
        self.second = second
        self.microsecond = microsecond
        self.tzinfo = tzinfo

    def isoformat(self, timespec="auto"):
        s = "%02d:%02d:%02d" % (self.hour, self.minute, self.second)
        if timespec == "minutes":
            s = "%02d:%02d" % (self.hour, self.minute)
        elif timespec == "hours":
            s = "%02d" % self.hour
        elif timespec == "milliseconds":
            s += ".%03d" % (self.microsecond // 1000)
        elif timespec == "microseconds" or (timespec == "auto" and self.microsecond):
            s += ".%06d" % self.microsecond
        if self.tzinfo is not None:
            s += _offset_text(self.tzinfo.utcoffset(None), ":")
        return s

    __str__ = isoformat

    def strftime(self, fmt):
        return _calendar.strftime(fmt, 1900, 1, 1, self.hour, self.minute, self.second, self.microsecond)

    def __format__(self, spec):
        return self.strftime(spec) if spec else str(self)

    def replace(self, hour=None, minute=None, second=None, microsecond=None):
        return time(self.hour if hour is None else hour, self.minute if minute is None else minute, self.second if second is None else second, self.microsecond if microsecond is None else microsecond, self.tzinfo)

    def _key(self):
        return (self.hour, self.minute, self.second, self.microsecond)

    def __eq__(self, other):
        if isinstance(other, time):
            return self._key() == other._key()
        return NotImplemented

    def __lt__(self, other):
        if isinstance(other, time):
            return self._key() < other._key()
        return NotImplemented

    def __le__(self, other):
        if isinstance(other, time):
            return self._key() <= other._key()
        return NotImplemented

    def __gt__(self, other):
        if isinstance(other, time):
            return self._key() > other._key()
        return NotImplemented

    def __ge__(self, other):
        if isinstance(other, time):
            return self._key() >= other._key()
        return NotImplemented

    def __hash__(self):
        return hash(self._key())

    def __repr__(self):
        parts = [self.hour, self.minute]
        if self.second or self.microsecond:
            parts.append(self.second)
        if self.microsecond:
            parts.append(self.microsecond)
        return "datetime.time(" + ", ".join([str(p) for p in parts]) + ")"


class datetime(date):
    def __init__(self, year, month, day, hour=0, minute=0, second=0, microsecond=0, tzinfo=None):
        date.__init__(self, year, month, day)
        if not 0 <= hour <= 23:
            raise ValueError("hour must be in 0..23")
        if not 0 <= minute <= 59:
            raise ValueError("minute must be in 0..59")
        if not 0 <= second <= 59:
            raise ValueError("second must be in 0..59")
        if not 0 <= microsecond <= 999999:
            raise ValueError("microsecond must be in 0..999999")
        self.hour = hour
        self.minute = minute
        self.second = second
        self.microsecond = microsecond
        self.tzinfo = tzinfo

    @classmethod
    def now(cls, tz=None):
        t = _now()
        if tz is None:
            t += _tz_offset()
        else:
            t += tz.utcoffset(None)._us() / 1000000
        return cls._from_seconds(t, tz)

    @classmethod
    def utcnow(cls):
        return cls._from_seconds(_now(), None)

    @classmethod
    def today(cls):
        return cls.now()

    @classmethod
    def fromtimestamp(cls, ts, tz=None):
        if tz is None:
            return cls._from_seconds(ts + _tz_offset(), None)
        return cls._from_seconds(ts + tz.utcoffset(None)._us() / 1000000, tz)

    @classmethod
    def utcfromtimestamp(cls, ts):
        return cls._from_seconds(ts, None)

    @classmethod
    def _from_seconds(cls, t, tz):
        us_total = round(t * 1000000)
        days, rest = divmod(us_total, 86400000000)
        secs, us = divmod(rest, 1000000)
        y, m, d = _calendar.ord_to_ymd(days + 719163)
        return cls(y, m, d, secs // 3600, secs % 3600 // 60, secs % 60, us, tz)

    @classmethod
    def combine(cls, d, t, tzinfo=None):
        return cls(d.year, d.month, d.day, t.hour, t.minute, t.second, t.microsecond, tzinfo if tzinfo is not None else t.tzinfo)

    @classmethod
    def fromordinal(cls, n):
        y, m, d = _calendar.ord_to_ymd(n)
        return cls(y, m, d)

    @classmethod
    def strptime(cls, text, fmt):
        y, mo, d, hh, mi, ss, us, off = _calendar.strptime(text, fmt)
        tz = None if off is None else timezone(timedelta(seconds=off))
        return cls(y, mo, d, hh, mi, ss, us, tz)

    @classmethod
    def fromisoformat(cls, text):
        try:
            if len(text) < 10:
                raise ValueError()
            y, mo, d = int(text[0:4]), int(text[5:7]), int(text[8:10])
            hh = mi = ss = us = 0
            tz = None
            rest = text[11:] if len(text) > 10 else ""
            if len(text) > 10 and text[10] not in "T ":
                raise ValueError()
            if rest.endswith("Z"):
                tz = timezone.utc
                rest = rest[:-1]
            else:
                for sign in "+-":
                    k = rest.find(sign)
                    if k > 0:
                        tzs = rest[k + 1:]
                        secs = int(tzs[0:2]) * 3600 + int(tzs[3:5] if ":" in tzs else tzs[2:4] or 0) * 60
                        tz = timezone(timedelta(seconds=secs if sign == "+" else -secs))
                        rest = rest[:k]
                        break
            if rest:
                hh = int(rest[0:2])
                if len(rest) > 2:
                    mi = int(rest[3:5])
                if len(rest) > 5:
                    ss = int(rest[6:8])
                if len(rest) > 8:
                    frac = rest[9:]
                    us = int((frac + "000000")[:6])
            return cls(y, mo, d, hh, mi, ss, us, tz)
        except (ValueError, IndexError):
            raise ValueError("Invalid isoformat string: " + repr(text))

    def date(self):
        return date(self.year, self.month, self.day)

    def time(self):
        return time(self.hour, self.minute, self.second, self.microsecond)

    def timestamp(self):
        days = self.toordinal() - 719163
        secs = days * 86400 + self.hour * 3600 + self.minute * 60 + self.second + self.microsecond / 1000000
        if self.tzinfo is not None:
            return secs - self.tzinfo.utcoffset(self)._us() / 1000000
        return secs - _tz_offset()

    def utcoffset(self):
        return None if self.tzinfo is None else self.tzinfo.utcoffset(self)

    def tzname(self):
        return None if self.tzinfo is None else self.tzinfo.tzname(self)

    def astimezone(self, tz=None):
        if tz is None:
            tz = timezone.utc
        if self.tzinfo is None:
            utc = self - timedelta(seconds=-_tz_offset())
        else:
            utc = self - self.tzinfo.utcoffset(self)
        return (utc + tz.utcoffset(None)).replace(tzinfo=tz)

    def replace(self, year=None, month=None, day=None, hour=None, minute=None, second=None, microsecond=None, tzinfo=True):
        return datetime(self.year if year is None else year, self.month if month is None else month, self.day if day is None else day,
                        self.hour if hour is None else hour, self.minute if minute is None else minute,
                        self.second if second is None else second, self.microsecond if microsecond is None else microsecond,
                        self.tzinfo if tzinfo is True else tzinfo)

    def isoformat(self, sep="T", timespec="auto"):
        s = date.isoformat(self) + sep + time(self.hour, self.minute, self.second, self.microsecond).isoformat(timespec)
        if self.tzinfo is not None:
            s += _offset_text(self.tzinfo.utcoffset(self), ":")
        return s

    def __str__(self):
        return self.isoformat(" ")

    def ctime(self):
        return self.strftime("%a %b %e %H:%M:%S %Y")

    def strftime(self, fmt):
        off = None if self.tzinfo is None else self.tzinfo.utcoffset(self)._us() // 1000000
        name = "" if self.tzinfo is None else self.tzinfo.tzname(self)
        return _calendar.strftime(fmt, self.year, self.month, self.day, self.hour, self.minute, self.second, self.microsecond, name, off)

    def timetuple(self):
        return (self.year, self.month, self.day, self.hour, self.minute, self.second, self.weekday(), _calendar.yearday(self.year, self.month, self.day), -1)

    def __repr__(self):
        parts = [self.year, self.month, self.day, self.hour, self.minute]
        if self.second or self.microsecond:
            parts.append(self.second)
        if self.microsecond:
            parts.append(self.microsecond)
        s = "datetime.datetime(" + ", ".join([str(p) for p in parts])
        if self.tzinfo is not None:
            s += ", tzinfo=" + repr(self.tzinfo)
        return s + ")"

    def _us(self):
        us = ((self.toordinal() * 24 + self.hour) * 60 + self.minute) * 60 * 1000000 + self.second * 1000000 + self.microsecond
        if self.tzinfo is not None:
            us -= self.tzinfo.utcoffset(self)._us()
        return us

    def __add__(self, other):
        if isinstance(other, timedelta):
            total = (((self.toordinal() * 24 + self.hour) * 60 + self.minute) * 60 + self.second) * 1000000 + self.microsecond + other._us()
            days, rest = divmod(total, 86400000000)
            secs, us = divmod(rest, 1000000)
            y, m, d = _calendar.ord_to_ymd(days)
            return datetime(y, m, d, secs // 3600, secs % 3600 // 60, secs % 60, us, self.tzinfo)
        return NotImplemented

    __radd__ = __add__

    def __sub__(self, other):
        if isinstance(other, timedelta):
            return self + (-other)
        if isinstance(other, datetime):
            if (self.tzinfo is None) != (other.tzinfo is None):
                raise TypeError("can't subtract offset-naive and offset-aware datetimes")
            return timedelta(microseconds=self._us() - other._us())
        return NotImplemented

    def _cmp_ok(self, other):
        if (self.tzinfo is None) != (other.tzinfo is None):
            raise TypeError("can't compare offset-naive and offset-aware datetimes")

    def __eq__(self, other):
        if isinstance(other, datetime):
            if (self.tzinfo is None) != (other.tzinfo is None):
                return False
            return self._us() == other._us()
        return NotImplemented

    def __lt__(self, other):
        if isinstance(other, datetime):
            self._cmp_ok(other)
            return self._us() < other._us()
        return NotImplemented

    def __le__(self, other):
        if isinstance(other, datetime):
            self._cmp_ok(other)
            return self._us() <= other._us()
        return NotImplemented

    def __gt__(self, other):
        if isinstance(other, datetime):
            self._cmp_ok(other)
            return self._us() > other._us()
        return NotImplemented

    def __ge__(self, other):
        if isinstance(other, datetime):
            self._cmp_ok(other)
            return self._us() >= other._us()
        return NotImplemented

    def __hash__(self):
        return hash(self._us())


datetime.min = datetime(1, 1, 1)
datetime.max = datetime(9999, 12, 31, 23, 59, 59, 999999)
`;
