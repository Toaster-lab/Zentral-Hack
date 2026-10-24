"""Accounts, sessions and the confirmation step.

Accounts are anonymous: a random id and (optionally) a leaderboard nickname. No email or phone.
Live accounts sign up and in with passkeys. Demo mode also offers a clearly labelled demo account with no
passkey, so the app can be tried on devices that can't do passkeys. Demo accounts only exist in demo-mode
databases, so they can never hold a live balance.

A "confirmation" is a passed passkey check that the server itself verified. It is tied to one user, one
purpose (log or redeem) and the exact idempotency keys it was requested for, and expires after two minutes.
Nothing the browser says about itself ("I authenticated") is ever believed.
"""
import hashlib
import json
import re
import secrets

from . import webauthn
from .webauthn import WebAuthnError, b64u

NICKNAME_RE = re.compile(r'^[\w .-]{3,20}$')
PURPOSES = ('activity', 'redeem')


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def _id(prefix: str) -> str:
    return prefix + secrets.token_urlsafe(12)


def nickname_error(n: str) -> str:
    if not NICKNAME_RE.fullmatch(n or ''):
        return '3–20 letters, numbers, spaces, dots, dashes or underscores.'
    if re.search(r'@|\d{6,}', n):
        return 'Please don’t use an email address or phone number.'
    return ''


# ---- sessions ---------------------------------------------------------------------------

