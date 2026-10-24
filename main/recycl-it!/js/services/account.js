// Who is using the app, when it is served by the RECYCL IT! server. Passkey sign-up and sign-in: the
// account is just a random id (and an optional leaderboard nickname). No email, no phone, no biometrics.
import { useEffect, useState } from '../lib.js';
import { env } from '../env.js';
import { api, ApiError, NetworkError } from './api.js';
import { b64u, assertionToJSON, deviceAuthStatus } from './deviceauth.js';
import { clearServerState } from '../store.js';

let account = { status: env.api ? 'unknown' : 'local', user: null, server: null };
const subs = new Set();
const set = (patch) => { account = { ...account, ...patch }; subs.forEach((f) => f()); };

export const getAccount = () => account;
export function useAccount() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); subs.add(f); return () => subs.delete(f); }, []);
  return account;
}

export async function loadAccount() {
  if (!env.api) return;
  try {
    const [server, me] = await Promise.all([api('GET', 'config'), api('GET', 'me')]);
    set({ server, status: me.user ? 'signedIn' : 'signedOut', user: me.user });
  } catch (e) {
    // Offline: keep what we knew. The cached view stays readable; nothing can be submitted until we're back.
    if (e instanceof NetworkError) set({ status: account.user ? 'signedIn' : 'offline' });
    else set({ status: 'signedOut' });
  }
}

export const passkeysPossible = async () => (await deviceAuthStatus()) !== 'insecure' && !!window.PublicKeyCredential;

export async function registerWithPasskey(nickname) {
  const opts = await api('POST', 'auth/register/options', { nickname: nickname || undefined });
  const pk = opts.publicKey;
  const cred = await navigator.credentials.create({ publicKey: {
    ...pk, challenge: b64u.dec(pk.challenge), user: { ...pk.user, id: b64u.dec(pk.user.id) },
  } });
  const out = await api('POST', 'auth/register/verify', { challengeId: opts.challengeId, credential: {
    id: cred.id, rawId: b64u.enc(cred.rawId), type: cred.type,
    response: { clientDataJSON: b64u.enc(cred.response.clientDataJSON), attestationObject: b64u.enc(cred.response.attestationObject) },
    transports: cred.response.getTransports?.() || [],
  } });
  set({ status: 'signedIn', user: out.user });
  return out.user;
}

export async function signInWithPasskey() {
  const opts = await api('POST', 'auth/login/options', {});
  const pk = opts.publicKey;
  const cred = await navigator.credentials.get({ publicKey: { challenge: b64u.dec(pk.challenge), rpId: pk.rpId, userVerification: 'required', timeout: pk.timeout } });
  const out = await api('POST', 'auth/login/verify', { challengeId: opts.challengeId, credential: assertionToJSON(cred) });
  set({ status: 'signedIn', user: out.user });
  return out.user;
}

export async function demoSignIn() {
  const out = await api('POST', 'auth/demo', {});
  set({ status: 'signedIn', user: out.user });
  return out.user;
}

export async function signOut() {
  try { await api('POST', 'auth/logout', {}); } catch { /* the cookie expires anyway */ }
  clearServerState();
  set({ status: 'signedOut', user: null });
}

export async function deleteAccount() {
  await api('POST', 'account/delete', { confirm: 'delete' });
  clearServerState();
  set({ status: 'signedOut', user: null });
}

export async function saveServerProfile(patch) {
  const user = await api('PUT', 'profile', { nickname: patch.nickname ?? account.user?.nickname ?? '', leaderboardOptIn: patch.leaderboardOptIn ?? account.user?.leaderboardOptIn ?? false });
  set({ user });
  return user;
}

export const friendlyAuthError = (e) => {
  if (e instanceof ApiError) return e.message;
  if (e instanceof NetworkError) return e.message;
  if (e?.name === 'NotAllowedError') return 'That was cancelled or timed out. Please try again.';
  return 'Something went wrong. Please try again.';
};
