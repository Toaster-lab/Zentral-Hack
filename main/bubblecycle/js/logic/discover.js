// Turns a free-text craving into structured filters, and matches products against them.
//
// Rule of thumb: if you name a kind of product ("soda", "chocolate"), you only get that kind.
// If you name something we can't match, you get an honest "nothing found" instead of
// unrelated products. Generic wishes ("something sweet") are flavour hints, not product types.

export const CATEGORIES = [
  { key: 'soda', label: 'Soda', emoji: '🥤', words: ['soda', 'cola', 'coke', 'fizzy drink', 'fizzy', 'soft drink', 'lemonade', 'limonade', 'limo', 'ginger beer', 'ginger ale', 'tonic', 'sprite', 'fanta', 'orangina', 'spritzer'] },
  { key: 'juice', label: 'Juice', emoji: '', words: ['juice', 'saft', 'smoothie', 'nectar'] },
  { key: 'breakfast', label: 'Breakfast', emoji: '', words: ['cereal', 'muesli', 'granola', 'oats', 'oat flakes', 'porridge', 'breakfast', 'cornflakes'] },
  { key: 'energy', label: 'Energy drink', emoji: '', words: ['energy drink', 'energy', 'red bull', 'redbull'] },
  { key: 'water_tea', label: 'Water & tea', emoji: '💧', words: ['mineral water', 'sparkling water', 'water', 'iced tea', 'ice tea', 'eistee', 'tea'] },
  { key: 'beer', label: 'Beer', emoji: '🍺', words: ['beer', 'bier', 'lager', 'ipa', 'radler', 'ale', 'pils'] },
  { key: 'wine', label: 'Wine & cider', emoji: '🍷', words: ['wine', 'wein', 'cider', 'prosecco', 'sparkling wine', 'rosé', 'rose'] },
  { key: 'milk', label: 'Milk & plant drinks', emoji: '🥛', words: ['milk', 'milch', 'oat drink', 'soy drink', 'almond drink', 'shake', 'latte', 'buttermilk', 'chocolate milk'] },
  { key: 'chocolate', label: 'Chocolate', emoji: '🍫', words: ['chocolate', 'choc', 'schoggi', 'cocoa', 'cacao', 'kakao'] },
  { key: 'baked', label: 'Biscuits & cakes', emoji: '🍪', words: ['biscuit', 'cookie', 'cake', 'croissant', 'muffin', 'pastry', 'baked', 'bakery', 'gebäck', 'brownie'] },
  { key: 'fruit', label: 'Fruit', emoji: '🍓', words: ['fruit', 'apple', 'strawberry', 'strawberries', 'mango', 'berry', 'berries', 'banana'] },
  { key: 'dairy', label: 'Yoghurt & desserts', emoji: '🍮', words: ['yoghurt', 'yogurt', 'pudding', 'ice cream', 'icecream', 'dessert', 'jogurt'] },
  { key: 'snacks', label: 'Salty snacks', emoji: '🥨', words: ['crisps', 'chips', 'pretzel', 'nuts', 'nut', 'snack', 'salty snack'] },
];

export const FLAVOURS = [
  { key: 'sweet', label: 'Sweet', emoji: '🍬', words: ['sweet', 'treat', 'sugary', 'süss', 'suess', 'naschen', 'sugar'] },
  { key: 'salty', label: 'Salty', emoji: '🧂', words: ['salty', 'salt', 'savoury', 'savory'] },
  { key: 'fruity', label: 'Fruity', emoji: '🍑', words: ['fruity'] },
];

export const BUDGETS = [
  { key: null, label: 'Any budget' },
  { key: 3, label: 'Up to CHF 3' },
  { key: 5, label: 'Up to CHF 5' },
  { key: 8, label: 'Up to CHF 8' },
];

