"""Server settings, read from environment variables. No secrets live in the frontend or the repository."""
import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

APP_ROOT = Path(__file__).resolve().parent.parent  # the folder holding index.html


@dataclass
class Settings:
    mode: str = 'demo'                    # 'demo' or 'live' (from_env requires BC_MODE to be set). Each mode has its own database; they never mix.
    host: str = '127.0.0.1'
    port: int = 5174
    origin: str = 'http://localhost:5174'  # exact origin users open; WebAuthn checks it
    rp_id: str = 'localhost'              # WebAuthn relying-party id (the site's domain)
    db_path: str = ''
    static_dir: Path = APP_ROOT
    admin_token: str = ''                 # reviewers' bearer token; empty = admin API disabled
    receipt_secret: str = ''              # shared with the trusted receipt issuer (HMAC); empty = no live receipts
    session_days: int = 30
    trust_proxy: bool = False             # behind a TLS proxy (Caddy, nginx): take the client address from X-Forwarded-For
    confirm_ttl_s: int = 120              # a passed confirmation can be used for 2 minutes, for the keys it was issued for
    demo_receipts: list = field(default_factory=lambda: ['BC-1001-ZH', 'BC-1002-ZH', 'BC-1003-ZH', 'BC-2001-BE', 'BC-3001-BS', 'BC-4001-LS', 'BC-5001-GE', 'BC-6001-LU'])

    @property
    def secure_cookie(self) -> bool:
        return self.origin.startswith('https://')


def from_env(env=None) -> Settings:
    env = os.environ if env is None else env
    mode = env.get('BC_MODE', '').lower()
    if mode not in ('demo', 'live'):  # no default: forgetting it must never silently start a demo server
        raise SystemExit('Set BC_MODE to "demo" or "live".')
    port = int(env.get('BC_PORT', '5174'))
    origin = env.get('BC_ORIGIN', f'http://localhost:{port}').rstrip('/')
    s = Settings(
        mode=mode,
        host=env.get('BC_HOST', '127.0.0.1'),
        port=port,
        origin=origin,
        rp_id=env.get('BC_RP_ID') or urlparse(origin).hostname or 'localhost',
        db_path=env.get('BC_DB') or str(APP_ROOT / 'server' / 'data' / f'bubblecycle-{mode}.db'),
        admin_token=env.get('BC_ADMIN_TOKEN', ''),
        receipt_secret=env.get('BC_RECEIPT_SECRET', ''),
        trust_proxy=env.get('BC_TRUST_PROXY', '') == '1',
    )
    if mode == 'live':
        if not s.origin.startswith('https://') and urlparse(s.origin).hostname not in ('localhost', '127.0.0.1'):
            raise SystemExit('Live mode needs an https BC_ORIGIN (passkeys and secure cookies require it).')
        if s.admin_token and len(s.admin_token) < 24:
            raise SystemExit('BC_ADMIN_TOKEN must be at least 24 characters.')
    return s
