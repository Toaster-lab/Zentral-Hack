// Collection dates for Rotkreuz (Risch).
//
// These are SAMPLE dates. They follow plausible patterns (every fourth Wednesday, the first Friday of the month…)
// so the calendar, filters, reminders and export can be tried, but they are NOT the municipality's schedule.
// To go live, replace `COLLECTIONS` with the official dates (the Gemeinde Risch waste calendar) and update
// CALENDAR_SOURCE: set kind to 'official', the page the dates came from, and the date they were last checked.
// The screen shows that source and date, and drops the "sample" labels, automatically.
export const CALENDAR_SOURCE = {
  kind: 'sample',                    // 'sample' | 'official'
  municipality: 'Risch (Rotkreuz)',
  label: 'Sample dates',
  url: null,                         // e.g. the municipality's published calendar, once used
  updated: '2026-10-24',             // when these dates were last written or checked
};

// Recurrence rules, in local (Zurich) calendar dates:
//   { every: N, anchor: 'YYYY-MM-DD' }  every N weeks from the anchor date
//   { nth: N, weekday: 0-6 }            the Nth weekday of each month (0 = Monday)
export const COLLECTIONS = [
  { id: 'paper', material: 'paper', title: 'Paper', hint: 'Tied in a bundle with string, put out by 7:00.', rule: { every: 4, anchor: '2026-10-28' } },
  { id: 'cardboard', material: 'cardboard', title: 'Cardboard', hint: 'Flattened and tied in a bundle.', rule: { nth: 1, weekday: 4 } },
  { id: 'green_waste', material: 'green_waste', title: 'Green waste', hint: 'Garden clippings only, no plastic bags.', rule: { every: 2, anchor: '2026-10-26' } },
  { id: 'textile', material: 'textile', title: 'Textiles & shoes', hint: 'Clean and dry, in a closed bag.', rule: { every: 12, anchor: '2026-11-07' } },
];
