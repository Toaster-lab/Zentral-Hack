// Local-only app state, persisted to localStorage. Nothing here leaves the device.
// Personal data kept to a minimum: optional nickname, municipality, preferences.
import { useEffect, useReducer } from './lib.js';
import { config } from './config.js';
import { env } from './env.js';
import { uid, startOfDay } from './utils.js';
import { evaluateLog, pointsFor, balance } from './logic/activity.js';
import { MATERIALS } from './logic/rules.js';
import { REWARDS } from './data/misc.js';
import { rewardableItems } from './services/index.js';
import { nowTs } from './logic/clock.js';
import { barcodeError } from './utils.js';
import { CATALOGUE_VERSION } from './data/catalogue.js';

// Demo (on this device), the demo server and the live server each keep their own copy, so balances never mix.
const KEY = env.api ? `bubblecycle:${env.mode}:v1` : 'bubblecycle:v1';

const defaults = () => ({
  profile: {
    nickname: '',
    municipality: 'risch',
    weeklyGoal: config.weeklyGoalDefault,
    leaderboardOptIn: false,
    welcomeDismissed: false,
  },
  activities: [],        // one row per material per log: { id, batchId, ts, material, count, accepted, verification, stationId, source }
  ledger: env.api ? [] : [{ id: uid(), ts: Date.now(), points: 100, label: 'Welcome bonus (demo)', type: 'bonus' }],
  redemptions: [],       // { id, ts, rewardId, cost, code }
  usedReceiptCodes: [],
  lastPlace: null,       // { lat, lng, label, municipality? }
  social: {              // optional; nothing here is shared unless you switch it on
    enabled: false, username: '', nickname: '', avatar: { initial: '', tone: 'green' },
    privacy: { totals: false, streaks: false, milestones: false },
    reminders: { on: false, day: 4 },   // day: 0 = Monday … 6 = Sunday
    reminderDismissedWeek: null,
    badges: [],                          // { id, challengeId, name, kind: 'winner'|'participant', ts }
  },
  customProducts: {},    // barcodes added before the pilot: kept for you, but not part of the catalogue and not looked up (see addCustomProduct)
  scans: [],             // { ts, code, source } for products found in a database (own barcodes are not counted)
  collection: {},        // Bottledex entry id -> { firstTs, source: 'database' | 'mine', code }
  questClaims: [],       // `${monthKey}:${questId}` once the bonus points were claimed
  contributorId: null,   // random, anonymous; ties your submissions to this device (no personal data)
  rewardedIds: [],       // community items whose reward points were already paid out
  checkins: [],          // check-in history, newest first: results only, no coordinates or images
  deviceAuth: null,      // { credentialId, createdAt }: this device's passkey id for "confirm it's you"; no biometric data
  calendar: { materials: [], remind: false }, // collection calendar: which materials to show, in-app reminder on/off
  authIntroSeen: false,  // the one-time explanation before the first device confirmation
  serverBalance: 0,      // with the server: its balance as of the last sync (the ledger below is only the recent history)
  outbox: [],            // with the server: submissions saved offline, not yet accepted by it
  catalogueVersion: CATALOGUE_VERSION, // which catalogue this device's data was last migrated to
});

export let storageOk = true;

// Targeted, versioned migration to the pilot catalogue. Everything personal (activity, points, redemptions, scans,
// Bottledex, check-ins, own barcodes, social, settings) is kept exactly as it is; only the retired data sources are
// switched off. Retired locations stay as plain names and ids on old records: nothing looks them up again.
function migrate(parsed) {
  if (parsed.catalogueVersion === CATALOGUE_VERSION) return parsed;
  if (parsed.profile) delete parsed.profile.useOpenFoodFacts;   // Open Food Facts is no longer consulted
  return { ...parsed, catalogueVersion: CATALOGUE_VERSION };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = migrate(JSON.parse(raw));
    const d = defaults();
    const tones = { mint: 'green', sky: 'slate', lavender: 'plum', peach: 'clay' };
    const av = parsed.social?.avatar;
    if (av && !av.initial) parsed.social.avatar = { initial: (parsed.social.nickname || '').slice(0, 1).toUpperCase(), tone: tones[av.tone] || 'green' };
    return { ...d, ...parsed, profile: { ...d.profile, ...parsed.profile }, calendar: { ...d.calendar, ...parsed.calendar }, social: { ...d.social, ...parsed.social, privacy: { ...d.social.privacy, ...parsed.social?.privacy }, reminders: { ...d.social.reminders, ...parsed.social?.reminders } } };
  } catch {
    storageOk = false;
    return defaults();
  }
}

