// DEMO community backend. It persists to localStorage on this device so the whole
// submit → review → approve → map-update loop works without a server. A real launch
// replaces this with an API (see services/live.js) and adds auth, moderation tooling,
// photo storage and server-side rate limits.
import { config } from '../config.js';
import { uid, haversineKm } from '../utils.js';
import { AREAS, areaContains } from '../data/areas.js';
import { SEED_LOCATIONS } from '../data/locations-seed.js';
import { CATALOGUE_VERSION } from '../data/catalogue.js';
import { parseOpeningHours } from '../logic/hours.js';
import { rewardFor, issueByKey } from '../logic/community.js';
import { simulate } from './latency.js';

const KEY = 'bubblecycle:community-demo:v1';
const HOUR = 3600000;
const DAY = 24 * HOUR;
const TEXT_LIMIT = 500;

// ---- Storage ---------------------------------------------------------------

// Pilot: no sample submissions. The queue only ever holds what people on this device sent themselves.
function seed() {
  return { version: 2, catalogue: CATALOGUE_VERSION, items: [], confirmations: [], overrides: {}, created: [] };
}

// Version 1 held made-up sample submissions about the old sample locations. Those samples are dropped; everything a
// person did themselves (their submissions, reports and confirmations) stays exactly as it was. Approved places and
// edits from before the pilot stay in storage but are not served (see allBase / effective).
function migrate(s) {
  if (s?.version === 2) return s;
  if (s?.version === 1) return { ...s, version: 2, catalogue: CATALOGUE_VERSION, items: (s.items || []).filter((i) => !i.demo) };
  return null;
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    const s = migrate(raw);
    if (s) { if (s !== raw) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } } return s; }
  } catch { /* fall through */ }
  const s = seed();
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  return s;
}

let db = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch { return false; } };
const STORAGE_FULL = { ok: false, error: 'Your browser’s storage is full, so we couldn’t save that. Try a smaller photo or delete some data.' };

// ---- Views -----------------------------------------------------------------

// The pilot map is exactly SEED_LOCATIONS. Places approved before the pilot (db.created) are kept but not served.
const allBase = () => (config.pilot.lockCatalogue ? SEED_LOCATIONS : [...SEED_LOCATIONS, ...db.created]);

function effective(loc) {
  if (config.pilot.lockCatalogue) return loc;   // approved edits and removals cannot change the supplied location
  const o = db.overrides[loc.id];
  if (o?.removed) return null;
  return o ? { ...loc, ...o.patch } : loc;
}

function tempIssues(locId, now = Date.now()) {
  return db.items
    .filter((i) => i.kind === 'report' && i.temporary && i.status === 'active' && i.locationId === locId)
    .filter((i) => now - i.createdAt < config.contribution.tempIssueHours[i.issue] * HOUR)
    .map((i) => ({ issue: i.issue, ts: i.createdAt }));
}

function lastConfirmed(loc) {
  const times = db.confirmations.filter((c) => c.locationId === loc.id).map((c) => c.ts);
  if (loc.approvedAt) times.push(loc.approvedAt);
  return times.length ? Math.max(...times) : null;
}

const decorate = (loc) => ({ ...loc, tempIssues: tempIssues(loc.id), lastConfirmedAt: lastConfirmed(loc), confirmations: db.confirmations.filter((c) => c.locationId === loc.id).length });
const getLocation = (id) => { const b = allBase().find((l) => l.id === id); return b ? effective(b) : null; };
const inBox = (p, b) => !b || (p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east);

