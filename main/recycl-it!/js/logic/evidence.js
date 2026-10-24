import { config } from '../config.js';
import { haversineKm } from '../utils.js';

export const EVIDENCE = {
  self: { label: 'Self-reported', hint: 'You told us what you recycled. Nothing was checked.' },
  location: { label: 'Location checked', hint: 'Your device was near the station when you checked in. This does not show what was deposited.' },
  partner: { label: 'Confirmed by a collection partner', hint: 'A collection partner confirmed the deposit. No partner is connected in this demo.' },
};
export const EVIDENCE_RANK = { self: 0, location: 1, partner: 2 };
export const meetsEvidence = (have, need = 'self') => EVIDENCE_RANK[have || 'self'] >= EVIDENCE_RANK[need];

export function locationCheck(pos, station) {
  const { nearM, maxAccuracyM } = config.checkin;
  if (!pos) return { result: 'none' };
  const accuracyM = Math.round(pos.accuracy || 0);
  const distanceM = Math.round(haversineKm(pos, station) * 1000);
  if (accuracyM > maxAccuracyM) return { result: 'inaccurate', accuracyM, distanceM };
  return { result: distanceM <= nearM + accuracyM ? 'near' : 'far', accuracyM, distanceM };
}

export const evidenceFromLocation = (loc) => (loc?.result === 'near' ? 'location' : 'self');

export const FLAGS = {
  rapid: { label: 'Several check-ins in a short time', hint: 'Fine if you were doing a few runs. A person may take a quick look.' },
  overlap: { label: 'Two stations at the same time', hint: 'Another check-in at a different station overlaps this one.' },
  large: { label: 'A large amount in one go', hint: 'Big recycling trips are genuine and welcome. A person may take a quick look.' },
  dupe_photo: { label: 'This photo looks like an earlier one', hint: 'Take a fresh photo of what you have now.' },
  travel: { label: 'Stations too far apart for the time between', hint: 'Check the times, or tell us if the clock on your device was off.' },
  far: { label: 'Your device was away from the station', hint: 'GPS can be off in built-up areas. You can explain this in an appeal.' },
};

const POP = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
export function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += POP[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return d;
}

export function reviewFlags(history, c) {
  const k = config.checkin;
  const prior = history.filter((h) => h.status !== 'declined');
  const out = [];
  const recent = prior.filter((h) => c.ts - h.ts <= k.rapidWindowMin * 60000);
  if (recent.length >= k.rapidCount - 1) out.push('rapid');
  if (prior.some((h) => h.stationId !== c.stationId && h.startedAt < c.ts && c.startedAt < h.ts)) out.push('overlap');
  if (c.entries.reduce((s, e) => s + Number(e.count || 0), 0) >= k.largeTripItems) out.push('large');
  if (c.fp && prior.some((h) => h.fp && hamming(h.fp, c.fp) <= k.dupeHamming)) out.push('dupe_photo');
  const prev = prior[0];
  if (prev && prev.stationId !== c.stationId && prev.at && c.at) {
    const hours = Math.max((c.ts - prev.ts) / 3600000, 1 / 3600);
    const km = haversineKm(prev.at, c.at);
    if (km > 0.3 && km / hours > k.maxSpeedKmh) out.push('travel');
  }
  if (c.location?.result === 'far') out.push('far');
  return out;
}
