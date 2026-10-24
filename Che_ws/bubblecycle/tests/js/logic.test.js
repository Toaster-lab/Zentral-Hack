// Pure rules in the browser: Zurich time, logging limits, rankings, streaks, challenges, calendar.
import { test, assert, equal } from './lib.js';
import { weekStart, monthStart, startOfDayZ, prevWeekStart } from '../../js/logic/zurich.js';
import { evaluateLog, periodRange, countInRange, buildLeaderboard, pointsFor } from '../../js/logic/activity.js';
import { computeStreaks, countForChallenge, rankParticipants, challengeWindow } from '../../js/logic/social.js';
import { upcoming, tomorrow, toIcs, todayKey } from '../../js/logic/calendar.js';
import { COLLECTIONS } from '../../js/data/collection-calendar.js';

const load = async (name) => (await fetch(`../fixtures/${name}.json`)).json();
const ZURICH = await load('zurich');
const RULES = await load('rules');

// A Zurich wall-clock time as a timestamp, with the UTC offset written out (+1 winter, +2 summer) so the
// expectation doesn't depend on the code under test.
const zt = (y, m, d, h, mi, off) => Date.UTC(y, m - 1, d, h - off, mi);
const HOUR = 3600000;

// ---- Zurich time -------------------------------------------------------------------------------
for (const c of ZURICH) {
  test(`zurich boundaries at ${c.local}`, () => {
    equal(startOfDayZ(c.ts), c.dayStart, 'day start');
    equal(weekStart(c.ts), c.weekStart, 'week start');
    equal(weekStart(c.ts, 1), c.nextWeekStart, 'next week');
    equal(weekStart(c.ts, -1), c.prevWeekStart, 'previous week');
    equal(monthStart(c.ts), c.monthStart, 'month start');
    equal(monthStart(c.ts, 1), c.nextMonthStart, 'next month');
    equal(monthStart(c.ts, -1), c.prevMonthStart, 'previous month');
  });
}

test('weeks are an hour shorter in spring and an hour longer in autumn', () => {
  const spring = periodRange('week', 0, zt(2026, 3, 29, 12, 0, 2));
  const autumn = periodRange('week', 0, zt(2026, 10, 25, 12, 0, 1));
  equal(spring.end - spring.start, 7 * 24 * HOUR - HOUR);
  equal(autumn.end - autumn.start, 7 * 24 * HOUR + HOUR);
});

// ---- Logging limits (same cases the server is tested with) ------------------------------------------
for (const c of RULES) {
  test(`log rule: ${c.name}`, () => {
    const res = evaluateLog(c.history, c.entries, c.now);
    equal(res.ok, c.expect.ok, 'ok');
    if (c.expect.code) equal(res.code, c.expect.code, 'code');
    if (c.expect.accepted !== null) equal(res.accepted, c.expect.accepted, 'accepted');
  });
}

test('points: 5 per item, +2 for verified items', () => {
  equal(pointsFor(10, false), 50);
  equal(pointsFor(10, true), 70);
});

// ---- Weekly and monthly rankings ------------------------------------------------------------------------
const act = (id, ts, accepted, verification = 'self-reported', material = 'glass') => ({ id, ts, material, count: accepted, accepted, verification });

test('Sunday 23:59 belongs to the old week, Monday 00:00 to the new one (clocks went back that night)', () => {
  const sunday = zt(2026, 10, 25, 23, 59, 1);
  const monday = zt(2026, 10, 26, 0, 0, 1);
  const rows = [act('a', sunday, 3), act('b', monday, 4)];
  equal(countInRange(rows, periodRange('week', 0, monday)).items, 4);
  equal(countInRange(rows, periodRange('week', -1, monday)).items, 3);
});

test('the spring-forward week counts across the missing hour', () => {
  const rows = [act('a', zt(2026, 3, 29, 1, 59, 1), 2), act('b', zt(2026, 3, 29, 3, 0, 2), 3), act('c', zt(2026, 3, 30, 0, 0, 2), 6)];
  equal(countInRange(rows, periodRange('week', 0, zt(2026, 3, 30, 12, 0, 2))).items, 6);
  equal(countInRange(rows, periodRange('week', -1, zt(2026, 3, 30, 12, 0, 2))).items, 5);
});

test('months and year ends', () => {
  const rows = [act('a', zt(2026, 12, 31, 23, 59, 1), 3), act('b', zt(2027, 1, 1, 0, 0, 1), 4)];
  const jan = zt(2027, 1, 15, 12, 0, 1);
  equal(countInRange(rows, periodRange('month', 0, jan)).items, 4);
  equal(countInRange(rows, periodRange('month', -1, jan)).items, 3);
});

test('verified items are counted separately and ties share a rank', () => {
  const rows = [act('a', Date.now(), 5, 'verified'), act('b', Date.now(), 3)];
  const c = countInRange(rows, periodRange('week', 0, Date.now()));
  equal([c.items, c.verified], [8, 5]);
  const board = buildLeaderboard([{ nickname: 'Ann', items: 5, verified: 1 }, { nickname: 'Bob', items: 5, verified: 4 }, { nickname: 'Cy', items: 2, verified: 0 }], null, false);
  equal(board.map((r) => [r.nickname, r.rank]), [['Ann', 1], ['Bob', 1], ['Cy', 3]]);
  const vo = buildLeaderboard([{ nickname: 'Ann', items: 5, verified: 1 }, { nickname: 'Bob', items: 5, verified: 4 }], null, true);
  equal(vo.map((r) => r.nickname), ['Bob', 'Ann']);
});

// ---- Streaks -------------------------------------------------------------------------------------------
const weeksSet = (now, offsets) => new Set(offsets.map((o) => weekStart(now, o)));

