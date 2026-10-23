// Fictional rewards. No real retailer or partner is involved; every reward is a demo.
export const REWARDS = [
  { id: 'badge-glass', kind: 'badge', name: 'Glass badge', emoji: '🫙', cost: 50, once: true, blurb: 'A badge for your profile.' },
  { id: 'badge-pet', kind: 'badge', name: 'PET bottle badge', emoji: '🧴', cost: 50, once: true, blurb: 'A badge for your profile.' },
  { id: 'badge-mapper', kind: 'badge', name: 'Map helper badge', emoji: '🗺️', cost: 40, once: true, blurb: 'For helping keep the map accurate.' },
  { id: 'badge-hero', kind: 'badge', name: 'Regular recycler badge', emoji: '🦸', cost: 120, once: true, blurb: 'For steady recyclers.' },
  { id: 'disc-refill', kind: 'discount', name: '10 % off at “Refill Room”', emoji: '🫧', cost: 200, partner: 'Refill Room (fictional shop)', blurb: 'A made-up refill shop for this demo.' },
  { id: 'voucher-cafe', kind: 'voucher', name: 'CHF 5 at “Leaf & Ladle” café', emoji: '☕', cost: 300, partner: 'Leaf & Ladle (fictional café)', blurb: 'A made-up café voucher for this demo.' },
  { id: 'voucher-bottle', kind: 'voucher', name: 'Reusable bottle at “Bubble Market”', emoji: '🍶', cost: 500, partner: 'Bubble Market (fictional shop)', blurb: 'A made-up shop voucher for this demo.' },
];

// Demo receipt codes stand in for a real verification source (e.g. a station machine
// printing a code, or a retailer API). Each code can only be used once.
export const DEMO_RECEIPT_CODES = ['BC-1001-ZH', 'BC-1002-ZH', 'BC-1003-ZH', 'BC-2001-BE', 'BC-3001-BS', 'BC-4001-LS', 'BC-5001-GE', 'BC-6001-LU'];

// Fictional players for the demo leaderboard.
export const DEMO_PLAYERS = [
  'MintyMarta', 'PETer_ZH', 'GlassGabi', 'AluAndri', 'BubbleBea', 'CardboardCarlo',
  'SkyLuca', 'LavenderLea', 'PeachyPia', 'RappiRecycles', 'NinaNoWaste', 'TomTextile',
];

export const TIPS = [
  'Squash PET bottles and screw the cap back on — they take up far less space in the bin.',
  'In Switzerland, shops that sell batteries take used ones back for free.',
  'Glass collection points often have quiet hours — check the sign before a noisy drop-off.',
  'Take the metal lid off glass jars: the lid goes to aluminium/tin, the jar to glass.',
  'Tie paper into bundles with string instead of putting it in a bag.',
  'Rinsing doesn’t need to be perfect — a quick swirl of water is enough.',
  'Not sure about an item? Scan it and confirm what the packaging is made of.',
  'Wearable clothes can go to textile collections — pack them in a closed bag.',
  'Shiny crisp bags are plastic with a metal layer, so they don’t belong with aluminium.',
  'The bag you already own is usually the best bag — keep one by the door.',
];
