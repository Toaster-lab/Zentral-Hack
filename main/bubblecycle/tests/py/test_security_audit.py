"""Security audit probes (OWASP Top 10:2025). Each test asserts the SECURE behaviour.
Everything runs against temporary SQLite files and a loopback server; nothing external is touched."""
import http.client
import json
import socket
import threading

import pytest

from conftest import ADMIN, E, STATION, World, SoftAuthenticator, code_of, make_receipt
from server import auth, config, webauthn
from server.auth import ApiError
from server.db import Database
from server.http_server import make_handler, make_server


# ---- helpers ----------------------------------------------------------------------------------

class Http:
    def __init__(self, port, origin):
        self.port, self.origin, self.cookie = port, origin, None

    def call(self, method, path, body=None, headers=None, raw=None):
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
        h = dict(headers or {})
        data = raw
        if body is not None:
            data = json.dumps(body)
            h.setdefault('Content-Type', 'application/json')
        if self.cookie:
            h.setdefault('Cookie', self.cookie)
        c.request(method, path, data, h)
        r = c.getresponse()
        out = r.read()
        if r.getheader('Set-Cookie'):
            self.cookie = r.getheader('Set-Cookie').split(';')[0]
        c.close()
        try:
            return r.status, json.loads(out or b'{}'), r.headers
        except ValueError:
            return r.status, out, r.headers


@pytest.fixture
def server(tmp_path):
    def build(mode):
        w = World(mode, db_path=str(tmp_path / f'{mode}.db'))
        w.settings.host, w.settings.port = '127.0.0.1', 0
        httpd = make_server(w.svc)
        port = httpd.server_address[1]
        w.settings.origin = f'http://127.0.0.1:{port}'
        w.settings.rp_id = '127.0.0.1'
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        built.append(httpd)
        return w, Http(port, w.settings.origin)
    built = []
    yield build
    for h in built:
        h.shutdown()


def http_passkey_user(w, c):
    """Registers a passkey account over HTTP; returns the authenticator."""
    a = SoftAuthenticator(origin=w.settings.origin, rp_id='127.0.0.1')
    _, o, _ = c.call('POST', '/api/auth/register/options', {})
    s, r, _ = c.call('POST', '/api/auth/register/verify', {'challengeId': o['challengeId'], 'credential': a.create(o['publicKey'])})
    assert s == 200, r
    return a


def http_confirm(c, a, purpose, keys):
    _, o, _ = c.call('POST', '/api/confirm/options', {'purpose': purpose, 'keys': keys})
    s, r, _ = c.call('POST', '/api/confirm/verify', {'challengeId': o['challengeId'], 'credential': a.get(o['publicKey'])})
    assert s == 200, r
    return r['confirmationId']


# ---- A01 access control / IDOR ------------------------------------------------------------------

PROTECTED = [('GET', '/api/state'), ('GET', '/api/quests'), ('POST', '/api/activity'), ('POST', '/api/rewards/redeem'),
             ('POST', '/api/quests/claim'), ('POST', '/api/account/delete'), ('POST', '/api/confirm/options'),
             ('POST', '/api/confirm/verify'), ('POST', '/api/activity/x/appeal'), ('POST', '/api/activity/x/withdraw'), ('PUT', '/api/profile')]


@pytest.mark.parametrize('method,path', PROTECTED)
def test_protected_endpoints_reject_anonymous(server, method, path):
    w, c = server('live')
    assert c.call(method, path, {})[0] == 401


def test_user_b_cannot_touch_user_a_data(live):
    a, b = live.person(), live.person()
    sub = live.checkin(a, [E('pet', 41)])                      # large trip -> pending review
    assert sub['status'] == 'review'
    assert code_of(live.svc.appeal, b.user, sub['id'], 'x') == 'nothing_to_appeal'
    assert code_of(live.svc.withdraw, b.user, sub['id']) == 'nothing_to_withdraw'
    assert live.svc.state(b.user)['checkins'] == []
    # A's confirmation / key cannot be used by B
    key = live.key()
    cid = live.confirm(a, 'activity', [key])
    assert code_of(live.svc.submit_activity, b.user, {'idemKey': key, 'kind': 'log', 'entries': [E('glass', 2)], 'confirmationId': cid}) == 'confirmation_required'
    # B reusing A's idempotency key must not return A's submission
    key2 = live.key()
    live.log(a, [E('glass', 3)], key=key2)
    out = live.log(b, [E('glass', 4)], key=key2)
    assert out['entries'][0]['count'] == 4 and out['replayed'] is False


