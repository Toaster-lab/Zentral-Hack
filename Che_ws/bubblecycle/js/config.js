// Central app configuration.
// Each data domain has a provider: 'demo' (bundled sample data / on-device demo backend)
// or 'live' (a real integration implemented in services/live.js). Flip one at a time as
// real services are connected.
import { defaultArea } from './data/areas.js';

export const config = {
  appName: 'BubbleCycle',
  providers: {
    locations: 'demo',    // public locations for the area (stations, bins)
    community: 'demo',    // submissions, reports, confirmations, admin review
    geocoding: 'demo',    // place / postcode -> coordinates
    products: 'demo',     // sustainable product discovery
    barcodes: 'demo',     // barcode -> product + packaging
    receipts: 'demo',     // station receipt codes -> verified recycling
    leaderboard: 'demo',  // other players' recycling counts
    social: 'demo',       // friends, requests, challenges (simulated people in demo mode)
  },
  demoLatencyMs: [250, 700],
  defaultCenter: { ...defaultArea().center, label: defaultArea().name },
  tiles: {
    // Fine for a local demo. Use a commercial / self-hosted tile provider for launch
    // (see https://operations.osmfoundation.org/policies/tiles/).
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  openFoodFacts: {
    // Optional, opt-in only (Profile > Data sources). Sends just the barcode.
    endpoint: 'https://world.openfoodfacts.org/api/v2/product/',
  },
  limits: {
    maxItemsPerLog: 50,
    maxLogsPerDay: 20,
    maxItemsPerDay: 150,
    duplicateWindowMin: 10,
  },
  points: {
    perItem: 5,
    verifiedBonusPerItem: 2,
  },
  // Spendable points for helping the map. These go to the points ledger only — never to
  // recycling counts or the leaderboard. Paid out after review (confirmations: instantly, capped).
  contribution: {
    placeApproved: 25,
    photoBonus: 5,
    placeMerged: 10,
    changeAccepted: 5,
    confirm: 2,
    confirmsPerDay: 3,
    maxPendingPerPerson: 5,
    duplicateRadiusM: { station: 60, bin: 20 },
    tempIssueHours: { bin_full: 24, damaged: 24 * 7 },
  },
  weeklyGoalDefault: 20,
};
