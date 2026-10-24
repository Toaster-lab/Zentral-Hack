// The pilot catalogue: exactly three drinks and one recycling point, the same everywhere the app reads them, and safe
// with old stored data and with no outside services. The expected values are written out here independently of the
// app's own data file, so a typo in either fails a test.
import { test, assert, equal } from './lib.js';
import { CATALOGUE, TEAM_PRODUCTS, PILOT_LOCATION, CATALOGUE_DISCREPANCIES, IMPORT_CHECK, RETIRED_LOCATION_IDS, isRetiredLocation, findProduct, migrosSources, validateMigrosImport, barcodeProblem, TEAM_SOURCE } from '../../js/data/catalogue.js';
import { BARCODES, BARCODE_LIST } from '../../js/data/barcodes.js';
import { PRODUCTS } from '../../js/data/products.js';
import { SEED_LOCATIONS } from '../../js/data/locations-seed.js';
import { MIGROS_IMPORT } from '../../js/data/migros-import.js';
import { AREAS, areaContains } from '../../js/data/areas.js';
import { barcodeError, normaliseBarcode } from '../../js/utils.js';
import { matchProducts, parseQuery } from '../../js/logic/discover.js';
import { questStatuses, QUESTS } from '../../js/logic/quests.js';
import * as demo from '../../js/services/demo.js';
import { lookupBarcode, findStations, nearbyLocations, loadLocations } from '../../js/services/index.js';
import * as store from '../../js/store.js';

const DRINKS = [
  { barcode: '90162909', name: 'Red Bull', size: '250 ml', material: 'aluminium' },
  { barcode: '7610097135078', name: 'Focus Water Reload', size: '500 ml', material: 'pet' },
  { barcode: '7640127851166', name: 'Limonade Minze Bio', size: '500 ml', material: 'pet' },
];
const AREA = AREAS.rotkreuz;
const json = (path) => fetch(path, { cache: 'no-store' }).then((r) => r.json());
const withKey = async (key, value, fn) => {
  const before = localStorage.getItem(key);
  localStorage.setItem(key, JSON.stringify(value));
  try { return await fn(); } finally { if (before === null) localStorage.removeItem(key); else localStorage.setItem(key, before); }
};

// ---- products ---------------------------------------------------------------------------------------

test('the three team-supplied drinks are exactly these barcodes, names, sizes and packaging', () => {
  equal(TEAM_PRODUCTS.map((p) => [p.barcode, p.name, p.size, p.components.map((c) => c.material)]),
    DRINKS.map((d) => [d.barcode, d.name, d.size, [d.material]]));
  CATALOGUE.forEach((p) => equal(typeof p.barcode, 'string', `${p.name}: barcode stays a string`));
  CATALOGUE.forEach((p) => equal(barcodeError(p.barcode), null, `${p.name}: valid check digit`));
  equal('90162909'.length, 8);
});

test('every supplied barcode passes its check digit and nothing was silently changed', () => {
  equal(CATALOGUE_DISCREPANCIES, []);
  DRINKS.forEach((d) => { equal(barcodeProblem(d.barcode), null, d.barcode); equal(barcodeError(d.barcode), null, d.barcode); });
  assert(barcodeError('90162908') !== null, 'a wrong check digit is reported');
  assert(barcodeError('7610097135079') !== null, 'a wrong check digit is reported (13 digits)');
  assert(barcodeProblem('9016290').includes('digits'), 'a 7-digit code is reported');
});

test('Scan, Discover and the suggestions all list the same products: the three team drinks plus labelled examples', () => {
  const all = CATALOGUE.map((p) => p.barcode).sort();
  equal([CATALOGUE.length, PRODUCTS.length, Object.keys(BARCODES).length, BARCODE_LIST.length], [16, 16, 16, 16]);
  equal(Object.keys(BARCODES).sort(), all);
  equal(PRODUCTS.map((p) => p.barcode).sort(), all);
  equal(BARCODE_LIST.map((b) => b.code).sort(), all);
  equal(new Set(all).size, all.length, 'no duplicate barcodes');
  equal(TEAM_PRODUCTS.length, 3);
  equal(BARCODE_LIST.filter((b) => !b.sample).map((b) => b.code), DRINKS.map((d) => d.barcode), 'the team drinks come first');
  CATALOGUE.filter((p) => p.source === 'sample').forEach((p) => {
    assert(p.barcode.startsWith('200'), `${p.name}: example barcodes use the internal 200… prefix`);
    equal([p.retailer, p.exampleDetails, migrosSources(p)], ['Migros (example)', true, null], `${p.name}: labelled as an example, with no Migros provenance`);
  });
});

