"""Passkey validation on the server, demo/live separation, and the HTTP surface."""
import json
import threading
import urllib.error
import urllib.request

import pytest

from conftest import ADMIN, E, ORIGIN, ROOT, World, SoftAuthenticator, code_of
from server import auth
from server.config import Settings
from server.db import Database
from server.http_server import make_server
from server.service import Service


# ---- passkeys ---------------------------------------------------------------------------------

def test_registration_and_login_roundtrip(live):
    authn = SoftAuthenticator()
    opts = auth.registration_options(live.svc, 'PasskeyPia')
    uid, tok = auth.registration_verify(live.svc, {'challengeId': opts['challengeId'], 'credential': authn.create(opts['publicKey'])})
    assert auth.user_for_token(live.svc, tok)['id'] == uid
    lo = auth.login_options(live.svc)
    uid2, _ = auth.login_verify(live.svc, {'challengeId': lo['challengeId'], 'credential': authn.get(lo['publicKey'])})
    assert uid2 == uid


def test_a_challenge_can_only_be_answered_once(live):
    authn = SoftAuthenticator()
    opts = auth.registration_options(live.svc)
    cred = authn.create(opts['publicKey'])
    auth.registration_verify(live.svc, {'challengeId': opts['challengeId'], 'credential': cred})
    assert code_of(auth.registration_verify, live.svc, {'challengeId': opts['challengeId'], 'credential': cred}) == 'challenge_invalid'


@pytest.mark.parametrize('tamper', ['wrong_origin', 'no_uv', 'wrong_challenge'])
def test_bad_registrations_are_rejected(live, tamper):
    authn = SoftAuthenticator()
    opts = auth.registration_options(live.svc)
    pk = dict(opts['publicKey'])
    if tamper == 'wrong_challenge':
        pk['challenge'] = 'AAAA'
    cred = authn.create(pk, uv=tamper != 'no_uv', origin='https://evil.test' if tamper == 'wrong_origin' else None)
    assert code_of(auth.registration_verify, live.svc, {'challengeId': opts['challengeId'], 'credential': cred}) == 'passkey_rejected'


def test_confirmation_checks_the_signature_origin_and_user_verification(live):
    p = live.person()
    key = live.key()
    for kwargs in ({'uv': False}, {'origin': 'https://evil.test'}, {'challenge': 'AAAA'}):
        opts = auth.confirm_options(live.svc, p.user, 'activity', [key])
        cred = p.authn.get(opts['publicKey'], **kwargs)
        assert code_of(auth.confirm_verify, live.svc, p.user, {'challengeId': opts['challengeId'], 'credential': cred}) == 'passkey_rejected'
    opts = auth.confirm_options(live.svc, p.user, 'activity', [key])
    cred = p.authn.get(opts['publicKey'])
    cred['response']['signature'] = cred['response']['signature'][:-4] + 'AAAA'
    assert code_of(auth.confirm_verify, live.svc, p.user, {'challengeId': opts['challengeId'], 'credential': cred}) == 'passkey_rejected'
    # none of the failures produced a usable confirmation
    assert code_of(live.svc.submit_activity, p.user, {'idemKey': key, 'kind': 'log', 'entries': [E('glass', 2)], 'confirmationId': opts['challengeId']}) == 'confirmation_required'


def test_someone_elses_passkey_cannot_confirm_my_action(live):
    a, b = live.person(), live.person()
    key = live.key()
    opts = auth.confirm_options(live.svc, a.user, 'activity', [key])
    cred = b.authn.get(opts['publicKey'])
    assert code_of(auth.confirm_verify, live.svc, a.user, {'challengeId': opts['challengeId'], 'credential': cred}) == 'passkey_unknown'


def test_a_replayed_assertion_is_rejected_by_the_counter(live):
    p = live.person()
    key = live.key()
    opts = auth.confirm_options(live.svc, p.user, 'activity', [key])
    cred = p.authn.get(opts['publicKey'])
    auth.confirm_verify(live.svc, p.user, {'challengeId': opts['challengeId'], 'credential': cred})
    opts2 = auth.confirm_options(live.svc, p.user, 'activity', [live.key()])
    stale = dict(cred)  # an old assertion presented against a new challenge fails on the challenge, not just the counter
    assert code_of(auth.confirm_verify, live.svc, p.user, {'challengeId': opts2['challengeId'], 'credential': stale}) == 'passkey_rejected'


def test_simulated_confirmation_is_refused_on_a_live_server(live):
    p = live.person()
    opts = auth.confirm_options(live.svc, p.user, 'activity', [live.key()])
    assert opts['simulationAllowed'] is False
    assert code_of(auth.confirm_verify, live.svc, p.user, {'challengeId': opts['challengeId'], 'simulated': True}) == 'simulation_refused'
    assert code_of(auth.demo_login, live.svc, None) == 'demo_only'


def test_simulated_confirmation_is_recorded_as_simulated_in_demo(demo):
    p = demo.person()
    key = demo.key()
    cid = demo.confirm(p, 'activity', [key])
    demo.svc.submit_activity(p.user, {'idemKey': key, 'kind': 'log', 'entries': [E('glass', 2)], 'confirmationId': cid})
    row = demo.svc.db.conn().execute('SELECT auth_method FROM submissions').fetchone()
    assert row['auth_method'] == 'simulated'


def test_demo_and_live_databases_cannot_be_mixed(tmp_path):
    path = str(tmp_path / 'x.db')
    Database(path, 'demo')
    with pytest.raises(SystemExit):
        Database(path, 'live')


# ---- HTTP ----------------------------------------------------------------------------------------