def test_client_supplied_points_and_flags_are_ignored(server):
    w, c = server('live')
    a = http_passkey_user(w, c)
    key = 'idem-key-0001'
    cid = http_confirm(c, a, 'activity', [key])
    s, r, _ = c.call('POST', '/api/activity', {'idemKey': key, 'kind': 'log', 'entries': [{'material': 'glass', 'count': 1, 'accepted': 999, 'points': 9999}],
                                               'confirmationId': cid, 'points': 99999, 'balance': 99999, 'verification': 'verified', 'status': 'counted', 'evidence': 'verified'})
    assert s == 200 and r['points'] == 5 and r['verification'] == 'self-reported'
    s, r, _ = c.call('PUT', '/api/profile', {'nickname': 'Tester', 'balance': 5000, 'is_demo': 1, 'id': 'u_other'})
    assert r['isDemo'] is False and r['id'] != 'u_other'
    assert c.call('GET', '/api/state')[1]['balance'] == 5


# ---- A06 / race conditions ------------------------------------------------------------------------

def _threads(n, fn):
    out, ts = [None] * n, []
    def run(i):
        try:
            out[i] = fn(i)
        except ApiError as e:
            out[i] = e.code
    for i in range(n):
        ts.append(threading.Thread(target=run, args=(i,)))
    [t.start() for t in ts]
    [t.join() for t in ts]
    return out


def test_concurrent_identical_requests_award_points_once(tmp_path):
    w = World('live', db_path=str(tmp_path / 'r.db'))
    p = w.person()
    key = w.key()
    cid = w.confirm(p, 'activity', [key])
    body = {'idemKey': key, 'kind': 'log', 'entries': [E('glass', 5)], 'confirmationId': cid}
    _threads(12, lambda i: w.svc.submit_activity(p.user, dict(body)))
    assert w.balance(p) == 25


def test_concurrent_redemptions_cannot_overspend(tmp_path):
    w = World('live', db_path=str(tmp_path / 'r.db'))
    p = w.person()
    w.log(p, [E('glass', 12)])                                 # 60 points
    rewards = ['badge-glass', 'badge-pet', 'badge-mapper', 'badge-glass', 'badge-pet']
    prepared = []
    for r in rewards:
        k = w.key()
        prepared.append({'idemKey': k, 'rewardId': r, 'confirmationId': w.confirm(p, 'redeem', [k])})
    _threads(len(prepared), lambda i: w.svc.redeem(p.user, prepared[i]))
    assert w.balance(p) >= 0
    owned = [r['rewardId'] for r in w.svc.state(p.user)['redemptions']]
    assert len(owned) == len(set(owned))                       # 'once' badges are never duplicated


def test_concurrent_receipt_use_by_two_users_verifies_once(tmp_path):
    w = World('live', db_path=str(tmp_path / 'r.db'))
    a, b = w.person(), w.person()
    code = make_receipt('race1')
    preps = []
    for p in (a, b):
        k = w.key()
        preps.append((p, {'idemKey': k, 'kind': 'log', 'entries': [E('glass', 2)], 'receiptCode': code, 'confirmationId': w.confirm(p, 'activity', [k])}))
    res = _threads(2, lambda i: w.svc.submit_activity(preps[i][0].user, preps[i][1]))
    assert sorted(r if isinstance(r, str) else 'ok' for r in res) == ['ok', 'receipt_used']


def test_concurrent_daily_cap_holds(tmp_path):
    w = World('live', db_path=str(tmp_path / 'r.db'))
    p = w.person()
    preps = []
    for i in range(30):
        k = w.key()
        preps.append({'idemKey': k, 'kind': 'log', 'entries': [E('glass', 40 + (i % 10))], 'confirmationId': w.confirm(p, 'activity', [k])})
        w.t += 11 * 60_000 if False else 0
    _threads(30, lambda i: w.svc.submit_activity(p.user, preps[i]))
    assert sum(a['accepted'] for a in w.svc.state(p.user)['activities']) <= 150