test('scan lookup finds each drink, including the 8-digit one, and drops spaces first', async () => {
  for (const d of DRINKS) {
    const hit = await demo.lookupBarcode(d.barcode);
    equal([hit?.name, hit?.size], [d.name, d.size], d.barcode);
  }
  equal(normaliseBarcode(' 9016 2909 '), '90162909');
  equal(findProduct('9016 2909')?.name, 'Red Bull');
  equal(findProduct('7610 0971 35078')?.name, 'Focus Water Reload');
  equal(findProduct('090162909'), null, 'a leading zero is not silently stripped or added');
  equal(findProduct('90162908'), null, 'a wrong check digit finds nothing');
});

test('an unknown barcode is not in the catalogue, and nothing is fetched from anywhere else', async () => {
  const realFetch = window.fetch;
  const calls = [];
  window.fetch = (...a) => { calls.push(a[0]); return Promise.reject(new Error('offline')); };
  try {
    equal(barcodeError('4006381333931'), null, 'a well-formed barcode');
    equal(await lookupBarcode('4006381333931'), null, 'unknown -> null, which the screen shows as "not in this pilot catalogue"');
    equal((await lookupBarcode('90162909')).name, 'Red Bull', 'known barcodes still work with no network');
    equal(calls, [], 'no outside service was called');
  } finally { window.fetch = realFetch; }
});

test('fields nobody supplied stay unavailable, and example details are flagged as examples', () => {
  CATALOGUE.forEach((p) => {
    equal([p.ingredients, p.photo, p.labels], [null, null, []], `${p.name}: nothing invented beyond the labelled example details`);
    equal(p.exampleDetails, true, p.name);
    equal(migrosSources(p), null, `${p.name}: nothing here came from Migros`);
  });
  equal(TEAM_PRODUCTS.map((p) => [p.retailer, p.source]), [[null, 'pilot'], [null, 'pilot'], [null, 'pilot']]);
});

test('no Migros source is connected: the import is empty and nothing claims to be from Migros', () => {
  equal([MIGROS_IMPORT.source, Object.keys(MIGROS_IMPORT.records).length], [null, 0]);
  equal(IMPORT_CHECK.records, {});
  assert(TEAM_SOURCE.startsWith('Product details supplied by the team'));
});

test('the Migros import validator follows the same shared cases as the Python tool', async () => {
  const cases = await json('/tests/fixtures/migros_import_cases.json');
  for (const c of cases.cases) {
    const { records } = validateMigrosImport(c.import, cases.approved, cases.today);
    const got = Object.fromEntries(Object.entries(records).map(([b, r]) => [b, Object.keys(r.fields).sort()]));
    const want = Object.fromEntries(Object.entries(c.expect).map(([b, f]) => [b, [...f].sort()]));
    equal(got, want, c.name);
  }
});

// ---- Discover ---------------------------------------------------------------------------------------

const search = (text) => { const q = parseQuery(text); return matchProducts(PRODUCTS, q.filters, q.terms); };
const names = (r) => r.items.map((p) => p.name);

test('Discover finds the drinks by name and type, and says so honestly when nothing fits', () => {
  equal(names(search('Red Bull')), ['Red Bull']);
  equal(names(search('energy drink')), ['Red Bull']);
  assert(names(search('a soda')).includes('Limonade Minze Bio') && names(search('a soda')).includes('Cola'), 'a soda lists the sodas');
  assert(names(search('limonade')).includes('Limonade Minze Bio'), 'limonade finds the real drink');
  equal(names(search('Focus water')), ['Focus Water Reload']);
  equal(names(search('salty snack gluten-free')), ['Potato crisps'], 'gluten-free hides the pretzels');
  equal(names(search('chocolate nut-free')), [], 'every chocolate contains or may contain nuts, so none is offered');
  equal(search('pizza').unknown, ['pizza']);
  equal(names(search('pizza')), []);
  equal(search('').nothingAsked, true);
});

test('Discover never treats unknown diet, allergen or price information as a match', () => {
  const unknown = { id: 'x', name: 'Mystery soda', category: 'soda', diet: null, allergens: null, mayContain: null, priceChf: null, tags: [] };
  const run = (text) => { const q = parseQuery(text); return matchProducts([unknown], q.filters, q.terms); };
  const vegan = run('vegan soda');
  equal([names(vegan), vegan.noData], [[], ['diet']]);
  const nutFree = run('nut-free soda');
  equal([names(nutFree), nutFree.noData], [[], ['allergens']]);
  const cheap = run('soda under CHF 3');
  equal([names(cheap), cheap.noData], [[], ['price']]);
});

