// The pilot catalogue. This is the ONLY place the active products and the active recycling location are defined:
// scan lookup, Discover, the map, the check-in selector and the Bottledex examples all read from here.
//
// Provenance:
//  - Names, sizes and main packaging below, and the location's coordinates and accepted materials, were supplied
//    by the RECYCL IT! team. They are shown as "supplied by the team", never as "Source: Migros".
//  - Price, diet and allergens of those three, and the whole list of EXAMPLE products below, are made-up sample data that
//    represents a Migros-style range. They are labelled "example data, not from Migros" and carry no Migros provenance.
//  - Everything else is unknown (ingredients, nutrition, certifications, photos, availability, opening hours): null, shown as "not available".
//  - A permitted official Migros export can add fields through js/data/migros-import.js (see docs/MIGROS-IMPORT.md).
//    Only fields that arrive that way carry "Source: Migros", with the page they came from and the retrieval date.
import { eanCheckDigit, normaliseBarcode } from '../utils.js';
import { MIGROS_IMPORT } from './migros-import.js';

export const CATALOGUE_VERSION = 'pilot-1';

export const TEAM_SOURCE = 'Product details supplied by the team';
export const TEAM_LOCATION_SOURCE = 'Location supplied by the team';

// Allergen vocabulary used by Discover filters and by imported records.
export const ALLERGENS = [
  { key: 'gluten', label: 'Gluten' }, { key: 'milk', label: 'Milk' }, { key: 'nuts', label: 'Nuts' },
  { key: 'peanuts', label: 'Peanuts' }, { key: 'soy', label: 'Soy' }, { key: 'eggs', label: 'Eggs' }, { key: 'sesame', label: 'Sesame' },
];

const PACKAGING = {
  aluminium_can: { components: [{ part: 'Can', material: 'aluminium' }], label: 'Aluminium can' },
  pet_bottle: { components: [{ part: 'Bottle', material: 'pet' }], label: 'PET bottle' },
};

// Barcodes are strings: the 8-digit one is valid as it is, and none may ever be turned into a number.
// `collect` is the Bottledex container type (a generic drawing, matched by material and size only).
const SUPPLIED = [
  { barcode: '90162909', name: 'Red Bull', size: '250 ml', packaging: 'aluminium_can', category: 'energy', collect: ['al-can-slim'],
    example: { priceChf: 2.2, diet: 'vegan', allergens: [], mayContain: [], tags: ['sweet'] } },
  { barcode: '7610097135078', name: 'Focus Water Reload', size: '500 ml', packaging: 'pet_bottle', category: 'water_tea', collect: ['pet-water-05'],
    example: { priceChf: 1.1, diet: 'vegan', allergens: [], mayContain: [], tags: [] } },
  { barcode: '7640127851166', name: 'Limonade Minze Bio', size: '500 ml', packaging: 'pet_bottle', category: 'soda', collect: ['pet-soda-05'],
    example: { priceChf: 1.6, diet: 'vegan', allergens: [], mayContain: [], tags: ['sweet'] } },
];

// EXAMPLE products: invented to make the pilot feel like a real range. Barcodes use the GS1 internal prefix 200…, so they can
// never clash with a real product. Not from Migros, not verified, prices illustrative.
const part = (p, material) => ({ part: p, material });
const SAMPLES = [
  ['Cola', '500 ml', 'PET bottle', [part('Bottle', 'pet'), part('Cap', 'pet')], 'soda', ['pet-soda-05'], 1.4, 'vegan', [], [], ['sweet']],
  ['Lemon soda', '1.5 L', 'PET bottle', [part('Bottle', 'pet'), part('Cap', 'pet')], 'soda', ['pet-soda-15'], 1.6, 'vegan', [], [], ['sweet', 'fruity']],
  ['Sparkling mineral water', '1.5 L', 'PET bottle', [part('Bottle', 'pet'), part('Cap', 'pet')], 'water_tea', ['pet-water-15'], 0.8, 'vegan', [], [], []],
  ['Peach iced tea', '1.5 L', 'PET bottle', [part('Bottle', 'pet'), part('Cap', 'pet')], 'water_tea', ['pet-tea'], 1.9, 'vegan', [], [], ['sweet', 'fruity']],
  ['Orange juice', '1 L', 'Drink carton', [part('Carton', 'beverage_carton'), part('Cap', 'mixed_plastic')], 'juice', ['carton-1l'], 2.5, 'vegan', [], [], ['sweet', 'fruity']],
  ['Apple juice', '1 L', 'Glass bottle', [part('Bottle', 'glass'), part('Lid', 'tin')], 'juice', ['glass-juice'], 2.3, 'vegan', [], [], ['sweet', 'fruity']],
  ['Dark chocolate 72 %', '100 g', 'Paper and foil wrapper', [part('Outer wrapper', 'paper'), part('Inner foil', 'aluminium')], 'chocolate', [], 2.4, 'vegan', ['soy'], ['milk', 'nuts'], ['sweet']],
  ['Milk chocolate with hazelnuts', '100 g', 'Plastic wrapper', [part('Flow wrap', 'mixed_plastic')], 'chocolate', [], 2.1, 'vegetarian', ['milk', 'nuts', 'soy'], [], ['sweet']],
  ['Potato crisps', '170 g', 'Plastic bag', [part('Bag', 'mixed_plastic')], 'snacks', [], 2.8, 'vegan', [], [], ['salty']],
  ['Pretzels', '200 g', 'Plastic bag', [part('Bag', 'mixed_plastic')], 'snacks', [], 2.2, 'vegan', ['gluten'], [], ['salty']],
  ['Muesli', '750 g', 'Cardboard box', [part('Box', 'cardboard'), part('Inner bag', 'mixed_plastic')], 'breakfast', ['cardboard-cereal'], 4.5, 'vegan', ['gluten'], ['nuts'], []],
  ['Peach yoghurt', '180 g', 'Plastic cup', [part('Cup', 'mixed_plastic'), part('Lid', 'aluminium')], 'dairy', ['al-lid'], 0.9, 'vegetarian', ['milk'], [], ['sweet', 'fruity']],
  ['Strawberry jam', '340 g', 'Glass jar', [part('Jar', 'glass'), part('Lid', 'tin')], 'breakfast', ['glass-jar-jam'], 2.6, 'vegan', [], [], ['sweet']],
].map(([name, size, packagingLabel, components, category, collect, priceChf, diet, allergens, mayContain, tags], i) => {
  const body = String(200000000001 + i);
  return { barcode: body + eanCheckDigit(body), name, size, packagingLabel, components, category, collect, sample: true, example: { priceChf, diet, allergens, mayContain, tags } };
});


