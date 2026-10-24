"""Points, redemption (no double spending), eligibility, leaderboards in Zurich time, quests."""
import threading

import pytest

from conftest import E, World, code_of, make_receipt, zms
from server import rules, zurich


def earn(w, p, points):
    """Give a person `points` by logging items (5 points each) on separate materials/days as needed."""
    mats = ['glass', 'pet', 'paper', 'tin', 'aluminium', 'cardboard', 'battery', 'textile']
    n = points // 5
    i = 0
    while n > 0:
        take = min(n, 50)
        w.log(p, [E(mats[i % len(mats)], take)])
        n -= take
        i += 1
        if i % 3 == 0:
            w.advance(hours=13)  # spread over days so the daily cap isn't hit


def test_redeeming_deducts_points_and_is_remembered(world):
    p = world.person()
    earn(world, p, 50)
    out = world.redeem(p, 'badge-glass')
    assert out['balance'] == 0 and out['cost'] == 50 and out['code'] is None
    state = world.svc.state(p.user)
    assert state['balance'] == 0 and [r['rewardId'] for r in state['redemptions']] == ['badge-glass']
    assert [l['points'] for l in state['ledger']][:2] == [-50, 50]


def test_insufficient_balance_is_refused_and_changes_nothing(world):
    p = world.person()
    earn(world, p, 45)
    assert code_of(world.redeem, p, 'badge-glass') == 'insufficient_points'
    assert world.balance(p) == 45


def test_one_off_badges_cannot_be_bought_twice(demo):
    p = demo.person()
    earn(demo, p, 100)
    demo.redeem(p, 'badge-glass')
    assert code_of(demo.redeem, p, 'badge-glass') == 'already_owned'
    assert demo.balance(p) == 50


def test_retrying_a_redemption_with_the_same_key_charges_once(world):
    p = world.person()
    earn(world, p, 120)
    key = world.key()
    first = world.redeem(p, 'badge-glass', key=key)
    again = world.svc.redeem(p.user, {'idemKey': key, 'rewardId': 'badge-glass'})
    assert again['id'] == first['id'] and again['replayed'] is True
    assert world.balance(p) == 70


def test_redeeming_needs_its_own_confirmation(demo):
    p = demo.person()
    earn(demo, p, 60)
    key = demo.key()
    assert code_of(demo.svc.redeem, p.user, {'idemKey': key, 'rewardId': 'badge-glass'}) == 'confirmation_required'
    log_key = demo.key()
    cid = demo.confirm(p, 'activity', [log_key])           # a "log" confirmation must not unlock spending
    assert code_of(demo.svc.redeem, p.user, {'idemKey': key, 'rewardId': 'badge-glass', 'confirmationId': cid}) == 'confirmation_required'
    assert demo.balance(p) == 60


def test_vouchers_need_verified_items_not_just_points(live):
    p = live.person()
    earn(live, p, 400)                                     # plenty of points, all self-reported
    assert code_of(live.redeem, p, 'voucher-cafe') == 'not_eligible'
    assert live.balance(p) == 400
    live.log(p, [E('cardboard', 5)], receiptCode=make_receipt('v1'))   # 5 verified items
    out = live.redeem(p, 'voucher-cafe')
    assert out['code'].startswith('DEMO-') and out['balance'] == 400 + 35 - 300


def test_concurrent_redemptions_cannot_overspend(tmp_path):
    w = World('demo', db_path=str(tmp_path / 'race.db'))
    p = w.person()
    earn(w, p, 100)                                        # exactly enough for two badges at 50
    rewards = ['badge-glass', 'badge-pet', 'badge-mapper', 'badge-hero']
    prepared = []
    for r in rewards * 2:
        k = w.key()
        prepared.append((r, k, w.confirm(p, 'redeem', [k])))
    results, barrier = [], threading.Barrier(len(prepared))

    def go(r, k, cid):
        barrier.wait()
        try:
            w.svc.redeem(p.user, {'idemKey': k, 'rewardId': r, 'confirmationId': cid})
            results.append('ok')
        except Exception as e:  # noqa: BLE001
            results.append(getattr(e, 'code', repr(e)))

    threads = [threading.Thread(target=go, args=a) for a in prepared]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert results.count('ok') <= 2, results
    assert w.balance(p) >= 0
    spent = sum(r['cost'] for r in w.svc.state(p.user)['redemptions'])
    assert w.balance(p) == 100 - spent