// ---- location ---------------------------------------------------------------------------------------

test('exactly one active location, with the supplied position and materials and no invented details', () => {
  equal(SEED_LOCATIONS.length, 1);
  const l = SEED_LOCATIONS[0];
  equal([l.lat, l.lng, [...l.materials].sort(), l.type, l.name], [47.143376, 8.432881, ['aluminium', 'pet'], 'station', 'PET and aluminium recycling point']);
  equal([l.hours, l.hoursText, l.access, l.description, l.website, l.photo], [null, '', '', '', '', null]);
  equal([l.source, l.sample], ['team', false]);
  assert(!/official|verified/i.test(l.name), 'the name makes no official claim');
  assert(areaContains(AREA, l), 'it sits inside the supported Rotkreuz area');
  equal(l, PILOT_LOCATION);
});

test('the map, the list, nearby suggestions and the check-in selector all see that one location', async () => {
  const area = { areaId: 'rotkreuz' };
  const mapView = await loadLocations({ ...area, bbox: { south: 47.1, north: 47.2, west: 8.38, east: 8.48 } });
  equal(mapView.locations.map((x) => x.id), [PILOT_LOCATION.id]);
  equal(mapView.pending, []);
  const stations = await findStations({ center: AREA.center });
  equal(stations.map((x) => x.id), [PILOT_LOCATION.id]);
  const near = await nearbyLocations({ ...area, point: { lat: 47.1434, lng: 8.4329 }, type: 'station', radiusM: 300 });
  equal(near.map((x) => x.id), [PILOT_LOCATION.id]);
  const far = await nearbyLocations({ ...area, point: AREA.center, type: 'bin', radiusM: 2000 });
  equal(far, [], 'there are no bins in the pilot');
});

test('PET and aluminium filters find the location; any other material gives an empty list', () => {
  const filter = (mats) => SEED_LOCATIONS.filter((l) => l.type === 'station' && l.materialsKnown !== false && mats.every((m) => l.materials.includes(m)));
  equal(filter(['pet']).length, 1);
  equal(filter(['aluminium']).length, 1);
  equal(filter(['pet', 'aluminium']).length, 1);
  for (const m of ['glass', 'paper', 'battery', 'textile', 'cardboard', 'tin', 'plastic_bottle', 'electronics']) equal(filter([m]).length, 0, m);
});

test('the app and the server agree on the station: id, position, name and accepted materials', async () => {
  const srv = await json('/server/data/stations.json');
  equal(srv.length, 1);
  equal([srv[0].id, srv[0].name, srv[0].lat, srv[0].lng, [...srv[0].materials].sort()],
    [PILOT_LOCATION.id, PILOT_LOCATION.name, PILOT_LOCATION.lat, PILOT_LOCATION.lng, [...PILOT_LOCATION.materials].sort()]);
  const retired = await json('/server/data/retired_stations.json');
  equal([...retired].sort(), [...RETIRED_LOCATION_IDS].sort());
  retired.forEach((id) => assert(isRetiredLocation(id), id));
  assert(!isRetiredLocation(PILOT_LOCATION.id));
});

// ---- old stored data and the pilot lock ---------------------------------------------------------------

test('community data from before the pilot is migrated: samples go, a person’s own items stay, retired places never return', async () => {
  const mine = { id: 'mine-1', kind: 'report', issue: 'bin_full', temporary: true, status: 'active', areaId: 'rotkreuz', contributorId: 'c-me', createdAt: Date.now(), reviewedAt: null, reviewNote: '', reward: null, locationId: 'osm-n10653389684', note: '', suggested: null, newPos: null };
  const sample = { ...mine, id: 'demo-rep-3', demo: true, contributorId: 'demo-member-5' };
  const approved = { id: 'c-x', areaId: 'rotkreuz', type: 'station', name: 'Old approved place', lat: 47.1425, lng: 8.4312, materials: ['glass'], materialsKnown: true, hours: null, hoursText: '', access: '', description: '', photo: null, source: 'community', sample: false, approvedAt: 1 };
  const v1 = { version: 1, items: [mine, sample], confirmations: [{ id: 'k', locationId: 'osm-n10653389684', contributorId: 'c-me', ts: 1 }], overrides: { 'osm-n453166316': { removed: true } }, created: [approved] };
  await withKey('bubblecycle:community-demo:v1', v1, async () => {
    const fresh = await import('../../js/services/community.js?migration-test');
    const { locations } = await fresh.loadLocations({ areaId: 'rotkreuz', contributorId: 'c-me' });
    equal(locations.map((l) => l.id), [PILOT_LOCATION.id], 'only the pilot location is served');
    const list = await fresh.listContributions({ contributorId: 'c-me' });
    equal(list.map((i) => [i.id, i.locationName]), [['mine-1', 'Removed place']], 'own item kept, shown gracefully');
    equal((await fresh.listContributions({ contributorId: 'demo-member-5' })).length, 0, 'sample items are gone');
    const stored = JSON.parse(localStorage.getItem('bubblecycle:community-demo:v1'));
    equal([stored.version, stored.created.length, stored.confirmations.length], [2, 1, 1], 'nothing personal was wiped');
  });
});