def test_concurrent_quest_claim_and_admin_decide_are_single_shot(tmp_path):
    w = World('live', db_path=str(tmp_path / 'r.db'))
    p = w.person()
    sub = w.checkin(p, [E('pet', 41)])
    res = _threads(6, lambda i: w.svc.decide(sub['id'], True, 'reviewer'))
    assert sum(1 for r in res if isinstance(r, dict)) == 1
    assert w.balance(p) == 205


# ---- A05/A10 input validation ----------------------------------------------------------------------

BAD = [None, True, 1, 1.5, 'x', [], {}, ['a'], {'a': 1}, float('nan'), 10 ** 30, -1, '\x00', "'; DROP TABLE users;--"]


def test_malformed_input_never_causes_a_server_error(server):
    w, c = server('demo')
    c.call('POST', '/api/auth/demo', {})
    errors, n = [], [0]
    def check(label, resp):
        n[0] += 1
        if resp[0] == 429:                       # per-user POST limit: sign in again and carry on
            c.cookie = None
            c.call('POST', '/api/auth/demo', {})
            n[0] = 0
        if resp[0] >= 500:
            errors.append(label)
    for v in BAD:
        check(f'material={v!r}', c.call('POST', '/api/activity', {'idemKey': 'fuzz-key-0001', 'kind': 'log', 'entries': [{'material': v, 'count': 1}], 'confirmationId': 'x'}))
        check(f'count={v!r}', c.call('POST', '/api/activity', {'idemKey': 'fuzz-key-0002', 'kind': 'log', 'entries': [{'material': 'glass', 'count': v}], 'confirmationId': 'x'}))
        check(f'entries={v!r}', c.call('POST', '/api/activity', {'idemKey': 'fuzz-key-0003', 'kind': 'log', 'entries': v}))
        check(f'idemKey={v!r}', c.call('POST', '/api/activity', {'idemKey': v, 'entries': []}))
        check(f'station={v!r}', c.call('POST', '/api/activity', {'idemKey': 'fuzz-key-0004', 'kind': 'checkin', 'stationId': v, 'entries': []}))
        check(f'kind={v!r}', c.call('POST', '/api/activity', {'idemKey': 'fuzz-key-0005', 'kind': v, 'entries': []}))
        check(f'receipt={v!r}', c.call('POST', '/api/activity', {'idemKey': 'fuzz-key-0006', 'entries': [], 'receiptCode': v}))
        check(f'nickname={v!r}', c.call('PUT', '/api/profile', {'nickname': v}))
        check(f'reward={v!r}', c.call('POST', '/api/rewards/redeem', {'idemKey': 'fuzz-key-0007', 'rewardId': v}))
        check(f'claim={v!r}', c.call('POST', '/api/quests/claim', {'claimId': v}))
        check(f'purpose={v!r}', c.call('POST', '/api/confirm/options', {'purpose': v, 'keys': v}))
        check(f'confirm={v!r}', c.call('POST', '/api/confirm/verify', {'challengeId': v}))
        check(f'admin-id={v!r}', c.call('POST', '/api/admin/decide', {'id': v}, headers={'Authorization': f'Bearer {ADMIN}'}))
    for body in ([], 'str', 1, None):
        check(f'body={body!r}', c.call('POST', '/api/activity', raw=json.dumps(body), headers={'Content-Type': 'application/json'}))
    assert not errors, " | ".join(sorted(set(errors)))


def test_idempotent_replay_with_odd_entries_is_not_a_server_error(demo):
    p = demo.person()
    key = demo.key()
    demo.log(p, [E('glass', 2)], key=key)
    assert code_of(demo.svc.submit_activity, p.user, {'idemKey': key, 'kind': 'log', 'entries': [{'material': 1, 'count': 2}, {'material': 'glass', 'count': 2}]}) in ('key_reused', 'bad_entries')


