// The UI only talks to this module. It routes each call to the demo or live provider
// configured in config.providers.
import { config } from '../config.js';
import * as demo from './demo.js';
import * as live from './live.js';
import * as openFoodFacts from './openfoodfacts.js';
import { haversineKm } from '../utils.js';
import { DEFAULT_AREA_ID, AREAS, areaBBox } from '../data/areas.js';

const provider = (domain) => (config.providers[domain] === 'live' ? live : demo);
export const isDemo = (domain) => config.providers[domain] !== 'live';

// Locations (approved only, per area and map view)
export const loadLocations = (q) => provider('locations').loadLocations(q);
export const nearbyLocations = (q) => provider('locations').nearbyLocations(q);

// Nearest recycling stations (with known materials) to a point — used by the scanner.
export async function findStations({ center, areaId = DEFAULT_AREA_ID }) {
  const { locations } = await loadLocations({ areaId, bbox: areaBBox(AREAS[areaId], 1.1) });
  return locations.filter((l) => l.type === 'station')
    .map((l) => ({ ...l, distanceKm: haversineKm(center, l) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

// Community
export const submitPlace = (q) => provider('community').submitPlace(q);
export const submitReport = (q) => provider('community').submitReport(q);
export const confirmPlace = (q) => provider('community').confirmPlace(q);
export const listContributions = (q) => provider('community').listContributions(q);
export const rewardableItems = (q) => provider('community').rewardableItems(q);
export const adminQueue = () => provider('community').adminQueue();
export const adminReview = (q) => provider('community').adminReview(q);
export const adminResetDemo = () => provider('community').adminResetDemo();

// Social
const soc = (name) => (q) => provider('social')[name](q);
export const getSocial = soc('getSocial');
export const findUser = soc('findUser');
export const sendRequest = soc('sendRequest');
export const respondRequest = soc('respondRequest');
export const cancelRequest = soc('cancelRequest');
export const removeFriend = soc('removeFriend');
export const blockUser = soc('blockUser');
export const unblockUser = soc('unblockUser');
export const reportUser = soc('reportUser');
export const react = soc('react');
export const createChallenge = soc('createChallenge');
export const respondChallenge = soc('respondChallenge');
export const leaveChallenge = soc('leaveChallenge');
export const saveChallengeResult = soc('saveChallengeResult');
export const resetSocialDemo = () => provider('social').resetSocialDemo();

// Everything else
export const geocode = (text) => provider('geocoding').geocode(text);
export const searchProducts = (q) => provider('products').searchProducts(q);
export const verifyReceipt = (code) => provider('receipts').verifyReceipt(code);
export const leaderboardPeers = (range) => provider('leaderboard').leaderboardPeers(range);

export async function lookupBarcode(code, { allowOpenFoodFacts = false } = {}) {
  const hit = await provider('barcodes').lookupBarcode(code);
  if (hit) return hit;
  if (allowOpenFoodFacts) return openFoodFacts.lookup(code);
  return null;
}

export { devFlags } from './flags.js';
