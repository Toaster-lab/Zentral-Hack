"""The RECYCL IT! server in live mode: accounts are passkeys the server verifies, and the server decides what counts."""
import json
import sys
import time

import pytest
from playwright.sync_api import expect

from conftest import FAR, NEAR, RECEIPT_SECRET, ROOT
from helpers import admin_decide, admin_queue, dialog, do_checkin, log_items, page_state, pass_intro_if_shown, sign_up, start_log, wait_for_worker

sys.path.insert(0, str(ROOT))
from server import receipts  # noqa: E402


def server_balance(page):
    return page_state(page)['balance']


def test_sign_up_log_and_the_server_holds_the_truth(make_page, live_app):
    page = make_page()
    sign_up(page, live_app)
    assert len(page.authn.credentials()) == 1
    page.goto(live_app.url)
    done = log_items(page, 'Glass', 4)
    expect(done).to_contain_text('+20 points')
    assert server_balance(page) == 20
    # Signed in across a reload, with the balance coming from the server.
    page.reload()
    page.goto(live_app.url + '#/rewards')
    expect(page.locator('.points-block .stat')).to_have_text('20')
    # Editing the local copy does nothing: the next sync replaces it with what the server holds.
    page.evaluate("""() => { const k = Object.keys(localStorage).find((x) => x.startsWith('bubblecycle:live')); const s = JSON.parse(localStorage[k]); s.serverBalance = 99999; localStorage[k] = JSON.stringify(s); }""")
    page.reload()
    page.goto(live_app.url + '#/rewards')
    expect(page.locator('.points-block .stat')).to_have_text('20')
    assert page.errors == []


def test_cancelled_authentication_sends_nothing_and_keeps_the_draft(make_page, live_app):
    page = make_page()
    sign_up(page, live_app)
    page.goto(live_app.url)
    d = start_log(page, 'Glass', 6)
    page.authn.set_verified(False)
    d.get_by_role('button', name='Confirm and log it').click()
    pass_intro_if_shown(page)
    expect(d.get_by_role('alert').filter(has_text='Your entries are still here')).to_be_visible()
    expect(d.get_by_label('Number of items')).to_have_value('6')
    assert page_state(page)['activities'] == [] and server_balance(page) == 0     # the server heard nothing
    page.authn.set_verified(True)
    d.get_by_role('button', name='Try again').click()
    expect(dialog(page, 'Logged')).to_contain_text('+30 points')
    assert server_balance(page) == 30


def test_redeeming_is_confirmed_and_cannot_double_spend(make_page, live_app):
    page = make_page()
    sign_up(page, live_app)
    page.goto(live_app.url)
    log_items(page, 'Glass', 50)                                      # 250 points
    page.keyboard.press('Escape')
    page.goto(live_app.url + '#/rewards')
    expect(page.locator('.points-block .stat')).to_have_text('250')
    # Vouchers need verified items, not just points.
    voucher = page.locator('.reward-row', has_text='CHF 5')
    expect(voucher).to_contain_text('Needs 5 verified items')
    row = page.locator('.reward-row', has_text='Glass badge')
    row.get_by_role('button', name='Redeem').click()
    d = dialog(page, 'Redeem this reward?')
    page.authn.set_verified(False)
    d.get_by_role('button', name='Confirm and redeem').click()
    expect(d.get_by_role('alert').filter(has_text='Your entries are still here')).to_be_visible()
    assert server_balance(page) == 250
    page.authn.set_verified(True)
    before = page.authn.sign_count()
    d.get_by_role('button', name='Try again').click()
    expect(dialog(page, 'Redeemed')).to_be_visible()
    assert page.authn.sign_count() > before
    assert server_balance(page) == 200
    page.keyboard.press('Escape')
    # A second purchase of a one-off badge is refused by the server even if the page is bypassed.
    status = page.evaluate("""() => fetch('api/rewards/redeem', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({idemKey: 'no-confirm-123', rewardId: 'badge-pet'})}).then((r) => r.status)""")
    assert status == 403                                                # no verified confirmation: refused
    assert server_balance(page) == 200