class Client:
    def __init__(self, base):
        self.base, self.cookie = base, None

    def call(self, method, path, body=None, headers=None, raw=False):
        h = {'Content-Type': 'application/json', **(headers or {})}
        if self.cookie:
            h['Cookie'] = self.cookie
        req = urllib.request.Request(self.base + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method=method)
        try:
            with urllib.request.urlopen(req) as r:
                data, status, hdrs = r.read(), r.status, r.headers
        except urllib.error.HTTPError as e:
            data, status, hdrs = e.read(), e.code, e.headers
        if hdrs.get('Set-Cookie'):
            self.cookie = hdrs['Set-Cookie'].split(';')[0]
        return status, (data if raw else json.loads(data or b'{}')), hdrs


@pytest.fixture
def http_world():
    w = World('demo')
    w.settings.origin = 'http://127.0.0.1'
    w.settings.host, w.settings.port = '127.0.0.1', 0
    httpd = make_server(w.svc)
    w.settings.origin = f'http://127.0.0.1:{httpd.server_address[1]}'
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield w, Client(w.settings.origin)
    httpd.shutdown()


def test_http_full_log_flow_with_cookie_session(http_world):
    w, c = http_world
    assert c.call('GET', '/api/me')[1] == {'user': None}
    assert c.call('GET', '/api/state')[0] == 401
    status, body, hdrs = c.call('POST', '/api/auth/demo', {})
    assert status == 200 and 'HttpOnly' in hdrs['Set-Cookie'] and 'SameSite=Strict' in hdrs['Set-Cookie']
    key = 'http-key-000001'
    _, opts, _ = c.call('POST', '/api/confirm/options', {'purpose': 'activity', 'keys': [key]})
    assert opts['simulationAllowed'] is True
    _, conf, _ = c.call('POST', '/api/confirm/verify', {'challengeId': opts['challengeId'], 'simulated': True})
    status, sub, _ = c.call('POST', '/api/activity', {'idemKey': key, 'kind': 'log', 'entries': [E('glass', 3)], 'confirmationId': conf['confirmationId']})
    assert status == 200 and sub['status'] == 'counted'
    assert c.call('GET', '/api/state')[1]['balance'] == 15
    status, err, _ = c.call('POST', '/api/activity', {'idemKey': 'http-key-000002', 'kind': 'log', 'entries': [E('glass', 3)]})
    assert status == 403 and err['error']['code'] == 'confirmation_required'


def test_http_blocks_cross_site_posts_and_non_json(http_world):
    w, c = http_world
    assert c.call('POST', '/api/auth/demo', {}, headers={'Origin': 'https://evil.test'})[0] == 403
    assert c.call('POST', '/api/auth/demo', {}, headers={'Content-Type': 'text/plain'})[0] == 415


def test_http_admin_api_needs_the_staff_token_not_a_user_session(http_world):
    w, c = http_world
    c.call('POST', '/api/auth/demo', {})
    assert c.call('GET', '/api/admin/queue')[0] == 403                       # a signed-in user is not a reviewer
    assert c.call('GET', '/api/admin/queue', headers={'Authorization': 'Bearer nope'})[0] == 403
    assert c.call('GET', '/api/admin/queue', headers={'Authorization': f'Bearer {ADMIN}'})[0] == 200


def test_http_serves_the_app_but_not_the_server_code_or_database(http_world):
    w, c = http_world
    assert c.call('GET', '/', raw=True)[0] == 200
    status, body, _ = c.call('GET', '/js/env.js', raw=True)
    assert status == 200 and b'"api": true' in body and b'"demo"' in body
    for path in ('/server/service.py', '/server/data/bubblecycle-demo.db', '/tests/py/conftest.py', '/../server/config.py', '/.git/config', '/tools/vendor.py'):
        assert c.call('GET', path, raw=True)[0] == 404, path
    status, body, hdrs = c.call('GET', '/sw-manifest.js', raw=True)
    assert status == 200 and b'index.html' in body and hdrs['Cache-Control'] == 'no-cache'


def test_http_api_responses_are_not_cacheable(http_world):
    w, c = http_world
    assert c.call('GET', '/api/config')[2]['Cache-Control'] == 'no-store'


def test_deleting_an_account_removes_its_data_but_keeps_receipts_spent(live):
    from conftest import make_receipt
    p = live.person()
    live.log(p, [E('glass', 2)], receiptCode=make_receipt('del1'))
    live.svc.update_profile(p.user, {'nickname': 'Goner', 'leaderboardOptIn': True})
    live.svc.delete_account(p.user)
    conn = live.svc.db.conn()
    for table in ('users', 'credentials', 'sessions', 'submissions', 'activity_items', 'ledger'):
        assert conn.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0] == 0, table
    q = live.person()
    assert code_of(live.log, q, [E('pet', 2)], receiptCode=make_receipt('del1')) == 'receipt_used'
    assert live.svc.leaderboard(None, 'week', 0)['rows'] == []


def test_http_a_rejected_request_does_not_poison_the_next_one_on_the_same_connection(http_world):
    import http.client
    w, c = http_world
    conn = http.client.HTTPConnection("127.0.0.1", w.settings.port or int(w.settings.origin.rsplit(":", 1)[1]))
    body = json.dumps({"id": "x", "approve": True})
    conn.request("POST", "/api/admin/decide", body, {"Content-Type": "application/json"})
    r = conn.getresponse(); r.read()
    assert r.status == 403
    conn.request("GET", "/api/config")                 # same keep-alive connection: must be a normal request
    r = conn.getresponse(); data = r.read()
    assert r.status == 200 and json.loads(data)["mode"] == "demo"
    conn.request("POST", "/api/auth/demo", "x" * 70000, {"Content-Type": "application/json"})
    r = conn.getresponse(); r.read()
    assert r.status == 413
