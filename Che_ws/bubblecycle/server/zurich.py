"""Calendar maths in Europe/Zurich time, without needing the tz database.

Switzerland follows the EU rule: summer time (UTC+2) starts on the last Sunday of March at 01:00 UTC
and ends on the last Sunday of October at 01:00 UTC; otherwise UTC+1. Weeks start on Monday 00:00 local
time. Mirrors js/logic/zurich.js; tests/fixtures/zurich.json (generated from the IANA database) keeps
both implementations honest.
"""
from datetime import date, datetime, timedelta, timezone

HOUR = 3_600_000
DAY = 86_400_000


def _last_sunday_utc_ms(year: int, month: int) -> int:
    d = date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1)  # last day of the month
    d -= timedelta(days=(d.weekday() + 1) % 7)  # back to Sunday
    return int(datetime(d.year, d.month, d.day, 1, tzinfo=timezone.utc).timestamp() * 1000)


def offset_ms(utc_ms: int) -> int:
    year = datetime.fromtimestamp(utc_ms / 1000, tz=timezone.utc).year
    summer = _last_sunday_utc_ms(year, 3) <= utc_ms < _last_sunday_utc_ms(year, 10)
    return (2 if summer else 1) * HOUR


def parts(utc_ms: int) -> dict:
    local = datetime.fromtimestamp((utc_ms + offset_ms(utc_ms)) / 1000, tz=timezone.utc)
    return {'y': local.year, 'm': local.month - 1, 'd': local.day, 'dow': local.weekday()}


def midnight(y: int, m: int, d: int) -> int:
    """UTC ms of 00:00 Zurich time on a calendar date. m is 0-based; m and d may overflow."""
    day = date(y + m // 12, m % 12 + 1, 1) + timedelta(days=d - 1)
    naive = int(datetime(day.year, day.month, day.day, tzinfo=timezone.utc).timestamp() * 1000)
    return naive - offset_ms(naive - offset_ms(naive))


def start_of_day(ts: int) -> int:
    p = parts(ts)
    return midnight(p['y'], p['m'], p['d'])


def week_start(ts: int, offset: int = 0) -> int:
    p = parts(ts)
    return midnight(p['y'], p['m'], p['d'] - p['dow'] + 7 * offset)


def month_start(ts: int, offset: int = 0) -> int:
    p = parts(ts)
    return midnight(p['y'], p['m'] + offset, 1)


def period_range(kind: str, offset: int, now: int) -> dict:
    if kind == 'week':
        start, end = week_start(now, offset), week_start(now, offset + 1)
        return {'kind': kind, 'key': f'w{start}', 'start': start, 'end': end}
    start, end = month_start(now, offset), month_start(now, offset + 1)
    p = parts(start)
    return {'kind': kind, 'key': f"m{p['y']}-{p['m']}", 'start': start, 'end': end}
