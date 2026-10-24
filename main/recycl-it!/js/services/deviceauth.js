// "Confirm it's you" before logging recycling or spending points.
//
// The operating system does the checking (WebAuthn / passkeys with user verification required): face,
// fingerprint or the device passcode, whichever the device offers, plus a security key if the person added one.
// A web page can't require face recognition specifically and never sees any biometric data; it only gets
// a signed yes or no.
//
// What a passed confirmation means: whoever holds this device (or account) just satisfied its screen lock.
// It doesn't show the person recycled, that they were at a station, or that they have only one account.
//
// Two modes:
//  - Served by the RECYCL IT! server (env.api): the server issues the challenge, checks the signature and
//    remembers the result. The browser can't claim "authenticated" by itself.
//  - Local demo: a device-only passkey check. With no server there is nobody to verify the signature, so
//    this only guards the unlocked-device case and is labelled as such.
import { config } from '../config.js';
import { env } from '../env.js';
import { getState, setDeviceAuth } from '../store.js';
import { api, ApiError, NetworkError } from './api.js';

export const b64u = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
};
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const UV_FLAG = 0x04; // authenticator data flags byte (offset 32): user verified

// 'ready' | 'insecure' | 'unsupported' | 'unavailable' (no screen lock / platform authenticator)
export async function deviceAuthStatus() {
  if (!window.isSecureContext) return 'insecure';
  if (!window.PublicKeyCredential || !navigator.credentials) return 'unsupported';
  try {
    return (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) ? 'ready' : 'unavailable';
  } catch { return 'unavailable'; }
}

function reasonOf(e) {
  if (e instanceof NetworkError) return 'offline';
  if (e instanceof ApiError) return e.code === 'passkey_rejected' || e.code === 'passkey_unknown' ? 'not_verified' : e.status === 429 ? 'busy' : 'error';
  if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') return 'cancelled'; // dismissed, denied or timed out
  if (e?.name === 'NotSupportedError') return 'unsupported';
  if (e?.name === 'SecurityError') return 'insecure';
  return 'error';
}

// ---- Server-verified (live and demo server) ---------------------------------------------------

const toRequestOptions = (pk) => ({
  challenge: b64u.dec(pk.challenge), rpId: pk.rpId, userVerification: 'required', timeout: pk.timeout,
  allowCredentials: (pk.allowCredentials || []).map((c) => ({ type: 'public-key', id: b64u.dec(c.id), transports: c.transports?.length ? c.transports : undefined })),
});

export const assertionToJSON = (cred) => ({
  id: cred.id, rawId: b64u.enc(cred.rawId), type: cred.type,
  response: { clientDataJSON: b64u.enc(cred.response.clientDataJSON), authenticatorData: b64u.enc(cred.response.authenticatorData), signature: b64u.enc(cred.response.signature) },
});

async function confirmWithServer({ purpose, keys }) {
  try {
    const opts = await api('POST', 'confirm/options', { purpose, keys });
    if (!opts.hasPasskey) {
      // A demo-server account without a passkey. Offered only when the server says it would accept it.
      if (!opts.simulationAllowed) return { ok: false, reason: 'unavailable' };
      return { ok: false, reason: 'demo_account', simulate: async () => {
        const out = await api('POST', 'confirm/verify', { challengeId: opts.challengeId, simulated: true });
        return { ok: true, method: out.method, confirmationId: out.confirmationId };
      } };
    }
    const status = await deviceAuthStatus();
    if (status === 'insecure' || status === 'unsupported') return { ok: false, reason: status };
    const cred = await navigator.credentials.get({ publicKey: toRequestOptions(opts.publicKey) });
    const out = await api('POST', 'confirm/verify', { challengeId: opts.challengeId, credential: assertionToJSON(cred) });
    return { ok: true, method: out.method, confirmationId: out.confirmationId };
  } catch (e) {
    return { ok: false, reason: reasonOf(e) };
  }
}

// ---- Device-only check (local demo) -----------------------------------------------------------

function clientDataOk(clientDataJSON, type, challenge) {
  try {
    const d = JSON.parse(new TextDecoder().decode(clientDataJSON));
    return d.type === type && d.challenge === b64u.enc(challenge) && d.origin === location.origin;
  } catch { return false; }
}

async function enroll() {
  const challenge = rand(32);
  const cred = await navigator.credentials.create({ publicKey: {
    challenge,
    rp: { name: config.appName },
    user: { id: rand(16), name: `${config.appName} on this device`, displayName: 'This device' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    attestation: 'none',
    timeout: config.deviceAuth.timeoutMs,
  } });
  if (!clientDataOk(cred.response.clientDataJSON, 'webauthn.create', challenge)) return { ok: false, reason: 'error' };
  setDeviceAuth({ credentialId: b64u.enc(cred.rawId), createdAt: Date.now() });
  // Creating the passkey already asked the user to verify. Reuse that result if the browser exposes it,
  // so the first use is one prompt, not two.
  const data = cred.response.getAuthenticatorData?.();
  if (!data) return assertLocal(b64u.enc(cred.rawId));
  return new Uint8Array(data)[32] & UV_FLAG ? { ok: true, method: 'passkey' } : { ok: false, reason: 'not_verified' };
}

async function assertLocal(credentialId) {
  const challenge = rand(32);
  const cred = await navigator.credentials.get({ publicKey: {
    challenge,
    allowCredentials: [{ type: 'public-key', id: b64u.dec(credentialId), transports: ['internal'] }],
    userVerification: 'required',
    timeout: config.deviceAuth.timeoutMs,
  } });
  const r = cred.response;
  if (!clientDataOk(r.clientDataJSON, 'webauthn.get', challenge) || b64u.enc(cred.rawId) !== credentialId) return { ok: false, reason: 'error' };
  return new Uint8Array(r.authenticatorData)[32] & UV_FLAG ? { ok: true, method: 'passkey' } : { ok: false, reason: 'not_verified' };
}

async function confirmLocally() {
  const status = await deviceAuthStatus();
  if (status !== 'ready') return { ok: false, reason: status, simulate: config.deviceAuth.allowSimulation ? async () => ({ ok: true, method: 'simulated' }) : undefined };
  try {
    const id = getState().deviceAuth?.credentialId;
    return id ? await assertLocal(id) : await enroll();
  } catch (e) {
    return { ok: false, reason: reasonOf(e) };
  }
}

// -> { ok: true, method: 'passkey' | 'simulated', confirmationId? } | { ok: false, reason, simulate? }
// `simulate` exists only where a simulated step is allowed (demo); callers must label its result as simulated.
export const confirmAction = (opts) => (env.api ? confirmWithServer(opts) : confirmLocally());

// If the passkey was deleted in device settings, the stored id no longer works; start fresh.
export const forgetDeviceCredential = () => setDeviceAuth(null);
