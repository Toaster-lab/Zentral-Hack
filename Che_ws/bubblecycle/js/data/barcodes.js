import { eanCheckDigit } from '../utils.js';

// DEMO barcodes use the GS1 "restricted circulation" prefix 20–29, so they can never collide
// with a real retail product. Names are generic (no brands). Packaging parts marked `confirm`
// are ones a barcode alone can't tell us reliably, so the user is asked to confirm them.
// `collect` lists the Bottledex entries (data/bottledex.js) a product unlocks when scanned.
const ean = (body) => body + eanCheckDigit(body);

const c = (part, material, extra = {}) => ({ part, material, ...extra });
const ask = (part, material, options) => ({ part, material, confirm: true, options });
const p = (name, collect, ...components) => ({ name, collect, components });

const crown = c('Crown cap', 'tin', { note: 'Take it off the bottle' });
const lidTin = c('Lid', 'tin');
const filmBag = (part = 'Inner bag') => ask(part, 'mixed_plastic', ['mixed_plastic', 'paper']);

// The first eight keep their original barcodes (…015 to …084).
const DEMO = [
  p('Sparkling mineral water, 1.5 L', ['pet-water-15'], c('Bottle', 'pet'), c('Cap', 'pet', { note: 'Screw it back onto the squashed bottle' }), c('Label', 'pet', { note: 'Can stay on the bottle' })),
  p('Tomato sauce in a glass jar, 400 g', ['glass-jar-sauce'], c('Jar', 'glass'), lidTin),
  p('Oat drink, 1 L', ['carton-1l'], c('Carton', 'beverage_carton'), c('Screw cap', 'mixed_plastic')),
  p('Dark chocolate bar, 100 g', [], ask('Outer wrapper', 'paper', ['paper', 'mixed_plastic']), ask('Inner foil', 'aluminium', ['aluminium', 'mixed_plastic'])),
  p('Energy drink can, 250 ml', ['al-can-slim'], c('Can', 'aluminium')),
  p('Muesli, 750 g', ['cardboard-cereal'], c('Box', 'cardboard'), filmBag()),
  p('Shampoo, 300 ml', ['hdpe-shampoo'], c('Bottle', 'plastic_bottle'), c('Flip cap', 'plastic_bottle', { note: 'Leave it on the bottle' })),
  p('AA batteries, 4-pack', ['battery-aa'], c('Batteries (when used up)', 'battery'), c('Blister', 'mixed_plastic'), ask('Backing card', 'cardboard', ['cardboard', 'residual'])),

  // Drinks in PET
  p('Still mineral water, 50 cl', ['pet-water-05'], c('Bottle', 'pet'), c('Cap', 'pet')),
  p('Mineral water, 1 L', ['pet-water-1'], c('Bottle', 'pet'), c('Cap', 'pet')),
  p('Cola, 50 cl bottle', ['pet-soda-05'], c('Bottle', 'pet'), c('Cap', 'pet')),
  p('Lemon soda, 1.5 L', ['pet-soda-15'], c('Bottle', 'pet'), c('Cap', 'pet')),
  p('Orange soda, 2 L', ['pet-soda-2'], c('Bottle', 'pet'), c('Cap', 'pet')),
  p('Peach iced tea, 1.5 L', ['pet-tea'], c('Bottle', 'pet'), c('Cap', 'pet')),
  p('Sports drink, 75 cl', ['pet-sports'], c('Bottle', 'pet'), c('Sports cap', 'pet')),
  p('Apple juice, 1 L bottle', ['pet-juice'], c('Bottle', 'pet'), c('Cap', 'pet')),

  // Drinks in glass
  p('Apple juice, 1 L glass bottle', ['glass-juice'], c('Bottle', 'glass'), lidTin),
  p('Lemonade, 33 cl glass bottle', ['glass-soda'], c('Bottle', 'glass'), crown),
  p('Ginger beer, 33 cl', ['glass-soda'], c('Bottle', 'glass'), crown),
  p('Lager beer, 33 cl', ['glass-beer-brown', 'tin-crown'], c('Bottle', 'glass'), crown),
  p('Pale beer, 33 cl', ['glass-beer-green'], c('Bottle', 'glass'), crown),
  p('Craft beer, 50 cl', ['glass-beer-500'], c('Bottle', 'glass'), crown),
  p('Swing-top lemonade, 50 cl', ['glass-swingtop'], c('Bottle', 'glass'), ask('Swing-top stopper', 'mixed_plastic', ['mixed_plastic', 'residual'])),
  p('Red wine, 75 cl', ['glass-wine-green'], c('Bottle', 'glass'), ask('Closure', 'mixed_plastic', ['mixed_plastic', 'residual', 'tin'])),
  p('White wine, 75 cl', ['glass-wine-clear'], c('Bottle', 'glass'), ask('Closure', 'tin', ['tin', 'mixed_plastic', 'residual'])),
  p('Sweet wine, 50 cl', ['glass-wine-brown'], c('Bottle', 'glass'), ask('Closure', 'mixed_plastic', ['mixed_plastic', 'residual'])),
  p('Spirit, 70 cl', ['glass-spirit'], c('Bottle', 'glass'), ask('Closure', 'tin', ['tin', 'mixed_plastic', 'residual'])),

  // Cans and cartons
  p('Cola can, 33 cl', ['al-can-33'], c('Can', 'aluminium')),
  p('Sparkling water can, 33 cl', ['al-can-33'], c('Can', 'aluminium')),
  p('Beer can, 50 cl', ['al-can-50'], c('Can', 'aluminium')),
  p('Orange juice, 1 L carton', ['carton-1l'], c('Carton', 'beverage_carton'), c('Cap', 'mixed_plastic')),
  p('Chocolate milk, 33 cl carton', ['carton-small'], c('Carton', 'beverage_carton'), c('Straw and wrapper', 'mixed_plastic')),
  p('Milk, 1 L bottle', ['hdpe-milk'], c('Bottle', 'plastic_bottle'), c('Cap', 'plastic_bottle')),
  p('Drinking yoghurt, 500 ml', ['hdpe-yoghurt-drink'], c('Bottle', 'plastic_bottle'), ask('Foil seal', 'aluminium', ['aluminium', 'mixed_plastic'])),

  // Food packaging
  p('Strawberry jam, 340 g', ['glass-jar-jam'], c('Jar', 'glass'), lidTin),
  p('Pickled gherkins, 720 ml', ['glass-jar-pickle'], c('Jar', 'glass'), lidTin),
  p('Baby food jar, 190 g', ['glass-jar-baby'], c('Jar', 'glass'), lidTin),
  p('Olive oil, 50 cl glass bottle', ['glass-oil'], c('Bottle', 'glass'), ask('Cap', 'tin', ['tin', 'mixed_plastic'])),
  p('Wine vinegar, 50 cl', ['glass-vinegar'], c('Bottle', 'glass'), ask('Cap', 'tin', ['tin', 'mixed_plastic'])),
  p('Chopped tomatoes, 400 g tin', ['tin-tomato'], c('Tin', 'tin')),
  p('Tuna in a tin, 160 g', ['tin-tuna'], c('Tin', 'tin')),
  p('Chickpeas, 800 g tin', ['tin-large'], c('Tin', 'tin')),
  p('Peach slices, 800 g tin', ['tin-large'], c('Tin', 'tin')),
  p('Cornflakes, 500 g', ['cardboard-cereal'], c('Box', 'cardboard'), filmBag()),
  p('Rolled oats, 500 g', ['cardboard-cereal'], c('Box', 'cardboard')),
  p('Free-range eggs, 6 pack', ['cardboard-egg'], c('Egg box', 'cardboard')),
  p('Bread roll, bakery bag', ['paper-bag'], c('Bag', 'paper')),
  p('Potato crisps, 170 g', [], c('Bag', 'mixed_plastic')),
  p('Butter biscuits, 200 g', [], c('Tray', 'mixed_plastic'), c('Film', 'mixed_plastic')),
  p('Strawberries, 250 g', ['pet-tray'], c('Punnet', 'mixed_plastic')),
  p('Grapes, 500 g', ['pet-tray'], c('Punnet', 'mixed_plastic')),
  p('Peach yoghurt, 180 g', ['al-lid'], c('Cup', 'mixed_plastic'), c('Lid', 'aluminium')),
  p('Vanilla yoghurt in a glass jar, 150 g', ['glass-jar-jam', 'al-lid'], c('Jar', 'glass'), c('Lid', 'aluminium')),
  p('Frozen peas, 1 kg', [], c('Bag', 'mixed_plastic')),
  p('Tea, 20 bags', ['cardboard-cereal'], c('Box', 'cardboard'), ask('Outer film', 'mixed_plastic', ['mixed_plastic', 'paper'])),
  p('Coffee beans, 500 g', [], ask('Bag', 'mixed_plastic', ['mixed_plastic', 'residual'])),

  // Household
  p('Conditioner, 250 ml', ['hdpe-conditioner'], c('Bottle', 'plastic_bottle'), c('Cap', 'plastic_bottle')),
  p('Liquid laundry detergent, 1.5 L', ['hdpe-detergent'], c('Bottle', 'plastic_bottle'), c('Cap', 'plastic_bottle')),
  p('Hand soap, 250 ml', ['hdpe-soap'], c('Bottle', 'plastic_bottle'), ask('Pump', 'mixed_plastic', ['mixed_plastic', 'residual'])),
  p('Dish soap, 500 ml', ['hdpe-soap'], c('Bottle', 'plastic_bottle'), c('Cap', 'plastic_bottle')),
  p('Button cell battery', ['battery-button'], c('Battery (when used up)', 'battery'), c('Blister', 'mixed_plastic')),
  p('Plastic bin liners, 20 pack', ['film-bag'], c('Roll film', 'mixed_plastic'), ask('Cardboard sleeve', 'cardboard', ['cardboard', 'paper'])),
];

export const BARCODES = Object.fromEntries(
  DEMO.map(({ name, collect, components }, i) => {
    const code = ean(String(200000000001 + i));
    return [code, { barcode: code, name, collect, components, demo: true, source: 'demo' }];
  }),
);

export const DEMO_BARCODE_LIST = Object.values(BARCODES).map((x) => ({ code: x.barcode, name: x.name }));
export const DEMO_BARCODE_COUNT = DEMO_BARCODE_LIST.length;
