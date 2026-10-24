"""End-to-end test setup: real servers, real Chrome, a virtual passkey authenticator, mocked location and camera.

What is real here: the app, the RECYCL IT! server and database, the service worker and cache, WebAuthn between the
browser and the server (the server verifies real signatures from Chrome's virtual authenticator).
What is mocked: the authenticator hardware (Chrome's virtual one), the GPS position, and the camera (Chrome's fake device).
Nothing here proves anything about real phones: Face ID, fingerprint sensors, real GPS and mobile keyboards need manual testing
(see docs/PHONE-TESTING.md).
"""
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
ADMIN_TOKEN = 'e2e-admin-token-0123456789abcdef'
RECEIPT_SECRET = 'e2e-receipt-secret'

# Station coordinates used for location mocks (server/data/stations.json)
NEAR = {'latitude': 47.143376, 'longitude': 8.432881}   # "PET and aluminium recycling point", the pilot's only station
FAR = {'latitude': 47.2000, 'longitude': 8.5200}


def free_port() -> int:
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class AppProcess:
    def __init__(self, cmd, env, port, cwd):
        self.port, self.url = port, f'http://localhost:{port}'   # 'localhost' (not an IP) because passkeys need a domain name
        probe = f'http://127.0.0.1:{port}/'
        # Request logs go to a file: an unread pipe would fill up and freeze the server.
        self.log = tempfile.NamedTemporaryFile(prefix='bc-e2e-', suffix='.log', delete=False)
        self.proc = subprocess.Popen(cmd, env={**os.environ, **env}, cwd=cwd, stdout=self.log, stderr=self.log)
        for _ in range(100):
            try:
                urllib.request.urlopen(probe, timeout=1).read()
                return
            except Exception:  # noqa: BLE001
                if self.proc.poll() is not None:
                    raise RuntimeError(Path(self.log.name).read_text(errors='replace'))
                time.sleep(0.1)
        raise RuntimeError('server did not start')

    def stop(self):
        self.proc.terminate()
        try:
            self.proc.wait(5)
        except subprocess.TimeoutExpired:
            self.proc.kill()


@pytest.fixture(scope='session')
def pw():
    with sync_playwright() as p:
        yield p


@pytest.fixture(scope='session')
def browser(pw):
    b = pw.chromium.launch(channel='chrome', headless=True, args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'])
    yield b
    b.close()


@pytest.fixture
def local_app(tmp_path):
    """The on-device demo: `python serve.py`, no accounts, everything stays in the browser."""
    port = free_port()
    app = AppProcess([sys.executable, str(ROOT / 'serve.py'), str(port), '--no-open'], {}, port, ROOT)
    yield app
    app.stop()


def _server(tmp_path, mode):
    port = free_port()
    env = {'BC_MODE': mode, 'BC_PORT': str(port), 'BC_ORIGIN': f'http://localhost:{port}', 'BC_RP_ID': 'localhost',
           'BC_DB': str(tmp_path / f'{mode}.db'), 'BC_ADMIN_TOKEN': ADMIN_TOKEN}
    if mode == 'live':
        env['BC_RECEIPT_SECRET'] = RECEIPT_SECRET
    return AppProcess([sys.executable, '-m', 'server'], env, port, ROOT)


@pytest.fixture
def live_app(tmp_path):
    app = _server(tmp_path, 'live')
    yield app
    app.stop()


@pytest.fixture
def demo_server_app(tmp_path):
    app = _server(tmp_path, 'demo')
    yield app
    app.stop()


class Authenticator:
    """Chrome's virtual platform authenticator (a stand-in for Face ID / fingerprint / PIN)."""

    def __init__(self, cdp):
        self.cdp = cdp
        cdp.send('WebAuthn.enable')
        self.id = cdp.send('WebAuthn.addVirtualAuthenticator', {'options': {
            'protocol': 'ctap2', 'transport': 'internal', 'hasResidentKey': True, 'hasUserVerification': True,
            'isUserVerified': True, 'automaticPresenceSimulation': True}})['authenticatorId']

    def set_verified(self, ok: bool):
        self.cdp.send('WebAuthn.setUserVerified', {'authenticatorId': self.id, 'isUserVerified': ok})

    def credentials(self):
        return self.cdp.send('WebAuthn.getCredentials', {'authenticatorId': self.id})['credentials']

    def sign_count(self):
        return max([c['signCount'] for c in self.credentials()] or [0])


@pytest.fixture
def make_page(browser):
    """Opens a phone-sized page with location and camera mocked and a virtual authenticator attached."""
    contexts = []

    def make(location=NEAR, authenticator=True, offline_ok=True):
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, service_workers='allow',
                                  geolocation=location, permissions=['geolocation', 'camera'], accept_downloads=True)
        contexts.append(ctx)
        page = ctx.new_page()
        page.set_default_timeout(15000)
        page.errors = []
        page.on('pageerror', lambda e: page.errors.append(str(e)))
        page.authn = Authenticator(ctx.new_cdp_session(page)) if authenticator else None
        return page

    yield make
    for c in contexts:
        c.close()


@pytest.fixture
def copy_of_app(tmp_path):
    """A throw-away copy of the app that a test may edit to simulate shipping a new version."""
    dest = tmp_path / 'app'
    shutil.copytree(ROOT, dest, ignore=shutil.ignore_patterns('tests', 'node_modules', '.git', '__pycache__', '*.db', 'venv', '.venv'))
    port = free_port()
    app = AppProcess([sys.executable, str(dest / 'serve.py'), str(port), '--no-open'], {}, port, dest)
    app.dir = dest
    yield app
    app.stop()