let state = load();
const subs = new Set();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; } catch { storageOk = false; }
}

export const getState = () => state;

export function setState(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  save();
  subs.forEach((fn) => fn());
}

export function useStore() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => { subs.add(force); return () => subs.delete(force); }, []);
  return state;
}

// ---- Actions ---------------------------------------------------------------

export const updateProfile = (patch) => setState((s) => ({ profile: { ...s.profile, ...patch } }));

export const getBalance = () => (env.api ? state.serverBalance : balance(state.ledger));

// ---- Social (optional) -----------------------------------------------------------
export const updateSocial = (patch) => setState((s) => ({ social: { ...s.social, ...patch } }));
export const updateSocialPrivacy = (patch) => setState((s) => ({ social: { ...s.social, privacy: { ...s.social.privacy, ...patch } } }));
export const updateReminders = (patch) => setState((s) => ({ social: { ...s.social, reminders: { ...s.social.reminders, ...patch } } }));
// Badges are digital keepsakes only: they never touch points or recycling counts.
export function addBadge(badge) {
  if (state.social.badges.some((b) => b.id === badge.id)) return false;
  setState((s) => ({ social: { ...s.social, badges: [...s.social.badges, badge] } }));
  return true;
}
export function leaveSocial() {
  setState((s) => ({ social: { ...s.social, enabled: false, username: '', nickname: '', privacy: { totals: false, streaks: false, milestones: false }, reminders: { on: false, day: 4 } } }));
}

// entries: [{ material, count }]; verified must already be checked against the receipt service.
export function logRecycling(entries, { verified = false, receiptCode = null, stationId = null, source = 'manual', evidence = 'self' } = {}) {
  const now = nowTs();
  const result = evaluateLog(state.activities, entries, now);
  if (!result.ok) return result;
  const batchId = uid();
  const verification = verified ? 'verified' : 'self-reported';
  const rows = result.entries.filter((e) => e.accepted > 0).map((e) => ({
    id: uid(), batchId, ts: now, material: e.material, count: e.count, accepted: e.accepted, verification, stationId, source, evidence,
  }));
  const points = pointsFor(result.accepted, verified);
  const summary = rows.map((r) => `${r.accepted} × ${MATERIALS[r.material].label.toLowerCase()}`).join(', ');
  setState((s) => ({
    activities: [...rows, ...s.activities],
    ledger: [{ id: uid(), ts: now, points, label: `Recycled ${summary}`, type: 'earn', batchId, verification, evidence }, ...s.ledger],
    usedReceiptCodes: receiptCode ? [...s.usedReceiptCodes, receiptCode] : s.usedReceiptCodes,
  }));
  return { ...result, points, verification, evidence };
}

