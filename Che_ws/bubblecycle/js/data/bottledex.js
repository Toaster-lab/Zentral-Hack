// The Bottledex: a numbered collection of everyday container types, in the spirit of a
// field guide. You "collect" an entry by scanning a product that comes in that container
// (or by adding your own barcode). Entries are container TYPES, not brands, and the drawings
// are generic silhouettes: no photos are invented.
//
// tier = how often the container shows up in everyday recycling ('everyday' | 'less' | 'unusual').

const C = { clear: '#cfe5d8', green: '#7fa57c', brown: '#a06f3f', pet: '#bfe0f2', petDark: '#c7b08a', metal: '#c3c8cc', tin: '#b9bfc4', carton: '#e7d9b9', card: '#d3b98c', hdpe: '#f1ece0', batt: '#8c8f93', film: '#d9d4c7', oil: '#b9b45a' };

// [id, name, material, shape, size, tier, tint, note]
const RAW = [
  // Glass
  ['glass-wine-clear', 'Clear wine bottle', 'glass', 'tall', '75 cl', 'everyday', C.clear, 'Clear glass goes in the clear glass bin.'],
  ['glass-wine-green', 'Green wine bottle', 'glass', 'tall', '75 cl', 'everyday', C.green, 'Green glass goes in the green bin.'],
  ['glass-wine-brown', 'Brown wine bottle', 'glass', 'tall', '75 cl', 'less', C.brown, 'Brown glass goes in the brown bin.'],
  ['glass-beer-brown', 'Brown beer bottle', 'glass', 'short', '33 cl', 'everyday', C.brown, 'Take the metal crown cap off first.'],
  ['glass-beer-green', 'Green beer bottle', 'glass', 'short', '33 cl', 'everyday', C.green, 'Take the metal crown cap off first.'],
  ['glass-beer-500', 'Large beer bottle', 'glass', 'short', '50 cl', 'less', C.brown, 'Check for a deposit sign before recycling.'],
  ['glass-swingtop', 'Swing-top bottle', 'glass', 'swing', '50 cl', 'less', C.clear, 'Remove the rubber seal and wire clip if you can.'],
  ['glass-soda', 'Glass soda bottle', 'glass', 'short', '33 cl', 'everyday', C.clear, 'Cap to metal collection, bottle to glass.'],
  ['glass-juice', 'Glass juice bottle', 'glass', 'tall', '1 L', 'less', C.clear, 'Empty it and take the lid off.'],
  ['glass-oil', 'Cooking oil bottle', 'glass', 'tall', '50 cl', 'less', C.oil, 'Drain as much oil as you can first.'],
  ['glass-vinegar', 'Vinegar bottle', 'glass', 'tall', '50 cl', 'less', C.clear, 'A quick rinse is enough.'],
  ['glass-jar-jam', 'Jam jar', 'glass', 'jar', '340 g', 'everyday', C.clear, 'The metal lid goes to aluminium and tin.'],
  ['glass-jar-sauce', 'Pasta sauce jar', 'glass', 'jar', '400 g', 'everyday', C.clear, 'Scrape out what’s left, then rinse briefly.'],
  ['glass-jar-pickle', 'Pickle jar', 'glass', 'jar', '720 ml', 'less', C.clear, 'Pour out the brine first.'],
  ['glass-jar-baby', 'Small food jar', 'glass', 'jar', '190 g', 'unusual', C.clear, 'Lid off, jar into glass.'],
  ['glass-spirit', 'Spirits bottle', 'glass', 'tall', '70 cl', 'unusual', C.clear, 'Remove the pourer if it comes off.'],
  // PET drink bottles
  ['pet-water-05', 'Water bottle', 'pet', 'pet', '50 cl', 'everyday', C.pet, 'Squash it and put the cap back on.'],
  ['pet-water-1', 'Water bottle', 'pet', 'pet', '1 L', 'everyday', C.pet, 'Squash it and put the cap back on.'],
  ['pet-water-15', 'Large water bottle', 'pet', 'pet', '1.5 L', 'everyday', C.pet, 'Squash it and put the cap back on.'],
  ['pet-soda-05', 'Soda bottle', 'pet', 'pet', '50 cl', 'everyday', C.petDark, 'Only drink bottles with the PET logo.'],
  ['pet-soda-15', 'Large soda bottle', 'pet', 'pet', '1.5 L', 'everyday', C.petDark, 'Only drink bottles with the PET logo.'],
  ['pet-soda-2', 'Family soda bottle', 'pet', 'pet', '2 L', 'less', C.petDark, 'Squash it to save space in the bin.'],
  ['pet-juice', 'Juice bottle', 'pet', 'pet', '1 L', 'less', C.pet, 'Empty it and leave the cap on.'],
  ['pet-tea', 'Iced tea bottle', 'pet', 'pet', '1.5 L', 'everyday', C.petDark, 'Squash it and put the cap back on.'],
  ['pet-sports', 'Sports drink bottle', 'pet', 'pet', '75 cl', 'less', C.pet, 'The sports cap can stay on.'],
  // Aluminium and tin
  ['al-can-33', 'Drinks can', 'aluminium', 'can', '33 cl', 'everyday', C.metal, 'Squash it if you can.'],
  ['al-can-50', 'Large drinks can', 'aluminium', 'can', '50 cl', 'less', C.metal, 'Squash it if you can.'],
  ['al-can-slim', 'Slim can', 'aluminium', 'can', '25 cl', 'less', C.metal, 'Squash it if you can.'],
  ['tin-tomato', 'Tomato tin', 'tin', 'tin', '400 g', 'everyday', C.tin, 'A magnet sticks to tin, not aluminium.'],
  ['tin-tuna', 'Small food tin', 'tin', 'tin', '160 g', 'everyday', C.tin, 'Press the lid inside the tin.'],
  ['tin-large', 'Large food tin', 'tin', 'tin', '800 g', 'less', C.tin, 'Rinse briefly; the lid can go in too.'],
  ['al-lid', 'Aluminium lid', 'aluminium', 'cap', 'about 7 cm', 'unusual', C.metal, 'Peel it off the cup and scrunch it into a ball.'],
  ['tin-crown', 'Crown cap', 'tin', 'cap', 'about 3 cm', 'unusual', C.tin, 'Small caps are easiest to collect in a larger can.'],
  // Cartons, cardboard, paper
  ['carton-1l', 'Drinks carton', 'beverage_carton', 'carton', '1 L', 'everyday', C.carton, 'Most places put these in household waste.'],
  ['carton-small', 'Small drinks carton', 'beverage_carton', 'carton', '33 cl', 'less', C.carton, 'Flatten it; check for a local carton collection.'],
  ['cardboard-cereal', 'Cereal box', 'cardboard', 'box', '500 g', 'everyday', C.card, 'Flatten it and bundle it with other cardboard.'],
  ['cardboard-egg', 'Egg box', 'cardboard', 'box', '6 eggs', 'less', C.card, 'Clean cardboard only.'],
  ['paper-bag', 'Paper bag', 'paper', 'bag', 'about 1 kg', 'unusual', C.card, 'Keep it dry and clean.'],
  // HDPE plastic bottles
  ['hdpe-milk', 'Milk bottle', 'plastic_bottle', 'jug', '1 L', 'everyday', C.hdpe, 'Leave the cap on if the collection point asks for it.'],
  ['hdpe-shampoo', 'Shampoo bottle', 'plastic_bottle', 'pump', '300 ml', 'everyday', C.hdpe, 'Empty it; the cap stays on.'],
  ['hdpe-detergent', 'Detergent bottle', 'plastic_bottle', 'jug', '1.5 L', 'everyday', C.hdpe, 'Empty it as far as you can.'],
  ['hdpe-soap', 'Hand soap bottle', 'plastic_bottle', 'pump', '250 ml', 'less', C.hdpe, 'Pumps can stay on.'],
  ['hdpe-conditioner', 'Conditioner bottle', 'plastic_bottle', 'pump', '250 ml', 'less', C.hdpe, 'Empty it; the cap stays on.'],
  ['hdpe-yoghurt-drink', 'Drinking yoghurt bottle', 'plastic_bottle', 'short', '500 ml', 'less', C.hdpe, 'Rinse briefly and leave the cap on.'],
  // Other things you’ll meet at the collection point
  ['battery-aa', 'Used AA battery', 'battery', 'battery', 'AA', 'everyday', C.batt, 'Shops that sell batteries take them back.'],
  ['battery-button', 'Button cell', 'battery', 'battery', 'small', 'unusual', C.batt, 'Tape the contacts and take it back to a shop.'],
  ['film-bag', 'Plastic film bag', 'mixed_plastic', 'bag', 'various', 'less', C.film, 'Household waste in most places.'],
  ['pet-tray', 'Fruit punnet', 'mixed_plastic', 'box', '250–500 g', 'less', C.film, 'Not a drink bottle, so not accepted as PET.'],
];

