export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const OSM_DAYS = { Mo: 0, Tu: 1, We: 2, Th: 3, Fr: 4, Sa: 5, Su: 6 };

export const todayIndex = (d = new Date()) => (d.getDay() + 6) % 7;

const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

// Slots look like "09:00-11:30" or "09:00-11:30, 13:15-17:00"; null/'' = closed.
const ranges = (slot) => (slot ? slot.split(',').map((r) => r.trim().split('-').map(toMin)) : []);

export function isOpenNow(hours, d = new Date()) {
  if (!hours) return null; // unknown
  const now = d.getHours() * 60 + d.getMinutes();
  return ranges(hours[todayIndex(d)]).some(([from, to]) => now >= from && now < to);
}

export const fmtSlot = (slot) => (!slot ? 'Closed' : slot === '00:00-24:00' ? 'Open 24 hours' : slot.replace(/-/g, ' – ').replace(/,/g, ', '));

// Groups identical consecutive days: "Mon–Fri 07:00 – 20:00".
export function hoursSummary(hours) {
  const out = [];
  let i = 0;
  while (i < 7) {
    let j = i;
    while (j + 1 < 7 && hours[j + 1] === hours[i]) j++;
    out.push({ days: i === j ? DAYS[i] : `${DAYS[i]}–${DAYS[j]}`, text: fmtSlot(hours[i]), today: todayIndex() >= i && todayIndex() <= j });
    i = j + 1;
  }
  return out;
}

// Parses the common subset of OSM opening_hours ("Mo-Fr 08:00-12:00, 13:00-17:00; Sa 09:00-12:00",
// "24/7"). Returns a 7-slot array, or null when the text is anything we can't read safely.
export function parseOpeningHours(text) {
  if (!text) return null;
  const t = text.trim();
  if (t === '24/7') return Array(7).fill('00:00-24:00');
  const week = Array(7).fill(null);
  for (const rule of t.split(';').map((r) => r.trim()).filter(Boolean)) {
    const m = rule.match(/^([A-Za-z]{2}(?:\s*[-,]\s*[A-Za-z]{2})*)\s+(\d{1,2}:\d{2}-\d{1,2}:\d{2}(?:\s*,\s*\d{1,2}:\d{2}-\d{1,2}:\d{2})*)$/);
    if (!m) return null;
    const days = new Set();
    for (const part of m[1].split(',').map((p) => p.trim())) {
      const [a, b] = part.split('-').map((p) => OSM_DAYS[p.trim()]);
      if (a === undefined || (part.includes('-') && b === undefined)) return null;
      if (b === undefined) days.add(a);
      else for (let k = a; ; k = (k + 1) % 7) { days.add(k); if (k === b) break; }
    }
    const slot = m[2].split(',').map((r) => r.trim().replace(/\b(\d):/g, '0$1:')).join(', ');
    days.forEach((d) => { week[d] = slot; });
  }
  return week;
}

export const directionsUrl = (loc, from) =>
  `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${from ? `${from.lat}%2C${from.lng}` : ''}%3B${loc.lat}%2C${loc.lng}`;
