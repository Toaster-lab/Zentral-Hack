"""Server-side WebAuthn (passkey) checks: registration and assertions.

The server issues every challenge, stores it once, and checks the browser's answer: ceremony type,
challenge, origin, relying-party hash, user-presence and user-verification flags, and the signature
against the public key stored at registration. It never sees a face, fingerprint or passcode, only the
signed statement from the user's device. Attestation is not requested (format "none"), so no
statement about the device model is trusted.

Needs the `cryptography` package; without it the server still runs, but only demo-mode sign-in exists.
"""
import base64
import hashlib
import json
import struct

try:
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa
    AVAILABLE = True
except ImportError:  # pragma: no cover - exercised only on installs without the package
    AVAILABLE = False

FLAG_UP, FLAG_UV, FLAG_AT = 0x01, 0x04, 0x40


class WebAuthnError(Exception):
    pass


def b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def b64u_decode(s: str) -> bytes:
    try:
        return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))
    except Exception as e:  # noqa: BLE001
        raise WebAuthnError('Malformed base64url value.') from e


def _cbor(data: bytes, i: int = 0, depth: int = 0):
    """Tiny CBOR decoder for what WebAuthn uses: ints, byte/text strings, arrays, maps. Returns (value, next_index)."""
    if depth > 8 or i >= len(data):
        raise WebAuthnError('Malformed CBOR.')
    head = data[i]
    major, info = head >> 5, head & 31
    i += 1
    if info < 24:
        arg = info
    elif info in (24, 25, 26, 27):
        n = 1 << (info - 24)
        if i + n > len(data):
            raise WebAuthnError('Malformed CBOR.')
        arg = int.from_bytes(data[i:i + n], 'big')
        i += n
    else:
        raise WebAuthnError('Unsupported CBOR.')
    if major == 0:
        return arg, i
    if major == 1:
        return -1 - arg, i
    if major in (2, 3):
        if i + arg > len(data):
            raise WebAuthnError('Malformed CBOR.')
        raw = data[i:i + arg]
        return (raw if major == 2 else raw.decode('utf-8')), i + arg
    if major == 4:
        out = []
        for _ in range(arg):
            v, i = _cbor(data, i, depth + 1)
            out.append(v)
        return out, i
    if major == 5:
        out = {}
        for _ in range(arg):
            k, i = _cbor(data, i, depth + 1)
            v, i = _cbor(data, i, depth + 1)
            out[k] = v
        return out, i
    raise WebAuthnError('Unsupported CBOR.')


def _client_data(raw_b64: str, expected_type: str, challenge: str, origin: str) -> bytes:
    raw = b64u_decode(raw_b64)
    try:
        cd = json.loads(raw)
    except ValueError as e:
        raise WebAuthnError('Malformed client data.') from e
    if cd.get('type') != expected_type:
        raise WebAuthnError('Wrong ceremony type.')
    if cd.get('challenge') != challenge:
        raise WebAuthnError('Challenge mismatch.')
    if cd.get('origin') != origin:
        raise WebAuthnError('Unexpected origin.')
    return raw


def _auth_data(auth: bytes, rp_id: str) -> tuple:
    if len(auth) < 37:
        raise WebAuthnError('Authenticator data too short.')
    if auth[:32] != hashlib.sha256(rp_id.encode()).digest():
        raise WebAuthnError('Wrong relying party.')
    flags = auth[32]
    if not flags & FLAG_UP:
        raise WebAuthnError('User presence missing.')
    if not flags & FLAG_UV:
        raise WebAuthnError('The device did not verify the user.')
    return flags, struct.unpack('>I', auth[33:37])[0]


def _public_key_from_cose(cose: dict):
    kty, alg = cose.get(1), cose.get(3)
    if kty == 2 and alg == -7 and cose.get(-1) == 1:
        x, y = cose.get(-2), cose.get(-3)
        if not (isinstance(x, bytes) and isinstance(y, bytes) and len(x) == 32 and len(y) == 32):
            raise WebAuthnError('Bad EC key.')
        key = ec.EllipticCurvePublicNumbers(int.from_bytes(x, 'big'), int.from_bytes(y, 'big'), ec.SECP256R1()).public_key()
        return key, -7
    if kty == 3 and alg == -257:
        n, e = cose.get(-1), cose.get(-2)
        if not (isinstance(n, bytes) and isinstance(e, bytes)):
            raise WebAuthnError('Bad RSA key.')
        return rsa.RSAPublicNumbers(int.from_bytes(e, 'big'), int.from_bytes(n, 'big')).public_key(), -257
    raise WebAuthnError('Unsupported key type. Use ES256 or RS256.')


def verify_registration(*, client_data_json: str, attestation_object: str, challenge: str, origin: str, rp_id: str) -> dict:
    """Returns {credential_id, public_key_pem, alg, sign_count}."""
    if not AVAILABLE:
        raise WebAuthnError('Passkey support needs the "cryptography" package on the server.')
    _client_data(client_data_json, 'webauthn.create', challenge, origin)
    att, _ = _cbor(b64u_decode(attestation_object))
    auth = att.get('authData') if isinstance(att, dict) else None
    if not isinstance(auth, bytes):
        raise WebAuthnError('Missing authenticator data.')
    flags, sign_count = _auth_data(auth, rp_id)
    if not flags & FLAG_AT or len(auth) < 55:
        raise WebAuthnError('No credential in the response.')
    cred_len = struct.unpack('>H', auth[53:55])[0]
    cred_id = auth[55:55 + cred_len]
    if len(cred_id) != cred_len or not cred_id:
        raise WebAuthnError('Bad credential id.')
    cose, _ = _cbor(auth, 55 + cred_len)
    key, alg = _public_key_from_cose(cose)
    pem = key.public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    return {'credential_id': b64u(cred_id), 'public_key_pem': pem, 'alg': alg, 'sign_count': sign_count}


def verify_assertion(*, client_data_json: str, authenticator_data: str, signature: str, challenge: str, origin: str,
                     rp_id: str, public_key_pem: str, alg: int, stored_sign_count: int) -> int:
    """Returns the new signature counter. Raises WebAuthnError when anything doesn't check out."""
    if not AVAILABLE:
        raise WebAuthnError('Passkey support needs the "cryptography" package on the server.')
    cd_raw = _client_data(client_data_json, 'webauthn.get', challenge, origin)
    auth = b64u_decode(authenticator_data)
    _, sign_count = _auth_data(auth, rp_id)
    signed = auth + hashlib.sha256(cd_raw).digest()
    key = serialization.load_pem_public_key(public_key_pem.encode())
    sig = b64u_decode(signature)
    try:
        if alg == -7:
            key.verify(sig, signed, ec.ECDSA(hashes.SHA256()))
        elif alg == -257:
            key.verify(sig, signed, padding.PKCS1v15(), hashes.SHA256())
        else:
            raise WebAuthnError('Unsupported key type.')
    except InvalidSignature as e:
        raise WebAuthnError('Signature check failed.') from e
    if (sign_count or stored_sign_count) and sign_count <= stored_sign_count:
        raise WebAuthnError('Signature counter did not increase (possible cloned authenticator).')
    return sign_count
