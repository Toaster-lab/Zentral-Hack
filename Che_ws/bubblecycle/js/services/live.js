// Live providers — stubs to implement when real services are connected.
// Keep the same signatures and return shapes as demo.js / community.js. Switch a domain to
// live in config.providers once its functions here are implemented.

class NotConnected extends Error {
  constructor(what, hint) {
    super(`${what} isn’t connected yet. ${hint}`);
    this.name = 'NotConnected';
  }
}
const nc = (what, hint) => async () => { throw new NotConnected(what, hint); };

// ---- locations (provider: 'locations') ---------------------------------------
// loadLocations({ areaId, bbox:{south,west,north,east}, contributorId }) ->
//   { locations: Location[], pending: Location[] }   // pending = the caller's own, unapproved places
// Location: { id, areaId, type:'station'|'bin', name, lat, lng, materials[], materialsKnown, hours[7]|null,
//   hoursText, access, description, photo, source:'osm'|'official'|'community'|'demo', sourceRef,
//   tempIssues:[{issue,ts}], lastConfirmedAt }
// Query by area + bbox on the server (e.g. a PostGIS index), never ship the whole country.
// Candidates: municipal open data, OSM (Overpass), your own database of approved submissions.
export const loadLocations = nc('Live location data', 'Serve approved locations per area and map view from your backend.');
export const nearbyLocations = nc('Live location data', 'Used for duplicate suggestions when adding a place.');

// ---- community (provider: 'community') ---------------------------------------
// Needs a backend with authentication (or at least abuse-resistant anonymous IDs).
export const submitPlace = nc('Community submissions', 'POST to a moderated queue; store photos in object storage after scanning.');
export const submitReport = nc('Community reports', 'Temporary issues expire server-side; permanent ones enter review.');
export const confirmPlace = nc('Place confirmations', 'Rate-limit per user and place.');
export const listContributions = nc('Your contributions', 'Return only the signed-in contributor’s own items.');
export const rewardableItems = nc('Contribution rewards', 'Pay points server-side after review.');
export const adminQueue = nc('The review queue', 'Restrict to authorised reviewers.');
export const adminReview = nc('Review actions', 'Restrict to authorised reviewers and keep an audit log.');
export const adminResetDemo = nc('Demo reset', 'Not available outside the demo.');

// ---- social (provider: 'social') ------------------------------------------------
// Needs real accounts: unique usernames, authentication, a friends graph, push/email for
// invitations, and server-side challenge scoring (so scores can’t be edited by clients).
// Challenge counts must come from validated server-side activity records, deduplicated by id,
// using the same rules as logic/social.js (Europe/Zurich boundaries, joined-at cut-off,
// verified vs self-reported levels). Never expose locations or visit times.
export const getSocial = nc('Social', 'Return friends, requests and challenges for the signed-in user.');
export const findUser = nc('Friend search', 'Exact username lookup only; never allow browsing or prefix search.');
export const sendRequest = nc('Friend requests', 'Rate-limit and respect blocks.');
export const respondRequest = nc('Friend requests', 'Accept or decline.');
export const cancelRequest = nc('Friend requests', 'Withdraw a pending request.');
export const removeFriend = nc('Friends', 'Remove a connection.');
export const blockUser = nc('Blocking', 'Blocked users can’t find, request or see you.');
export const unblockUser = nc('Blocking', 'Reverse a block.');
export const reportUser = nc('Reporting', 'Send to a moderation queue.');
export const react = nc('Reactions', 'Preset reactions only; no free text.');
export const createChallenge = nc('Challenges', 'Create and invite friends.');
export const respondChallenge = nc('Challenges', 'Accepting sets the join time used for counting.');
export const leaveChallenge = nc('Challenges', 'Leave before it ends.');
export const saveChallengeResult = nc('Challenges', 'Finalise results server-side when a challenge ends.');
export const resetSocialDemo = nc('Demo reset', 'Not available outside the demo.');

// ---- other domains -------------------------------------------------------------
// geocode(text) -> { label, lat, lng, areaId, municipality } | { outside:true, label } | null
export const geocode = nc('Live place search', 'Connect a geocoder (swisstopo, Nominatim) and map results to areas.');
// searchProducts({ filters, text }) -> Product[]; labels only `verified: true` with a named source.
export const searchProducts = nc('Live product data', 'Requires a retailer product API agreement.');
// lookupBarcode(code) -> { name, emoji?, components:[{ part, material, confirm?, options? }], source } | null
export const lookupBarcode = nc('Live barcode data', 'Connect a product/packaging database.');
// verifyReceipt(code) -> { valid:boolean }. Must be enforced server-side.
export const verifyReceipt = nc('Receipt verification', 'Requires station/retailer verification.');
// leaderboardPeers({ key, start, end }) -> [{ nickname, items, verified }]
export const leaderboardPeers = nc('Live leaderboard', 'Requires a backend.');
