"""HTTP layer: the JSON API under /api and the static app files, on one origin.

Serving both from one origin keeps the session cookie HttpOnly and SameSite=Strict (no tokens in JavaScript,
no cross-site requests) and lets passkeys bind to a single domain. Put a TLS proxy in front for HTTPS.
"""
import hmac
import json
import mimetypes
import posixpath
import threading
import time
import traceback
from collections import defaultdict, deque
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

from . import auth, precache, webauthn
from .auth import ApiError

COOKIE = 'bc_session'
MAX_BODY = 64 * 1024
PUBLIC_TOP = {'index.html', 'offline.html', 'manifest.webmanifest', 'sw.js'}
PUBLIC_DIRS = {'css', 'js', 'vendor', 'icons'}
MIME = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json',
        '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.html': 'text/html'}


class RateLimiter:
    def __init__(self):
        self.hits = defaultdict(deque)
        self.lock = threading.Lock()

    def allow(self, key: str, limit: int, window_s: int = 60) -> bool:
        now = time.monotonic()
        with self.lock:
            q = self.hits[key]
            while q and now - q[0] > window_s:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            return True


def make_handler(svc):
    settings = svc.settings
    limiter = RateLimiter()

    class Handler(BaseHTTPRequestHandler):
        server_version = 'RecyclIt'
        protocol_version = 'HTTP/1.1'

        def log_message(self, fmt, *args):
            if '/vendor/' not in self.path and '/icons/' not in self.path:
                super().log_message(fmt, *args)

        # ---- plumbing ------------------------------------------------------------------
        def _headers(self, status, ctype, length, extra=None):
            self.send_response(status)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(length))
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'same-origin')
            self.send_header('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'")
            self.send_header('Permissions-Policy', 'camera=(self), geolocation=(self), publickey-credentials-get=(self), publickey-credentials-create=(self)')
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()

        def _json(self, status, payload, cookie=None):
            body = json.dumps(payload).encode()
            extra = {'Cache-Control': 'no-store'}
            if cookie is not None:
                extra['Set-Cookie'] = cookie
            self._headers(status, 'application/json', len(body), extra)
            if self.command != 'HEAD':
                self.wfile.write(body)

        def _session_cookie(self, token, clear=False):
            c = cookies.SimpleCookie()
            c[COOKIE] = '' if clear else token
            c[COOKIE]['path'] = '/'
            c[COOKIE]['httponly'] = True
            c[COOKIE]['samesite'] = 'Strict'
            c[COOKIE]['max-age'] = 0 if clear else settings.session_days * 86400
            if settings.secure_cookie:
                c[COOKIE]['secure'] = True
            return c[COOKIE].OutputString()

        def _token(self):
            raw = self.headers.get('Cookie')
            if not raw:
                return None
            c = cookies.SimpleCookie()
            try:
                c.load(raw)
            except cookies.CookieError:
                return None
            return c[COOKIE].value if COOKIE in c else None

        def _ip(self):
            if settings.trust_proxy and self.headers.get('X-Forwarded-For'):
                return self.headers['X-Forwarded-For'].split(',')[-1].strip()  # the address our own proxy saw
            return self.client_address[0]

        def _read_body(self):
            """Reads the whole request body up front. With keep-alive connections an unread body would be parsed as the
            next request, so every early error (not signed in, forbidden…) must still consume it first."""
            try:
                n = int(self.headers.get('Content-Length') or 0)
            except ValueError:
                n = -1
            if n < 0 or n > MAX_BODY:
                self.close_connection = True
                raise ApiError(413, 'too_large', 'That request is too large.')
            self._raw = self.rfile.read(n) if n else b''

        def _body(self):
            if 'application/json' not in (self.headers.get('Content-Type') or ''):
                raise ApiError(415, 'bad_content_type', 'Send JSON.')
            try:
                data = json.loads(self._raw or b'{}')
            except ValueError as e:
                raise ApiError(400, 'bad_json', 'Malformed request.') from e
            if not isinstance(data, dict):
                raise ApiError(400, 'bad_json', 'Malformed request.')
            return data

        # ---- routing -------------------------------------------------------------------
        def do_GET(self):
            self._dispatch('GET')

        def do_HEAD(self):
            self._dispatch('HEAD')

        def do_POST(self):
            self._dispatch('POST')

        def do_PUT(self):
            self._dispatch('PUT')

        def _dispatch(self, method):
            url = urlparse(self.path)
            try:
                if method in ('POST', 'PUT'):
                    self._read_body()
                if url.path.startswith('/api/'):
                    self._api(method, url)
                elif method in ('GET', 'HEAD'):
                    self._static(url.path)
                else:
                    raise ApiError(405, 'method_not_allowed', 'Not allowed.')
            except ApiError as e:
                self._json(e.status, {'error': {'code': e.code, 'message': e.message}})
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception:  # noqa: BLE001 - never leak internals to the client
                traceback.print_exc()
                self._json(500, {'error': {'code': 'server_error', 'message': 'Something went wrong on our side. Please try again.'}})

        def _api(self, method, url):
            path, q = url.path[5:].strip('/'), parse_qs(url.query)
            if method in ('POST', 'PUT'):
                origin = self.headers.get('Origin')
                if origin and origin != settings.origin:
                    raise ApiError(403, 'bad_origin', 'Cross-site requests aren’t allowed.')
            if not limiter.allow(f'ip:{self._ip()}', 240):
                raise ApiError(429, 'slow_down', 'Too many requests. Please wait a moment.')
            if path.startswith('auth/') and method == 'POST' and not limiter.allow(f'auth:{self._ip()}', 20):
                raise ApiError(429, 'slow_down', 'Too many attempts. Please wait a minute.')

            token = self._token()
            user = auth.user_for_token(svc, token)

            def need_user():
                if not user:
                    raise ApiError(401, 'sign_in', 'Please sign in first.')
                return user

            def body():
                return self._body()

            if path == 'config' and method == 'GET':
                return self._json(200, {'mode': settings.mode, 'passkeys': webauthn.AVAILABLE, 'demoSignIn': settings.mode == 'demo',
                                        'receipts': {'demoCodes': settings.mode == 'demo', 'trustedSource': bool(settings.receipt_secret)},
                                        'rewards': list(svc.rewards.values())})
            if path == 'me' and method == 'GET':
                return self._json(200, {'user': svc.profile(user) if user else None}, None)

            # sign-in
            if path == 'auth/register/options' and method == 'POST':
                return self._json(200, auth.registration_options(svc, body().get('nickname')))
            if path == 'auth/register/verify' and method == 'POST':
                uid, tok = auth.registration_verify(svc, body())
                return self._json(200, {'user': svc.profile(auth.user_for_token(svc, tok))}, self._session_cookie(tok))
            if path == 'auth/login/options' and method == 'POST':
                return self._json(200, auth.login_options(svc))
            if path == 'auth/login/verify' and method == 'POST':
                uid, tok = auth.login_verify(svc, body())
                return self._json(200, {'user': svc.profile(auth.user_for_token(svc, tok))}, self._session_cookie(tok))
            if path == 'auth/demo' and method == 'POST':
                uid, tok = auth.demo_login(svc, body().get('nickname'))
                return self._json(200, {'user': svc.profile(auth.user_for_token(svc, tok))}, self._session_cookie(tok))
            if path == 'auth/logout' and method == 'POST':
                auth.end_session(svc, token)
                return self._json(200, {'ok': True}, self._session_cookie('', clear=True))

            # admin (reviewers): bearer token, never a user session
            if path.startswith('admin/'):
                given = (self.headers.get('Authorization') or '').removeprefix('Bearer ').strip()
                if not settings.admin_token or not hmac.compare_digest(given, settings.admin_token):
                    raise ApiError(403, 'forbidden', 'Not allowed.')
                if path == 'admin/queue' and method == 'GET':
                    return self._json(200, {'items': svc.review_queue()})
                if path == 'admin/decide' and method == 'POST':
                    b = body()
                    return self._json(200, svc.decide(str(b.get('id')), bool(b.get('approve')), 'reviewer', str(b.get('reason') or '')))
                raise ApiError(404, 'not_found', 'Not found.')

            if path == 'leaderboard' and method == 'GET':  # public: nicknames and counts of people who opted in
                try:
                    off = int(q.get('offset', ['0'])[0])
                except ValueError:
                    off = 0
                return self._json(200, svc.leaderboard(user, q.get('period', ['week'])[0], off))

            u = need_user()
            if method == 'POST' and not limiter.allow(f'user:{u["id"]}', 60):
                raise ApiError(429, 'slow_down', 'Too many requests. Please wait a moment.')
            if path == 'confirm/options' and method == 'POST':
                b = body()
                return self._json(200, auth.confirm_options(svc, u, b.get('purpose'), b.get('keys')))
            if path == 'confirm/verify' and method == 'POST':
                return self._json(200, auth.confirm_verify(svc, u, body()))
            if path == 'state' and method == 'GET':
                return self._json(200, svc.state(u))
            if path == 'activity' and method == 'POST':
                return self._json(200, svc.submit_activity(u, body()))
            if path.startswith('activity/') and method == 'POST':
                _, sid, action = path.split('/', 2) if path.count('/') == 2 else (None, None, None)
                if action == 'appeal':
                    return self._json(200, svc.appeal(u, sid, body().get('note')))
                if action == 'withdraw':
                    return self._json(200, svc.withdraw(u, sid))
            if path == 'rewards/redeem' and method == 'POST':
                return self._json(200, svc.redeem(u, body()))
            if path == 'quests' and method == 'GET':
                return self._json(200, svc.quests(u))
            if path == 'quests/claim' and method == 'POST':
                return self._json(200, svc.claim_quest(u, body().get('claimId')))
            if path == 'account/delete' and method == 'POST':
                if body().get('confirm') != 'delete':
                    raise ApiError(400, 'confirm_needed', 'Confirm the deletion.')
                svc.delete_account(u)
                return self._json(200, {'ok': True}, self._session_cookie('', clear=True))
            if path == 'profile' and method == 'PUT':
                return self._json(200, svc.update_profile(u, body()))
            raise ApiError(404, 'not_found', 'Not found.')

        # ---- static files ----------------------------------------------------------------
        def _static(self, raw_path):
            rel = posixpath.normpath(unquote(raw_path)).lstrip('/')
            if rel in ('', '.'):
                rel = 'index.html'
            parts = rel.split('/')
            if '..' in parts or any(p.startswith('.') for p in parts):
                raise ApiError(404, 'not_found', 'Not found.')
            if rel == 'js/env.js':
                return self._send_bytes(f'export const env = {json.dumps({"api": True, "mode": settings.mode})};\n'.encode(), 'text/javascript', no_cache=True)
            if rel == 'sw-manifest.js':
                return self._send_bytes(precache.script(settings.static_dir).encode(), 'text/javascript', no_cache=True)
            if not (rel in PUBLIC_TOP or parts[0] in PUBLIC_DIRS):
                raise ApiError(404, 'not_found', 'Not found.')
            f = (settings.static_dir / rel)
            if not f.is_file():
                raise ApiError(404, 'not_found', 'Not found.')
            ctype = MIME.get(f.suffix) or mimetypes.guess_type(f.name)[0] or 'application/octet-stream'
            self._send_bytes(f.read_bytes(), ctype, no_cache=True, sw=(rel == 'sw.js'))

        def _send_bytes(self, data, ctype, no_cache=False, sw=False):
            extra = {'Cache-Control': 'no-cache'} if no_cache else {}
            if sw:
                extra['Service-Worker-Allowed'] = '/'
            self._headers(200, ctype, len(data), extra)
            if self.command != 'HEAD':
                self.wfile.write(data)

    return Handler


def make_server(svc) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((svc.settings.host, svc.settings.port), make_handler(svc))
