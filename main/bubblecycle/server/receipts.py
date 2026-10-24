"""Receipt verification boundary.

A "verified" log needs a receipt code from a trusted source. The server never takes the client's word that a
receipt is valid.

- demo mode: the fictional demo codes (BC-1001-ZH ...) are accepted. They are never accepted in live mode.
- live mode: a code is `BCR.<payload>.<signature>`, signed with a secret shared only between this server
  and the station/retailer system that issues receipts (BC_RECEIPT_SECRET). Without that secret nobody can
  verify a receipt, so live receipts are refused rather than guessed.

`sign()` shows the format for whoever builds the issuer; it is not used by the app itself.
"""
import base64
import hashlib
import hmac
import json


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def sign(secret: str, receipt_id: str, expires_ms: int | None = None, station_id: str | None = None) -> str:
    payload = _b64(json.dumps({'id': receipt_id, 'exp': expires_ms, 'st': station_id}, separators=(',', ':')).encode())
    mac = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest()[:16]
    return f'BCR.{payload}.{_b64(mac)}'


def verify(settings, code: str, now_ms: int) -> dict:
    """-> {'valid': True, 'key': <single-use key>} or {'valid': False, 'reason': ...}"""
    code = (code or '').strip()
    if settings.mode == 'demo':
        up = code.upper()
        return {'valid': True, 'key': 'demo:' + up} if up in settings.demo_receipts else {'valid': False, 'reason': 'unknown'}
    if not settings.receipt_secret:
        return {'valid': False, 'reason': 'not_configured'}
    try:
        tag, payload, sig = code.split('.')
        if tag != 'BCR':
            raise ValueError
        want = _b64(hmac.new(settings.receipt_secret.encode(), payload.encode(), hashlib.sha256).digest()[:16])
        if not hmac.compare_digest(want, sig):
            raise ValueError
        data = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
        if data.get('exp') and now_ms > int(data['exp']):
            return {'valid': False, 'reason': 'expired'}
        return {'valid': True, 'key': 'live:' + str(data['id'])}
    except (ValueError, KeyError, TypeError):
        return {'valid': False, 'reason': 'unknown'}
