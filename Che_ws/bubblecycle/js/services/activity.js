// Talking to the server about recycling activity, rewards and quests. Only used when the app is served by
// the RECYCL IT! server (env.api); the on-device demo uses the store directly.
//
// The server decides everything: the time, whether a limit or duplicate rule applies, what counts, the
// points and the balance. This module only sends what the person did, with a submission key so a retry
// can never be counted twice, and copies the server's answer into the local view.
import { api, ApiError, NetworkError } from './api.js';
import { applyServerState, getState, queueOutbox, patchOutbox, removeOutbox } from '../store.js';
import { uid } from '../utils.js';

export const newKey = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : uid() + uid() + uid()).slice(0, 32);

export const isOffline = () => !navigator.onLine;

export async function syncFromServer() {
  const state = await api('GET', 'state');
  applyServerState(state);
  return state;
}

// payload: { key, kind: 'log' | 'checkin', entries, stationId, source, receiptCode, location, fp, startedAt, queuedAt, confirmationId }
export async function sendActivity({ key, confirmationId, queuedAt, ...rest }) {
  const out = await api('POST', 'activity', { idemKey: key, confirmationId, queuedAt, ...rest });
  await syncFromServer().catch(() => {});
  return out;
}

export async function redeemOnServer({ key, rewardId, confirmationId }) {
  const out = await api('POST', 'rewards/redeem', { idemKey: key, rewardId, confirmationId });
  await syncFromServer().catch(() => {});
  return out;
}

export async function claimQuestOnServer(claimId) {
  const out = await api('POST', 'quests/claim', { claimId });
  await syncFromServer().catch(() => {});
  return out;
}

export const fetchQuests = () => api('GET', 'quests');

export async function appealOnServer(id, note) {
  const out = await api('POST', `activity/${id}/appeal`, { note });
  await syncFromServer().catch(() => {});
  return out;
}

export async function withdrawOnServer(id) {
  const out = await api('POST', `activity/${id}/withdraw`, {});
  await syncFromServer().catch(() => {});
  return out;
}

// ---- Offline: saved on this device, not yet accepted -----------------------------------------------
// Nothing queued counts for anything. When the connection is back the person confirms once (the server
// needs a fresh confirmation it can verify) and the server re-checks every item before accepting it.

export function saveForLater({ key, kind, label, payload }) {
  const item = { id: uid(), idemKey: key, kind, label, payload, queuedAt: Date.now(), status: 'queued', error: '' };
  queueOutbox(item);
  return item;
}

export const waitingItems = () => getState().outbox.filter((o) => o.status === 'queued');

// `confirm` is ({ purpose, keys }) => Promise<{ ok, confirmationId }>
export async function sendWaiting(confirm) {
  const items = waitingItems();
  if (!items.length) return { sent: 0, rejected: 0 };
  const c = await confirm({ purpose: 'activity', keys: items.map((i) => i.idemKey) });
  if (!c.ok) return { sent: 0, rejected: 0, confirmFailed: true, reason: c.reason };
  let sent = 0; let rejected = 0;
  for (const it of items) {
    try {
      await sendActivity({ ...it.payload, key: it.idemKey, kind: it.kind, queuedAt: it.queuedAt, confirmationId: c.confirmationId });
      removeOutbox(it.id);
      sent++;
    } catch (e) {
      if (e instanceof NetworkError) break; // still offline: keep the rest as they are
      patchOutbox(it.id, { status: e instanceof ApiError && e.code === 'expired' ? 'expired' : 'rejected', error: e.message });
      rejected++;
    }
  }
  return { sent, rejected };
}