test('during the pilot nothing can be added to or changed on the map', async () => {
  const fresh = await import('../../js/services/community.js?lock-test');
  const added = await fresh.submitPlace({ areaId: 'rotkreuz', contributorId: 'c-me', payload: { type: 'station', name: 'New', lat: 47.1425, lng: 8.4312, materials: ['glass'] } });
  equal([added.ok, added.locked], [false, true]);
  const queue = await fresh.adminQueue();
  equal([queue.places.length, queue.changes.length], [0, 0]);
  const reported = await fresh.submitReport({ locationId: PILOT_LOCATION.id, issue: 'removed', note: '', contributorId: 'c-lock' });
  assert(reported.ok, 'a report can still be sent');
  const review = await fresh.adminReview({ id: reported.item.id, action: 'approve' });
  equal([review.ok, review.locked], [false, true], 'but approving it cannot remove the location');
  equal((await fresh.loadLocations({ areaId: 'rotkreuz' })).locations.map((l) => l.id), [PILOT_LOCATION.id]);
  const rejected = await fresh.adminReview({ id: reported.item.id, action: 'reject', reason: 'Other' });
  assert(rejected.ok, 'rejecting still works');
  localStorage.removeItem('bubblecycle:community-demo:v1');
});

test('adding a barcode is paused, so the catalogue cannot grow from inside the app', () => {
  store.resetAll();
  const r = store.addCustomProduct({ barcode: '4006381333931', name: 'Some pencil case', components: [{ part: 'Case', material: 'mixed_plastic' }] });
  equal(r.ok, false);
  equal(store.getState().customProducts, {});
});

test('device data from before the pilot is migrated without losing anything personal', async () => {
  const old = {
    profile: { nickname: 'Mia', municipality: 'risch', weeklyGoal: 20, leaderboardOptIn: false, useOpenFoodFacts: true, welcomeDismissed: true },
    activities: [{ id: 'a1', batchId: 'b1', ts: Date.now(), material: 'glass', count: 3, accepted: 3, verification: 'self-reported', stationId: 'demo-glass-can', source: 'checkin', evidence: 'self' }],
    ledger: [{ id: 'l1', ts: Date.now(), points: 15, label: 'Recycled 3 × glass', type: 'earn' }],
    customProducts: { 4006381333931: { barcode: '4006381333931', name: 'Pencil case', components: [], collect: [], createdAt: 1 } },
    scans: [{ ts: Date.now(), code: '2000000000992', source: 'demo' }],
    collection: { 'glass-jar-sauce': { firstTs: 1, source: 'database', code: '2000000000992' } },
    checkins: [{ id: 'c1', stationId: 'osm-n10653389684', stationName: 'Recycling container', status: 'counted', entries: [], flags: [] }],
  };
  await withKey('bubblecycle:v1', old, async () => {
    const fresh = await import('../../js/store.js?migration-test');
    const s = fresh.getState();
    equal([s.activities.length, s.ledger.length, s.checkins.length, Object.keys(s.collection).length, Object.keys(s.customProducts).length, s.scans.length], [1, 1, 1, 1, 1, 1], 'personal history is intact');
    equal([s.profile.nickname, s.profile.useOpenFoodFacts, s.catalogueVersion], ['Mia', undefined, 'pilot-1']);
    equal(s.checkins[0].stationName, 'Recycling container', 'old records keep their own text and need no lookup');
    assert(isRetiredLocation(s.activities[0].stationId), 'the old station id is recognised as retired');
    const quest = questStatuses(s).list.find((q) => q.id === 'scans');
    equal(quest.progress, 0, 'a scan of a product that left the catalogue does not count towards the scan quest');
  });
});

test('the scan quest never asks for more products than exist', () => {
  const q = QUESTS.find((x) => x.id === 'scans');
  equal([q.target, CATALOGUE.length >= q.target], [5, true]);
});
