"""Shared test helpers: a fake clock, a software passkey authenticator, and a small "world" to drive the service."""
import hashlib
import json
import os
import struct
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from cryptography.hazmat.primitives import hashes  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import ec  # noqa: E402

from server import auth, receipts, webauthn  # noqa: E402
from server.auth import ApiError  # noqa: E402
from server.config import Settings  # noqa: E402
from server.service import Service  # noqa: E402

ORIGIN, RP_ID = 'https://bc.test', 'bc.test'
SECRET = 'receipt-secret-for-tests'
ADMIN = 'a' * 32
FIXTURES = ROOT / 'tests' / 'fixtures'


def zms(y, m, d, h=0, mi=0):
    return int(datetime(y, m, d, h, mi, tzinfo=ZoneInfo('Europe/Zurich')).timestamp() * 1000)


# ---- minimal CBOR writer (what a real authenticator would send) ------------------------------
def cbor(v):
    def head(major, n):
        if n < 24:
            return bytes([major << 5 | n])
        if n < 256:
            return bytes([major << 5 | 24, n])
        return bytes([major << 5 | 25]) + struct.pack('>H', n)
    if isinstance(v, bool):
        raise TypeError
    if isinstance(v, int):
        return head(0, v) if v >= 0 else head(1, -1 - v)
    if isinstance(v, bytes):
        return head(2, len(v)) + v
    if isinstance(v, str):
        b = v.encode()
        return head(3, len(b)) + b
    if isinstance(v, dict):
        return head(5, len(v)) + b''.join(cbor(k) + cbor(x) for k, x in v.items())
    raise TypeError(type(v))


class SoftAuthenticator:
    """Stands in for a phone/laptop passkey: holds a P-256 key and signs like a real WebAuthn authenticator."""

    def __init__(self, origin=ORIGIN, rp_id=RP_ID):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.cred_id = os.urandom(32)
        self.origin, self.rp_id, self.count = origin, rp_id, 0

    def _auth_data(self, flags, extra=b''):
        self.count += 1
        return hashlib.sha256(self.rp_id.encode()).digest() + bytes([flags]) + struct.pack('>I', self.count) + extra

    def create(self, options, uv=True, origin=None):
        client = json.dumps({'type': 'webauthn.create', 'challenge': options['challenge'], 'origin': origin or self.origin}).encode()
        n = self.key.public_key().public_numbers()
        cose = cbor({1: 2, 3: -7, -1: 1, -2: n.x.to_bytes(32, 'big'), -3: n.y.to_bytes(32, 'big')})
        attested = bytes(16) + struct.pack('>H', len(self.cred_id)) + self.cred_id + cose
        auth_data = self._auth_data(0x01 | (0x04 if uv else 0) | 0x40, attested)
        att = cbor({'fmt': 'none', 'attStmt': {}, 'authData': auth_data})
        return {'id': webauthn.b64u(self.cred_id), 'rawId': webauthn.b64u(self.cred_id), 'type': 'public-key',
                'response': {'clientDataJSON': webauthn.b64u(client), 'attestationObject': webauthn.b64u(att)}, 'transports': ['internal']}

    def get(self, options, uv=True, origin=None, challenge=None):
        client = json.dumps({'type': 'webauthn.get', 'challenge': challenge or options['challenge'], 'origin': origin or self.origin}).encode()
        auth_data = self._auth_data(0x01 | (0x04 if uv else 0))
        sig = self.key.sign(auth_data + hashlib.sha256(client).digest(), ec.ECDSA(hashes.SHA256()))
        return {'id': webauthn.b64u(self.cred_id), 'rawId': webauthn.b64u(self.cred_id), 'type': 'public-key',
                'response': {'clientDataJSON': webauthn.b64u(client), 'authenticatorData': webauthn.b64u(auth_data), 'signature': webauthn.b64u(sig)}}


class Person:
    def __init__(self, user, authn):
        self.user, self.authn = user, authn

    @property
    def id(self):
        return self.user['id']


class World:
    def __init__(self, mode='demo', db_path=':memory:', start=None):
        self.t = start or zms(2026, 10, 24, 12)
        self.settings = Settings(mode=mode, origin=ORIGIN, rp_id=RP_ID, db_path=db_path, receipt_secret=SECRET if mode == 'live' else '', admin_token=ADMIN)
        self.svc = Service(self.settings, clock=lambda: self.t)
        self._n = 0

    @property
    def live(self):
        return self.settings.mode == 'live'

    def advance(self, minutes=0, hours=0, days=0):
        self.t += ((days * 24 + hours) * 60 + minutes) * 60_000

    def person(self) -> Person:
        if self.live:
            authn = SoftAuthenticator()
            opts = auth.registration_options(self.svc)
            uid, tok = auth.registration_verify(self.svc, {'challengeId': opts['challengeId'], 'credential': authn.create(opts['publicKey'])})
            return Person(auth.user_for_token(self.svc, tok), authn)
        uid, tok = auth.demo_login(self.svc, None)
        return Person(auth.user_for_token(self.svc, tok), None)

    def key(self):
        self._n += 1
        return f'key-{self._n:06d}-abcdef'

    def confirm(self, p: Person, purpose, keys, uv=True):
        opts = auth.confirm_options(self.svc, p.user, purpose, keys)
        if p.authn:
            body = {'challengeId': opts['challengeId'], 'credential': p.authn.get(opts['publicKey'], uv=uv)}
        else:
            body = {'challengeId': opts['challengeId'], 'simulated': True}
        return auth.confirm_verify(self.svc, p.user, body)['confirmationId']

    def log(self, p: Person, entries, key=None, confirmation=None, **extra):
        key = key or self.key()
        cid = confirmation or self.confirm(p, 'activity', [key])
        return self.svc.submit_activity(p.user, {'idemKey': key, 'kind': 'log', 'entries': entries, 'confirmationId': cid, **extra})

    def checkin(self, p: Person, entries, station='demo-glass-can', key=None, location='near', **extra):
        key = key or self.key()
        cid = self.confirm(p, 'activity', [key])
        return self.svc.submit_activity(p.user, {'idemKey': key, 'kind': 'checkin', 'stationId': station, 'entries': entries,
                                                 'location': {'result': location}, 'confirmationId': cid, **extra})

    def redeem(self, p: Person, reward_id, key=None, confirmation=None):
        key = key or self.key()
        cid = confirmation or self.confirm(p, 'redeem', [key])
        return self.svc.redeem(p.user, {'idemKey': key, 'rewardId': reward_id, 'confirmationId': cid})

    def balance(self, p: Person):
        return self.svc.state(p.user)['balance']


def E(material, count):
    return {'material': material, 'count': count}


def code_of(fn, *a, **kw):
    """Run fn and return the ApiError code it raises ('' if it doesn't)."""
    try:
        fn(*a, **kw)
    except ApiError as e:
        return e.code
    return ''


@pytest.fixture(params=['demo', 'live'])
def world(request):
    return World(request.param)


@pytest.fixture
def demo():
    return World('demo')


@pytest.fixture
def live():
    return World('live')


def make_receipt(rid='r1', exp=None):
    return receipts.sign(SECRET, rid, exp)
