// DEMO social backend. Persists to localStorage and SIMULATES the other people: friends
// accept requests and invitations after a short delay, and their recycling is generated.
// A real launch replaces this with accounts + a server (see services/live.js and README).
import { uid, hashStr } from '../utils.js';
import { nowTs } from '../logic/clock.js';
import { challengeWindow, challengeStatus, USERNAME_RE } from '../logic/social.js';
import { weekStart, DAY_MS } from '../logic/zurich.js';
import { DEMO_USERS, demoUser, demoByUsername, simStreaks, simItemsThisWeek, simChallengeScore } from '../data/social-demo.js';
import { simulate } from './latency.js';

const KEY = 'bubblecycle:social-demo:v1';
const HOUR = 3600000;
const clean = (s) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 40);

function seed() {
  const now = nowTs();
  const thisWeek = challengeWindow('week', 'this', now);
  const lastWeek = { start: weekStart(now, -1), end: weekStart(now) };
  return {
    version: 1,
    friends: ['u-marta', 'u-gabi'],
    incoming: [{ id: 'req-seed-1', userId: 'u-luca', ts: now - DAY_MS }],
    outgoing: [], blocked: [], reports: [], reactions: {},
    challenges: [
      { id: 'ch-seed-invite', name: 'Bubble race', kind: 'week', ...thisWeek, level: 'self', creatorId: 'u-marta', createdAt: now - 3 * HOUR,
        participants: [{ userId: 'u-marta', status: 'joined', joinedAt: thisWeek.start }, { userId: 'u-gabi', status: 'joined', joinedAt: thisWeek.start + HOUR }, { userId: 'me', status: 'invited', joinedAt: null }], result: null },
      { id: 'ch-seed-ended', name: 'Last week’s bubble race', kind: 'week', ...lastWeek, level: 'self', creatorId: 'u-gabi', createdAt: lastWeek.start - DAY_MS,
        participants: [{ userId: 'u-gabi', status: 'joined', joinedAt: lastWeek.start }, { userId: 'u-marta', status: 'joined', joinedAt: lastWeek.start }, { userId: 'me', status: 'joined', joinedAt: lastWeek.start }], result: null },
    ],
  };
}

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s?.version === 1) return s; } catch { /* fall through */ }
  const s = seed();
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  return s;
}
let db = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch { return false; } };

const lite = (u) => ({ id: u.id, username: u.username, nickname: u.nickname, avatar: u.avatar, demo: true });
const ME = (name, avatar) => ({ id: 'me', nickname: name || 'You', avatar: avatar || null, isMe: true });

// Resolve simulated responses that are due.
function tick(now) {
  let changed = false;
  for (const o of [...db.outgoing]) {
    if (o.respondAt <= now) { db.friends.push(o.userId); db.outgoing = db.outgoing.filter((x) => x.id !== o.id); changed = true; }
  }
  for (const ch of db.challenges) {
    for (const p of ch.participants) {
      if (p.status === 'invited' && p.userId !== 'me' && p.respondAt <= now) {
        if (p.respondAt >= ch.end) p.status = 'expired';
        else if (p.decline) p.status = 'declined';
        else { p.status = 'joined'; p.joinedAt = p.respondAt; }
        changed = true;
      }
    }
    if (ch.end <= now) for (const p of ch.participants) if (p.userId === 'me' && p.status === 'invited') { p.status = 'expired'; changed = true; }
  }
  if (changed) save();
}

function friendDTO(u, now) {
  const st = simStreaks(u, now);
  return {
    ...lite(u), shares: { ...u.privacy },
    stats: { weekItems: u.privacy.totals ? simItemsThisWeek(u, now) : null, streak: u.privacy.streaks ? st.current : null, longest: u.privacy.streaks ? st.longest : null },
  };
}

function challengeDTO(ch, now, myName, myAvatar) {
  return {
    ...ch, status: challengeStatus(ch, now),
    participants: ch.participants.map((p) => {
      if (p.userId === 'me') return { ...p, user: ME(myName, myAvatar) };
      const u = demoUser(p.userId);
      return { ...p, user: lite(u), sim: p.status === 'joined' ? simChallengeScore(u, ch, p.joinedAt, now) : null };
    }),
  };
}

export async function getSocial({ myName, myAvatar } = {}) {
  await simulate();
  const now = nowTs();
  tick(now);
  const friends = db.friends.map((id) => friendDTO(demoUser(id), now));
  const feed = db.friends.flatMap((id) => {
    const u = demoUser(id);
    return u.privacy.milestones ? u.milestones.map((m) => ({ id: m.id, user: lite(u), text: m.text, emoji: m.emoji, daysAgo: m.daysAgo, reacted: db.reactions[m.id] || [] })) : [];
  }).sort((a, b) => a.daysAgo - b.daysAgo);
  return {
    now, friends, feed,
    incoming: db.incoming.map((r) => ({ id: r.id, ts: r.ts, user: lite(demoUser(r.userId)) })),
    outgoing: db.outgoing.map((o) => ({ id: o.id, ts: o.ts, user: lite(demoUser(o.userId)) })),
    blocked: db.blocked.map((id) => lite(demoUser(id))),
    challenges: db.challenges.map((c) => challengeDTO(c, now, myName, myAvatar)).sort((a, b) => b.start - a.start),
  };
}

// ---- Friends -------------------------------------------------------------------