test('a streak counts consecutive weeks and this week can only extend it', () => {
  const now = zt(2026, 10, 21, 12, 0, 2);
  const s = computeStreaks((w) => weeksSet(now, [0, -1, -2]).has(w), now);
  equal([s.current, s.thisDone, s.ended], [3, true, false]);
  const noThisWeek = computeStreaks((w) => weeksSet(now, [-1, -2]).has(w), now);
  equal([noThisWeek.current, noThisWeek.thisDone, noThisWeek.ended, noThisWeek.alive], [2, false, false, true]);
});

test('a full empty week ends the streak, and longest is remembered', () => {
  const now = zt(2026, 10, 21, 12, 0, 2);
  const s = computeStreaks((w) => weeksSet(now, [-2, -3, -4]).has(w), now);
  equal([s.current, s.longest, s.ended], [0, 3, true]);
});

test('a streak survives the clock changes', () => {
  const now = zt(2026, 11, 4, 12, 0, 1);                       // spans 29 Mar (spring) and 25 Oct (autumn)
  const spring = zt(2026, 4, 8, 12, 0, 2);
  const across = computeStreaks((w) => weeksSet(spring, [0, -1, -2, -3]).has(w), spring);
  equal(across.current, 4);
  const autumn = computeStreaks((w) => weeksSet(now, [0, -1, -2]).has(w), now);
  equal(autumn.current, 3);
  equal(prevWeekStart(weekStart(zt(2026, 3, 30, 12, 0, 2))), weekStart(zt(2026, 3, 23, 12, 0, 1)));
});

// ---- Challenge eligibility --------------------------------------------------------------------------------
test('only activity after the start and after joining counts, each log once', () => {
  const now = zt(2026, 10, 21, 12, 0, 2);
  const ch = { ...challengeWindow('week', 'this', now), level: 'self' };
  const joined = ch.start + 2 * 24 * HOUR;
  const rows = [
    act('before-start', ch.start - HOUR, 9),
    act('before-join', joined - HOUR, 7),
    act('ok', joined + HOUR, 3),
    act('ok', joined + HOUR, 3),                                // same id twice: counted once
    act('residual', joined + 2 * HOUR, 5, 'self-reported', 'residual'),
    act('future', now + 5 * HOUR, 4),
    act('after-end', ch.end + HOUR, 8),
  ];
  const r = countForChallenge(rows, ch, joined, now);
  equal([r.items, r.verified, r.score], [3, 0, 3]);
});

test('verified-only challenges score verified items alone', () => {
  const now = zt(2026, 10, 21, 12, 0, 2);
  const ch = { ...challengeWindow('week', 'this', now), level: 'verified' };
  const r = countForChallenge([act('a', ch.start + HOUR, 4, 'verified'), act('b', ch.start + 2 * HOUR, 6)], ch, ch.start, now);
  equal([r.items, r.verified, r.score], [10, 4, 4]);
});

test('challenge ranking shares ranks on ties', () => {
  const ranked = rankParticipants([{ name: 'Ann', score: 4 }, { name: 'Bob', score: 4 }, { name: 'Cy', score: 1 }]);
  equal(ranked.map((r) => r.rank), [1, 1, 3]);
});

// ---- Collection calendar --------------------------------------------------------------------------------
const OCT24 = zt(2026, 10, 24, 12, 0, 2);

test('calendar: every-N-weeks and nth-weekday rules', () => {
  const paper = upcoming(COLLECTIONS, OCT24, { days: 60, materials: ['paper'] }).map((r) => r.date);
  equal(paper, ['2026-10-28', '2026-11-25', '2026-12-23']);
  const cardboard = upcoming(COLLECTIONS, OCT24, { days: 60, materials: ['cardboard'] }).map((r) => r.date);
  equal(cardboard, ['2026-11-06', '2026-12-04']);
});

test('calendar: filters, ordering and tomorrow', () => {
  const all = upcoming(COLLECTIONS, OCT24, { days: 30 });
  assert(all.every((r, i) => i === 0 || all[i - 1].date <= r.date), 'sorted by date');
  assert(upcoming(COLLECTIONS, OCT24, { days: 30, materials: ['textile'] }).every((r) => r.material === 'textile'));
  equal(todayKey(OCT24), '2026-10-24');
  equal(tomorrow(COLLECTIONS, zt(2026, 10, 27, 12, 0, 1)).map((r) => r.id), ['paper']);
  equal(tomorrow(COLLECTIONS, zt(2026, 10, 24, 12, 0, 2), ['cardboard']), []);
});

test('calendar: the .ics file is well formed, escapes text, folds long lines and says when dates are samples', () => {
  const rows = [{ date: '2026-10-28', id: 'paper', material: 'paper', title: 'Paper, board; more', hint: 'x'.repeat(120) }];
  const ics = toIcs(rows, { source: { kind: 'sample', municipality: 'Risch (Rotkreuz)' }, reminder: true, now: Date.UTC(2026, 9, 24) });
  assert(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'), 'envelope with CRLF');
  assert(ics.includes('DTSTART;VALUE=DATE:20261028') && ics.includes('DTEND;VALUE=DATE:20261029'), 'all-day event');
  assert(ics.includes('SUMMARY:Paper\\, board\\; more collection'), 'escaped');
  assert(ics.includes('BEGIN:VALARM') && ics.includes('TRIGGER:-PT6H'), 'reminder the evening before');
  assert(/SAMPLE DATE/.test(ics.replace(/\r\n /g, '')), 'marked as sample');
  assert(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75), 'lines fit in 75 octets');
  assert(!toIcs(rows, { reminder: false }).includes('VALARM'), 'no reminder when switched off');
});