export const PILOT_LOCATION = Object.freeze({
  id: 'rotkreuz-pet-aluminium-point',
  areaId: 'rotkreuz',
  type: 'station',
  name: 'PET and aluminium recycling point',
  lat: 47.143376,
  lng: 8.432881,
  materials: ['pet', 'aluminium'],   // PET drink bottles and aluminium
  materialsKnown: true,
  hours: null, hoursText: '', access: '', description: '', website: '', photo: null,
  source: 'team', sourceRef: null,
  sample: false, lastConfirmedAt: null,
});

// Ids of locations that existed before the pilot (OpenStreetMap snapshot and demo points). They are never served again.
// Kept so that old check-ins, logs and saved submissions that mention them can be recognised and handled politely.
export const RETIRED_LOCATION_IDS = Object.freeze([
  'osm-n453166316', 'osm-n10653389684', 'osm-n12050793176',
  'demo-glass-can', 'demo-pet-battery', 'demo-paper', 'demo-textile',
]);
export const isRetiredLocation = (id) => RETIRED_LOCATION_IDS.includes(id) || /^osm-[nwr]\d+$/.test(String(id)) || /^demo-/.test(String(id));

// ---- Barcodes ------------------------------------------------------------------------------------------------

// Returns null when the barcode is well formed, otherwise a description of the discrepancy (never "fixes" it).
export function barcodeProblem(code) {
  if (typeof code !== 'string') return 'The barcode must be a string.';
  if (!/^\d+$/.test(code)) return 'The barcode must contain digits only.';
  if (![8, 12, 13].includes(code.length)) return `The barcode has ${code.length} digits; EAN-8, UPC-A or EAN-13 need 8, 12 or 13.`;
  const expected = eanCheckDigit(code.slice(0, -1));
  if (expected !== Number(code.at(-1))) return `The check digit is ${code.at(-1)} but the other digits give ${expected}.`;
  return null;
}

// ---- Imported (official Migros) fields -----------------------------------------------------------------------------

const MIGROS_FIELDS = ['priceChf', 'diet', 'allergens', 'mayContain', 'ingredients', 'photo'];
const DIETS = ['vegan', 'vegetarian', 'neither'];
const ALLERGEN_KEYS = ALLERGENS.map((a) => a.key);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isMigrosUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && (u.hostname === 'migros.ch' || u.hostname.endsWith('.migros.ch'));
  } catch { return false; }
}

function fieldProblem(name, v) {
  switch (name) {
    case 'priceChf': return typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1000 ? null : 'priceChf must be a number of CHF between 0 and 1000';
    case 'diet': return DIETS.includes(v) ? null : `diet must be one of ${DIETS.join(', ')}`;
    case 'allergens': case 'mayContain':
      return Array.isArray(v) && v.every((x) => ALLERGEN_KEYS.includes(x)) ? null : `${name} must be a list of ${ALLERGEN_KEYS.join(', ')}`;
    case 'ingredients': return typeof v === 'string' && v.trim() && v.length <= 1500 ? null : 'ingredients must be non-empty text of at most 1500 characters';
    case 'photo': return isMigrosUrl(v) ? null : 'photo must be an https address on migros.ch';
    default: return `field "${name}" is not accepted`;
  }
}