export async function findUser({ username, myUsername }) {
  await simulate();
  if (!USERNAME_RE.test(username)) return { status: 'invalid' };
  if (username === myUsername) return { status: 'self' };
  const u = demoByUsername(username);
  if (!u || u.discoverable === false || db.blocked.includes(u.id)) return { status: 'none' }; // exact match only, nothing revealed otherwise
  if (db.friends.includes(u.id)) return { status: 'friend', user: lite(u) };
  if (db.outgoing.some((o) => o.userId === u.id)) return { status: 'requested', user: lite(u) };
  const inc = db.incoming.find((r) => r.userId === u.id);
  if (inc) return { status: 'incoming', user: lite(u), requestId: inc.id };
  return { status: 'found', user: lite(u) };
}

export async function sendRequest({ username }) {
  await simulate();
  const u = demoByUsername(username);
  if (!u || u.discoverable === false || db.blocked.includes(u.id)) return { ok: false, error: 'We couldn’t find that username.' };
  if (db.friends.includes(u.id) || db.outgoing.some((o) => o.userId === u.id)) return { ok: false, error: 'You’re already connected or waiting for a reply.' };
  if (db.outgoing.length >= 10) return { ok: false, error: 'You have 10 requests waiting. Let’s wait for some replies first.' };
  const now = nowTs();
  db.outgoing.push({ id: uid(), userId: u.id, ts: now, respondAt: now + 12000 + hashStr(u.id) * 18000 });
  db.incoming = db.incoming.filter((r) => r.userId !== u.id);
  save();
  return { ok: true };
}

export async function respondRequest({ id, accept }) {
  await simulate();
  const r = db.incoming.find((x) => x.id === id);
  if (!r) return { ok: false, error: 'That request is no longer there.' };
  db.incoming = db.incoming.filter((x) => x.id !== id);
  if (accept && !db.friends.includes(r.userId)) db.friends.push(r.userId);
  save();
  return { ok: true };
}

export async function cancelRequest({ id }) {
  await simulate();
  db.outgoing = db.outgoing.filter((o) => o.id !== id);
  save();
  return { ok: true };
}

export async function removeFriend({ userId }) {
  await simulate();
  db.friends = db.friends.filter((id) => id !== userId);
  save();
  return { ok: true };
}

export async function blockUser({ userId }) {
  await simulate();
  db.friends = db.friends.filter((id) => id !== userId);
  db.incoming = db.incoming.filter((r) => r.userId !== userId);
  db.outgoing = db.outgoing.filter((o) => o.userId !== userId);
  if (!db.blocked.includes(userId)) db.blocked.push(userId);
  save();
  return { ok: true };
}

export async function unblockUser({ userId }) {
  await simulate();
  db.blocked = db.blocked.filter((id) => id !== userId);
  save();
  return { ok: true };
}

export async function reportUser({ userId, reason }) {
  await simulate();
  db.reports.push({ id: uid(), userId, reason: clean(reason), ts: nowTs() });
  save();
  return { ok: true };
}

export async function react({ itemId, key }) {
  await simulate();
  const cur = db.reactions[itemId] || [];
  db.reactions[itemId] = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
  save();
  return { ok: true, reacted: db.reactions[itemId] };
}

// ---- Challenges ------------------------------------------------------------------

export async function createChallenge({ kind, when, level, inviteIds, name }) {
  await simulate();
  const now = nowTs();
  if (!['week', 'month'].includes(kind) || !['this', 'next'].includes(when) || !['self', 'verified'].includes(level)) return { ok: false, error: 'Please check the challenge options.' };
  const ids = [...new Set(inviteIds)].filter((id) => db.friends.includes(id));
  if (!ids.length) return { ok: false, error: 'Invite at least one friend.' };
  if (ids.length > 9) return { ok: false, error: 'You can invite up to 9 friends.' };
  const win = challengeWindow(kind, when, now);
  const active = db.challenges.filter((c) => c.end > now && c.participants.some((p) => p.userId === 'me' && ['joined', 'invited'].includes(p.status)));
  if (active.length >= 6) return { ok: false, error: 'You already have 6 challenges going. Wait for one to finish or leave one before starting another.' };
  const ch = {
    id: `ch-${uid()}`, name: clean(name), kind, ...win, level, creatorId: 'me', createdAt: now,
    participants: [{ userId: 'me', status: 'joined', joinedAt: now }, ...ids.map((userId) => ({
      userId, status: 'invited', joinedAt: null, respondAt: now + 12000 + hashStr(userId + now) * 25000, decline: hashStr(userId + ch0(kind)) > 0.88,
    }))],
    result: null,
  };
  db.challenges.push(ch);
  save();
  return { ok: true, id: ch.id };
}
const ch0 = (k) => k + 'x';

export async function respondChallenge({ id, accept }) {
  await simulate();
  const ch = db.challenges.find((c) => c.id === id);
  const me = ch?.participants.find((p) => p.userId === 'me');
  const now = nowTs();
  if (!ch || !me || me.status !== 'invited') return { ok: false, error: 'That invitation is no longer open.' };
  if (ch.end <= now) { me.status = 'expired'; save(); return { ok: false, error: 'That challenge has already ended.' }; }
  me.status = accept ? 'joined' : 'declined';
  me.joinedAt = accept ? now : null;
  save();
  return { ok: true, joinedAt: me.joinedAt };
}

export async function leaveChallenge({ id }) {
  await simulate();
  const ch = db.challenges.find((c) => c.id === id);
  const me = ch?.participants.find((p) => p.userId === 'me');
  if (!me || ch.end <= nowTs()) return { ok: false, error: 'You can’t leave a finished challenge.' };
  me.status = 'left';
  save();
  return { ok: true };
}

export async function saveChallengeResult({ id, result }) {
  const ch = db.challenges.find((c) => c.id === id);
  if (!ch || ch.result) return { ok: true };
  ch.result = result;
  save();
  return { ok: true };
}

export async function resetSocialDemo() {
  db = seed();
  return save() ? { ok: true } : { ok: false, error: 'Storage is full.' };
}

export { DEMO_USERS };