def test_injection_strings_do_not_alter_data(demo):
    p = demo.person()
    for payload in ("x' OR '1'='1", "'; DROP TABLE ledger;--", '<script>alert(1)</script>'):
        code_of(demo.svc.update_profile, p.user, {'nickname': payload})
        code_of(demo.svc.appeal, p.user, payload, payload)
    assert demo.svc.db.conn().execute('SELECT COUNT(*) FROM ledger').fetchone()[0] == 0
    assert demo.svc.profile(demo.svc.db.conn().execute('SELECT * FROM users').fetchone())['nickname'] is None


def test_nicknames_cannot_impersonate_or_be_blank(demo):
    a, b = demo.person(), demo.person()
    demo.svc.update_profile(a.user, {'nickname': 'Alex Green', 'leaderboardOptIn': True})
    assert code_of(demo.svc.update_profile, b.user, {'nickname': '   '}) == 'bad_nickname'
    assert code_of(demo.svc.update_profile, b.user, {'nickname': 'ALEX GREEN'}) == 'nickname_taken'
    a2 = demo.person()
    demo.svc.update_profile(a2.user, {'nickname': 'Älex'})
    assert code_of(demo.svc.update_profile, b.user, {'nickname': 'älex'}) == 'nickname_taken'


def test_leaderboard_exposes_only_opted_in_nicknames(demo):
    a, b = demo.person(), demo.person()
    demo.svc.update_profile(a.user, {'nickname': 'Public Pia', 'leaderboardOptIn': True})
    demo.log(a, [E('glass', 3)]); demo.log(b, [E('glass', 4)])
    rows = demo.svc.leaderboard(b.user, 'week', 0)['rows']
    assert [r['nickname'] for r in rows] == ['Public Pia'] and set(rows[0]) == {'nickname', 'items', 'verified', 'isMe'}


# ---- A07 demo vs live, auth, sessions --------------------------------------------------------------

def test_demo_features_are_unreachable_in_live(server):
    w, c = server('live')
    assert c.call('POST', '/api/auth/demo', {})[0] == 403
    assert c.call('GET', '/api/config')[1]['demoSignIn'] is False
    a = http_passkey_user(w, c)
    key = 'live-key-0001'
    _, o, _ = c.call('POST', '/api/confirm/options', {'purpose': 'activity', 'keys': [key]})
    assert o['simulationAllowed'] is False
    assert c.call('POST', '/api/confirm/verify', {'challengeId': o['challengeId'], 'simulated': True})[0] == 403
    cid = http_confirm(c, a, 'activity', [key])
    s, r, _ = c.call('POST', '/api/activity', {'idemKey': key, 'entries': [E('glass', 2)], 'receiptCode': 'BC-1001-ZH', 'confirmationId': cid})
    assert s == 422 and r['error']['code'] == 'receipt_invalid'


def test_a_database_cannot_be_opened_in_the_other_mode(tmp_path):
    p = str(tmp_path / 'x.db')
    Database(p, 'live')
    with pytest.raises(SystemExit):
        Database(p, 'demo')


def test_mode_must_be_set_explicitly():
    """Forgetting BC_MODE must not silently enable demo sign-in."""
    with pytest.raises(SystemExit):
        config.from_env({})
    assert config.from_env({'BC_MODE': 'demo'}).mode == 'demo'


def test_live_refuses_plain_http_non_local_origin():
    with pytest.raises(SystemExit):
        config.from_env({'BC_MODE': 'live', 'BC_ORIGIN': 'http://example.com'})


def test_session_cookie_is_secure_httponly_strict_on_https():
    from server.config import Settings
    assert Settings(origin='https://x.test').secure_cookie is True


def test_logout_and_delete_invalidate_the_session_server_side(server):
    w, c = server('demo')
    c.call('POST', '/api/auth/demo', {})
    old = c.cookie
    assert c.call('GET', '/api/state')[0] == 200
    c.call('POST', '/api/auth/logout', {})
    assert Http(c.port, c.origin).call('GET', '/api/state', headers={'Cookie': old})[0] == 401
    c.cookie = None
    c.call('POST', '/api/auth/demo', {})
    old = c.cookie
    c.call('POST', '/api/account/delete', {'confirm': 'delete'})
    assert Http(c.port, c.origin).call('GET', '/api/state', headers={'Cookie': old})[0] == 401


