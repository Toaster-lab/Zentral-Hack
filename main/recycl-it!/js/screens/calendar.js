import { html, useState } from '../lib.js';
import { Header, Icon, Chip, Toggle, DemoTag, toast } from '../ui.js';
import { useStore, updateCalendar } from '../store.js';
import { COLLECTIONS, CALENDAR_SOURCE } from '../data/collection-calendar.js';
import { upcoming, tomorrow, todayKey, addDays, toIcs } from '../logic/calendar.js';
import { MATERIALS } from '../logic/rules.js';
import { nowTs } from '../logic/clock.js';

const FILTERS = [...new Set(COLLECTIONS.map((c) => c.material))];
const dayLabel = (key, today) => {
  if (key === today) return 'Today';
  if (key === addDays(today, 1)) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${key}T12:00:00Z`));
};

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function Calendar() {
  const s = useStore();
  const prefs = s.calendar;
  const [alarm, setAlarm] = useState(true);
  const now = nowTs();
  const today = todayKey(now);
  const rows = upcoming(COLLECTIONS, now, { days: 90, materials: prefs.materials });
  const sample = CALENDAR_SOURCE.kind !== 'official';
  const toggle = (m) => updateCalendar({ materials: prefs.materials.includes(m) ? prefs.materials.filter((x) => x !== m) : [...prefs.materials, m] });
  const groups = rows.reduce((acc, r) => ((acc[r.date] = acc[r.date] || []).push(r), acc), {});

  function exportIcs() {
    const all = upcoming(COLLECTIONS, now, { days: 180, materials: prefs.materials });
    download('bubblecycle-collections.ics', toIcs(all, { source: CALENDAR_SOURCE, reminder: alarm, now: Date.now() }));
    toast('Calendar file downloaded');
  }

  return html`<div class="screen calendar-screen">
    <${Header} back title="Collection calendar" subtitle=${CALENDAR_SOURCE.municipality} />

    <p class=${`note ${sample ? 'tone-peach' : ''}`}><${Icon} name="info" size=${18} /> <span>
      ${sample
        ? html`<${DemoTag}>Sample dates<//> These dates are examples, not the official ${CALENDAR_SOURCE.municipality} schedule. Check the municipality’s waste calendar before you put anything out.`
        : html`Source: ${CALENDAR_SOURCE.url ? html`<a href=${CALENDAR_SOURCE.url} rel="noopener noreferrer">${CALENDAR_SOURCE.label}</a>` : CALENDAR_SOURCE.label}.`}
      Dates last updated ${CALENDAR_SOURCE.updated}.</span></p>

    <section class="section" aria-labelledby="cal-f">
      <h2 id="cal-f">Show</h2>
      <div class="chip-wrap">
        <${Chip} selected=${prefs.materials.length === 0} onClick=${() => updateCalendar({ materials: [] })}>All<//>
        ${FILTERS.map((m) => html`<${Chip} selected=${prefs.materials.includes(m)} onClick=${() => toggle(m)}>${MATERIALS[m].label}<//>`)}
      </div>
    </section>

    <section class="section" aria-labelledby="cal-u">
      <h2 id="cal-u">Next 90 days</h2>
      ${rows.length === 0 && html`<p class="muted">No collections in the next 90 days for this selection.</p>`}
      <div class="list">
        ${Object.entries(groups).map(([date, items]) => html`<div class="list-row" key=${date}>
          <span class="grow">
            <span class="row-title block">${dayLabel(date, today)}</span>
            ${items.map((r) => html`<span class="row-sub block" key=${r.id}><strong>${r.title}</strong>. ${r.hint}</span>`)}
          </span>
        </div>`)}
      </div>
    </section>

    <section class="card stack">
      <h2>Reminders</h2>
      <${Toggle} checked=${prefs.remind} onChange=${(v) => updateCalendar({ remind: v })}
        label="Remind me inside the app" description="When you open RECYCL IT! the day before a collection, it shows a note on Home." />
      <p class="muted small">RECYCL IT! can’t send you a notification when the app is closed. For a reminder that does, add the dates to your phone’s calendar below: your calendar app does the reminding.</p>
      <label class="row gap center small"><input type="checkbox" checked=${alarm} onChange=${(e) => setAlarm(e.target.checked)} /> Include a reminder at 18:00 the evening before</label>
      <button class="btn btn-primary" style="align-self:flex-start" disabled=${rows.length === 0} onClick=${exportIcs}><${Icon} name="clock" size=${18} /> Add to my calendar (.ics)</button>
      <p class="muted small">Downloads the next six months for the materials selected above.${sample ? ' They are sample dates, so the events say so.' : ''}</p>
    </section>
  </div>`;
}

// Home: shown only when in-app reminders are on and a selected collection is tomorrow.
export function CollectionReminder() {
  const s = useStore();
  if (!s.calendar.remind) return null;
  const list = tomorrow(COLLECTIONS, nowTs(), s.calendar.materials);
  if (!list.length) return null;
  const sample = CALENDAR_SOURCE.kind !== 'official';
  return html`<p class="note tone-mint" role="status"><${Icon} name="clock" size=${18} /> <span>Tomorrow: ${list.map((r) => r.title.toLowerCase()).join(' and ')} collection${sample ? ' (sample date)' : ''}.</span></p>`;
}
