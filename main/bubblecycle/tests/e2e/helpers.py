"""Small UI helpers shared by the end-to-end tests."""
import json
import urllib.request

from conftest import ADMIN_TOKEN

INTRO = 'About confirming it’s you'


def dialog(page, name):
    return page.get_by_role('dialog', name=name)


def start_log(page, material='Glass', count=None):
    """Open Log recycling and fill the form, without submitting."""
    page.get_by_role('button', name='Log recycling').first.click()
    d = dialog(page, 'Log recycling')
    d.wait_for()
    d.get_by_role('button', name=material, exact=False).first.click()
    if count:
        d.get_by_label('Number of items').fill(str(count))
    return d


def pass_intro_if_shown(page):
    intro = page.get_by_role('group', name=INTRO)
    try:
        intro.wait_for(timeout=1500)
    except Exception:  # noqa: BLE001 - already seen
        return False
    intro.get_by_role('button', name='Continue').click()
    return True


def log_items(page, material='Glass', count=3):
    d = start_log(page, material, count)
    d.get_by_role('button', name='Confirm and log it').click()
    pass_intro_if_shown(page)
    dialog(page, 'Logged').wait_for()
    return dialog(page, 'Logged')


def close_top_sheet(page):
    page.keyboard.press('Escape')


def api(app, path, token=None, method='GET', body=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(f'{app.url}/api/{path}', data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def admin_queue(app):
    return api(app, 'admin/queue', ADMIN_TOKEN)['items']


def admin_decide(app, sid, approve):
    return api(app, 'admin/decide', ADMIN_TOKEN, 'POST', {'id': sid, 'approve': approve, 'reason': 'checked in e2e'})


def page_state(page):
    """The signed-in user's server-side state, fetched with their own session cookie."""
    return page.evaluate("""fetch('api/state', {cache: 'no-store'}).then(async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { throw new Error(r.status + ' ' + r.url + ' ' + t.slice(0, 120)); } })""")


def sign_up(page, app):
    """Create an account with a passkey on the live server (the server verifies the registration)."""
    page.goto(app.url + '/#/profile')
    page.get_by_role('button', name='Sign in or create an account').click()
    d = dialog(page, 'Your account')
    d.get_by_role('button', name='Create an account with a passkey').click()
    d.wait_for(state='detached')


def do_checkin(page, station='PET and aluminium recycling point', material='PET drink bottles', offline_before_submit=False):
    """Walk through the check-in sheet up to the final button, then press it."""
    import re
    page.get_by_role('button', name='Check in at a station').first.click()
    d = dialog(page, 'Check in')
    d.get_by_role('button', name=re.compile(station)).click()
    d.get_by_role('button', name=material, exact=True).click()
    d.get_by_role('button', name='Next').click()
    d.get_by_role('button', name='Check my location').click()
    d.get_by_role('button', name='Continue').click()
    d.get_by_role('button', name='Skip photo').click()
    if offline_before_submit:
        page.context.set_offline(True)
    d.get_by_role('button', name='Confirm and submit').click()
    return d


def wait_for_worker(page):
    """Waits until the service worker is installed and active (never hangs: wait_for_function has a timeout)."""
    page.wait_for_function("navigator.serviceWorker.getRegistration().then((r) => !!(r && r.active))", timeout=20000)
