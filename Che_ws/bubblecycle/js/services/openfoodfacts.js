// Optional real integration: Open Food Facts (community-maintained, open data).
// Only used when the user opts in. Sends just the barcode. Packaging data there is often
// incomplete, so every component is returned with `confirm: true`.
import { config } from '../config.js';

const MATERIAL_MAP = [
  [/\bpet\b|polyethylene-terephthalate/, 'pet'],
  [/glass/, 'glass'],
  [/alumin/, 'aluminium'],
  [/steel|\btin\b|metal/, 'tin'],
  [/tetra|beverage-carton|drink-carton|composite/, 'beverage_carton'],
  [/cardboard|carton|corrugated/, 'cardboard'],
  [/paper/, 'paper'],
  [/plastic|\b(hdpe|ldpe|pp|ps)\b|poly/, 'mixed_plastic'],
];

const toMaterial = (s) => MATERIAL_MAP.find(([re]) => re.test(s))?.[1] || 'residual';
const prettify = (s) => (s || '').replace(/^\w\w:/, '').replace(/-/g, ' ');

export async function lookup(code) {
  const res = await fetch(`${config.openFoodFacts.endpoint}${encodeURIComponent(code)}.json?fields=product_name,brands,packagings,packaging_tags`);
  if (!res.ok) throw new Error(`Open Food Facts responded with ${res.status}`);
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  const p = data.product;
  let components = (p.packagings || []).map((pk) => {
    const material = toMaterial(`${pk.material || ''} ${pk.shape || ''}`.toLowerCase());
    return { part: prettify(pk.shape) || 'Packaging', material, confirm: true, options: [...new Set([material, 'mixed_plastic', 'cardboard', 'glass', 'residual'])] };
  });
  if (!components.length && p.packaging_tags?.length) {
    components = p.packaging_tags.slice(0, 3).map((t) => {
      const material = toMaterial(t);
      return { part: prettify(t), material, confirm: true, options: [...new Set([material, 'mixed_plastic', 'cardboard', 'glass', 'residual'])] };
    });
  }
  return {
    barcode: code,
    name: [p.brands?.split(',')[0], p.product_name].filter(Boolean).join(' · ') || 'Unnamed product',
    emoji: '🛒',
    components,
    source: 'openfoodfacts',
    demo: false,
  };
}
