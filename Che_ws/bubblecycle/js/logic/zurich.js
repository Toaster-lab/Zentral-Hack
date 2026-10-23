// Calendar maths in Europe/Zurich time (weeks start Monday 00:00 local time, DST-aware),
// independent of the device's own time zone.
const TZ = 'Europe/Zurich';
const DAY = 86400000;
const WEEKDAYS = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
});

export function zParts(ts) {
  const p = {};
  for (const x of parts.formatToParts(new Date(ts))) p[x.type] = x.value;
  return { y: +p.year, m: +p.month - 1, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, dow: WEEKDAYS[p.weekday] };
}

const offsetAt = (ts) => { const p = zParts(ts); return Date.UTC(p.y, p.m, p.d, p.h, p.mi, p.s) - Math.floor(ts / 1000) * 1000; };

// Timestamp of 00:00 Zurich time on the given calendar date (month/day may overflow).
export function zMidnight(y, m, d) {
  const t = Date.UTC(y, m, d);
  return t - offsetAt(t - offsetAt(t));
}

export const startOfDayZ = (ts) => { const p = zParts(ts); return zMidnight(p.y, p.m, p.d); };
export const weekStart = (ts, offset = 0) => { const p = zParts(ts); return zMidnight(p.y, p.m, p.d - p.dow + 7 * offset); };
export const monthStart = (ts, offset = 0) => { const p = zParts(ts); return zMidnight(p.y, p.m + offset, 1); };
export const prevWeekStart = (ws) => weekStart(ws - 3 * DAY);
export const nextWeekStart = (ws) => weekStart(ws + 10 * DAY);

const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const shortFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' });
const monthFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, month: 'long', year: 'numeric' });
export const fmtDayZ = (ts) => dayFmt.format(new Date(ts));
export const fmtShortZ = (ts) => shortFmt.format(new Date(ts));
export const fmtMonthZ = (ts) => monthFmt.format(new Date(ts));
// Inclusive label for an exclusive end timestamp ("Mon 19 Oct – Sun 25 Oct").
export const fmtRangeZ = (start, end) => `${fmtDayZ(start)} – ${fmtDayZ(end - 1)}`;

export function timeLeft(end, now) {
  const ms = end - now;
  if (ms <= 0) return 'Ended';
  const min = Math.floor(ms / 60000);
  const d = Math.floor(min / 1440); const h = Math.floor((min % 1440) / 60); const m = min % 60;
  if (d >= 1) return `${d} day${d > 1 ? 's' : ''} ${h} h left`;
  if (h >= 1) return `${h} h ${m} min left`;
  return `${Math.max(1, m)} min left`;
}
export function timeUntil(start, now) {
  const ms = start - now;
  const d = Math.floor(ms / DAY); const h = Math.floor((ms % DAY) / 3600000);
  return d >= 1 ? `Starts in ${d} day${d > 1 ? 's' : ''}` : `Starts in ${Math.max(1, h)} h`;
}
export const DAY_MS = DAY;