const DIET_WORDS = { vegan: ['vegan', 'plant-based', 'plant based'], vegetarian: ['vegetarian', 'veggie'] };
const FREE_FROM = [
  ['gluten', /gluten[- ]free|coeliac|celiac/], ['milk', /dairy[- ]free|lactose[- ]free|milk[- ]free|no dairy/],
  ['nuts', /nut[- ]free|no nuts/], ['peanuts', /peanut[- ]free|no peanuts/], ['eggs', /egg[- ]free|no eggs/],
  ['soy', /soy[- ]free|no soy/],
];
const OTHER_RETAILERS = ['coop', 'aldi', 'lidl', 'denner', 'manor', 'spar', 'volg'];
const BUDGET_RE = /(?:under|below|less than|max(?:imum)?|up to|<)\s*(?:chf|fr\.?)?\s*(\d+(?:[.,]\d+)?)/;
const CHEAP_RE = /\b(cheap|budget|inexpensive|günstig)\b/;

const STOPWORDS = ['i', 'im', 'i\'m', 'want', 'wanna', 'would', 'like', 'love', 'need', 'get', 'buy', 'find', 'give', 'show', 'me', 'my', 'a', 'an', 'the', 'some', 'something', 'anything', 'any', 'one', 'ones',
  'from', 'at', 'in', 'on', 'for', 'to', 'of', 'with', 'and', 'or', 'but', 'please', 'looking', 'craving', 'feel', 'feeling', 'kind', 'good', 'nice', 'tasty', 'little', 'bit', 'something', 'sustainable', 'eco', 'friendly', 'migros',
  'under', 'below', 'than', 'less', 'max', 'maximum', 'up', 'chf', 'fr', 'cheap', 'budget', 'inexpensive', 'free', 'no', 'is', 'are', 'it', 'that', 'this', 'what', 'have', 'got', 'do', 'you', 'can', 'today', 'now', 'right', 'just', 'really', 'very'];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w) => new RegExp(`(^|[^\\p{L}])${esc(w)}(?:s|es)?(?=$|[^\\p{L}])`, 'u');
const singular = (w) => (w.endsWith('ies') && w.length > 4 ? `${w.slice(0, -3)}y` : w.endsWith('s') && !w.endsWith('ss') && w.length > 3 ? w.slice(0, -1) : w);

export function emptyFilters() {
  return { diet: 'any', freeFrom: [], budget: null, categories: [], flavours: [] };
}

export function parseQuery(text) {
  const raw = ` ${(text || '').toLowerCase().replace(/[^\p{L}\p{N}.,'<\- ]/gu, ' ')} `;
  const f = emptyFilters();
  const understood = [];

  // Allergen and budget phrases first, so "nut-free" isn't read as the product "nut".
  let t = raw;
  const eat = (re) => { t = t.replace(new RegExp(re.source, 'g'), ' '); };
  for (const [k, re] of FREE_FROM) if (re.test(raw)) { f.freeFrom.push(k); understood.push(`${k}-free`); eat(re); }
  const m = raw.match(BUDGET_RE);
  if (m) { f.budget = Number(m[1].replace(',', '.')); understood.push(`up to CHF ${f.budget}`); eat(BUDGET_RE); }
  else if (CHEAP_RE.test(raw)) { f.budget = 3; understood.push('budget-friendly'); }
  let rest = t;

  for (const c of CATEGORIES) {
    if (c.words.some((w) => wordRe(w).test(t))) { f.categories.push(c.key); understood.push(c.label.toLowerCase()); }
  }
  for (const fl of FLAVOURS) {
    if (fl.words.some((w) => wordRe(w).test(t))) { f.flavours.push(fl.key); }
  }
  // "sweet" only describes what you want when you didn't name a product type.
  if (f.categories.length && f.flavours.length === 1 && f.flavours[0] === 'sweet') f.flavours = [];
  for (const fl of FLAVOURS) if (f.flavours.includes(fl.key)) understood.push(fl.key === 'sweet' ? 'something sweet' : fl.label.toLowerCase());

  for (const [diet, words] of Object.entries(DIET_WORDS)) if (words.some((w) => wordRe(w).test(t))) { f.diet = f.diet === 'vegan' ? 'vegan' : diet; }
  if (f.diet !== 'any') understood.push(f.diet);

  const retailer = /migros/.test(t) ? 'Migros' : null;
  const otherRetailer = OTHER_RETAILERS.find((r) => wordRe(r).test(t)) || null;
  if (retailer) understood.push('from Migros');

  // Whatever is left over (after removing words we understand) are terms to look for in product names.
  const known = [...CATEGORIES.flatMap((c) => c.words), ...FLAVOURS.flatMap((x) => x.words), ...Object.values(DIET_WORDS).flat(), ...OTHER_RETAILERS]
    .sort((a, b) => b.length - a.length);
  for (const w of known) rest = rest.replace(new RegExp(wordRe(w).source, 'gu'), ' ');
  const terms = [...new Set(rest.split(/[\s,.]+/).map((x) => x.replace(/^[-'<]+|[-'<]+$/g, '')).filter((x) => x.length > 2 && !/^\d/.test(x) && !STOPWORDS.includes(x)).map(singular))];

  return { filters: f, understood, retailer, otherRetailer, terms };
}

