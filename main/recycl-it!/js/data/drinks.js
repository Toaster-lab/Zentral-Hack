// The drinks range: ~100 everyday drinks in cans, PET bottles, glass bottles and cartons. Works offline (plain data, no network).
//
// HOW TO ADD REAL BARCODES: put the real EAN in the `code` column of a row (as a string). Rows with `code: null` get a placeholder
// barcode (GS1 internal prefix 200…, never a real product) and are shown as "Example product". A row with a real `code` is
// shown as a supplied product. Prices are ESTIMATES in CHF (typical Swiss supermarket shelf prices), not a live price list.
//
// Row: [code, name, size, pack, category, collect (Bottledex id), estimated price CHF, tags, diet, allergens]
//   pack: can | pet | glass | carton
//   diet: vegan (default) | vegetarian | neither
import { eanCheckDigit } from '../utils.js';

// Packaging parts, as the scan screen lists them (material keys come from logic/rules.js).
export const PACKS = {
  can:    { label: 'Aluminium can',  components: [{ part: 'Can', material: 'aluminium' }],
            how: 'Empty it, squash it flat and put it in the aluminium and tin collection.' },
  pet:    { label: 'PET bottle',     components: [{ part: 'Bottle', material: 'pet' }, { part: 'Cap', material: 'pet' }],
            how: 'Empty it, squash it flat and screw the cap back on. Return it to the PET point at any supermarket.' },
  glass:  { label: 'Glass bottle',   components: [{ part: 'Bottle', material: 'glass' }, { part: 'Cap', material: 'tin' }],
            how: 'Take the cap off (it goes to the metal collection). Sort the bottle by colour into the glass bin.' },
  carton: { label: 'Drink carton',   components: [{ part: 'Carton', material: 'beverage_carton' }, { part: 'Cap', material: 'mixed_plastic' }],
            how: 'Empty and flatten it. Most places put cartons in household waste; check for a local carton collection.' },
};

// Extra advice that overrides the default text of a pack for one row (matched by name).
const HOW = {
  'Red Bull Sugarfree': 'Squash the can and put it in the aluminium and tin collection. Do not put it in the PET bin.',
  'Cold brew coffee': 'Rinse out the coffee, squash the can and put it in the aluminium and tin collection.',
  'Latte macchiato': 'Rinse the bottle, take the cap off for the metal collection, and put the bottle in the glass bin.',
  'Drinking yoghurt strawberry': 'Rinse briefly and leave the cap on: put it in the plastic-bottle collection (not the PET point).',
  'Protein shake chocolate': 'Empty it, squash it and screw the cap back on. Put it in the PET point if it has the PET logo.',
  'Orange juice freshly pressed': 'Empty it, squash it and screw the cap back on. Return it to the PET point.',
  'Rosé wine': 'Take the cap off. Clear glass goes in the clear glass bin; do not put it in the green bin.',
};

const R = (code, name, size, pack, category, collect, priceChf, tags = [], diet = 'vegan', allergens = []) =>
  ({ code, name, size, pack, category, collect, priceChf, tags, diet, allergens });

