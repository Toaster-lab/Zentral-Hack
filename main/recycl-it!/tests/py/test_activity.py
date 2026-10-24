"""Server-enforced logging: limits, duplicates, idempotency, evidence labels, pending review, appeals, receipts."""
import pytest

from conftest import E, World, code_of, make_receipt
from server import rules
from server.auth import ApiError


def test_a_valid_log_is_credited_by_the_server(world):
    p = world.person()
    out = world.log(p, [E('glass', 4), E('pet', 2)])
    assert out['status'] == 'counted' and out['accepted'] == 6 and out['points'] == 30
    assert out['verification'] == 'self-reported' and out['evidence'] == 'self'
    assert world.balance(p) == 30


def test_quantity_limit_is_enforced_per_material(world):
    p = world.person()
    assert code_of(world.log, p, [E('glass', 51)]) == 'too_many_per_log'
    assert world.balance(p) == 0
    assert world.log(p, [E('glass', 50)])['accepted'] == 50


@pytest.mark.parametrize('entries,code', [([E('glass', 0)], 'no_items'), ([E('glass', -3)], 'no_items'), ([E('residual', 2)], 'not_countable'),
                                           ([E('glass', 1.5)], 'not_integer'), ([E('glass', 1), E('glass', 2)], 'duplicate_material'), ([], 'no_items')])
def test_bad_quantities_are_refused(world, entries, code):
    p = world.person()
    assert code_of(world.log, p, entries) == code


def test_daily_log_limit_resets_at_zurich_midnight(demo):
    p = demo.person()
    for m in sorted(rules.COUNTABLE):
        for n in (1, 2):                                   # 10 materials x 2 counts: 20 distinct small logs
            demo.log(p, [E(m, n)])
    assert code_of(demo.log, p, [E('glass', 2)]) == 'daily_logs'
    demo.advance(hours=12)  # 00:00 the next morning in Zurich
    assert demo.log(p, [E('glass', 2)])['status'] == 'counted'


def test_daily_item_cap_trims_the_last_log(demo):
    p = demo.person()
    for m in ('paper', 'glass', 'pet'):
        demo.log(p, [E(m, 48)])
    out = demo.log(p, [E('tin', 20)])
    assert out['accepted'] == 6 and out['capped'] is True
    assert code_of(demo.log, p, [E('battery', 1)]) == 'daily_items'


def test_duplicates_are_blocked_for_ten_minutes(demo):
    p = demo.person()
    demo.log(p, [E('glass', 3)])
    demo.advance(minutes=9)
    assert code_of(demo.log, p, [E('glass', 3)]) == 'duplicate'
    demo.advance(minutes=2)
    assert demo.log(p, [E('glass', 3)])['status'] == 'counted'


def test_a_retry_with_the_same_key_never_credits_twice(world):
    p = world.person()
    key = world.key()
    first = world.log(p, [E('glass', 4)], key=key)
    again = world.svc.submit_activity(p.user, {'idemKey': key, 'kind': 'log', 'entries': [E('glass', 4)]})  # no confirmation needed for a replay
    assert again['id'] == first['id'] and again['replayed'] is True
    assert world.balance(p) == 20
    assert len(world.svc.state(p.user)['activities']) == 1


def test_reusing_a_key_for_different_items_is_a_conflict(demo):
    p = demo.person()
    key = demo.key()
    demo.log(p, [E('glass', 4)], key=key)
    assert code_of(demo.svc.submit_activity, p.user, {'idemKey': key, 'kind': 'log', 'entries': [E('pet', 9)]}) == 'key_reused'


def test_keys_are_per_person(demo):
    a, b = demo.person(), demo.person()
    key = demo.key()
    demo.log(a, [E('glass', 4)], key=key)
    assert demo.log(b, [E('glass', 4)], key=key)['replayed'] is False


def test_client_supplied_credit_fields_are_ignored(demo):
    p = demo.person()
    key = demo.key()
    cid = demo.confirm(p, 'activity', [key])
    out = demo.svc.submit_activity(p.user, {'idemKey': key, 'kind': 'log', 'entries': [E('glass', 2)], 'confirmationId': cid,
                                            'points': 9999, 'verification': 'verified', 'evidence': 'partner', 'status': 'counted', 'ts': 1, 'balance': 1e6, 'authenticated': True})
    assert (out['points'], out['verification'], out['evidence']) == (10, 'self-reported', 'self')
    assert out['ts'] == demo.t


