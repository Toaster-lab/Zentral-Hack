"""The on-device demo (python serve.py): everything runs in the browser, the device passkey check is mocked with
Chrome's virtual authenticator."""
import re

import pytest
from playwright.sync_api import expect

from conftest import FAR, NEAR
from helpers import dialog, log_items, pass_intro_if_shown, start_log, INTRO


def balance(page):
    page.goto(page.url.split('#')[0] + '#/rewards')
    text = page.locator('.points-block .stat').inner_text()
    return int(text)


def test_logging_recycling_confirms_at_the_last_step(make_page, local_app):
    page = make_page()
    page.goto(local_app.url)
    d = start_log(page, 'Glass', 4)
    # The form is complete and nothing has asked for authentication yet.
    assert page.authn.credentials() == []
    d.get_by_role('button', name='Confirm and log it').click()
    intro = page.get_by_role('group', name=INTRO)
    expect(intro).to_be_visible()                                     # explained once, on first use
    expect(intro).to_contain_text('never sees or stores your face or fingerprint')
    expect(intro).to_contain_text('doesn’t prove you recycled')
    intro.get_by_role('button', name='Continue').click()
    done = dialog(page, 'Logged')
    expect(done).to_contain_text('+20 points')
    expect(done).to_contain_text('Self-reported')
    expect(done).not_to_contain_text('Simulated')
    assert len(page.authn.credentials()) == 1                          # a real (virtual) passkey was used, once
    # The explanation is not repeated.
    page.keyboard.press('Escape')
    d = start_log(page, 'Paper', 2)
    d.get_by_role('button', name='Confirm and log it').click()
    expect(dialog(page, 'Logged')).to_be_visible()
    assert page.errors == []


def test_cancelled_authentication_keeps_the_draft_and_offers_a_retry(make_page, local_app):
    page = make_page()
    page.goto(local_app.url)
    d = start_log(page, 'Glass', 7)
    page.authn.set_verified(False)                                    # the person fails or cancels the device prompt
    d.get_by_role('button', name='Confirm and log it').click()
    pass_intro_if_shown(page)
    expect(d.get_by_role('alert').filter(has_text='Your entries are still here')).to_be_visible()
    expect(d.get_by_label('Number of items')).to_have_value('7')       # draft kept
    expect(d.get_by_role('button', name='Glass')).to_have_attribute('aria-pressed', 'true')
    page.authn.set_verified(True)
    d.get_by_role('button', name='Try again').click()
    expect(dialog(page, 'Logged')).to_contain_text('+35 points')
    assert balance(page) == 100 + 35                                  # welcome bonus + this log, counted once


def test_double_tapping_submit_logs_only_once(make_page, local_app):
    page = make_page()
    page.goto(local_app.url)
    log_items(page, 'Glass', 2)                                       # sees the intro and sets up the passkey
    page.keyboard.press('Escape')
    d = start_log(page, 'Paper', 5)
    button = d.get_by_role('button', name='Confirm and log it')
    button.dblclick()
    page.wait_for_timeout(500)
    expect(dialog(page, 'Logged')).to_be_visible()
    assert balance(page) == 100 + 10 + 25                             # exactly two logs


def test_redeeming_asks_for_confirmation_and_keeps_the_selection_if_it_fails(make_page, local_app):
    page = make_page()
    page.goto(local_app.url)
    log_items(page, 'Glass', 20)                                      # +100 points, plus the welcome bonus
    page.keyboard.press('Escape')
    page.goto(local_app.url + '#/rewards')
    row = page.locator('.reward-row', has_text='Glass badge')
    row.get_by_role('button', name='Redeem').click()
    d = dialog(page, 'Redeem this reward?')
    expect(d).to_contain_text('Glass badge')
    page.authn.set_verified(False)
    d.get_by_role('button', name='Confirm and redeem').click()
    expect(d.get_by_role('alert').filter(has_text='Your entries are still here')).to_be_visible()
    expect(d).to_contain_text('Glass badge')                          # the chosen reward is still selected
    assert int(page.locator('.points-block .stat').inner_text()) == 200   # nothing was spent
    page.authn.set_verified(True)
    d.get_by_role('button', name='Try again').click()
    expect(dialog(page, 'Redeemed')).to_be_visible()
    assert int(page.locator('.points-block .stat').inner_text()) == 150
    # one-off badge: no second purchase
    expect(page.locator('.reward-row', has_text='Glass badge').get_by_role('button', name='Owned')).to_be_visible()


def test_a_held_checkin_stays_pending_until_reviewed(make_page, local_app):
    page = make_page(location=FAR)
    page.goto(local_app.url)
    page.get_by_role('button', name='Check in at a station').click()
    d = dialog(page, 'Check in')
    d.get_by_role('button', name=re.compile('PET and aluminium recycling point')).click()
    d.get_by_role('button', name='PET drink bottles', exact=True).click()
    d.get_by_role('button', name='Next').click()
    d.get_by_role('button', name='Check my location').click()
    expect(d).to_contain_text('about')                                # "looks about N m from the station"
    d.get_by_role('button', name='Continue').click()
    d.get_by_role('button', name='Skip photo').click()
    d.get_by_role('button', name='Confirm and submit').click()
    pass_intro_if_shown(page)
    expect(page.get_by_role('dialog')).to_contain_text('Held for a quick check')
    page.keyboard.press('Escape')
    page.goto(local_app.url + '#/activity')
    expect(page.get_by_text('Held for review')).to_be_visible()
    assert balance(page) == 100                                       # no points while held
    # The demo reviewer (on-device demo only) can approve it, once.
    page.goto(local_app.url + '#/activity')
    page.get_by_role('button', name='Approve').click()
    assert balance(page) == 100 + 5                                  # one PET item


def test_offline_checkin_is_queued_then_resubmitted_when_back_online(make_page, local_app):
    page = make_page(location=NEAR)
    page.goto(local_app.url)
    page.get_by_role('button', name='Check in at a station').click()
    d = dialog(page, 'Check in')
    d.get_by_role('button', name=re.compile('PET and aluminium recycling point')).click()
    d.get_by_role('button', name='PET drink bottles', exact=True).click()
    d.get_by_role('button', name='Next').click()
    d.get_by_role('button', name='Check my location').click()
    d.get_by_role('button', name='Continue').click()
    d.get_by_role('button', name='Skip photo').click()
    page.context.set_offline(True)
    d.get_by_role('button', name='Confirm and submit').click()
    pass_intro_if_shown(page)
    expect(page.get_by_role('dialog')).to_contain_text('Saved on this device')
    expect(page.get_by_role('dialog')).to_contain_text('no points are credited until then')
    page.keyboard.press('Escape')
    page.evaluate("location.hash = '#/activity'")
    expect(page.get_by_text('Waiting to send')).to_be_visible()
    expect(page.locator('.screen-header .muted').first).to_contain_text('100 points')   # not counted
    page.context.set_offline(False)
    expect(page.get_by_text('Counted')).to_be_visible()
    expect(page.locator('.screen-header .muted').first).to_contain_text('105 points')
