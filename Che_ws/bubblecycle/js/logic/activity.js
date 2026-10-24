// Recycling logs, points and leaderboard maths.
// Two separate ledgers on purpose:
//  - activities: accepted recyclable items (drives progress and leaderboard)
//  - points ledger: spendable points (earned from activities, spent on rewards)
// Redeeming only touches the points ledger, so it can never move anyone on the leaderboard.
import { config } from '../config.js';
import { startOfDay } from '../utils.js';
import { isCountable, MATERIALS } from './rules.js';
import { nowTs } from './clock.js';
import { weekStart, monthStart, zParts, fmtShortZ, fmtMonthZ } from './zurich.js';

const { maxItemsPerLog, maxLogsPerDay, maxItemsPerDay, duplicateWindowMin } = config.limits;

// Validates a batch of entries ([{ material, count }]) before it is saved.
// Returns { ok:false, error } or { ok:true, entries:[{ material, count, accepted }], accepted, capped }.
export function evaluateLog(activities, entries, now = nowTs()) {
  const clean = entries.filter((e) => e.material && e.count > 0);
  if (!clean.length) return { ok: false, code: 'no_items', error: 'Add at least one item to log.' };

  for (const e of clean) {
    if (!isCountable(e.material)) return { ok: false, code: 'not_countable', error: `${MATERIALS[e.material]?.label || 'That material'} isn’t counted as an accepted recyclable item yet.` };
    if (!Number.isInteger(e.count) || e.count < 1) return { ok: false, code: 'not_integer', error: 'Item counts must be whole numbers.' };
    if (e.count > maxItemsPerLog) return { ok: false, code: 'too_many_per_log', error: `You can log up to ${maxItemsPerLog} items per material at once. Split larger amounts into separate logs.` };
  }
  const seen = new Set();
  for (const e of clean) {
    if (seen.has(e.material)) return { ok: false, code: 'duplicate_material', error: `${MATERIALS[e.material].label} appears twice — combine them into one line.` };
    seen.add(e.material);
  }

  const today = activities.filter((a) => a.ts >= startOfDay(now));
  const logsToday = new Set(today.map((a) => a.batchId)).size;
  if (logsToday >= maxLogsPerDay) return { ok: false, code: 'daily_logs', error: `You’ve reached today’s limit of ${maxLogsPerDay} logs. You can log again tomorrow.` };

  const windowStart = now - duplicateWindowMin * 60000;
  for (const e of clean) {
    const dup = activities.find((a) => a.ts >= windowStart && a.material === e.material && a.count === e.count);
    if (dup) {
      const mins = Math.max(1, Math.round((now - dup.ts) / 60000));
      return { ok: false, code: 'duplicate', error: `This looks like a duplicate: you logged ${e.count} × ${MATERIALS[e.material].label.toLowerCase()} ${mins} min ago. If it’s really new, wait a few minutes or change the count.` };
    }
  }

  let remaining = maxItemsPerDay - today.reduce((s, a) => s + a.accepted, 0);
  if (remaining <= 0) return { ok: false, code: 'daily_items', error: `You’ve hit the daily cap of ${maxItemsPerDay} items. Anything more can be logged tomorrow.` };
  let capped = false;
  const out = clean.map((e) => {
    const accepted = Math.min(e.count, Math.max(0, remaining));
    if (accepted < e.count) capped = true;
    remaining -= accepted;
    return { ...e, accepted };
  });
  return { ok: true, entries: out, accepted: out.reduce((s, e) => s + e.accepted, 0), capped };
}

export function pointsFor(accepted, verified) {
  return accepted * config.points.perItem + (verified ? accepted * config.points.verifiedBonusPerItem : 0);
}

export const balance = (ledger) => ledger.reduce((s, l) => s + l.points, 0);

// ---- Periods ---------------------------------------------------------------

// Weeks run Monday–Sunday and months follow the calendar, both in Europe/Zurich time.
export function periodRange(kind, offset = 0, now = nowTs()) {
  const ms = +now;
  if (kind === 'week') {
    const start = weekStart(ms, offset);
    const end = weekStart(ms, offset + 1);
    return { kind, key: `w${start}`, start, end, label: `${fmtShortZ(start)} – ${fmtShortZ(end - 1)}` };
  }
  const start = monthStart(ms, offset);
  const end = monthStart(ms, offset + 1);
  const p = zParts(start);
  return { kind, key: `m${p.y}-${p.m}`, start, end, label: fmtMonthZ(start) };
}

export function countInRange(activities, { start, end }) {
  const inRange = activities.filter((a) => a.ts >= start && a.ts < end);
  return {
    items: inRange.reduce((s, a) => s + a.accepted, 0),
    verified: inRange.filter((a) => a.verification === 'verified').reduce((s, a) => s + a.accepted, 0),
  };
}

export function buildLeaderboard(peers, me, verifiedOnly) {
  const rows = [...peers, ...(me ? [me] : [])].map((r) => ({ ...r, score: verifiedOnly ? r.verified : r.items }));
  rows.sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
  // Standard competition ranking: ties share a rank.
  let lastScore = null; let lastRank = 0;
  return rows.map((r, i) => {
    const rank = r.score === lastScore ? lastRank : i + 1;
    lastScore = r.score; lastRank = rank;
    return { ...r, rank };
  });
}
