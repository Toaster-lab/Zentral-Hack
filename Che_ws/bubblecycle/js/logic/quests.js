// Monthly quests: optional goals that pay a one-off bonus of spendable points.
// Months are calendar months in Europe/Zurich. Quests only read activity the app already
// validated (duplicates and unrealistic logs are blocked when logging), count each log once,
// and never ask for purchases or extra trips. Bonus points never touch recycling counts or ranks.
import { isCountable } from './rules.js';
import { weekStart } from './zurich.js';
import { periodRange } from './activity.js';
import { nowTs } from './clock.js';

export const QUESTS = [
  { id: 'items', title: 'Recycle 25 items', desc: 'Log 25 eligible items this month.', target: 25, points: 30, unit: 'items', measure: (c) => c.items },
  { id: 'mix', title: 'Try 4 different materials', desc: 'Log at least four materials, for example glass, PET, aluminium and paper.', target: 4, points: 20, unit: 'materials', measure: (c) => c.materials },
  { id: 'verified', title: 'Log 5 verified items', desc: 'Use a station receipt code on a log so its items count as verified.', target: 5, points: 25, unit: 'items', measure: (c) => c.verified },
  { id: 'weeks', title: 'Recycle in 3 different weeks', desc: 'Log something in three separate weeks. One drop-off a week is enough.', target: 3, points: 25, unit: 'weeks', measure: (c) => c.weeks },
  { id: 'scans', title: 'Check 5 products', desc: 'Scan five different barcodes from the app’s database to see how their packaging is recycled.', target: 5, points: 15, unit: 'products', measure: (c) => c.scans },
  { id: 'dex', title: 'Add 3 entries to the Bottledex', desc: 'Find three new container types by scanning things you already have. Barcodes you add yourself don’t count here.', target: 3, points: 20, unit: 'entries', measure: (c) => c.dex },
  { id: 'map', title: 'Help the map twice', desc: 'Confirm a place is still there, or get a contribution approved. Twice this month.', target: 2, points: 15, unit: 'actions', measure: (c) => c.map },
];

export function questContext(state, now = nowTs()) {
  const range = periodRange('month', 0, now);
  const within = (ts) => ts >= range.start && ts < range.end;
  const seen = new Set();
  const materials = new Set();
  const weeks = new Set();
  let items = 0; let verified = 0;
  for (const a of state.activities) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    if (!within(a.ts) || !isCountable(a.material) || !(a.accepted > 0)) continue;
    items += a.accepted; materials.add(a.material); weeks.add(weekStart(a.ts));
    if (a.verification === 'verified') verified += a.accepted;
  }
  const scans = new Set(state.scans.filter((s) => within(s.ts)).map((s) => s.code)).size;
  const dex = Object.values(state.collection).filter((e) => e.source === 'database' && within(e.firstTs)).length;
  const map = state.ledger.filter((l) => within(l.ts) && (l.type === 'confirm' || l.type === 'contribute')).length;
  return { range, items, materials: materials.size, verified, weeks: weeks.size, scans, dex, map };
}

// Quests the server can verify from its own records (the others depend on data kept only on the device).
export const SERVER_QUESTS = ['items', 'mix', 'verified', 'weeks'];

export function questStatuses(state, now = nowTs(), only = null) {
  const ctx = questContext(state, now);
  const list = QUESTS.filter((q) => !only || only.includes(q.id)).map((q) => {
    const progress = Math.min(q.target, q.measure(ctx));
    const claimId = `${ctx.range.key}:${q.id}`;
    return { ...q, progress, done: progress >= q.target, claimId, claimed: state.questClaims.includes(claimId) };
  });
  return { range: ctx.range, list, ready: list.filter((q) => q.done && !q.claimed), claimable: list.filter((q) => q.done && !q.claimed).reduce((s, q) => s + q.points, 0) };
}