// Only approved locations for one area and the current map view.
export async function loadLocations({ areaId, bbox, contributorId }) {
  await simulate();
  if (!AREAS[areaId]) return { locations: [], pending: [] };
  const locations = allBase().map(effective).filter((l) => l && l.areaId === areaId && inBox(l, bbox)).map(decorate);
  const pending = contributorId && !config.pilot.lockCatalogue
    ? db.items.filter((i) => i.kind === 'new_place' && i.status === 'pending' && i.contributorId === contributorId && inBox(i.payload, bbox))
        .map((i) => ({ id: i.id, pending: true, areaId: i.areaId, type: i.payload.type, name: i.payload.name || LABEL[i.payload.type], lat: i.payload.lat, lng: i.payload.lng, materials: i.payload.materials, materialsKnown: !i.payload.notSure, hours: parseOpeningHours(i.payload.hoursText), hoursText: i.payload.hoursText, access: i.payload.access, description: i.payload.description, photo: i.payload.photo, source: 'community', tempIssues: [], lastConfirmedAt: null }))
    : [];
  return { locations, pending };
}
const LABEL = { station: 'Recycling point', bin: 'Public trash bin' };

export async function nearbyLocations({ areaId, point, type, radiusM }) {
  await simulate();
  const box = { south: point.lat - radiusM / 111320, north: point.lat + radiusM / 111320, west: point.lng - radiusM / 75000, east: point.lng + radiusM / 75000 };
  return allBase().map(effective).filter((l) => l && l.areaId === areaId && inBox(l, box))
    .map((l) => ({ ...decorate(l), distanceM: haversineKm(point, l) * 1000 }))
    .filter((l) => l.distanceM <= radiusM && (!type || l.type === type))
    .sort((a, b) => a.distanceM - b.distanceM);
}

// ---- Contributor actions ---------------------------------------------------

const clean = (s) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, TEXT_LIMIT);
const pendingCount = (cid) => db.items.filter((i) => i.contributorId === cid && i.status === 'pending').length;

export const PILOT_LOCKED = { ok: false, locked: true, error: 'The pilot map has one recycling point and new places can’t be added right now.' };

export async function submitPlace({ areaId, contributorId, payload }) {
  await simulate();
  if (config.pilot.lockCatalogue) return PILOT_LOCKED;
  const area = AREAS[areaId];
  if (!area) return { ok: false, error: 'That area isn’t supported yet.' };
  if (!areaContains(area, payload)) return { ok: false, error: 'That pin is outside the Rotkreuz launch area.' };
  if (!['station', 'bin'].includes(payload.type)) return { ok: false, error: 'Please choose a place type.' };
  if (payload.type === 'station' && !payload.materials?.length && !payload.notSure) return { ok: false, error: 'Pick the accepted materials, or choose “Not sure”.' };
  if (pendingCount(contributorId) >= config.contribution.maxPendingPerPerson) return { ok: false, error: `You already have ${config.contribution.maxPendingPerPerson} contributions waiting for review. Thanks! Please wait for those first.` };
  const dup = db.items.find((i) => i.kind === 'new_place' && i.status === 'pending' && i.contributorId === contributorId
    && haversineKm(i.payload, payload) * 1000 < 10 && i.payload.type === payload.type);
  if (dup) return { ok: false, error: 'You’ve already submitted a place at this spot — it’s waiting for review.' };
  const item = {
    id: uid(), kind: 'new_place', status: 'pending', areaId, contributorId, createdAt: Date.now(), reviewedAt: null, reviewNote: '', reward: null,
    payload: {
      type: payload.type, name: clean(payload.name), lat: payload.lat, lng: payload.lng,
      materials: payload.type === 'station' ? [...new Set(payload.materials || [])] : [], notSure: !!payload.notSure,
      hoursText: clean(payload.hoursText), access: clean(payload.access), description: clean(payload.description), photo: payload.photo || null,
    },
  };
  db.items.unshift(item);
  if (!save()) { db.items.shift(); return STORAGE_FULL; }
  return { ok: true, item };
}

