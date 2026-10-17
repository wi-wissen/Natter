// time: clock and sleeping on top of the native _time module.
export default String.raw`
from _time import time, time_ns, perf_counter, monotonic, process_time, sleep
import _calendar

timezone = 0
altzone = 0
daylight = 0
tzname = ("UTC", "UTC")


def _fields(t):
    secs = int(t // 1)
    days, rest = divmod(secs, 86400)
    y, m, d = _calendar.ord_to_ymd(days + 719163)
    return (y, m, d, rest // 3600, rest % 3600 // 60, rest % 60, _calendar.weekday(y, m, d), _calendar.yearday(y, m, d), 0)


def gmtime(secs=None):
    return _fields(time() if secs is None else secs)


def localtime(secs=None):
    from _time import tz_offset
    t = time() if secs is None else secs
    return _fields(t + tz_offset())


def mktime(t):
    days = _calendar.ymd_to_ord(t[0], t[1], t[2]) - 719163
    from _time import tz_offset
    return float(days * 86400 + t[3] * 3600 + t[4] * 60 + t[5] - tz_offset())


def strftime(fmt, t=None):
    if t is None:
        t = localtime()
    return _calendar.strftime(fmt, t[0], t[1], t[2], t[3], t[4], t[5], 0, "UTC")


def asctime(t=None):
    return strftime("%a %b %e %H:%M:%S %Y", t)


def ctime(secs=None):
    return asctime(localtime(secs))
`;