export const BOTTLEDEX = RAW.map(([id, name, material, shape, size, tier, tint, note], i) => ({
  id, no: i + 1, name, material, shape, size, tier, tint, note,
}));

export const TIER_LABEL = { everyday: 'Everyday', less: 'Less common', unusual: 'Unusual' };
export const dexEntry = (id) => BOTTLEDEX.find((e) => e.id === id);

// SVG shapes drawn in a 48 × 64 box.
export const SHAPES = {
  tall: '<path d="M20 4h8v10c0 5 8 8 8 16v28a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V30c0-8 8-11 8-16z"/>',
  short: '<path d="M21 4h6v14c0 4 7 7 7 13v27a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3V31c0-6 7-9 7-13z"/>',
  swing: '<path d="M21 8h6v10c0 4 7 7 7 13v27a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3V31c0-6 7-9 7-13z"/><path d="M18 8h12M30 8l5-4"/>',
  jar: '<path d="M13 16h22v-4a2 2 0 0 0-2-2H15a2 2 0 0 0-2 2z"/><path d="M12 20h24v34a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4z"/>',
  pet: '<rect x="20" y="3" width="8" height="5" rx="1"/><path d="M21 8h6l1 8c1 3 7 6 7 12v26a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4V28c0-6 6-9 7-12z"/><path d="M13 38h22M13 47h22"/>',
  can: '<rect x="14" y="7" width="20" height="51" rx="3"/><path d="M14 13h20M14 52h20"/>',
  tin: '<rect x="12" y="20" width="24" height="34" rx="2"/><path d="M12 26h24M12 48h24"/>',
  cap: '<ellipse cx="24" cy="34" rx="13" ry="5"/><path d="M11 34v5c0 3 6 5 13 5s13-2 13-5v-5"/>',
  carton: '<path d="M12 18l12-10 12 10v38H12z"/><path d="M12 18h24"/>',
  box: '<rect x="10" y="16" width="28" height="40" rx="2"/><path d="M10 24h28"/>',
  bag: '<path d="M12 18h24l3 38H9z"/><path d="M18 18c0-5 2-8 6-8s6 3 6 8"/>',
  jug: '<path d="M18 4h12v8l8 6v38a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V18l8-6z"/><path d="M34 22c6 0 6 14 0 14"/>',
  pump: '<path d="M22 14v-5h9"/><rect x="21" y="12" width="8" height="5"/><path d="M16 24c0-5 4-7 9-7s9 2 9 7v30a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4z"/>',
  battery: '<rect x="16" y="13" width="16" height="44" rx="2"/><rect x="21" y="8" width="6" height="5"/><path d="M16 24h16"/>',
};