// Validates a whole import object. Returns { records, problems }: `records` holds only what passed, so a bad record
// or field is dropped (and reported) and can never break the catalogue. tests/fixtures/migros_import_cases.json is
// shared with tools/import_migros.py so the two validators stay in step.
export function validateMigrosImport(imp, approvedBarcodes, today = new Date().toISOString().slice(0, 10)) {
  const problems = [];
  const empty = { records: {}, problems };
  if (!imp || typeof imp !== 'object' || !imp.records || !Object.keys(imp.records).length) return empty;
  const s = imp.source;
  if (!s || s.name !== 'Migros') problems.push('source.name must be "Migros"');
  if (!s || !isMigrosUrl(s.url)) problems.push('source.url must be an https address on migros.ch');
  if (!s || !ISO_DATE.test(s.retrievedAt || '') || s.retrievedAt > today) problems.push('source.retrievedAt must be a past or present YYYY-MM-DD date');
  if (!s || typeof s.permission !== 'string' || !s.permission.trim()) problems.push('source.permission must say why this export may be used');
  if (problems.length) return empty;
  const records = {};
  for (const [barcode, rec] of Object.entries(imp.records)) {
    if (!approvedBarcodes.includes(barcode)) { problems.push(`${barcode}: not one of the approved pilot products`); continue; }
    const fields = {};
    for (const [name, v] of Object.entries(rec?.fields || {})) {
      const why = MIGROS_FIELDS.includes(name) ? fieldProblem(name, v) : `field "${name}" is not accepted`;
      if (why) problems.push(`${barcode}: ${why}`); else fields[name] = v;
    }
    if (Object.keys(fields).length) records[barcode] = { fields, url: isMigrosUrl(rec.url) ? rec.url : s.url, retrievedAt: ISO_DATE.test(rec.retrievedAt || '') && rec.retrievedAt <= today ? rec.retrievedAt : s.retrievedAt };
  }
  return { records, problems };
}

// ---- Products --------------------------------------------------------------------------------------------------

const APPROVED = SUPPLIED.map((p) => p.barcode);   // only real products can receive an official Migros import
// A malformed import file must never take the catalogue down: on any error the import is ignored.
export const IMPORT_CHECK = (() => {
  try { return validateMigrosImport(MIGROS_IMPORT, APPROVED); } catch (e) { return { records: {}, problems: [`import ignored: ${e.message}`] }; }
})();

function build(p) {
  const pack = p.packaging ? PACKAGING[p.packaging] : null;
  const components = p.components || pack.components;
  const imported = IMPORT_CHECK.records[p.barcode];
  const f = imported?.fields || {};
  const ex = p.example || {};
  const from = (name) => (name in f ? { source: 'migros', url: imported.url, retrievedAt: imported.retrievedAt } : null);
  const pick = (name) => (name in f ? f[name] : ex[name] ?? null);   // official Migros field > example detail > unknown
  return Object.freeze({
    id: `p-${p.barcode}`, barcode: p.barcode, name: p.name, size: p.size, category: p.category,
    packagingLabel: p.packagingLabel || pack.label, components: components.map((c) => ({ ...c })), packaging: components.map((c) => ({ ...c })), collect: [...p.collect],
    // null means "not available" (never "none"). Example details are made up; only an official import overrides them.
    priceChf: pick('priceChf'), diet: pick('diet'), allergens: pick('allergens'), mayContain: pick('mayContain'),
    ingredients: f.ingredients ?? null, photo: f.photo ?? null,
    tags: ex.tags ? [...ex.tags] : [], labels: [], tradeoffs: [],
    retailer: p.sample ? 'Migros (example)' : null,
    source: p.sample ? 'sample' : 'pilot',           // 'pilot' = supplied by the team, 'sample' = invented example
    exampleDetails: !!p.example && !Object.keys(f).length,
    migros: Object.fromEntries(MIGROS_FIELDS.map((n) => [n, from(n)]).filter(([, v]) => v)),
  });
}

export const CATALOGUE = Object.freeze([...SUPPLIED, ...SAMPLES].map(build));
export const TEAM_PRODUCTS = Object.freeze(CATALOGUE.filter((p) => p.source === 'pilot'));
export const PRODUCT_COUNT = CATALOGUE.length;
export const EXAMPLE_NOTE = 'Example data, not from Migros';
export const EXAMPLE_DETAILS_NOTE = 'Price, diet and allergens are example data, not from Migros.';

const BY_BARCODE = new Map(CATALOGUE.map((p) => [p.barcode, p]));

// Normalises what a person typed or a scanner read (spaces and dashes are dropped) and looks it up. Strings only.
export function findProduct(raw) {
  return BY_BARCODE.get(normaliseBarcode(raw)) || null;
}

// Fields of a product that came from an identifiable official Migros source, with where and when.
export function migrosSources(product) {
  const entries = Object.entries(product.migros || {});
  if (!entries.length) return null;
  return { fields: entries.map(([n]) => n), url: entries[0][1].url, retrievedAt: entries[0][1].retrievedAt };
}

// Self-check used by the tests and the tools: every supplied barcode must validate; nothing is silently changed.
export const CATALOGUE_DISCREPANCIES = [...SUPPLIED, ...SAMPLES].map((p) => ({ barcode: p.barcode, problem: barcodeProblem(p.barcode) })).filter((x) => x.problem);