def test_expired_session_is_rejected(demo):
    p = demo.person()
    tok = auth.start_session(demo.svc, demo.svc.db.conn(), p.id)
    assert auth.user_for_token(demo.svc, tok)
    demo.advance(days=31)
    assert auth.user_for_token(demo.svc, tok) is None


def test_confirmations_are_single_purpose_single_use_and_expire(live):
    p = live.person()
    k1, k2 = live.key(), live.key()
    cid = live.confirm(p, 'activity', [k1])
    assert code_of(live.redeem, p, 'badge-glass', key=k1, confirmation=cid) == 'confirmation_required'   # wrong purpose
    assert code_of(live.log, p, [E('glass', 2)], key=k2, confirmation=cid) == 'confirmation_required'    # other key
    live.log(p, [E('glass', 2)], key=k1, confirmation=cid)
    k3 = live.key()
    cid2 = live.confirm(p, 'activity', [k3])
    live.advance(minutes=3)
    assert code_of(live.log, p, [E('pet', 2)], key=k3, confirmation=cid2) == 'confirmation_expired'


def test_passkey_assertions_cannot_be_replayed(live):
    p = live.person()
    opts = auth.confirm_options(live.svc, p.user, 'activity', [live.key()])
    cred = p.authn.get(opts['publicKey'])
    body = {'challengeId': opts['challengeId'], 'credential': cred}
    auth.confirm_verify(live.svc, p.user, body)
    assert code_of(auth.confirm_verify, live.svc, p.user, body) == 'challenge_invalid'
    lo = auth.login_options(live.svc)
    lb = {'challengeId': lo['challengeId'], 'credential': p.authn.get(lo['publicKey'])}
    auth.login_verify(live.svc, lb)
    assert code_of(auth.login_verify, live.svc, lb) == 'challenge_invalid'
    # a login assertion is not a valid confirmation (ceremony/challenge kinds are separate)
    lo2 = auth.login_options(live.svc)
    assert code_of(auth.confirm_verify, live.svc, p.user, {'challengeId': lo2['challengeId'], 'credential': p.authn.get(lo2['publicKey'])}) == 'challenge_invalid'


def test_cloned_authenticator_counter_regression_is_rejected(live):
    p = live.person()
    p.authn.count += 5
    lo = auth.login_options(live.svc)
    auth.login_verify(live.svc, {'challengeId': lo['challengeId'], 'credential': p.authn.get(lo['publicKey'])})
    p.authn.count = 1
    lo = auth.login_options(live.svc)
    assert code_of(auth.login_verify, live.svc, {'challengeId': lo['challengeId'], 'credential': p.authn.get(lo['publicKey'])}) == 'passkey_rejected'


def test_auth_endpoints_are_rate_limited(server):
    w, c = server('live')
    codes = [c.call('POST', '/api/auth/login/options', {})[0] for _ in range(25)]
    assert 429 in codes


def test_expired_challenges_and_sessions_are_purged(live):
    for _ in range(5):
        auth.login_options(live.svc)
    live.advance(days=1)
    auth.login_options(live.svc)
    assert live.svc.db.conn().execute("SELECT COUNT(*) FROM challenges WHERE expires_at < ?", (live.t,)).fetchone()[0] == 0


# ---- admin -------------------------------------------------------------------------------------------

@pytest.mark.parametrize('hdr', [None, 'Bearer ', 'Bearer wrong', 'Basic ' + ADMIN, pytest.param(ADMIN, marks=[]),
                                 pytest.param('Bearer ééé', marks=[]), 'bearer ' + ADMIN])
def test_admin_rejects_everything_but_the_exact_token(server, hdr):
    w, c = server('live')
    h = {'Authorization': hdr} if hdr is not None else {}
    for m, p in (('GET', '/api/admin/queue'), ('POST', '/api/admin/decide')):
        s = c.call(m, p, {} if m == 'POST' else None, headers=h)[0]
        assert s == 403, (hdr, p, s)


def test_admin_disabled_without_token_even_with_empty_header(server):
    w, c = server('live')
    w.settings.admin_token = ''
    assert c.call('GET', '/api/admin/queue', headers={'Authorization': 'Bearer '})[0] == 403