def test_the_same_key_sent_twice_at_once_is_one_redemption(tmp_path):
    w = World('demo', db_path=str(tmp_path / 'dup.db'))
    p = w.person()
    earn(w, p, 100)
    k = w.key()
    cid = w.confirm(p, 'redeem', [k])
    out, barrier = [], threading.Barrier(4)

    def go():
        barrier.wait()
        try:
            out.append(w.svc.redeem(p.user, {'idemKey': k, 'rewardId': 'badge-glass', 'confirmationId': cid})['id'])
        except Exception as e:  # noqa: BLE001
            out.append(getattr(e, 'code', repr(e)))

    ts = [threading.Thread(target=go) for _ in range(4)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert len({o for o in out if o.startswith('r_')}) == 1, out
    assert w.balance(p) == 50


# ---- leaderboard ------------------------------------------------------------------------------

def opted_in(w, nickname):
    p = w.person()
    w.svc.update_profile(p.user, {'nickname': nickname, 'leaderboardOptIn': True})
    p.user = w.svc.db.conn().execute('SELECT * FROM users WHERE id=?', (p.id,)).fetchone()
    return p


def board(w, p, kind='week', offset=0):
    return {r['nickname']: r['items'] for r in w.svc.leaderboard(dict(p.user), kind, offset)['rows']}


def test_only_opted_in_people_appear_and_counts_come_from_the_server(demo):
    a, b = opted_in(demo, 'MintyMarta'), demo.person()
    demo.log(a, [E('glass', 7)])
    demo.log(b, [E('glass', 9)])
    assert board(demo, a) == {'MintyMarta': 7}


def test_nicknames_are_unique_and_validated(demo):
    opted_in(demo, 'MintyMarta')
    other = demo.person()
    assert code_of(demo.svc.update_profile, other.user, {'nickname': 'mintymarta', 'leaderboardOptIn': True}) == 'nickname_taken'
    assert code_of(demo.svc.update_profile, other.user, {'nickname': 'me@example.com'}) == 'bad_nickname'
    assert code_of(demo.svc.update_profile, other.user, {'leaderboardOptIn': True}) == 'bad_nickname'


def test_weekly_boundary_is_monday_midnight_zurich(demo):
    p = opted_in(demo, 'WeekWalker')
    demo.t = zms(2026, 10, 25, 23, 59)     # Sunday night
    demo.log(p, [E('glass', 3)])
    demo.t = zms(2026, 10, 26, 0, 0)       # Monday 00:00 — a new week, and the clocks went back the night before
    demo.log(p, [E('pet', 4)])
    assert board(demo, p, 'week', 0) == {'WeekWalker': 4}
    assert board(demo, p, 'week', -1) == {'WeekWalker': 3}


def test_monthly_boundary_and_year_end(demo):
    p = opted_in(demo, 'MonthMo')
    demo.t = zms(2026, 12, 31, 23, 59)
    demo.log(p, [E('glass', 3)])
    demo.t = zms(2027, 1, 1, 0, 0)
    demo.log(p, [E('pet', 4)])
    assert board(demo, p, 'month', 0) == {'MonthMo': 4}
    assert board(demo, p, 'month', -1) == {'MonthMo': 3}


def test_the_spring_forward_week_is_one_hour_short_but_still_one_week(demo):
    p = opted_in(demo, 'SpringSam')
    demo.t = zms(2026, 3, 29, 1, 59)       # last minute of winter time
    demo.log(p, [E('glass', 2)])
    demo.t = zms(2026, 3, 29, 3, 0)        # summer time already; same Zurich week
    demo.log(p, [E('pet', 3)])
    demo.t = zms(2026, 3, 30, 0, 0)        # next Monday
    demo.log(p, [E('tin', 6)])
    assert board(demo, p, 'week', 0) == {'SpringSam': 6}
    assert board(demo, p, 'week', -1) == {'SpringSam': 5}


def test_the_autumn_week_is_an_hour_long_and_late_sunday_stays_in_the_old_week(demo):
    p = opted_in(demo, 'AutumnAnn')
    demo.t = zms(2026, 10, 25, 23, 30)     # Sunday 23:30 CET, the extra hour already passed
    demo.log(p, [E('glass', 2)])
    demo.t = zms(2026, 10, 26, 0, 1)
    demo.log(p, [E('pet', 3)])
    assert board(demo, p, 'week', 0) == {'AutumnAnn': 3}
    assert board(demo, p, 'week', -1) == {'AutumnAnn': 2}


def test_verified_counts_are_reported_separately(live):
    p = opted_in(live, 'ReceiptRay')
    live.log(p, [E('glass', 2)], receiptCode=make_receipt('lb1'))
    live.log(p, [E('pet', 3)])
    row = live.svc.leaderboard(dict(p.user), 'week', 0)['rows'][0]
    assert (row['items'], row['verified']) == (5, 2)


def test_redeeming_never_changes_the_leaderboard(demo):
    p = opted_in(demo, 'SpendySue')
    earn(demo, p, 100)
    before = board(demo, p, 'month')
    demo.redeem(p, 'badge-glass')
    assert board(demo, p, 'month') == before


# ---- quests ------------------------------------------------------------------------------------

def test_quests_can_be_claimed_only_once(demo):
    p = demo.person()
    demo.log(p, [E('glass', 25)])
    q = {x['id']: x for x in demo.svc.quests(p.user)['quests']}['items']
    assert q['progress'] == 25 and not q['claimed']
    out = demo.svc.claim_quest(p.user, q['claimId'])
    assert out['points'] == 30 and out['balance'] == 125 + 30
    assert code_of(demo.svc.claim_quest, p.user, q['claimId']) == 'already_claimed'
    assert demo.balance(p) == 155


def test_an_unfinished_quest_cannot_be_claimed(demo):
    p = demo.person()
    demo.log(p, [E('glass', 24)])
    key = demo.svc.quests(p.user)['quests'][0]['claimId']
    assert code_of(demo.svc.claim_quest, p.user, key) == 'not_done'
    assert code_of(demo.svc.claim_quest, p.user, 'm2026-8:items') == 'bad_claim'       # last month
    assert code_of(demo.svc.claim_quest, p.user, 'm2026-9:scans') == 'bad_claim'       # device-only quests can't be claimed here


def test_pending_activity_does_not_complete_a_quest(demo):
    p = demo.person()
    demo.checkin(p, [E('glass', 30)], location='far')
    assert {x['id']: x for x in demo.svc.quests(p.user)['quests']}['items']['progress'] == 0


def test_a_new_month_offers_the_quest_again(demo):
    p = demo.person()
    demo.log(p, [E('glass', 25)])
    first = {x['id']: x for x in demo.svc.quests(p.user)['quests']}['items']['claimId']
    demo.svc.claim_quest(p.user, first)
    demo.t = zms(2026, 11, 2, 12)
    demo.log(p, [E('pet', 25)])
    second = {x['id']: x for x in demo.svc.quests(p.user)['quests']}['items']
    assert second['claimId'] != first and not second['claimed'] and second['progress'] == 25


def test_rewards_catalogue_matches_the_apps_own_list():
    import json
    import re
    from conftest import ROOT
    js = (ROOT / 'js' / 'data' / 'misc.js').read_text(encoding='utf-8')
    app = {m.group(1): (int(m.group(2)), int(m.group(3) or 0)) for m in re.finditer(r"id: '([\w-]+)'.*?cost: (\d+)(?:, needsVerifiedItems: (\d+))?", js)}
    server = {r['id']: (r['cost'], r.get('needsVerifiedItems', 0)) for r in json.loads((ROOT / 'server' / 'data' / 'rewards.json').read_text(encoding='utf-8'))}
    assert app == server
