"""Regenerates tests/fixtures/*.json. Needs `pip install tzdata` on Windows.

zurich.json is computed from the IANA time-zone database (zoneinfo), independently of both the Python
(server/zurich.py) and JavaScript (js/logic/zurich.js) implementations that are tested against it.
rules.json holds hand-written recycling-rule cases that both implementations must agree on.
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ZH = ZoneInfo('Europe/Zurich')
OUT = Path(__file__).resolve().parent.parent / 'fixtures'


def ms(dt):
    return int(dt.timestamp() * 1000)


def z(y, m, d, h=0, mi=0):
    return ms(datetime(y, m, d, h, mi, tzinfo=ZH))


def midnight(date):
    return ms(datetime(date.year, date.month, date.day, tzinfo=ZH))


def expectations(t):
    local = datetime.fromtimestamp(t / 1000, tz=timezone.utc).astimezone(ZH)
    d = local.date()
    wk = d - timedelta(days=d.weekday())
    first = d.replace(day=1)
    nm = (first + timedelta(days=32)).replace(day=1)
    pm = (first - timedelta(days=1)).replace(day=1)
    return {
        'ts': t, 'local': local.isoformat(), 'dayStart': midnight(d), 'weekStart': midnight(wk), 'nextWeekStart': midnight(wk + timedelta(days=7)),
        'prevWeekStart': midnight(wk - timedelta(days=7)), 'monthStart': midnight(first), 'nextMonthStart': midnight(nm), 'prevMonthStart': midnight(pm),
    }


def zurich_cases():
    instants = [
        z(2026, 10, 24, 12),                 # an ordinary Saturday, summer time
        z(2026, 3, 29, 1, 59),               # last minute of winter time (clocks go forward at 02:00)
        z(2026, 3, 29, 3, 0),                # first hour of summer time
        z(2026, 3, 28, 23, 59), z(2026, 3, 30, 0, 0),
        z(2026, 10, 25, 1, 30),              # clocks go back at 03:00: this is the first 02:30
        z(2026, 10, 25, 23, 59), z(2026, 10, 26, 0, 0),
        z(2025, 10, 26, 12), z(2025, 3, 30, 12),
        z(2026, 12, 31, 23, 59), z(2027, 1, 1, 0, 0),   # year boundary (also a Thursday/Friday)
        z(2026, 2, 28, 23, 59), z(2026, 3, 1, 0, 0),
        z(2026, 1, 5, 0, 0), z(2026, 1, 4, 23, 59),      # Monday 00:00 and the Sunday minute before it
        z(2026, 9, 30, 23, 59), z(2026, 10, 1, 0, 0),
        ms(datetime(2026, 3, 28, 23, 0, tzinfo=timezone.utc)),   # exactly local midnight on 29 Mar
        ms(datetime(2026, 10, 24, 22, 0, tzinfo=timezone.utc)),  # exactly local midnight on 25 Oct
    ]
    return [expectations(t) for t in instants]


E = lambda material, count: {'material': material, 'count': count}  # noqa: E731
NOW = z(2026, 10, 24, 12)


def past(minutes=0, hours=0):
    return NOW - minutes * 60_000 - hours * 3_600_000


def h(ts, material, count, accepted=None, batch='b1'):
    return {'ts': ts, 'material': material, 'count': count, 'accepted': count if accepted is None else accepted, 'batchId': batch}


MATS = ['glass', 'pet', 'plastic_bottle', 'aluminium', 'tin', 'paper', 'cardboard', 'battery', 'textile', 'electronics']


def small_logs(n):
    # n distinct small logs earlier today (each material twice at most, different counts): no duplicates, far below the item cap
    return [h(past(minutes=30 + i), MATS[i % 10], 1 + i // 10, batch=f'b{i}') for i in range(n)]


def rules_cases():
    cases = [
        ('one valid line', NOW, [], [E('glass', 3)], True, None, 3),
        ('exactly the per-log limit is fine', NOW, [], [E('glass', 50)], True, None, 50),
        ('one over the per-log limit is refused', NOW, [], [E('glass', 51)], False, 'too_many_per_log', None),
        ('zero items', NOW, [], [E('glass', 0)], False, 'no_items', None),
        ('no material chosen', NOW, [], [{'material': None, 'count': 2}], False, 'no_items', None),
        ('fractions are refused', NOW, [], [E('glass', 1.5)], False, 'not_integer', None),
        ('household waste is not countable', NOW, [], [E('residual', 2)], False, 'not_countable', None),
        ('the same material twice in one log', NOW, [], [E('glass', 1), E('glass', 2)], False, 'duplicate_material', None),
        ('same material and count 9 minutes ago is a duplicate', NOW, [h(past(9), 'glass', 3)], [E('glass', 3)], False, 'duplicate', None),
        ('exactly 10 minutes ago still counts as a duplicate', NOW, [h(past(10), 'glass', 3)], [E('glass', 3)], False, 'duplicate', None),
        ('11 minutes ago is fine', NOW, [h(past(11), 'glass', 3)], [E('glass', 3)], True, None, 3),
        ('different count is not a duplicate', NOW, [h(past(2), 'glass', 3)], [E('glass', 4)], True, None, 4),
        ('different material is not a duplicate', NOW, [h(past(2), 'glass', 3)], [E('pet', 3)], True, None, 3),
        ('20 logs already today blocks the 21st', NOW, small_logs(20), [E('glass', 2)], False, 'daily_logs', None),
        ('19 logs today still allows one more', NOW, small_logs(19), [E('glass', 2)], True, None, 2),
        ('daily item cap reached', NOW, [h(past(hours=3), 'paper', 50, batch='x1'), h(past(hours=4), 'glass', 50, batch='x2'), h(past(hours=5), 'pet', 50, batch='x3')], [E('tin', 1)], False, 'daily_items', None),
        ('only part of a log fits under the daily cap', NOW, [h(past(hours=3), 'paper', 50, batch='x1'), h(past(hours=4), 'glass', 50, batch='x2'), h(past(hours=5), 'pet', 40, batch='x3')], [E('tin', 20)], True, None, 10),
        ('yesterday before Zurich midnight does not count towards today', z(2026, 10, 24, 0, 30),
         [h(z(2026, 10, 23, 23, 50) - 11 * 60_000, 'paper', 50, batch='y1'), h(z(2026, 10, 23, 22, 0), 'glass', 50, batch='y2'), h(z(2026, 10, 23, 21, 0), 'pet', 50, batch='y3')],
         [E('tin', 5)], True, None, 5),
        ('summer-time midnight: 23:30 the day before is yesterday', z(2026, 3, 29, 0, 10), [h(z(2026, 3, 28, 23, 30), 'paper', 50, batch='z1'), h(z(2026, 3, 28, 22, 30), 'glass', 50, batch='z2'), h(z(2026, 3, 28, 21, 30), 'pet', 50, batch='z3')], [E('tin', 5)], True, None, 5),
    ]
    out = []
    for name, now, history, entries, ok, code, accepted in cases:
        out.append({'name': name, 'now': now, 'history': history, 'entries': entries, 'expect': {'ok': ok, 'code': code, 'accepted': accepted}})
    return out


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'zurich.json').write_text(json.dumps(zurich_cases(), indent=1) + '\n')
    (OUT / 'rules.json').write_text(json.dumps(rules_cases(), indent=1) + '\n')
    print('fixtures written to', OUT)
