// Materials and recycling guidance.
// Guidance is general Swiss practice, simplified for the demo. Municipal rules differ —
// a live integration should load per-municipality rules (see services/live.js).

export const MATERIALS = {
  glass:          { label: 'Glass',               emoji: '🫙', tone: 'mint',     countable: true },
  pet:            { label: 'PET drink bottles',   emoji: '🧴', tone: 'sky',      countable: true },
  plastic_bottle: { label: 'Plastic bottles',     emoji: '🥛', tone: 'sky',      countable: true, hint: 'milk, shampoo, detergent' },
  aluminium:      { label: 'Aluminium',           emoji: '🥫', tone: 'lavender', countable: true },
  tin:            { label: 'Tin / steel cans',    emoji: '🥫', tone: 'lavender', countable: true },
  paper:          { label: 'Paper',               emoji: '📰', tone: 'peach',    countable: true },
  cardboard:      { label: 'Cardboard',           emoji: '📦', tone: 'peach',    countable: true },
  battery:        { label: 'Batteries',           emoji: '🔋', tone: 'mint',     countable: true },
  textile:        { label: 'Textiles & shoes',    emoji: '👕', tone: 'lavender', countable: true },
  electronics:    { label: 'Small electronics',   emoji: '📱', tone: 'sky',      countable: true },
  beverage_carton:{ label: 'Drink cartons',       emoji: '🧃', tone: 'grey',     countable: false },
  mixed_plastic:  { label: 'Other plastics & film', emoji: '🛍️', tone: 'grey',   countable: false },
  residual:       { label: 'Household waste',     emoji: '🗑️', tone: 'grey',     countable: false },
  green_waste:    { label: 'Green waste',         emoji: '🌿', tone: 'mint',     countable: false },
};

// Order matters: the materials named in the brief come first.
export const STATION_FILTERS = ['glass', 'pet', 'aluminium', 'paper', 'battery', 'textile', 'cardboard', 'tin', 'plastic_bottle', 'electronics'];
export const COUNTABLE = Object.keys(MATERIALS).filter((k) => MATERIALS[k].countable);

const BASE_GUIDANCE = {
  glass: {
    where: 'Glass collection point',
    steps: ['Empty it — a quick rinse is enough if it’s sticky', 'Take off lids and corks (metal lids go to aluminium/tin)', 'Sort by colour: clear, brown, green (other colours → green)'],
    note: 'No drinking glasses, ceramics or window glass. Many glass points have quiet hours — check the sign.',
  },
  pet: {
    where: 'PET return point (most supermarkets)',
    steps: ['Only drink bottles with the PET logo', 'Empty it', 'Squash it flat and screw the cap back on'],
    note: 'PET trays and other PET packaging are not accepted — drink bottles only.',
  },
  plastic_bottle: {
    where: 'Plastic bottle collection (many supermarkets)',
    steps: ['Empty it (milk, shampoo, detergent bottles…)', 'Leave the cap on'],
    note: 'Not every shop collects these — look for the plastic-bottle bin next to the PET bin.',
  },
  aluminium: {
    where: 'Aluminium & tin collection',
    steps: ['Empty and rinse briefly', 'Squash cans; scrunch small foil pieces into a ball'],
    note: 'Aluminium and tin/steel often share one container.',
  },
  tin: {
    where: 'Aluminium & tin collection',
    steps: ['Empty and rinse briefly', 'Lids can go in too'],
    note: 'Tip: a magnet sticks to tin/steel but not to aluminium.',
  },
  paper: {
    where: 'Paper collection (kerbside bundle or collection point)',
    steps: ['Keep it clean and dry', 'Tie it into a bundle with string — no plastic bags'],
    note: 'No tissues, receipts or coated paper.',
  },
  cardboard: {
    where: 'Cardboard collection (kerbside bundle or collection point)',
    steps: ['Flatten boxes', 'Remove tape and plastic windows where easy', 'Tie into a bundle with string'],
    note: 'Greasy or coated cardboard goes with household waste.',
  },
  battery: {
    where: 'Any shop that sells batteries (free take-back) or a collection point',
    steps: ['Tape the contacts of lithium batteries', 'Keep them cool and dry until drop-off'],
    note: 'Never put batteries in household waste.',
  },
  textile: {
    where: 'Textile collection container',
    steps: ['Clean and dry only', 'Pack in a closed bag', 'Tie shoes together in pairs'],
    note: 'Wet or heavily soiled textiles go with household waste.',
  },
  electronics: {
    where: 'Shops selling similar devices take them back free, or a recycling centre',
    steps: ['Remove batteries if you can', 'Delete personal data'],
    note: 'No need to buy anything to return a device.',
  },
  beverage_carton: {
    where: 'Household waste in most places',
    steps: ['Empty and flatten'],
    note: 'Some municipalities and shops run carton collections — check locally.',
  },
  mixed_plastic: {
    where: 'Household waste, or a mixed-plastics collection bag where offered',
    steps: ['Empty it', 'Keep it clean if you use a plastics collection bag'],
    note: 'Some municipalities sell a separate collection bag for mixed plastics.',
  },
  residual: {
    where: 'Household waste (official fee bag)',
    steps: ['Put it in your municipality’s official bag'],
    note: '',
  },
  green_waste: {
    where: 'Green waste collection',
    steps: ['Plants and garden clippings only — no plastic bags'],
    note: 'Check what your municipality accepts.',
  },
};

export const MUNICIPALITIES = {
  risch:    { name: 'Risch (Rotkreuz)' },
  zurich:   { name: 'Zürich', bag: 'Züri-Sack' },
  bern:     { name: 'Bern' },
  basel:    { name: 'Basel', bag: 'Bebbi-Sagg' },
  lausanne: { name: 'Lausanne' },
  geneve:   { name: 'Genève' },
  luzern:   { name: 'Luzern' },
  other:    { name: 'Other / not sure' },
};

export function guidanceFor(material, municipalityKey = 'other') {
  const base = BASE_GUIDANCE[material] || BASE_GUIDANCE.residual;
  const muni = MUNICIPALITIES[municipalityKey] || MUNICIPALITIES.other;
  const g = { ...base, steps: [...base.steps] };
  if ((material === 'residual' || material === 'mixed_plastic' || material === 'beverage_carton') && muni.bag) {
    g.where = g.where.replace('household waste', `household waste (${muni.bag})`).replace('Household waste', `Household waste (${muni.bag})`);
  }
  if (material === 'paper' || material === 'cardboard') {
    g.steps.push(municipalityKey === 'other'
      ? 'Check your municipality’s waste calendar for collection days'
      : `Check the ${muni.name} waste calendar for collection days`);
  }
  return g;
}

export const isCountable = (m) => !!MATERIALS[m]?.countable;