const searchText = (p) => `${p.name} ${CATEGORIES.find((c) => c.key === p.category)?.label || ''} ${p.keywords || ''}`.toLowerCase();

// Returns { items, unknown, nothingAsked, noData }. `unknown` lists terms that match no product at all —
// we say so rather than quietly showing something unrelated.
// A field nobody has supplied is `null`, and a filter never treats "not known" as a match: a product with no allergen
// information is not "nut-free", one with no price is not "under CHF 3". `noData` names the filters (diet, allergens,
// price) that hid products only because that information is missing, so the screen can say so.
export function matchProducts(products, f, terms = []) {
  const unknown = terms.filter((term) => !products.some((p) => searchText(p).includes(term)));
  const nothingAsked = !f.categories.length && !f.flavours.length && f.diet === 'any' && !f.freeFrom.length && !f.budget && !terms.length;
  if (unknown.length || nothingAsked) return { items: [], unknown, nothingAsked, noData: [] };

  const candidates = products
    .filter((p) => (f.categories.length ? f.categories.includes(p.category) : true))
    .filter((p) => terms.every((term) => searchText(p).includes(term)));
  const noData = [];
  if (f.diet !== 'any' && candidates.some((p) => !p.diet)) noData.push('diet');
  if (f.freeFrom.length && candidates.some((p) => !p.allergens || !p.mayContain)) noData.push('allergens');
  if (f.budget && candidates.some((p) => p.priceChf == null)) noData.push('price');

  const items = candidates
    .filter((p) => (f.diet === 'vegan' ? p.diet === 'vegan' : f.diet === 'vegetarian' ? ['vegan', 'vegetarian'].includes(p.diet) : true))
    .filter((p) => !f.freeFrom.length || (p.allergens && p.mayContain && !f.freeFrom.some((a) => p.allergens.includes(a) || p.mayContain.includes(a))))
    .filter((p) => (f.budget ? p.priceChf != null && p.priceChf <= f.budget : true))
    .filter((p) => (f.flavours.length ? f.flavours.some((fl) => p.tags.includes(fl)) : true))
    .map((p) => {
      let score = 0;
      if (f.categories.includes(p.category)) score += 5;
      for (const fl of f.flavours) if (p.tags.includes(fl)) score += 2;
      for (const term of terms) if (p.name.toLowerCase().includes(term)) score += 3;
      // A "sweet treat" is rarely a drink unless you asked for one.
      if (!f.categories.length && ['soda', 'water_tea'].includes(p.category)) score -= 3;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score || (a.p.priceChf ?? Infinity) - (b.p.priceChf ?? Infinity))
    .map((x) => x.p);
  return { items, unknown: [], nothingAsked: false, noData };
}

// Words in the raw text that name a specific product (e.g. "cola") rank those products first.
export function boostByQuery(items, text) {
  const words = (text || '').toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length > 2).map(singular);
  const hit = (p) => words.filter((w) => p.name.toLowerCase().includes(w)).length;
  return [...items].sort((a, b) => hit(b) - hit(a));
}