def test_receipts_come_only_from_the_trusted_source(make_page, live_app):
    page = make_page()
    sign_up(page, live_app)
    page.goto(live_app.url)
    d = start_log(page, 'Glass', 3)
    d.get_by_label('Station receipt code').fill('BC-1001-ZH')          # a demo code
    d.get_by_role('button', name='Confirm and log it').click()
    pass_intro_if_shown(page)
    expect(d.get_by_role('alert')).to_contain_text('couldn’t verify that receipt code')
    assert server_balance(page) == 0
    d.get_by_label('Station receipt code').fill(receipts.sign(RECEIPT_SECRET, 'e2e-1'))
    d.get_by_role('button', name='Confirm and log it').click()
    done = dialog(page, 'Logged')
    expect(done).to_contain_text('Verified')
    expect(done).to_contain_text('+21 points')
    # Using it again is refused.
    page.keyboard.press('Escape')
    d = start_log(page, 'Paper', 2)
    d.get_by_label('Station receipt code').fill(receipts.sign(RECEIPT_SECRET, 'e2e-1'))
    d.get_by_role('button', name='Confirm and log it').click()
    expect(d.get_by_role('alert')).to_contain_text('already been used')


def test_a_flagged_checkin_is_pending_can_be_appealed_and_only_staff_can_approve_it(make_page, live_app):
    page = make_page(location=FAR)
    sign_up(page, live_app)
    page.goto(live_app.url)
    do_checkin(page)
    pass_intro_if_shown(page)
    expect(page.get_by_role('dialog')).to_contain_text('Held for a quick check')
    page.keyboard.press('Escape')
    assert server_balance(page) == 0
    page.goto(live_app.url + '#/activity')
    expect(page.get_by_text('Held for review')).to_be_visible()
    expect(page.get_by_text('Demo reviewer')).to_have_count(0)           # no local approval controls on server activity
    page.get_by_role('button', name='Add a note or appeal').click()
    page.get_by_label('What should the reviewer know?').fill('Poor GPS between buildings')
    page.get_by_role('button', name='Send', exact=True).click()
    queue = admin_queue(live_app)
    assert len(queue) == 1 and queue[0]['status'] == 'appealed' and queue[0]['note'] == 'Poor GPS between buildings'
    # The user's own session is not a reviewer.
    status = page.evaluate("fetch('api/admin/decide', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: '%s', approve: true})}).then((r) => r.status)" % queue[0]['id'])
    assert status == 403 and server_balance(page) == 0
    assert admin_decide(live_app, queue[0]['id'], True)['status'] == 'counted'
    page.reload()
    page.goto(live_app.url + '#/activity')
    expect(page.get_by_text('Counted')).to_be_visible()
    assert server_balance(page) == 5


def test_offline_submissions_wait_unconfirmed_then_are_rechecked_by_the_server(make_page, live_app):
    page = make_page(location=NEAR)
    sign_up(page, live_app)
    page.goto(live_app.url)
    log_items(page, 'Glass', 2)                                       # sees the intro; +10 points
    page.keyboard.press('Escape')
    page.context.set_offline(True)
    d = start_log(page, 'Paper', 3)
    d.get_by_role('button', name='Confirm and log it').click()
    saved = dialog(page, 'Saved on this device')
    expect(saved).to_contain_text('Not counted yet')                  # never shown as accepted
    page.keyboard.press('Escape')
    page.context.set_offline(False)
    page.goto(live_app.url + '#/activity')
    expect(page.get_by_text('Waiting to send')).to_be_visible()
    assert server_balance(page) == 10
    page.get_by_role('button', name='Confirm and send 1').click()
    expect(page.get_by_text('Waiting to send')).to_have_count(0)
    assert server_balance(page) == 25
    assert page_state(page)['activities'][0]['ts'] <= int(time.time() * 1000)   # credited at server time