def test_submitting_needs_a_fresh_confirmation(world):
    p = world.person()
    key = world.key()
    assert code_of(world.svc.submit_activity, p.user, {'idemKey': key, 'kind': 'log', 'entries': [E('glass', 2)]}) == 'confirmation_required'
    cid = world.confirm(p, 'activity', [key])
    assert world.svc.submit_activity(p.user, {'idemKey': key, 'kind': 'log', 'entries': [E('glass', 2)], 'confirmationId': cid})['status'] == 'counted'
    other = world.key()  # the same confirmation cannot be used for a different submission
    assert code_of(world.svc.submit_activity, p.user, {'idemKey': other, 'kind': 'log', 'entries': [E('pet', 2)], 'confirmationId': cid}) == 'confirmation_required'


def test_a_confirmation_for_redeeming_cannot_log(demo):
    p = demo.person()
    key = demo.key()
    cid = demo.confirm(p, 'redeem', [key])
    assert code_of(demo.svc.submit_activity, p.user, {'idemKey': key, 'kind': 'log', 'entries': [E('glass', 2)], 'confirmationId': cid}) == 'confirmation_required'


def test_confirmations_expire(demo):
    p = demo.person()
    key = demo.key()
    cid = demo.confirm(p, 'activity', [key])
    demo.advance(minutes=3)
    assert code_of(demo.svc.submit_activity, p.user, {'idemKey': key, 'kind': 'log', 'entries': [E('glass', 2)], 'confirmationId': cid}) == 'confirmation_expired'


def test_a_failed_attempt_does_not_use_up_the_confirmation(demo):
    p = demo.person()
    key = demo.key()
    cid = demo.confirm(p, 'activity', [key])
    bad = {'idemKey': key, 'kind': 'log', 'entries': [E('glass', 99)], 'confirmationId': cid}
    assert code_of(demo.svc.submit_activity, p.user, bad) == 'too_many_per_log'
    assert demo.svc.submit_activity(p.user, {**bad, 'entries': [E('glass', 5)]})['status'] == 'counted'


def test_one_confirmation_can_cover_a_batch_of_queued_submissions(demo):
    p = demo.person()
    keys = [demo.key(), demo.key()]
    cid = demo.confirm(p, 'activity', keys)
    for k, m in zip(keys, ('glass', 'pet')):
        assert demo.svc.submit_activity(p.user, {'idemKey': k, 'kind': 'log', 'entries': [E(m, 2)], 'confirmationId': cid})['status'] == 'counted'


def test_expired_offline_submissions_are_rejected(demo):
    p = demo.person()
    key = demo.key()
    cid = demo.confirm(p, 'activity', [key])
    old = demo.t - 4 * 24 * 3_600_000
    assert code_of(demo.svc.submit_activity, p.user, {'idemKey': key, 'kind': 'log', 'entries': [E('glass', 2)], 'confirmationId': cid, 'queuedAt': old}) == 'expired'
    fresh = demo.t - 2 * 3_600_000
    out = demo.svc.submit_activity(p.user, {'idemKey': key, 'kind': 'log', 'entries': [E('glass', 2)], 'confirmationId': cid, 'queuedAt': fresh})
    assert out['ts'] == demo.t  # credited at server time, not the time the phone says


# ---- receipts -----------------------------------------------------------------------------

def test_demo_receipts_work_only_in_demo_mode(demo, live):
    p = demo.person()
    out = demo.log(p, [E('glass', 2)], receiptCode='BC-1001-ZH')
    assert out['verification'] == 'verified' and out['points'] == 14
    assert code_of(demo.log, p, [E('pet', 2)], receiptCode='BC-1001-ZH') == 'receipt_used'
    q = live.person()
    assert code_of(live.log, q, [E('glass', 2)], receiptCode='BC-1001-ZH') == 'receipt_invalid'
    assert live.balance(q) == 0


