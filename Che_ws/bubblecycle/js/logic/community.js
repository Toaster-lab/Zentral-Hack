// Shared vocabulary for community contributions (used by the UI and the demo backend).
import { config } from '../config.js';

export const LOCATION_TYPES = {
  station: { label: 'Recycling point', short: 'Station', icon: 'leaf' },
  bin: { label: 'Public trash bin', short: 'Bin', icon: 'trash' },
};

// Temporary issues clear by themselves and never change the place's record.
// Permanent ones go through review before the place is changed.
export const ISSUES = [
  { key: 'wrong_location', label: 'Wrong location', temporary: false, hint: 'The pin isn’t where the place really is.' },
  { key: 'bin_full', label: 'Bin full', temporary: true, hint: 'Full right now — this clears by itself.' },
  { key: 'damaged', label: 'Damaged or inaccessible', temporary: true, hint: 'Broken, blocked or locked for now.' },
  { key: 'incorrect_info', label: 'Incorrect recycling information', temporary: false, hint: 'Materials, hours or details are wrong.' },
  { key: 'removed', label: 'Removed or no longer exists', temporary: false, hint: 'It’s gone for good.' },
];
export const issueByKey = (k) => ISSUES.find((i) => i.key === k);

export const REJECT_REASONS = [
  'Already on the map',
  'Couldn’t verify it',
  'Not a public place',
  'Photo shows people or private property',
  'Other',
];

export const PHOTO_REMINDER = 'Please don’t include people, faces or number plates in photos. Photos are checked before they appear publicly.';

// Points are decided by the backend at review time, so the rule lives in one place.
export function rewardFor(item, outcome) {
  const c = config.contribution;
  if (item.kind === 'new_place') {
    if (outcome === 'merged') return { points: c.placeMerged, label: 'Helped improve a place on the map' };
    const photo = item.payload.photo ? c.photoBonus : 0;
    return { points: c.placeApproved + photo, label: `Added a place to the map${photo ? ' (with photo)' : ''}` };
  }
  return { points: c.changeAccepted, label: 'Report helped keep the map accurate' };
}

export function statusMessage(item) {
  const pts = item.reward?.points;
  if (item.kind === 'report' && item.temporary) {
    return { tone: 'sky', title: 'Reported', text: 'Thanks. It now shows on the place as a temporary issue and clears by itself.' };
  }
  switch (item.status) {
    case 'pending': return { tone: 'lavender', title: 'Pending review', text: 'A reviewer will check this. ' + (item.kind === 'new_place' ? 'Until then only you can see it on the map.' : 'The place stays as it is until then.') };
    case 'approved': return { tone: 'mint', title: 'Approved', text: item.kind === 'new_place' ? `It’s now on the map for everyone.${pts ? ` You earned ${pts} points.` : ''}` : `The map has been updated.${pts ? ` You earned ${pts} points.` : ''}` };
    case 'merged': return { tone: 'mint', title: 'Merged', text: `It matched a place that was already on the map, so we combined them.${pts ? ` You earned ${pts} points.` : ''}` };
    case 'rejected': return { tone: 'peach', title: 'Not added', text: `Reason: ${item.reviewNote || 'not given'}. You can submit it again with more detail.` };
    default: return { tone: 'grey', title: item.status, text: '' };
  }
}

export function itemTitle(item, locName) {
  if (item.kind === 'new_place') return `New ${LOCATION_TYPES[item.payload.type].label.toLowerCase()}`;
  const issue = issueByKey(item.issue)?.label || 'Report';
  return `${issue}${locName ? ` · ${locName}` : ''}`;
}
