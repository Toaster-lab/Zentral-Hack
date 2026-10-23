// SIMULATED people. These profiles are made up; their activity is generated, not real.
// Every place in the UI that shows them marks them as demo/simulated. Real accounts need a
// backend (see README). Privacy flags show how sharing choices are respected.
import { hashStr } from '../utils.js';
import { computeStreaks } from '../logic/social.js';
import { weekStart } from '../logic/zurich.js';

export const DEMO_USERS = [
  { id: 'u-marta', username: 'minty_marta', nickname: 'MintyMarta', avatar: { initial: 'M', tone: 'green' }, privacy: { totals: true, streaks: true, milestones: true }, consistency: 0.92, scale: 1.2,
    milestones: [{ id: 'm-marta-1', text: 'Reached 100 recycled items', daysAgo: 2 }, { id: 'm-marta-2', text: '8-week recycling streak', daysAgo: 6 }] },
  { id: 'u-gabi', username: 'glass_gabi', nickname: 'GlassGabi', avatar: { initial: 'G', tone: 'slate' }, privacy: { totals: true, streaks: false, milestones: true }, consistency: 0.75, scale: 1,
    milestones: [{ id: 'm-gabi-1', text: 'Reached 50 recycled items', daysAgo: 4 }] },
  { id: 'u-luca', username: 'sky_luca', nickname: 'SkyLuca', avatar: { initial: 'S', tone: 'slate' }, privacy: { totals: true, streaks: true, milestones: true }, consistency: 0.6, scale: 0.8,
    milestones: [{ id: 'm-luca-1', text: 'Reached 25 recycled items', daysAgo: 9 }] },
  { id: 'u-lea', username: 'lavender_lea', nickname: 'LavenderLea', avatar: { initial: 'L', tone: 'plum' }, privacy: { totals: false, streaks: true, milestones: false }, consistency: 0.85, scale: 1.4, milestones: [] },
  { id: 'u-andri', username: 'alu_andri', nickname: 'AluAndri', avatar: { initial: 'A', tone: 'clay' }, privacy: { totals: true, streaks: true, milestones: true }, consistency: 0.5, scale: 0.9,
    milestones: [{ id: 'm-andri-1', text: '4-week recycling streak', daysAgo: 1 }] },
  { id: 'u-pia', username: 'peachy_pia', nickname: 'PeachyPia', avatar: { initial: 'P', tone: 'clay' }, privacy: { totals: false, streaks: false, milestones: true }, consistency: 0.7, scale: 1.1,
    milestones: [{ id: 'm-pia-1', text: 'Finished a challenge', daysAgo: 12 }] },
  // Not discoverable: exact-username search finds nothing (they keep their profile private).
  { id: 'u-quinn', username: 'quiet_quinn', nickname: 'QuietQuinn', avatar: { initial: 'Q', tone: 'plum' }, privacy: { totals: false, streaks: false, milestones: false }, consistency: 0.4, scale: 1, milestones: [], discoverable: false },
];

export const demoUser = (id) => DEMO_USERS.find((u) => u.id === id);
export const demoByUsername = (name) => DEMO_USERS.find((u) => u.username === name);

// Items a simulated person recycled in the week starting `ws` (deterministic).
export function simWeekItems(user, ws) {
  if (hashStr(user.id + ws) > user.consistency) return 0;
  return Math.max(1, Math.round((1 + hashStr(ws + user.id) * 8) * user.scale));
}

export const simStreaks = (user, now) => computeStreaks((ws) => simWeekItems(user, ws) > 0, now, 40);

// Items so far this week, scaled by how much of the week has passed.
export function simItemsThisWeek(user, now) {
  const ws = weekStart(now);
  const frac = Math.min(1, Math.max(0.1, (now - ws) / (7 * 86400000)));
  return Math.round(simWeekItems(user, ws) * frac);
}

// Simulated progress in a challenge: grows with the share of the period elapsed after the
// person joined. 'verified' challenges only count the verified share.
export function simChallengeScore(user, ch, joinedAt, now) {
  const from = Math.max(ch.start, joinedAt);
  const to = Math.min(ch.end, now);
  if (to <= from) return { items: 0, verified: 0, score: 0 };
  const full = ch.kind === 'week' ? 4 + hashStr(user.id + ch.id) * 26 : 12 + hashStr(user.id + ch.id) * 90;
  const items = Math.round(full * user.scale * ((to - from) / (ch.end - ch.start)));
  const verified = Math.round(items * (0.15 + hashStr(ch.id + user.id) * 0.55));
  return { items, verified, score: ch.level === 'verified' ? verified : items };
}
