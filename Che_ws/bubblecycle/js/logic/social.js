// Pure rules for friends, challenges, streaks and milestones.
// Nothing here knows about storage or the network, so a real backend can reuse it.
import { isCountable } from './rules.js';
import { weekStart, prevWeekStart, nextWeekStart, monthStart, fmtDayZ, fmtShortZ, fmtRangeZ, DAY_MS } from './zurich.js';

export const REACTIONS = [
  { key: 'nice', label: 'Nice work' },
  { key: 'leaf', label: 'Leaf', glyph: '🌿' },
  { key: 'party', label: 'Well done' },
  { key: 'go', label: 'Keep going' },
];

export const AVATAR_TONES = ['green', 'clay', 'ochre', 'slate', 'plum', 'sand'];

export const REPORT_REASONS = ['Inappropriate nickname or avatar', 'Spam or fake profile', 'Harassment', 'Something else'];

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const NICKNAME_RE = /^[\p{L}\p{N}_ .-]{3,20}$/u;

export const cleanUsername = (s) => String(s || '').trim().replace(/^@/, '').toLowerCase();
export function usernameError(u) {
  if (!USERNAME_RE.test(u)) return 'Use 3–20 lowercase letters, numbers or underscores.';
  return '';
}
export function nicknameError(n) {
  if (!NICKNAME_RE.test(n)) return '3–20 letters, numbers, spaces, dots, dashes or underscores.';
  if (/@|\d{6,}/.test(n)) return 'Please don’t use an email address or phone number.';
  return '';
}

// ---- Challenges -------------------------------------------------------------

export const challengeStatus = (ch, now) => (now < ch.start ? 'upcoming' : now < ch.end ? 'active' : 'ended');

// Boundaries are Zurich calendar boundaries. `when` is 'this' or 'next'.
export function challengeWindow(kind, when, now) {
  const off = when === 'next' ? 1 : 0;
  if (kind === 'week') return { start: weekStart(now, off), end: weekStart(now, off + 1) };
  return { start: monthStart(now, off), end: monthStart(now, off + 1) };
}

export function challengeTitle(ch) {
  if (ch.name) return ch.name;
  return ch.kind === 'week' ? `Weekly challenge · ${fmtShortZ(ch.start)}` : `Monthly challenge · ${fmtShortZ(ch.start)}`;
}
export const challengeDates = (ch) => fmtRangeZ(ch.start, ch.end);

// Counts eligible items for one participant, once each.
//  - only activity at or after the challenge start AND after the participant joined
//  - only up to the end (and not in the future)
//  - 'verified' challenges count verified items only; 'self' challenges count every eligible item
//  - ordinary rubbish isn't a recyclable material, so it never counts
export function countForChallenge(activities, ch, joinedAt, now) {
  const from = Math.max(ch.start, joinedAt);
  const to = Math.min(ch.end, now + 1);
  const seen = new Set();
  let items = 0; let verified = 0;
  for (const a of activities) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    if (a.ts < from || a.ts >= to || !isCountable(a.material)) continue;
    items += a.accepted;
    if (a.verification === 'verified') verified += a.accepted;
  }
  return { items, verified, selfReported: items - verified, score: ch.level === 'verified' ? verified : items };
}

// Standard competition ranking (ties share a rank). Only people who joined are ranked.
export function rankParticipants(rows) {
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  let last = null; let lastRank = 0;
  return sorted.map((r, i) => { const rank = r.score === last ? lastRank : i + 1; last = r.score; lastRank = rank; return { ...r, rank }; });
}

// Rows for everyone who has joined: me (counted from my own validated activity) and
// simulated friends (generated). Everyone is measured by the same rule (`ch.level`).
export function challengeRows(ch, activities, now, myName) {
  const rows = [];
  for (const p of ch.participants) {
    if (p.status !== 'joined') continue;
    if (p.userId === 'me') {
      rows.push({ userId: 'me', name: myName || 'You', avatar: p.user.avatar, isMe: true, ...countForChallenge(activities, ch, p.joinedAt, now) });
    } else {
      const s = p.sim;
      rows.push({ userId: p.userId, name: p.user.nickname, avatar: p.user.avatar, isMe: false, demo: true, items: s.items, verified: s.verified, selfReported: s.items - s.verified, score: s.score });
    }
  }
  return rankParticipants(rows);
}