def test_an_expired_queued_item_is_refused_with_a_clear_message(make_page, live_app):
    page = make_page()
    sign_up(page, live_app)
    page.goto(live_app.url)
    log_items(page, 'Glass', 2)
    page.keyboard.press('Escape')
    page.context.set_offline(True)
    d = start_log(page, 'Paper', 3)
    d.get_by_role('button', name='Confirm and log it').click()
    dialog(page, 'Saved on this device').wait_for()
    page.keyboard.press('Escape')
    page.context.set_offline(False)
    page.wait_for_timeout(1500)                                       # let the app's own "back online" refresh finish, so it can't overwrite the edit below
    page.evaluate("""() => { const k = Object.keys(localStorage).find((x) => x.startsWith('bubblecycle:live')); const s = JSON.parse(localStorage[k]); s.outbox[0].queuedAt -= 4 * 86400000; localStorage[k] = JSON.stringify(s); }""")
    page.reload()
    old = page.evaluate("""() => { const k = Object.keys(localStorage).find((x) => x.startsWith('bubblecycle:live')); return Date.now() - JSON.parse(localStorage[k]).outbox[0].queuedAt; }""")
    assert old > 3 * 86400000, 'the saved item should now look four days old'
    page.goto(live_app.url + '#/activity')
    page.get_by_role('button', name='Confirm and send 1').click()
    expect(page.get_by_text('Expired')).to_be_visible()
    expect(page.get_by_text('saved too long ago')).to_be_visible()
    assert server_balance(page) == 10


def test_a_lost_response_cannot_make_the_server_count_twice(make_page, live_app):
    page = make_page()
    sign_up(page, live_app)
    page.goto(live_app.url)
    log_items(page, 'Glass', 2)                                       # intro seen; +10
    page.keyboard.press('Escape')
    dropped = []

    def drop_response(route):
        if route.request.method == 'POST' and not dropped:
            route.fetch()                                              # the server receives and counts it...
            dropped.append(1)
            route.abort()                                              # ...but the phone never hears back
        else:
            route.continue_()

    page.route('**/api/activity', drop_response)
    d = start_log(page, 'Paper', 4)
    d.get_by_role('button', name='Confirm and log it').click()
    dialog(page, 'Saved on this device').wait_for()                    # looks like a network failure: saved, unconfirmed
    page.keyboard.press('Escape')
    assert server_balance(page) == 30                                  # the server did count it once
    page.unroute('**/api/activity')
    page.goto(live_app.url + '#/activity')
    page.get_by_role('button', name='Confirm and send 1').click()
    expect(page.get_by_text('Waiting to send')).to_have_count(0)
    assert server_balance(page) == 30                                  # the retry was recognised, not counted again
    assert len(page_state(page)['activities']) == 2


def test_live_mode_offers_no_demo_shortcuts(make_page, live_app):
    page = make_page()
    page.goto(live_app.url + '#/profile')
    page.get_by_role('button', name='Sign in or create an account').click()
    d = dialog(page, 'Your account')
    expect(d.get_by_role('button', name='Create an account with a passkey')).to_be_visible()
    expect(d.get_by_role('button', name='Continue with a demo account')).to_have_count(0)
    page.keyboard.press('Escape')
    page.goto(live_app.url + '#/dev')
    expect(page.get_by_text('aren’t available on a live server')).to_be_visible()
    status = page.evaluate("fetch('api/auth/demo', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'}).then((r) => r.status)")
    assert status == 403


def test_the_service_worker_never_stores_api_responses(make_page, live_app):
    page = make_page()
    sign_up(page, live_app)
    page.goto(live_app.url)
    log_items(page, 'Glass', 2)
    wait_for_worker(page)
    urls = page.evaluate("""async () => { const out = []; for (const k of await caches.keys()) { for (const r of await (await caches.open(k)).keys()) out.push(r.url); } return out; }""")
    assert urls, 'the shell should be cached'
    assert not [u for u in urls if '/api/' in u], [u for u in urls if '/api/' in u]