export async function submitReport({ locationId, issue, note, suggested, newPos, contributorId }) {
  await simulate();
  const loc = getLocation(locationId);
  const meta = issueByKey(issue);
  if (!loc || !meta) return { ok: false, error: 'We couldn’t find that place any more.' };
  const recent = db.items.find((i) => i.kind === 'report' && i.locationId === locationId && i.contributorId === contributorId && i.issue === issue && Date.now() - i.createdAt < DAY);
  if (recent) return { ok: false, error: 'You already reported this today.' };
  if (!meta.temporary && db.items.filter((i) => i.contributorId === contributorId && i.status === 'pending').length >= 10) return { ok: false, error: 'You have a lot of reports waiting for review. Please wait for those first.' };
  if (newPos && !areaContains(AREAS[loc.areaId], newPos)) return { ok: false, error: 'The new pin is outside the launch area.' };
  const item = {
    id: uid(), kind: 'report', issue, temporary: meta.temporary, status: meta.temporary ? 'active' : 'pending',
    areaId: loc.areaId, contributorId, createdAt: Date.now(), reviewedAt: null, reviewNote: '', reward: null,
    locationId, note: clean(note), suggested: suggested || null, newPos: newPos || null,
  };
  db.items.unshift(item);
  if (!save()) { db.items.shift(); return STORAGE_FULL; }
  return { ok: true, item };
}

export async function confirmPlace({ locationId, contributorId }) {
  await simulate();
  const loc = getLocation(locationId);
  if (!loc) return { ok: false, error: 'We couldn’t find that place any more.' };
  const recent = db.confirmations.find((c) => c.locationId === locationId && c.contributorId === contributorId && Date.now() - c.ts < 7 * DAY);
  if (recent) return { ok: false, reason: 'recent', error: 'You’ve already confirmed this place this week.' };
  const c = { id: uid(), locationId, contributorId, ts: Date.now() };
  db.confirmations.push(c);
  if (!save()) { db.confirmations.pop(); return STORAGE_FULL; }
  return { ok: true, ts: c.ts };
}

export async function listContributions({ contributorId }) {
  await simulate();
  return db.items.filter((i) => i.contributorId === contributorId)
    .map((i) => ({ ...i, locationName: i.locationId ? getLocation(i.locationId)?.name || 'Removed place' : null }));
}

// Lets the store pay rewards once a review outcome exists (idempotent on the client).
export async function rewardableItems({ contributorId }) {
  return db.items.filter((i) => i.contributorId === contributorId && ['approved', 'merged'].includes(i.status) && i.reward).map((i) => ({ id: i.id, ...i.reward }));
}

// ---- Admin (demo: no authentication) -----------------------------------------

function duplicatesFor(item) {
  const p = item.payload;
  const radius = config.contribution.duplicateRadiusM[p.type] ?? 40;
  return allBase().map(effective).filter((l) => l && l.areaId === item.areaId && l.type === p.type)
    .map((l) => ({ id: l.id, name: l.name, source: l.source, distanceM: Math.round(haversineKm(p, l) * 1000) }))
    .filter((l) => l.distanceM <= radius).sort((a, b) => a.distanceM - b.distanceM);
}

export async function adminQueue() {
  await simulate();
  const pendingPlaces = db.items.filter((i) => i.kind === 'new_place' && i.status === 'pending').map((i) => ({ ...i, duplicates: duplicatesFor(i) }));
  const withLoc = (i) => ({ ...i, location: getLocation(i.locationId) });
  const changes = db.items.filter((i) => i.kind === 'report' && !i.temporary && i.status === 'pending').map(withLoc);
  const temps = db.items.filter((i) => i.kind === 'report' && i.temporary && i.status === 'active').map(withLoc);
  return { places: pendingPlaces, changes, temps };
}

function applyPatch(locId, patch) {
  const cur = db.overrides[locId] || { patch: {} };
  db.overrides[locId] = { ...cur, patch: { ...cur.patch, ...patch } };
}

function normaliseEdits(edits = {}) {
  const e = { ...edits };
  if (e.hoursText !== undefined) { e.hoursText = clean(e.hoursText); e.hours = parseOpeningHours(e.hoursText); }
  for (const k of ['name', 'access', 'description']) if (e[k] !== undefined) e[k] = clean(e[k]);
  return e;
}