export function redeem(rewardId) {
  if (env.api) return { ok: false, error: 'Rewards are redeemed on the server.' };
  const reward = REWARDS.find((r) => r.id === rewardId);
  if (!reward) return { ok: false, error: 'That reward doesn’t exist.' };
  if (reward.once && state.redemptions.some((r) => r.rewardId === rewardId)) return { ok: false, error: 'You already have this badge.' };
  const verifiedItems = state.activities.filter((x) => x.verification === 'verified').reduce((n, x) => n + x.accepted, 0);
  if (reward.needsVerifiedItems && verifiedItems < reward.needsVerifiedItems) return { ok: false, error: `This reward needs ${reward.needsVerifiedItems} verified items first. You have ${verifiedItems}.` };
  if (getBalance() < reward.cost) return { ok: false, error: 'Not enough points yet.' };
  const code = reward.kind === 'badge' ? null : `DEMO-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const now = Date.now();
  const redemption = { id: uid(), ts: now, rewardId, cost: reward.cost, code };
  setState((s) => ({
    redemptions: [redemption, ...s.redemptions],
    ledger: [{ id: uid(), ts: now, points: -reward.cost, label: `Redeemed: ${reward.name}`, type: 'redeem' }, ...s.ledger],
  }));
  return { ok: true, redemption, reward };
}

// ---- Community contributions ---------------------------------------------------
// Contribution points are spendable points only. They never create `activities`, so they
// can't affect recycling counts, progress or the leaderboard.

export function getContributorId() {
  if (!state.contributorId) setState({ contributorId: 'c-' + uid() });
  return state.contributorId;
}

let syncing = false;
// Pays out points for my approved/merged contributions (once each). Returns the points added.
export async function syncContributionRewards() {
  if (env.api) return 0; // map-help points are demo-only and never mix into a server balance
  if (syncing || !state.contributorId) return 0;
  syncing = true;
  try {
    const items = await rewardableItems({ contributorId: state.contributorId });
    const fresh = items.filter((i) => !state.rewardedIds.includes(i.id));
    if (!fresh.length) return 0;
    const now = Date.now();
    setState((s) => ({
      rewardedIds: [...s.rewardedIds, ...fresh.map((i) => i.id)],
      ledger: [...fresh.map((i) => ({ id: uid(), ts: now, points: i.points, label: i.label, type: 'contribute' })), ...s.ledger],
    }));
    return fresh.reduce((sum, i) => sum + i.points, 0);
  } catch { return 0; } finally { syncing = false; }
}

// Small instant reward for confirming a place is still there, capped per day.
export function awardConfirmation(placeName) {
  if (env.api) return 0;
  const today = state.ledger.filter((l) => l.type === 'confirm' && l.ts >= startOfDay()).length;
  if (today >= config.contribution.confirmsPerDay) return 0;
  const points = config.contribution.confirm;
  setState((s) => ({ ledger: [{ id: uid(), ts: Date.now(), points, label: `Confirmed: ${placeName}`, type: 'confirm' }, ...s.ledger] }));
  return points;
}

// ---- Scans, Bottledex, own barcodes, quests -------------------------------------
// Everything here stays on the device. Points from quests are spendable points only:
// they never create recycling activity, so they can't move anyone on the leaderboard.

// Call when a scan found a product. Returns the Bottledex entry ids unlocked for the first time.
export function recordScan(product) {
  const now = nowTs();
  const mine = product.source === 'mine';
  const fresh = (product.collect || []).filter((id) => !state.collection[id]);
  setState((s) => ({
    scans: mine ? s.scans : [...s.scans, { ts: now, code: product.barcode, source: product.source }].slice(-500),
    collection: fresh.reduce((acc, id) => ({ ...acc, [id]: { firstTs: now, source: mine ? 'mine' : 'database', code: product.barcode } }), s.collection),
  }));
  return fresh;
}

// Save a barcode the app didn't know. Returns { ok, product } or { ok:false, error }.
export function addCustomProduct({ barcode, name, components, collect }) {
  // During the pilot the catalogue is fixed: nothing a person adds is published to it or looked up on a scan.
  if (config.pilot.lockCatalogue) return { ok: false, error: 'Adding barcodes is paused during the pilot. The catalogue has three drinks.' };
  const err = barcodeError(barcode);
  if (err) return { ok: false, error: err };
  const clean = String(name || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60);
  if (clean.length < 3) return { ok: false, error: 'Give the product a name of at least 3 characters.' };
  if (!components?.length) return { ok: false, error: 'Add at least one packaging part so we can explain how to recycle it.' };
  const product = { barcode, name: clean, components, collect: collect || [], createdAt: nowTs() };
  setState((s) => ({ customProducts: { ...s.customProducts, [barcode]: product } }));
  return { ok: true, product: { ...product, source: 'mine', custom: true } };
}

export function removeCustomProduct(barcode) {
  setState((s) => { const next = { ...s.customProducts }; delete next[barcode]; return { customProducts: next }; });
}

export function claimQuest({ claimId, points, title }) {
  if (env.api) return { ok: false, error: 'Quests are claimed on the server.' };
  if (state.questClaims.includes(claimId)) return { ok: false, error: 'You already claimed this one.' };
  setState((s) => ({
    questClaims: [...s.questClaims, claimId],
    ledger: [{ id: uid(), ts: nowTs(), points, label: `Quest: ${title}`, type: 'quest' }, ...s.ledger],
  }));
  return { ok: true };
}

// ---- Recycling check-ins ---------------------------------------------------------

export const CHECKIN_PENDING = ['queued', 'review', 'appealed'];

function countCheckin(c) {
  return logRecycling(c.entries.map((e) => ({ material: e.material, count: Number(e.count) })), { stationId: c.stationId, source: 'checkin', evidence: c.evidence });
}

export function addCheckin(rec) {
  const status = rec.offline ? 'queued' : rec.flags.length ? 'review' : 'counted';
  let result = null;
  if (status === 'counted') {
    result = countCheckin(rec);
    if (!result.ok) return result;
  }
  const { offline, ...saved } = rec;
  const checkin = { ...saved, status, note: '' };
  setState((s) => ({ checkins: [checkin, ...s.checkins].slice(0, 100) }));
  return { ok: true, checkin, result };
}

const patchCheckin = (id, patch) => setState((s) => ({ checkins: s.checkins.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

export function appealCheckin(id, note) {
  if (env.api) return;
  patchCheckin(id, { status: 'appealed', note: String(note || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200) });
}

export function withdrawCheckin(id) {
  if (env.api) return;
  setState((s) => ({ checkins: s.checkins.filter((c) => c.id !== id) }));
}

// Demo reviewer for the on-device demo only. With the server, only staff can decide, through the review API.
export function resolveCheckin(id, approve) {
  if (env.api) return { ok: false, error: 'Only staff can review check-ins.' };
  const c = state.checkins.find((x) => x.id === id);
  if (!c || !CHECKIN_PENDING.includes(c.status)) return { ok: false, error: 'Nothing to review.' };
  if (!approve) { patchCheckin(id, { status: 'declined' }); return { ok: true, status: 'declined' }; }
  const res = countCheckin(c);
  patchCheckin(id, { status: res.ok ? 'counted' : 'declined', note: res.ok ? c.note : res.error });
  return { ...res, status: res.ok ? 'counted' : 'declined' };
}

export function queuedCheckins() { return state.checkins.filter((c) => c.status === 'queued'); }

export function markSynced(id) {
  const c = state.checkins.find((x) => x.id === id);
  if (!c || c.status !== 'queued') return;
  if (c.flags.length) { patchCheckin(id, { status: 'review' }); return; }
  const res = countCheckin(c);
  patchCheckin(id, { status: res.ok ? 'counted' : 'declined', note: res.ok ? '' : res.error });
}

const EVIDENCE_KEY = 'bubblecycle:evidence';
export function savedPhotos() {
  try { return JSON.parse(localStorage.getItem(EVIDENCE_KEY) || '[]'); } catch { return []; }
}
export function savePhoto(jpeg) {
  const next = [{ id: uid(), ts: nowTs(), jpeg }, ...savedPhotos()].slice(0, config.checkin.maxKeptPhotos);
  try { localStorage.setItem(EVIDENCE_KEY, JSON.stringify(next)); } catch { return false; }
  subs.forEach((fn) => fn());
  return true;
}
export function deleteSavedPhotos() {
  try { localStorage.removeItem(EVIDENCE_KEY); } catch { /* ignore */ }
  setState((s) => ({ checkins: s.checkins.map((c) => (c.photo?.kept ? { ...c, photo: { ...c.photo, kept: false } } : c)) }));
}

export const setDeviceAuth = (rec) => setState({ deviceAuth: rec });
export const updateCalendar = (patch) => setState((s) => ({ calendar: { ...s.calendar, ...patch } }));
export const markAuthIntroSeen = () => setState({ authIntroSeen: true });

// ---- Server sync -----------------------------------------------------------------------------------
// With the server, activities, ledger, redemptions and check-ins are copies of what the server holds.
// They're replaced wholesale on every sync; the device never edits them.

export function applyServerState(srv) {
  setState({
    activities: srv.activities, ledger: srv.ledger, redemptions: srv.redemptions, questClaims: srv.questClaims,
    checkins: srv.checkins, serverBalance: srv.balance,
  });
}

export function clearServerState() {
  setState({ activities: [], ledger: [], redemptions: [], questClaims: [], checkins: [], serverBalance: 0, outbox: [] });
}

export const queueOutbox = (item) => setState((s) => ({ outbox: [...s.outbox, item] }));
export const patchOutbox = (id, patch) => setState((s) => ({ outbox: s.outbox.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
export const removeOutbox = (id) => setState((s) => ({ outbox: s.outbox.filter((o) => o.id !== id) }));

export function resetAll() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(EVIDENCE_KEY); } catch { /* ignore */ }
  state = defaults();
  save();
  subs.forEach((fn) => fn());
}