def test_live_receipts_need_the_trusted_signature(live):
    p = live.person()
    assert code_of(live.log, p, [E('glass', 2)], receiptCode='BCR.eyJpZCI6IngifQ.AAAAAAAAAAAAAAAAAAAAAA') == 'receipt_invalid'
    good = make_receipt('abc')
    out = live.log(p, [E('glass', 2)], receiptCode=good)
    assert out['verification'] == 'verified'
    assert code_of(live.log, p, [E('pet', 3)], receiptCode=good) == 'receipt_used'
    expired = make_receipt('old', exp=live.t - 1000)
    assert code_of(live.log, p, [E('tin', 3)], receiptCode=expired) == 'receipt_invalid'


def test_live_receipts_are_refused_when_no_issuer_is_configured():
    w = World('live')
    w.settings.receipt_secret = ''
    p = w.person()
    assert code_of(w.log, p, [E('glass', 2)], receiptCode=make_receipt('abc')) == 'receipt_invalid'


# ---- check-ins, evidence and review ---------------------------------------------------------

def test_a_nearby_checkin_is_labelled_location_checked_but_never_verified(world):
    p = world.person()
    out = world.checkin(p, [E('pet', 3)], location='near')
    assert out['status'] == 'counted' and out['evidence'] == 'location' and out['verification'] == 'self-reported'
    world.advance(minutes=45)
    out2 = world.checkin(p, [E('aluminium', 2)], location='inaccurate')
    assert out2['evidence'] == 'self' and out2['status'] == 'counted'


def test_unknown_stations_are_refused(demo):
    p = demo.person()
    assert code_of(demo.checkin, p, [E('glass', 2)], station='nowhere') == 'unknown_station'


def test_a_flagged_checkin_stays_pending_and_earns_nothing(demo):
    p = demo.person()
    out = demo.checkin(p, [E('pet', 3)], location='far')
    assert out['status'] == 'review' and 'far' in out['flags'] and out['points'] == 0
    state = demo.svc.state(p.user)
    assert state['balance'] == 0 and state['activities'] == []
    assert demo.svc.leaderboard(p.user, 'week', 0)['rows'] == []


def test_pending_checkins_reserve_daily_capacity(demo):
    p = demo.person()
    demo.checkin(p, [E('aluminium', 50)], location='far')
    demo.checkin(p, [E('pet', 50)], location='far')
    demo.checkin(p, [E('pet', 49)], location='far')
    out = demo.log(p, [E('tin', 5)])
    assert out['accepted'] == 1 and out['capped'] is True          # 149 of 150 are already spoken for


def test_appeal_then_approval_credits_once(demo):
    p = demo.person()
    sub = demo.checkin(p, [E('pet', 3)], location='far')
    appealed = demo.svc.appeal(p.user, sub['id'], 'Poor GPS between buildings\x00')
    assert appealed['status'] == 'appealed' and appealed['note'] == 'Poor GPS between buildings'
    assert demo.svc.review_queue()[0]['id'] == sub['id']
    done = demo.svc.decide(sub['id'], True, 'reviewer')
    assert done['status'] == 'counted' and done['points'] == 15
    assert demo.balance(p) == 15
    assert code_of(demo.svc.decide, sub['id'], True, 'reviewer') == 'nothing_to_review'  # cannot be approved twice
    assert demo.balance(p) == 15


def test_decline_and_withdraw_never_credit(demo):
    p = demo.person()
    a = demo.checkin(p, [E('pet', 3)], location='far')
    demo.advance(minutes=20)
    b = demo.checkin(p, [E('aluminium', 3)], location='far')
    assert demo.svc.decide(a['id'], False, 'reviewer', 'Photo reused')['note'] == 'Photo reused'
    assert demo.svc.withdraw(p.user, b['id'])['status'] == 'withdrawn'
    assert demo.balance(p) == 0
    assert code_of(demo.svc.appeal, p.user, a['id'], 'late') == 'nothing_to_appeal'


def test_people_cannot_appeal_or_withdraw_each_others_checkins(demo):
    a, b = demo.person(), demo.person()
    sub = demo.checkin(a, [E('pet', 3)], location='far')
    assert code_of(demo.svc.appeal, b.user, sub['id'], 'mine') == 'nothing_to_appeal'
    assert code_of(demo.svc.withdraw, b.user, sub['id']) == 'nothing_to_withdraw'
