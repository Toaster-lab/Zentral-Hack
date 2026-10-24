"""Pure rules and Zurich time, checked against fixtures shared with the JavaScript tests."""
import json

import pytest

from conftest import FIXTURES, zms
from server import rules, zurich

ZURICH = json.loads((FIXTURES / 'zurich.json').read_text())
RULES = json.loads((FIXTURES / 'rules.json').read_text())


@pytest.mark.parametrize('c', ZURICH, ids=lambda c: c['local'])
def test_zurich_boundaries_match_the_iana_database(c):
    t = c['ts']
    assert zurich.start_of_day(t) == c['dayStart']
    assert zurich.week_start(t) == c['weekStart']
    assert zurich.week_start(t, 1) == c['nextWeekStart']
    assert zurich.week_start(t, -1) == c['prevWeekStart']
    assert zurich.month_start(t) == c['monthStart']
    assert zurich.month_start(t, 1) == c['nextMonthStart']
    assert zurich.month_start(t, -1) == c['prevMonthStart']


def test_weeks_are_23_or_25_hours_longer_or_shorter_across_clock_changes():
    spring = zurich.week_start(zms(2026, 3, 29, 12), 1) - zurich.week_start(zms(2026, 3, 29, 12))
    autumn = zurich.week_start(zms(2026, 10, 25, 12), 1) - zurich.week_start(zms(2026, 10, 25, 12))
    assert spring == 7 * 24 * 3_600_000 - 3_600_000
    assert autumn == 7 * 24 * 3_600_000 + 3_600_000


@pytest.mark.parametrize('case', RULES, ids=lambda c: c['name'])
def test_log_rules(case):
    history = [{**h, 'batch_id': h['batchId']} for h in case['history']]
    res = rules.evaluate_log(history, case['entries'], case['now'])
    want = case['expect']
    assert res['ok'] is want['ok']
    if want['code']:
        assert res['code'] == want['code']
    if want['accepted'] is not None:
        assert res['accepted'] == want['accepted']


def test_points_use_the_bonus_only_for_verified_items():
    assert rules.points_for(10, False) == 50
    assert rules.points_for(10, True) == 70


def test_review_flags_describe_signals_not_verdicts():
    now = zms(2026, 10, 24, 12)
    base = {'ts': now, 'started_at': now - 60_000, 'station_id': 'a', 'at': {'lat': 47.14, 'lng': 8.43}, 'entries': [{'material': 'glass', 'count': 2}], 'fp': None, 'location_result': 'near'}
    assert rules.review_flags([], base) == []
    assert 'large' in rules.review_flags([], {**base, 'entries': [{'material': 'glass', 'count': 40}]})
    assert 'far' in rules.review_flags([], {**base, 'location_result': 'far'})
    assert 'inaccurate' not in rules.review_flags([], {**base, 'location_result': 'inaccurate'})  # poor GPS is not a signal
    prior = [{'status': 'counted', 'ts': now - 5 * 60_000, 'started_at': now - 6 * 60_000, 'station_id': 'a', 'at': base['at'], 'fp': None}] * 2
    assert 'rapid' in rules.review_flags(prior, base)
    declined = [{**p, 'status': 'declined'} for p in prior]
    assert rules.review_flags(declined, base) == []
    far_prev = [{'status': 'counted', 'ts': now - 10 * 60_000, 'started_at': now - 11 * 60_000, 'station_id': 'b', 'at': {'lat': 47.5, 'lng': 8.9}, 'fp': None}]
    assert 'travel' in rules.review_flags(far_prev, base)
    photo = [{'status': 'counted', 'ts': now - 3 * 3_600_000, 'started_at': now - 3 * 3_600_000, 'station_id': 'a', 'at': base['at'], 'fp': 'ffff0000ffff0000'}]
    assert 'dupe_photo' in rules.review_flags(photo, {**base, 'fp': 'ffff0000ffff0001'})
