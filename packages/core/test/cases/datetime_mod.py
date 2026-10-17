from datetime import date, time, datetime, timedelta, timezone
import datetime as dt

d = date(2024, 2, 28)
print(d, repr(d), d.weekday(), d.isoweekday(), d.isocalendar()[:2])
print(d + timedelta(days=2), d - timedelta(days=60), date(2025, 1, 1) - d)
print(d.strftime("%A, %d. %B %Y (%a %b %j %U %W)"), f"{d:%Y/%m/%d}")
print(date.fromisoformat("2023-12-31"), date.fromordinal(739000), d.toordinal())
print(d < date(2024, 3, 1), d == date(2024, 2, 28), d.replace(day=1), d.replace(year=2023))
try:
    date(2023, 2, 29)
except ValueError as e:
    print("ValueError", e)

t = time(7, 5, 9)
print(t, repr(t), time(12, 30), time(1, 2, 3, 4500), t.isoformat("minutes"))

x = datetime(2024, 3, 9, 14, 5, 7, 123456)
print(x, repr(x), x.isoformat(), x.isoformat(" ", "milliseconds"))
print(x.date(), x.time(), x.year, x.hour, x.microsecond)
print(x.strftime("%Y-%m-%d %H:%M:%S.%f %I:%M %p %y %e"))
print(x + timedelta(hours=10), x - timedelta(days=365), x - datetime(2024, 1, 1))
print(datetime.strptime("2024-05-17 08:30", "%Y-%m-%d %H:%M"), datetime.strptime("17 March 2021", "%d %B %Y"))
print(datetime.fromisoformat("2024-05-17T08:30:15"), datetime.fromisoformat("2024-05-17 08:30:15.5"))
print(datetime.combine(d, t), x > datetime(2024, 3, 9), sorted([x, datetime(2020, 1, 1)])[0])
print(datetime.fromtimestamp(0, timezone.utc), datetime.fromtimestamp(86400 * 365.25, timezone.utc).year)

utc = timezone.utc
a = datetime(2024, 6, 1, 12, 0, tzinfo=utc)
b = a.astimezone(timezone(timedelta(hours=2)))
print(a, b, repr(b), a == b, b.tzname(), b.utcoffset())
print(a.isoformat(), a.strftime("%z %Z"), b.strftime("%z %Z"), a.timestamp())

td = timedelta(days=1, hours=2, minutes=3, seconds=4, microseconds=5)
print(td, repr(td), td.total_seconds(), td * 2, td / 2, td // timedelta(hours=1), -td, abs(-td))
print(timedelta(0), timedelta(days=-1), timedelta(seconds=-1), timedelta(weeks=2), timedelta(milliseconds=1500))
print(timedelta(hours=5) > timedelta(minutes=299), bool(timedelta(0)), timedelta(days=7) / timedelta(days=2))
print(dt.MINYEAR, dt.MAXYEAR, date.min, date.max, timedelta.max.days)
try:
    datetime(2024, 1, 1) - a
except TypeError as e:
    print("TypeError", e)
