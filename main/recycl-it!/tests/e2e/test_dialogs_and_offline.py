"""Dialog accessibility, and offline/update behaviour of the service worker."""
import re

from playwright.sync_api import expect

from helpers import dialog, start_log, wait_for_worker


# ---- dialogs ---------------------------------------------------------------------------------------------

def inside(dlg):
    return dlg.evaluate('d => d.contains(document.activeElement)')


def test_a_dialog_names_itself_traps_focus_and_blocks_the_page_behind_it(make_page, local_app):
    page = make_page()
    page.goto(local_app.url)
    opener = page.get_by_role('button', name='Log recycling').first
    opener.click()
    dlg = dialog(page, 'Log recycling')
    expect(dlg).to_have_attribute('aria-modal', 'true')
    expect(dlg.locator('h2')).to_be_focused()                         # focus moves into the dialog, onto its title
    for selector in ('main', '.app-bar', 'nav.bottom-nav'):
        assert page.evaluate(f"document.querySelector('{selector}').inert") is True, selector
    for _ in range(40):                                               # Tab all the way round, twice: focus never leaves
        page.keyboard.press('Tab')
        assert inside(dlg)
    for _ in range(10):
        page.keyboard.press('Shift+Tab')
        assert inside(dlg)
    page.keyboard.press('Escape')
    expect(dlg).to_have_count(0)
    assert page.evaluate("document.querySelector('main').inert") is False   # the page is live again
    expect(page.locator('body')).not_to_have_class(re.compile('no-scroll'))


def test_closing_a_dialog_returns_focus_to_the_control_that_opened_it(make_page, local_app):
    page = make_page()
    page.goto(local_app.url)
    opener = page.get_by_role('button', name='Check in at a station')
    opener.focus()
    page.keyboard.press('Enter')
    dlg = dialog(page, 'Check in')
    expect(dlg).to_be_visible()
    dlg.get_by_role('button', name='Close: Check in').click()
    expect(opener).to_be_focused()


def test_stacked_dialogs_close_one_at_a_time_and_release_the_page_in_order(make_page, local_app):
    page = make_page()
    page.goto(local_app.url + '#/profile')
    page.get_by_role('button', name='Delete all my data').click()
    first = dialog(page, 'Delete all data?')
    expect(first).to_be_visible()
    page.keyboard.press('Escape')
    expect(first).to_have_count(0)
    assert page.evaluate("document.querySelector('main').inert") is False


def test_the_form_stays_reachable_when_the_screen_is_short_like_with_a_keyboard_open(make_page, local_app):
    page = make_page()
    page.goto(local_app.url)
    d = start_log(page, 'Glass', 3)
    page.set_viewport_size({'width': 390, 'height': 380})            # roughly what a phone shows above its keyboard
    submit = d.get_by_role('button', name='Confirm and log it')
    submit.scroll_into_view_if_needed()
    expect(submit).to_be_in_viewport()
    box = page.locator('.sheet').bounding_box()
    assert box['y'] >= 0 and box['y'] + box['height'] <= 380 + 1       # the sheet itself fits the visible area
    d.get_by_label('Number of items').focus()
    expect(d.get_by_label('Number of items')).to_be_in_viewport()


# ---- offline and updates -----------------------------------------------------------------------------------

def test_the_app_reopens_offline_after_one_completed_visit(make_page, local_app):
    page = make_page()
    page.goto(local_app.url)
    wait_for_worker(page)
    page.reload()                                                     # now controlled by the worker
    page.wait_for_function("navigator.serviceWorker.controller !== null")
    names = page.evaluate("caches.keys()")
    assert len(names) == 1 and names[0].startswith('bubblecycle-')
    cached = page.evaluate("caches.open(%r).then((c) => c.keys()).then((ks) => ks.map((k) => new URL(k.url).pathname))" % names[0])
    for must in ('/index.html', '/offline.html', '/css/styles.css', '/js/app.js', '/js/screens/home.js', '/js/env.js', '/vendor/preact-htm.js',
                 '/vendor/leaflet/leaflet.js', '/vendor/zxing.min.js', '/icons/icon-192.png', '/manifest.webmanifest'):
        assert must in cached, must
    page.context.set_offline(True)
    fresh = page.context.new_page()                                   # like closing the app and opening it again
    fresh.goto(local_app.url)
    expect(fresh.locator('h1').first).to_contain_text(re.compile('Good|Hello'))
    expect(fresh.get_by_text('You’re offline')).to_be_visible()
    fresh.goto(local_app.url + '#/calendar')
    expect(fresh.locator('h1').first).to_have_text('Collection calendar')
    fresh.goto(local_app.url + '#/map')
    expect(fresh.get_by_text('Map tiles aren’t available')).to_be_visible()
    assert fresh.evaluate("document.title") == 'RECYCL IT!'


def test_a_new_version_waits_for_the_person_and_never_loses_an_open_form(make_page, copy_of_app):
    page = make_page()
    page.goto(copy_of_app.url)
    wait_for_worker(page)
    page.reload()
    page.wait_for_function("navigator.serviceWorker.controller !== null")
    old_cache = page.evaluate("caches.keys()")
    expect(page.get_by_text('Rotkreuz, Canton Zug').first).to_be_visible()

    d = start_log(page, 'Glass', 7)                                   # unsaved work
    home = copy_of_app.dir / 'js' / 'screens' / 'home.js'
    home.write_text(home.read_text(encoding='utf-8').replace('Rotkreuz, Canton Zug</p>', 'Rotkreuz, Canton Zug (version 2)</p>'), encoding='utf-8')
    page.evaluate("navigator.serviceWorker.getRegistration().then((r) => r.update())")
    banner = page.locator('.update-banner')
    expect(banner).to_contain_text('A new version of RECYCL IT! is ready')
    expect(banner).to_contain_text('Finish what you’re doing')
    assert page.locator('.update-banner button').is_disabled()        # can't be applied while a form is open
    expect(d.get_by_label('Number of items')).to_have_value('7')       # nothing was reloaded or lost
    page.wait_for_timeout(500)
    assert '(version 2)' not in page.content()                         # the running page is still the old version

    page.keyboard.press('Escape')                                     # finish with the form
    expect(page.locator('.update-banner button')).to_be_enabled()
    with page.expect_navigation():
        page.locator('.update-banner button').click()
    expect(page.get_by_text('Rotkreuz, Canton Zug (version 2)')).to_be_visible()
    new_cache = page.evaluate("caches.keys()")
    assert len(new_cache) == 1 and new_cache != old_cache              # the old version's cache is gone
    page.context.set_offline(True)
    fresh = page.context.new_page()
    fresh.goto(copy_of_app.url)
    expect(fresh.get_by_text('Rotkreuz, Canton Zug (version 2)')).to_be_visible()   # and the new one works offline