export function resultMessage(rank, score, total) {
  if (score === 0) return 'No eligible items were logged this time. You can start or join another challenge any time.';
  if (rank === 1) return 'You finished first.';
  if (rank <= 3 && total > 3) return 'You finished in the top three.';
  return 'Thanks for taking part.';
}

// ---- Streaks ---------------------------------------------------------------

// `hasWeek(weekStartTs)` says whether a week had at least one eligible recycling activity.
// A week is Monday–Sunday in Zurich. The current week is still in progress: it can only
// extend a streak, never break it.
export function computeStreaks(hasWeek, now, lookbackWeeks = 52) {
  const cur = weekStart(now);
  const weeks = [];
  for (let i = lookbackWeeks; i >= 0; i--) weeks.push(weekStart(now, -i));
  let longest = 0; let run = 0;
  for (const w of weeks) { run = hasWeek(w) ? run + 1 : 0; longest = Math.max(longest, run); }
  const thisDone = hasWeek(cur);
  const last = prevWeekStart(cur);
  const anchor = thisDone ? cur : hasWeek(last) ? last : null;
  let current = 0;
  for (let w = anchor; w !== null && hasWeek(w) && current <= lookbackWeeks + 1; w = prevWeekStart(w)) current++;
  const recent = weeks.slice(-8).map((w) => ({ start: w, done: hasWeek(w), isCurrent: w === cur, label: fmtShortZ(w) }));
  const ended = !thisDone && !hasWeek(last) && longest > 0;
  return { current, longest, thisDone, ended, recent, alive: current > 0 && !thisDone };
}

export function weekCountsFromActivities(activities) {
  const seen = new Set(); const map = new Map();
  for (const a of activities) {
    if (seen.has(a.id)) continue; seen.add(a.id);
    if (!isCountable(a.material) || !(a.accepted > 0)) continue;
    const w = weekStart(a.ts);
    map.set(w, (map.get(w) || 0) + a.accepted);
  }
  return map;
}

export const streakMessage = (s) => {
  if (s.thisDone) return s.current >= 2 ? `This week is done. That’s ${s.current} weeks in a row.` : 'This week is done.';
  if (s.alive) return `Your streak is at ${s.current} week${s.current === 1 ? '' : 's'}. One eligible drop-off this week keeps it going. There’s no need for extra trips.`;
  if (s.ended) return 'A fresh week, a fresh start. Your streak has ended, and a new one begins the next time you recycle.';
  return 'Recycle something this week to start a streak. One drop-off is enough.';
};

// ---- Milestones (shared only if the user allows it; never carry places or times) ----

const ITEM_STEPS = [10, 25, 50, 100, 250, 500];
const STREAK_STEPS = [2, 4, 8, 12, 26];
export function myMilestones(activities, streaks, badges) {
  const seen = new Set();
  let total = 0;
  for (const a of activities) { if (seen.has(a.id)) continue; seen.add(a.id); if (isCountable(a.material)) total += a.accepted; }
  const out = [];
  for (const n of ITEM_STEPS) if (total >= n) out.push({ id: `items-${n}`, text: `Reached ${n} recycled items`, icon: 'leaf' });
  for (const n of STREAK_STEPS) if (streaks.longest >= n) out.push({ id: `streak-${n}`, text: `${n}-week recycling streak`, icon: 'leaf' });
  if (badges.length) out.push({ id: 'badge-1', text: `Finished a challenge${badges.length > 1 ? ` (${badges.length} badges)` : ''}`, icon: 'star' });
  return out.reverse();
}

export { fmtDayZ, DAY_MS, nextWeekStart };