const ROWS = [
  // ---- Soda (cans, PET, glass) ----
  R(null, 'Coca-Cola', '330 ml', 'can', 'soda', 'al-can-33', 1.2, ['sweet']),
  R(null, 'Coca-Cola Zero', '330 ml', 'can', 'soda', 'al-can-33', 1.2),
  R(null, 'Coca-Cola', '500 ml', 'pet', 'soda', 'pet-soda-05', 1.9, ['sweet']),
  R(null, 'Coca-Cola', '1.5 L', 'pet', 'soda', 'pet-soda-15', 2.3, ['sweet']),
  R(null, 'Coca-Cola', '2 L', 'pet', 'soda', 'pet-soda-2', 2.7, ['sweet']),
  R(null, 'Coca-Cola', '330 ml', 'glass', 'soda', 'glass-soda', 1.6, ['sweet']),
  R(null, 'Pepsi', '330 ml', 'can', 'soda', 'al-can-33', 1.1, ['sweet']),
  R(null, 'Pepsi Max', '1.5 L', 'pet', 'soda', 'pet-soda-15', 2.1),
  R(null, 'Fanta Orange', '330 ml', 'can', 'soda', 'al-can-33', 1.2, ['sweet', 'fruity']),
  R(null, 'Fanta Orange', '1.5 L', 'pet', 'soda', 'pet-soda-15', 2.3, ['sweet', 'fruity']),
  R(null, 'Sprite', '330 ml', 'can', 'soda', 'al-can-33', 1.2, ['sweet', 'fruity']),
  R(null, 'Sprite', '1.5 L', 'pet', 'soda', 'pet-soda-15', 2.3, ['sweet', 'fruity']),
  R(null, 'Rivella Rot', '500 ml', 'pet', 'soda', 'pet-soda-05', 1.9, ['sweet'], 'vegetarian', ['milk']),
  R(null, 'Rivella Blau', '1.5 L', 'pet', 'soda', 'pet-soda-15', 2.8, [], 'vegetarian', ['milk']),
  R(null, 'Rivella Grün', '500 ml', 'pet', 'soda', 'pet-soda-05', 1.9, [], 'vegetarian', ['milk']),
  R(null, 'Orangina', '330 ml', 'glass', 'soda', 'glass-soda', 1.8, ['sweet', 'fruity']),
  R(null, 'Schweppes Tonic', '330 ml', 'can', 'soda', 'al-can-33', 1.3),
  R(null, 'Ginger Ale', '330 ml', 'can', 'soda', 'al-can-33', 1.2, ['sweet']),
  R(null, 'Lemon soda', '1.5 L', 'pet', 'soda', 'pet-soda-15', 1.6, ['sweet', 'fruity']),
  R(null, 'Limonade Zitrone Bio', '500 ml', 'glass', 'soda', 'glass-soda', 2.1, ['sweet', 'fruity']),
  R(null, 'Holunderblüten Limonade', '500 ml', 'pet', 'soda', 'pet-soda-05', 1.9, ['sweet', 'fruity']),
  R(null, 'Apfelschorle', '1 L', 'pet', 'soda', 'pet-juice', 1.7, ['fruity']),
  R(null, 'Cola', '500 ml', 'pet', 'soda', 'pet-soda-05', 1.0, ['sweet']),
  R(null, 'Ice-tea Lemon fizz', '330 ml', 'can', 'soda', 'al-can-33', 1.3, ['sweet', 'fruity']),
  R(null, 'Bitter lemon', '330 ml', 'glass', 'soda', 'glass-soda', 1.7),

  // ---- Water (PET, glass) ----
  R(null, 'Mineral water still', '500 ml', 'pet', 'water_tea', 'pet-water-05', 0.6),
  R(null, 'Mineral water sparkling', '500 ml', 'pet', 'water_tea', 'pet-water-05', 0.6),
  R(null, 'Mineral water still', '1.5 L', 'pet', 'water_tea', 'pet-water-15', 0.8),
  R(null, 'Mineral water sparkling', '1.5 L', 'pet', 'water_tea', 'pet-water-15', 0.8),
  R(null, 'Mineral water medium', '1.5 L', 'pet', 'water_tea', 'pet-water-15', 0.8),
  R(null, 'Mineral water still', '1 L', 'glass', 'water_tea', 'glass-juice', 1.2),
  R(null, 'Mineral water sparkling', '75 cl', 'glass', 'water_tea', 'glass-wine-clear', 1.4),
  R(null, 'Sparkling water lemon', '1 L', 'pet', 'water_tea', 'pet-water-1', 1.1, ['fruity']),
  R(null, 'Sparkling water raspberry', '500 ml', 'pet', 'water_tea', 'pet-water-05', 1.0, ['fruity']),
  R(null, 'Sparkling water in can', '330 ml', 'can', 'water_tea', 'al-can-33', 1.3),
  R(null, 'Water with vitamins', '500 ml', 'pet', 'water_tea', 'pet-water-05', 1.9, ['fruity']),
  R(null, 'Spring water', '1.5 L', 'pet', 'water_tea', 'pet-water-15', 0.7),

  // ---- Iced tea, coffee drinks ----
  R(null, 'Iced tea peach', '1.5 L', 'pet', 'water_tea', 'pet-tea', 1.9, ['sweet', 'fruity']),
  R(null, 'Iced tea lemon', '1.5 L', 'pet', 'water_tea', 'pet-tea', 1.9, ['sweet', 'fruity']),
  R(null, 'Iced tea lemon', '500 ml', 'pet', 'water_tea', 'pet-tea', 1.5, ['sweet', 'fruity']),
  R(null, 'Iced tea green', '330 ml', 'can', 'water_tea', 'al-can-33', 1.3, ['sweet']),
  R(null, 'Iced tea mango', '1 L', 'carton', 'water_tea', 'carton-1l', 2.2, ['sweet', 'fruity']),
  R(null, 'Iced tea', '1 L', 'carton', 'water_tea', 'carton-1l', 2.0, ['sweet']),
  R(null, 'Kombucha ginger', '330 ml', 'glass', 'water_tea', 'glass-soda', 3.2),
  R(null, 'Cold brew coffee', '250 ml', 'can', 'water_tea', 'al-can-slim', 2.6, [], 'vegan'),
  R(null, 'Latte macchiato', '250 ml', 'glass', 'milk', 'glass-soda', 2.4, [], 'vegetarian', ['milk']),
  R(null, 'Iced coffee', '250 ml', 'carton', 'milk', 'carton-small', 1.6, ['sweet'], 'vegetarian', ['milk']),

  // ---- Juice ----
  R(null, 'Orange juice', '1 L', 'carton', 'juice', 'carton-1l', 2.5, ['sweet', 'fruity']),
  R(null, 'Orange juice', '330 ml', 'carton', 'juice', 'carton-small', 1.3, ['sweet', 'fruity']),
  R(null, 'Orange juice freshly pressed', '750 ml', 'pet', 'juice', 'pet-juice', 4.2, ['sweet', 'fruity']),
  R(null, 'Apple juice', '1 L', 'glass', 'juice', 'glass-juice', 2.3, ['sweet', 'fruity']),
  R(null, 'Apple juice cloudy', '1 L', 'carton', 'juice', 'carton-1l', 2.0, ['sweet', 'fruity']),
  R(null, 'Apple juice', '1.5 L', 'pet', 'juice', 'pet-juice', 2.4, ['sweet', 'fruity']),
  R(null, 'Multivitamin juice', '1 L', 'carton', 'juice', 'carton-1l', 2.4, ['sweet', 'fruity']),
  R(null, 'Grapefruit juice', '1 L', 'carton', 'juice', 'carton-1l', 2.6, ['fruity']),
  R(null, 'Pineapple juice', '1 L', 'carton', 'juice', 'carton-1l', 2.5, ['sweet', 'fruity']),
  R(null, 'Tomato juice', '1 L', 'carton', 'juice', 'carton-1l', 2.5, ['salty']),
  R(null, 'Carrot juice', '750 ml', 'glass', 'juice', 'glass-juice', 3.4, ['sweet']),
  R(null, 'Grape juice', '1 L', 'glass', 'juice', 'glass-juice', 2.9, ['sweet', 'fruity']),
  R(null, 'Cranberry juice', '1 L', 'carton', 'juice', 'carton-1l', 3.1, ['fruity']),
  R(null, 'Smoothie mango and passion fruit', '250 ml', 'pet', 'juice', 'pet-juice', 3.2, ['sweet', 'fruity']),
  R(null, 'Smoothie berry', '250 ml', 'pet', 'juice', 'pet-juice', 3.2, ['sweet', 'fruity']),

  // ---- Energy and sports ----
  R(null, 'Red Bull Sugarfree', '250 ml', 'can', 'energy', 'al-can-slim', 2.2),
  R(null, 'Red Bull', '355 ml', 'can', 'energy', 'al-can-33', 2.9, ['sweet']),
  R(null, 'Monster Energy', '500 ml', 'can', 'energy', 'al-can-50', 2.5, ['sweet']),
  R(null, 'Monster Energy Zero', '500 ml', 'can', 'energy', 'al-can-50', 2.5),
  R(null, 'Rockstar Energy', '500 ml', 'can', 'energy', 'al-can-50', 2.3, ['sweet']),
  R(null, 'Energy drink', '250 ml', 'can', 'energy', 'al-can-slim', 1.1, ['sweet']),
  R(null, 'Energy drink sugar free', '250 ml', 'can', 'energy', 'al-can-slim', 1.1),
  R(null, 'Isotonic sports drink', '750 ml', 'pet', 'energy', 'pet-sports', 2.6, ['fruity']),
  R(null, 'Isotonic sports drink', '500 ml', 'pet', 'energy', 'pet-sports', 2.1, ['fruity']),
  R(null, 'Protein shake chocolate', '330 ml', 'pet', 'milk', 'pet-sports', 3.4, ['sweet'], 'vegetarian', ['milk']),
  R(null, 'Electrolyte drink', '500 ml', 'pet', 'energy', 'pet-sports', 2.4, ['fruity']),

  // ---- Milk drinks ----
  R(null, 'Whole milk', '1 L', 'carton', 'milk', 'carton-1l', 1.7, [], 'vegetarian', ['milk']),
  R(null, 'Chocolate milk', '500 ml', 'carton', 'milk', 'carton-1l', 1.5, ['sweet'], 'vegetarian', ['milk']),
  R(null, 'Chocolate milk', '330 ml', 'pet', 'milk', 'pet-juice', 1.7, ['sweet'], 'vegetarian', ['milk']),
  R(null, 'Oat drink', '1 L', 'carton', 'milk', 'carton-1l', 2.3, [], 'vegan', ['gluten']),
  R(null, 'Soy drink', '1 L', 'carton', 'milk', 'carton-1l', 2.2, [], 'vegan', ['soy']),
  R(null, 'Almond drink', '1 L', 'carton', 'milk', 'carton-1l', 2.7, [], 'vegan', ['nuts']),
  R(null, 'Drinking yoghurt strawberry', '500 ml', 'pet', 'milk', 'hdpe-yoghurt-drink', 2.1, ['sweet', 'fruity'], 'vegetarian', ['milk']),
  R(null, 'Buttermilk', '500 ml', 'carton', 'milk', 'carton-1l', 1.4, [], 'vegetarian', ['milk']),

  // ---- Beer ----
  R(null, 'Lager beer', '330 ml', 'can', 'beer', 'al-can-33', 1.3, [], 'vegan', ['gluten']),
  R(null, 'Lager beer', '500 ml', 'can', 'beer', 'al-can-50', 1.6, [], 'vegan', ['gluten']),
  R(null, 'Lager beer', '330 ml', 'glass', 'beer', 'glass-beer-brown', 1.5, [], 'vegan', ['gluten']),
  R(null, 'Lager beer', '500 ml', 'glass', 'beer', 'glass-beer-500', 1.9, [], 'vegan', ['gluten']),
  R(null, 'Wheat beer', '500 ml', 'glass', 'beer', 'glass-beer-500', 2.1, [], 'vegan', ['gluten']),
  R(null, 'Dark beer', '330 ml', 'glass', 'beer', 'glass-beer-brown', 1.8, [], 'vegan', ['gluten']),
  R(null, 'Pale ale', '330 ml', 'can', 'beer', 'al-can-33', 2.4, [], 'vegan', ['gluten']),
  R(null, 'Craft IPA', '330 ml', 'can', 'beer', 'al-can-33', 3.1, [], 'vegan', ['gluten']),
  R(null, 'Alcohol-free beer', '330 ml', 'glass', 'beer', 'glass-beer-green', 1.4, [], 'vegan', ['gluten']),
  R(null, 'Alcohol-free beer', '330 ml', 'can', 'beer', 'al-can-33', 1.2, [], 'vegan', ['gluten']),
  R(null, 'Radler lemon', '330 ml', 'can', 'beer', 'al-can-33', 1.3, ['fruity'], 'vegan', ['gluten']),
  R(null, 'Green-glass lager', '330 ml', 'glass', 'beer', 'glass-beer-green', 1.6, [], 'vegan', ['gluten']),

  // ---- Wine and cider ----
  R(null, 'White wine', '75 cl', 'glass', 'wine', 'glass-wine-clear', 7.9, [], 'vegan'),
  R(null, 'Red wine', '75 cl', 'glass', 'wine', 'glass-wine-green', 8.9, [], 'vegan'),
  R(null, 'Rosé wine', '75 cl', 'glass', 'wine', 'glass-wine-clear', 7.4, [], 'vegan'),
  R(null, 'Sparkling wine', '75 cl', 'glass', 'wine', 'glass-wine-green', 9.9, [], 'vegan'),
  R(null, 'Cider', '500 ml', 'can', 'wine', 'al-can-50', 1.9, ['sweet', 'fruity'], 'vegan'),
  R(null, 'Cider', '330 ml', 'glass', 'wine', 'glass-beer-green', 1.8, ['sweet', 'fruity'], 'vegan'),
];

// Hand-set check digit, so the placeholder is a valid EAN-13 that nobody owns.
const placeholder = (i) => { const body = String(200000000001 + i); return body + eanCheckDigit(body); };

export const DRINK_ROWS = Object.freeze(ROWS.map((r, i) => {
  const pack = PACKS[r.pack];
  return Object.freeze({
    barcode: r.code || placeholder(i), supplied: !!r.code,
    name: r.name, size: r.size, packagingLabel: pack.label,
    components: pack.components.map((c) => ({ ...c })),
    category: r.category, collect: [r.collect], priceChf: r.priceChf, tags: r.tags, diet: r.diet, allergens: r.allergens,
    recycling: HOW[r.name] || pack.how,
  });
}));
