// The on-device demo's store: logging, points, redemption, quests and check-in review (localStorage-backed).
import { test, assert, equal } from './lib.js';
import * as store from '../../js/store.js';
import { questStatuses } from '../../js/logic/quests.js';

const fresh = () => { store.resetAll(); };
const log = (material, count, opts = {}) => store.logRecycling([{ material, count }], opts);

test('a log earns points once and is added to the totals', () => {
  fresh();
  const before = store.getBalance();
  const r = log('glass', 4);
  assert(r.ok, 'log accepted');
  equal([r.points, r.verification], [20, 'self-reported']);
  equal(store.getBalance(), before + 20);
  equal(store.getState().activities.length, 1);
});

test('the same material and count again straight away is refused as a duplicate', () => {
  fresh();
  log('glass', 4);
  const again = log('glass', 4);
  equal([again.ok, again.code], [false, 'duplicate']);
  equal(store.getState().activities.length, 1);
});

test('redeeming spends points but never changes recycling counts', () => {
  fresh();
  log('glass', 20); log('pet', 20);                              // 200 points on top of the welcome bonus
  const itemsBefore = store.getState().activities.reduce((n, a) => n + a.accepted, 0);
  const balanceBefore = store.getBalance();
  const r = store.redeem('badge-glass');
  assert(r.ok, 'redeemed');
  equal(store.getBalance(), balanceBefore - 50);
  equal(store.getState().activities.reduce((n, a) => n + a.accepted, 0), itemsBefore);
});

test('not enough points, and one-off badges cannot be bought twice', () => {
  fresh();
  const poor = store.redeem('voucher-bottle');
  equal(poor.ok, false);
  log('glass', 30);
  assert(store.redeem('badge-glass').ok, 'first purchase');
  const again = store.redeem('badge-glass');
  equal([again.ok, again.error], [false, 'You already have this badge.']);
});

test('vouchers need verified items, not just points', () => {
  fresh();
  log('glass', 50); log('pet', 50);                              // 500+ points, all self-reported
  const blocked = store.redeem('voucher-cafe');
  assert(!blocked.ok && /verified items/.test(blocked.error), blocked.error);
  store.logRecycling([{ material: 'paper', count: 6 }], { verified: true, receiptCode: 'BC-1001-ZH' });
  assert(store.redeem('voucher-cafe').ok, 'allowed after 5+ verified items');
});

test('a quest bonus can be claimed only once and is points, not recycling activity', () => {
  fresh();
  log('glass', 25);
  const q = questStatuses(store.getState()).list.find((x) => x.id === 'items');
  assert(q.done && !q.claimed, 'ready to claim');
  const balance = store.getBalance();
  const first = store.claimQuest({ claimId: q.claimId, points: q.points, title: q.title });
  const second = store.claimQuest({ claimId: q.claimId, points: q.points, title: q.title });
  equal([first.ok, second.ok], [true, false]);
  equal(store.getBalance(), balance + q.points);
  assert(questStatuses(store.getState()).list.find((x) => x.id === 'items').claimed, 'shown as claimed');
  equal(store.getState().activities.length, 1);
});

const checkin = (over = {}) => ({
  id: `c${Math.random()}`, ts: Date.now(), startedAt: Date.now() - 60000, stationId: 'demo-glass-can', stationName: 'Station', at: { lat: 47.14, lng: 8.43 },
  entries: [{ material: 'glass', count: 3 }], location: { result: 'near' }, fp: null, evidence: 'location', flags: [], photo: { taken: false, kept: false }, ...over,
});

test('a flagged check-in is held: nothing counts until a reviewer approves, and only once', () => {
  fresh();
  const out = store.addCheckin(checkin({ flags: ['far'], evidence: 'self' }));
  equal([out.checkin.status, out.result], ['review', null]);
  equal(store.getState().activities.length, 0);
  const balance = store.getBalance();
  assert(store.resolveCheckin(out.checkin.id, true).ok, 'approved');
  equal(store.getBalance(), balance + 15);
  const again = store.resolveCheckin(out.checkin.id, true);
  equal([again.ok, again.error], [false, 'Nothing to review.']);
  equal(store.getBalance(), balance + 15);
});

test('declining or withdrawing a held check-in never credits', () => {
  fresh();
  const a = store.addCheckin(checkin({ flags: ['far'] }));
  const balance = store.getBalance();
  store.appealCheckin(a.checkin.id, 'poor GPS');
  equal(store.getState().checkins[0].status, 'appealed');
  store.resolveCheckin(a.checkin.id, false);
  equal(store.getState().checkins[0].status, 'declined');
  equal(store.getBalance(), balance);
});

test('an offline check-in is only pending until it syncs, and then goes through the same checks', () => {
  fresh();
  const out = store.addCheckin(checkin({ offline: true }));
  equal(out.checkin.status, 'queued');
  equal([store.getState().activities.length, store.queuedCheckins().length], [0, 1]);
  store.markSynced(out.checkin.id);
  equal(store.getState().checkins[0].status, 'counted');
  equal(store.getState().activities.length, 1);
  const flagged = store.addCheckin(checkin({ offline: true, flags: ['large'], entries: [{ material: 'pet', count: 2 }] }));
  store.markSynced(flagged.checkin.id);
  equal(store.getState().checkins[0].status, 'review');
});

test('calendar preferences persist and unknown saved data is tolerated', () => {
  fresh();
  store.updateCalendar({ remind: true, materials: ['paper'] });
  equal(store.getState().calendar, { materials: ['paper'], remind: true });
});

fresh();