def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(svc, conn, user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = svc.now()
    conn.execute('INSERT INTO sessions VALUES (?,?,?,?)', (_hash(token), user_id, now, now + svc.settings.session_days * 86_400_000))
    return token


def user_for_token(svc, token: str | None):
    if not token:
        return None
    row = svc.db.conn().execute(
        'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
        (_hash(token), svc.now())).fetchone()
    return dict(row) if row else None


def end_session(svc, token: str | None):
    if token:
        with svc.db.tx() as c:
            c.execute('DELETE FROM sessions WHERE token_hash = ?', (_hash(token),))


# ---- challenges -------------------------------------------------------------------------

def _new_challenge(c, svc, kind, user_id=None, purpose=None, keys=None, nickname=None, ttl_s=300):
    cid, challenge, now = _id('ch_'), b64u(secrets.token_bytes(32)), svc.now()
    c.execute('INSERT INTO challenges (id, kind, user_id, challenge, purpose, keys_json, nickname, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?)',
              (cid, kind, user_id, challenge, purpose, json.dumps(keys or []), nickname, now, now + ttl_s * 1000))
    return cid, challenge


def _take_challenge(c, svc, cid: str, kind: str, user_id=None):
    """Loads a challenge and deletes it, so a challenge can be answered once only."""
    row = c.execute('SELECT * FROM challenges WHERE id = ? AND kind = ?', (cid, kind)).fetchone()
    if not row or row['expires_at'] < svc.now() or (user_id and row['user_id'] != user_id):
        raise ApiError(400, 'challenge_invalid', 'That request expired. Please try again.')
    return row


def _pk_common(svc):
    return {'rp': {'name': 'RECYCL IT!', 'id': svc.settings.rp_id}, 'timeout': 60000}


def registration_options(svc, nickname: str | None = None):
    if not webauthn.AVAILABLE:
        raise ApiError(501, 'passkeys_unavailable', 'Passkeys need the "cryptography" package on the server.')
    if nickname:
        err = nickname_error(nickname)
        if err:
            raise ApiError(400, 'bad_nickname', err)
    user_handle = secrets.token_bytes(16)
    with svc.db.tx() as c:
        cid, challenge = _new_challenge(c, svc, 'register', nickname=nickname, keys=[b64u(user_handle)])
    return {'challengeId': cid, 'publicKey': {
        **_pk_common(svc), 'challenge': challenge,
        'user': {'id': b64u(user_handle), 'name': 'bubblecycle-account', 'displayName': nickname or 'RECYCL IT! account'},
        'pubKeyCredParams': [{'type': 'public-key', 'alg': -7}, {'type': 'public-key', 'alg': -257}],
        'authenticatorSelection': {'userVerification': 'required', 'residentKey': 'preferred'},
        'attestation': 'none',
    }}


def registration_verify(svc, body: dict):
    r = (body.get('credential') or {}).get('response') or {}
    with svc.db.tx() as c:
        row = _take_challenge(c, svc, str(body.get('challengeId')), 'register')
        c.execute('DELETE FROM challenges WHERE id = ?', (row['id'],))
        try:
            info = webauthn.verify_registration(
                client_data_json=r.get('clientDataJSON', ''), attestation_object=r.get('attestationObject', ''),
                challenge=row['challenge'], origin=svc.settings.origin, rp_id=svc.settings.rp_id)
        except WebAuthnError as e:
            raise ApiError(400, 'passkey_rejected', str(e)) from e
        if c.execute('SELECT 1 FROM credentials WHERE id = ?', (info['credential_id'],)).fetchone():
            raise ApiError(409, 'passkey_exists', 'That passkey is already registered.')
        uid, now = _id('u_'), svc.now()
        nick = row['nickname']
        if nick and c.execute('SELECT 1 FROM users WHERE lower(nickname) = lower(?)', (nick,)).fetchone():
            nick = None
        c.execute('INSERT INTO users (id, created_at, nickname, leaderboard_opt_in, is_demo) VALUES (?,?,?,?,0)', (uid, now, nick, 0))
        c.execute('INSERT INTO credentials VALUES (?,?,?,?,?,?,?)',
                  (info['credential_id'], uid, info['public_key_pem'], info['alg'], info['sign_count'],
                   json.dumps((body.get('credential') or {}).get('transports') or []), now))
        token = start_session(svc, c, uid)
    return uid, token


def login_options(svc):
    if not webauthn.AVAILABLE:
        raise ApiError(501, 'passkeys_unavailable', 'Passkeys need the "cryptography" package on the server.')
    with svc.db.tx() as c:
        cid, challenge = _new_challenge(c, svc, 'login')
    return {'challengeId': cid, 'publicKey': {'challenge': challenge, 'rpId': svc.settings.rp_id, 'userVerification': 'required', 'timeout': 60000}}


def _assert(svc, c, body: dict, challenge: str, user_id: str | None):
    cred = body.get('credential') or {}
    r = cred.get('response') or {}
    row = c.execute('SELECT * FROM credentials WHERE id = ?', (str(cred.get('id', '')),)).fetchone()
    if not row or (user_id and row['user_id'] != user_id):
        raise ApiError(401, 'passkey_unknown', 'This passkey isn’t linked to your account.')
    try:
        new_count = webauthn.verify_assertion(
            client_data_json=r.get('clientDataJSON', ''), authenticator_data=r.get('authenticatorData', ''), signature=r.get('signature', ''),
            challenge=challenge, origin=svc.settings.origin, rp_id=svc.settings.rp_id,
            public_key_pem=row['public_key_pem'], alg=row['alg'], stored_sign_count=row['sign_count'])
    except WebAuthnError as e:
        raise ApiError(401, 'passkey_rejected', str(e)) from e
    c.execute('UPDATE credentials SET sign_count = ? WHERE id = ?', (new_count, row['id']))
    return row['user_id']


def login_verify(svc, body: dict):
    with svc.db.tx() as c:
        row = _take_challenge(c, svc, str(body.get('challengeId')), 'login')
        c.execute('DELETE FROM challenges WHERE id = ?', (row['id'],))
        uid = _assert(svc, c, body, row['challenge'], None)
        token = start_session(svc, c, uid)
    return uid, token


def demo_login(svc, nickname: str | None):
    if svc.settings.mode != 'demo':
        raise ApiError(403, 'demo_only', 'Demo sign-in is not available on this server.')
    with svc.db.tx() as c:
        uid = _id('d_')
        c.execute('INSERT INTO users (id, created_at, nickname, leaderboard_opt_in, is_demo) VALUES (?,?,NULL,0,1)', (uid, svc.now()))
        token = start_session(svc, c, uid)
    return uid, token


# ---- confirmation ------------------------------------------------------------------------

def confirm_options(svc, user: dict, purpose: str, keys: list):
    if purpose not in PURPOSES:
        raise ApiError(400, 'bad_purpose', 'Unknown purpose.')
    if not isinstance(keys, list) or not 1 <= len(keys) <= 20 or not all(isinstance(k, str) and 8 <= len(k) <= 64 for k in keys):
        raise ApiError(400, 'bad_keys', 'Give 1 to 20 submission keys.')
    with svc.db.tx() as c:
        cid, challenge = _new_challenge(c, svc, 'confirm', user_id=user['id'], purpose=purpose, keys=keys, ttl_s=120)
        creds = c.execute('SELECT id, transports FROM credentials WHERE user_id = ?', (user['id'],)).fetchall()
    return {'challengeId': cid, 'hasPasskey': bool(creds), 'simulationAllowed': svc.settings.mode == 'demo' and not creds,
            'publicKey': {'challenge': challenge, 'rpId': svc.settings.rp_id, 'userVerification': 'required', 'timeout': 60000,
                          'allowCredentials': [{'type': 'public-key', 'id': r['id'], 'transports': json.loads(r['transports'])} for r in creds]}}


def confirm_verify(svc, user: dict, body: dict):
    with svc.db.tx() as c:
        row = _take_challenge(c, svc, str(body.get('challengeId')), 'confirm', user['id'])
        if row['verified_at']:
            raise ApiError(400, 'challenge_invalid', 'That request was already used.')
        if body.get('simulated'):
            # Only a demo server, and only an account with no passkey. Recorded as "simulated", never as verified.
            has_key = c.execute('SELECT 1 FROM credentials WHERE user_id = ?', (user['id'],)).fetchone()
            if svc.settings.mode != 'demo' or has_key:
                raise ApiError(403, 'simulation_refused', 'Simulated confirmation isn’t allowed here.')
            method = 'simulated'
        else:
            _assert(svc, c, body, row['challenge'], user['id'])
            method = 'passkey'
        c.execute('UPDATE challenges SET verified_at = ?, method = ? WHERE id = ?', (svc.now(), method, row['id']))
    return {'confirmationId': row['id'], 'method': method, 'expiresInS': svc.settings.confirm_ttl_s}


def consume_confirmation(svc, c, user_id: str, confirmation_id, purpose: str, key: str) -> str:
    """Inside a write transaction: marks `key` as used by this confirmation and returns its method."""
    row = c.execute("SELECT * FROM challenges WHERE id = ? AND kind = 'confirm' AND user_id = ?", (str(confirmation_id or ''), user_id)).fetchone()
    err = ApiError(403, 'confirmation_required', 'Please confirm it’s you to continue.')
    if not row or not row['verified_at'] or row['purpose'] != purpose:
        raise err
    if svc.now() - row['verified_at'] > svc.settings.confirm_ttl_s * 1000:
        raise ApiError(403, 'confirmation_expired', 'That confirmation expired. Please confirm again.')
    keys, used = json.loads(row['keys_json']), json.loads(row['used_keys_json'])
    if key not in keys or key in used:
        raise err
    c.execute('UPDATE challenges SET used_keys_json = ? WHERE id = ?', (json.dumps(used + [key]), row['id']))
    return row['method']
