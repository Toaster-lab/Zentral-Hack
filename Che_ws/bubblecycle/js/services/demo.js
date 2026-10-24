// Demo providers: bundled sample data with simulated latency.
// Every function here has a counterpart in live.js with the same signature.
import { hashStr } from '../utils.js';
import { PLACES, AREA_POSTCODES } from '../data/places.js';
import { AREAS } from '../data/areas.js';
import { PRODUCTS } from '../data/products.js';
import { BARCODES } from '../data/barcodes.js';
import { DEMO_RECEIPT_CODES, DEMO_PLAYERS } from '../data/misc.js';
import { matchProducts, boostByQuery } from '../logic/discover.js';
import { simulate } from './latency.js';
import { nowTs } from '../logic/clock.js';

export * from './community.js'; // locations + community backend (demo)
export { getSocial, findUser, sendRequest, respondRequest, cancelRequest, removeFriend, blockUser, unblockUser, reportUser, react,
  createChallenge, respondChallenge, leaveChallenge, saveChallengeResult, resetSocialDemo } from './social.js';

// Returns { label, lat, lng, areaId, municipality } for places in a supported area,
// { outside: true, label } for places we recognise but don't support yet, or null.
export async function geocode(text) {
  await simulate();
  const q = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^\d{4}$/.test(q)) {
    const areaId = AREA_POSTCODES[q];
    if (!areaId) return { outside: true, label: q };
    const a = AREAS[areaId];
    return { label: `${q} ${a.name}`, lat: a.center.lat, lng: a.center.lng, areaId, municipality: a.municipality };
  }
  const hit = PLACES.find((p) => p.names.includes(q)) || PLACES.find((p) => p.names.some((n) => n.length > 3 && (n.startsWith(q) || q.includes(n))));
  if (!hit) return null;
  return hit.areaId ? hit : { outside: true, label: hit.label };
}

// -> { items, unknown, nothingAsked }; `unknown` = words we couldn't match to any product.
export async function searchProducts({ filters, terms, text }) {
  await simulate();
  const r = matchProducts(PRODUCTS, filters, terms);
  return { ...r, items: boostByQuery(r.items, text) };
}

export async function lookupBarcode(code) {
  await simulate();
  return BARCODES[code] || null;
}

export async function submitCheckin(payload) {
  await simulate();
  return { received: true, payload };
}

export async function verifyReceipt(code) {
  await simulate();
  return { valid: DEMO_RECEIPT_CODES.includes(code.trim().toUpperCase()) };
}

// Fictional peers with deterministic counts per period. For the current period the counts
// scale with how much of the period has passed, so the board looks plausible all week.
export async function leaderboardPeers({ key, start, end }) {
  await simulate();
  const monthly = key.startsWith('m');
  const elapsed = Math.min(1, Math.max(0.15, (nowTs() - start) / (end - start)));
  return DEMO_PLAYERS.map((nickname) => {
    const r = hashStr(nickname + key);
    const full = monthly ? Math.round(15 + r * 145) : Math.round(3 + r * 42);
    const items = Math.max(0, Math.round(full * elapsed));
    const verified = Math.round(items * hashStr(key + nickname) * 0.6);
    return { nickname, items, verified, demo: true };
  });
}
