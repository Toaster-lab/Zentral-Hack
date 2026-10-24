// Collection-calendar maths: when is the next collection, and a calendar file people can import.
// Dates are whole local days in Europe/Zurich, so a collection on "Wednesday" is Wednesday for everyone,
// whatever time zone the phone is set to.
import { zParts } from './zurich.js';

const pad = (n) => String(n).padStart(2, '0');
const key = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const civil = (y, m, d) => new Date(Date.UTC(y, m, d));            // m is 0-based; overflow rolls over
const weekdayOf = (dt) => (dt.getUTCDay() + 6) % 7;                  // Monday = 0
const keyOf = (dt) => key(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
const DAY = 86400000;

export const todayKey = (ts) => { const p = zParts(ts); return key(p.y, p.m, p.d); };
export const addDays = (k, n) => keyOf(new Date(Date.parse(`${k}T00:00:00Z`) + n * DAY));

function datesFor(rule, fromKey, toKey) {
  const out = [];
  const from = Date.parse(`${fromKey}T00:00:00Z`); const to = Date.parse(`${toKey}T00:00:00Z`);
  if (rule.every) {
    const step = rule.every * 7 * DAY; const anchor = Date.parse(`${rule.anchor}T00:00:00Z`);
    for (let t = anchor + Math.ceil((from - anchor) / step) * step; t <= to; t += step) out.push(keyOf(new Date(t)));
  } else if (rule.nth) {
    const start = new Date(from);
    for (let y = start.getUTCFullYear(), m = start.getUTCMonth(); civil(y, m, 1).getTime() <= to; m++) {
      const first = civil(y, m, 1);
      const offset = (rule.weekday - weekdayOf(first) + 7) % 7;
      const d = civil(y, m, 1 + offset + 7 * (rule.nth - 1));
      if (d.getUTCMonth() % 12 === ((m % 12) + 12) % 12 && d.getTime() >= from && d.getTime() <= to) out.push(keyOf(d));
    }
  }
  return out;
}

// Upcoming collections from today (inclusive) for `days` days, soonest first. `materials` filters; empty = all.
export function upcoming(collections, nowTs, { days = 90, materials = [] } = {}) {
  const from = todayKey(nowTs); const to = addDays(from, days);
  const rows = [];
  for (const c of collections) {
    if (materials.length && !materials.includes(c.material)) continue;
    for (const date of datesFor(c.rule, from, to)) rows.push({ date, id: c.id, material: c.material, title: c.title, hint: c.hint });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

// Collections happening tomorrow, for the in-app reminder.
export const tomorrow = (collections, nowTs, materials = []) => {
  const t = addDays(todayKey(nowTs), 1);
  return upcoming(collections, nowTs, { days: 1, materials }).filter((r) => r.date === t);
};

// ---- iCalendar (.ics) --------------------------------------------------------------------------

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Lines may not exceed 75 octets; longer ones are continued on a line starting with a space.
function fold(line) {
  const bytes = new TextEncoder(); const out = []; let cur = ''; let size = 0;
  for (const ch of line) {
    const n = bytes.encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; size = 0; }
    cur += ch; size += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function toIcs(rows, { source, reminder = true, now = Date.now() } = {}) {
  const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const sample = source?.kind !== 'official';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RECYCL IT//Collection calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(`Waste collection, ${source?.municipality || 'Rotkreuz'}`)}`, 'X-WR-TIMEZONE:Europe/Zurich'];
  for (const r of rows) {
    const d = r.date.replace(/-/g, '');
    const next = addDays(r.date, 1).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${r.id}-${d}@bubblecycle`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${esc(`${r.title} collection`)}`,
      `DESCRIPTION:${esc(`${r.hint}${sample ? ' SAMPLE DATE from RECYCL IT!, not the official schedule. Check the municipality\'s waste calendar.' : ''}`)}`,
      'TRANSP:TRANSPARENT');
    if (reminder) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`${r.title} collection tomorrow`)}`, 'TRIGGER:-PT6H', 'END:VALARM'); // 18:00 the evening before
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