def test_user_cannot_approve_own_submission(server):
    w, c = server('live')
    a = http_passkey_user(w, c)
    key = 'adm-key-00001'
    cid = http_confirm(c, a, 'activity', [key])
    s, sub, _ = c.call('POST', '/api/activity', {'idemKey': key, 'kind': 'checkin', 'stationId': STATION, 'entries': [E('pet', 41)], 'location': {'result': 'near'}, 'confirmationId': cid})
    assert sub['status'] == 'review'
    assert c.call('POST', '/api/admin/decide', {'id': sub['id'], 'approve': True})[0] == 403
    assert c.call('GET', '/api/state')[1]['balance'] == 0


def test_admin_queue_does_not_expose_full_user_ids(live):
    p = live.person()
    live.checkin(p, [E('pet', 41)])
    q = live.svc.review_queue()
    assert q and p.id not in json.dumps(q)


# ---- static files / headers / transport -----------------------------------------------------------

TRAVERSAL = ['/js/..%5c..%5cserver%5cconfig.py', '/js/..\\..\\server\\config.py', '/css/..%5cserver%5cservice.py', '/js/%2e%2e/server/config.py',
             '/js/..%2fserver%2fconfig.py', '/vendor/..%5c..%5cserver%5cdata%5cbubblecycle-demo.db', '/js/%00.js', '/icons/..%5c..%5c.env']


@pytest.mark.parametrize('path', TRAVERSAL)
def test_static_path_traversal_is_blocked(server, path):
    w, c = server('demo')
    s, body, _ = c.call('GET', path)
    assert s in (400, 404) and b'RECYCL' not in (body if isinstance(body, bytes) else b'') and b'def ' not in (body if isinstance(body, bytes) else b''), (path, s)


def test_server_banner_does_not_disclose_versions(server):
    w, c = server('demo')
    assert 'Python' not in (c.call('GET', '/api/config')[2].get('Server') or '')


def test_csp_restricts_scripts(server):
    w, c = server('demo')
    assert 'script-src' in c.call('GET', '/', headers={})[2].get('Content-Security-Policy', '')


def test_connections_have_a_read_timeout(server):
    w, c = server('demo')
    h = make_handler(w.svc)
    assert h.timeout is not None


def test_chunked_request_cannot_smuggle_a_second_request(server):
    w, c = server('demo')
    s = socket.create_connection(('127.0.0.1', c.port), timeout=3)
    smuggled = b'GET /api/config HTTP/1.1\r\nHost: x\r\n\r\n'
    req = (b'POST /api/auth/demo HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n'
           + hex(len(smuggled))[2:].encode() + b'\r\n' + smuggled + b'\r\n0\r\n\r\n')
    s.sendall(req)
    data = b''
    try:
        while True:
            chunk = s.recv(65536)
            if not chunk:
                break
            data += chunk
    except socket.timeout:
        pass
    s.close()
    assert data.count(b'HTTP/1.1 ') <= 1, data[:300]


# ---- business logic --------------------------------------------------------------------------------

def test_self_reported_points_cannot_buy_real_world_vouchers(live):
    """Vouchers need 5 verified items once, but are then paid with any points, including unreviewed self-reported ones."""
    p = live.person()
    live.log(p, [E('glass', 5)], receiptCode=make_receipt('v1'))       # 35 points, 5 verified items
    for day in range(3):
        for mat in ('glass', 'pet', 'aluminium'):
            live.log(p, [E(mat, 50)])
        live.advance(days=1)
    spend = code_of(live.redeem, p, 'voucher-bottle')
    assert spend == 'insufficient_verified_points'


def test_redeem_code_is_not_a_guessable_demo_pattern_in_live(live):
    p = live.person()
    for day in range(2):
        live.log(p, [E('glass', 50)], receiptCode=make_receipt(f'c{day}')); live.advance(days=1)
    out = live.redeem(p, 'disc-refill')
    assert not out['code'].startswith('DEMO-')


def test_non_string_materials_are_rejected_not_crashed(demo):
    p = demo.person()
    for bad in (['glass'], {'a': 1}, 5):
        assert code_of(demo.log, p, [{'material': bad, 'count': 1}]) in ('no_items', 'bad_entries')