export async function adminReview({ id, action, edits, reason, mergeInto }) {
  await simulate();
  const item = db.items.find((i) => i.id === id);
  if (!item) return { ok: false, error: 'That submission no longer exists.' };
  if (item.status !== 'pending' && !(item.temporary && item.status === 'active')) return { ok: false, error: 'This one was already reviewed.' };
  const now = Date.now();
  const snapshot = JSON.stringify(db);
  const done = (status, outcome) => {
    item.status = status; item.reviewedAt = now;
    if (outcome) item.reward = rewardFor(item, outcome);
    if (!save()) { db = JSON.parse(snapshot); return STORAGE_FULL; }
    return { ok: true, item };
  };

  if (action === 'reject') {
    item.reviewNote = clean(reason) || 'Other';
    return done('rejected');
  }

  if (action === 'clear') { // temporary issue resolved
    return done('resolved');
  }

  // Pilot: publishing a place, merging into one or changing/removing the supplied location is paused. The item stays
  // in the queue (rejecting it is still possible).
  if (config.pilot.lockCatalogue) return { ok: false, locked: true, error: 'Publishing is paused during the pilot. You can reject this, or leave it in the queue.' };

  if (item.kind === 'new_place') {
    const e = normaliseEdits(edits);
    item.payload = { ...item.payload, ...e, photo: e.removePhoto ? null : item.payload.photo };
    delete item.payload.removePhoto; delete item.payload.hours;
    const p = item.payload;
    if (action === 'merge') {
      const target = getLocation(mergeInto);
      if (!target) return { ok: false, error: 'Pick a place to merge into.' };
      const patch = {
        materials: [...new Set([...(target.materials || []), ...p.materials])],
        materialsKnown: target.materialsKnown || p.materials.length > 0,
        description: target.description || p.description, access: target.access || p.access, photo: target.photo || p.photo,
      };
      if (!target.hoursText && p.hoursText) { patch.hoursText = p.hoursText; patch.hours = parseOpeningHours(p.hoursText); }
      applyPatch(target.id, patch);
      db.confirmations.push({ id: uid(), locationId: target.id, contributorId: 'review', ts: now });
      item.mergedInto = target.id;
      return done('merged', 'merged');
    }
    if (!areaContains(AREAS[item.areaId], p)) return { ok: false, error: 'The pin is outside the supported area.' };
    db.created.push({
      id: `c-${item.id}`, areaId: item.areaId, type: p.type, name: p.name || LABEL[p.type], lat: p.lat, lng: p.lng,
      materials: p.materials, materialsKnown: !p.notSure, hours: parseOpeningHours(p.hoursText), hoursText: p.hoursText,
      access: p.access, description: p.description, photo: p.photo, source: 'community', sample: false, approvedAt: now,
    });
    item.locationId = `c-${item.id}`;
    return done('approved', 'approved');
  }

  // Report / correction on an existing place.
  const loc = getLocation(item.locationId);
  if (!loc) return { ok: false, error: 'That place no longer exists.' };
  if (item.issue === 'removed') {
    db.overrides[loc.id] = { ...(db.overrides[loc.id] || {}), removed: true };
  } else if (item.issue === 'wrong_location') {
    const pos = { lat: Number(edits?.lat ?? item.newPos?.lat), lng: Number(edits?.lng ?? item.newPos?.lng) };
    if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return { ok: false, error: 'This report has no new position. Enter coordinates, or reject it.' };
    if (!areaContains(AREAS[loc.areaId], pos)) return { ok: false, error: 'The new position is outside the supported area.' };
    applyPatch(loc.id, pos);
  } else if (item.issue === 'incorrect_info') {
    const patch = normaliseEdits({ ...(item.suggested || {}), ...(edits || {}) });
    if (patch.materials) patch.materialsKnown = true;
    if (!Object.keys(patch).length) return { ok: false, error: 'There’s no suggested change to apply. Edit it first, or reject.' };
    applyPatch(loc.id, patch);
  }
  return done('approved', 'approved');
}

export async function adminResetDemo() {
  db = seed();
  return save() ? { ok: true } : STORAGE_FULL;
}
