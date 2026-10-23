import { html } from '../lib.js';
import { Icon, Toggle } from '../ui.js';
import { useStore, updateReminders, updateSocial } from '../store.js';
import { computeStreaks, weekCountsFromActivities, streakMessage, myMilestones } from '../logic/social.js';
import { nowTs } from '../logic/clock.js';
import { weekStart, zParts, fmtShortZ } from '../logic/zurich.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function useMyStreaks() {
  const s = useStore();
  const counts = weekCountsFromActivities(s.activities);
  return computeStreaks((ws) => (counts.get(ws) || 0) > 0, nowTs());
}

// A calm, dismissible nudge. Never shown unless reminders are on, and it asks for no purchases or extra trips.
export function ReminderBanner() {
  const s = useStore();
  const st = useMyStreaks();
  const r = s.social.reminders;
  const now = nowTs();
  const wk = weekStart(now);
  if (!s.social.enabled || !r.on || st.thisDone || s.social.reminderDismissedWeek === wk || zParts(now).dow < r.day) return null;
  return html`<div class="note tone-lavender reminder" role="status">
    <${Icon} name="bell" size=${18} />
    <span class="grow">Your week is still open. If you happen to have something to drop off, now’s a nice time — no extra trips needed.</span>
    <button class="btn btn-ghost btn-sm" style="flex:none;min-height:36px" onClick=${() => updateSocial({ reminderDismissedWeek: wk })}>Not now</button>
  </div>`;
}

export function StreaksTab({ onEditPrivacy }) {
  const s = useStore();
  const st = useMyStreaks();
  const soc = s.social;
  const milestones = myMilestones(s.activities, st, soc.badges);
  const vis = (on) => (on ? 'Friends can see' : 'Only you');

  return html`<div class="stack">
    <section class="card streak-card tone-mint stack-sm">
      <div class="streak-main">
        <div class=${`streak-bubble ${st.current > 0 ? 'on' : ''}`} aria-hidden="true"><strong>${st.current}</strong><span class="small">week${st.current === 1 ? '' : 's'}</span></div>
        <div class="stack-sm">
          <h2>Current streak</h2>
          <p class="small">Longest: <strong>${st.longest}</strong> week${st.longest === 1 ? '' : 's'}</p>
          <p><span class=${`tag ${st.thisDone ? 'tag-verified' : 'tag-pending'}`}>${st.thisDone ? 'This week’s goal is done' : 'This week: not done yet'}</span></p>
        </div>
      </div>
      <p aria-live="polite">${streakMessage(st)}</p>
    </section>

    <section class="card stack-sm">
      <h3>Recent weeks</h3>
      <ol class="week-dots" aria-label="Last eight weeks">
        ${st.recent.map((w) => html`<li class=${`${w.done ? 'done' : ''} ${w.isCurrent ? 'current' : ''}`}><span class="dot" role="img" aria-label=${`Week of ${w.label}: ${w.done ? 'completed' : w.isCurrent ? 'in progress' : 'no activity'}`}>${w.done ? '✓' : ''}</span><span class="small muted">${w.label}</span></li>`)}
      </ol>
      <p class="muted small">A week runs Monday to Sunday (Europe/Zurich). It counts when you log at least one eligible recycling activity — a single drop-off is plenty. There’s no need to make extra trips or buy anything.</p>
    </section>

    <section class="card stack-sm">
      <h3><${Icon} name="bell" size=${20} /> Gentle reminder</h3>
      <${Toggle} checked=${soc.reminders.on} onChange=${(v) => updateReminders({ on: v })} label="Remind me if my week is still open" description="A quiet note in the app. You can turn it off any time." />
      ${soc.reminders.on && html`<label class="field"><span class="strong small">From which day?</span>
        <select value=${soc.reminders.day} onChange=${(e) => updateReminders({ day: Number(e.target.value) })}>${DAYS.slice(2).map((d, i) => html`<option value=${i + 2}>${d}</option>`)}</select></label>`}
      <p class="muted small">Demo: reminders appear inside the app. Real push notifications need a server and your permission.</p>
    </section>

    <section class="card stack-sm">
      <h3>Milestones & badges</h3>
      ${soc.badges.length > 0 && html`<div class="chip-wrap">${soc.badges.map((b) => html`<span class="chip tone-lavender" title=${b.name}>${b.name}</span>`)}</div>`}
      ${milestones.length === 0 ? html`<p class="muted small">Your first milestones will show up here as you recycle.</p>`
        : html`<ul class="plain-list">${milestones.slice(0, 6).map((m) => html`<li>${m.text}</li>`)}</ul>`}
      <p class="small muted">Milestones are ${soc.privacy.milestones ? html`<strong>visible to friends</strong>` : html`<strong>private</strong>`}. They never include places or times.</p>
    </section>

    <section class="card tone-lavender stack-sm">
      <h3>What friends can see</h3>
      <ul class="plain-list summary">
        <li><span>Recycling totals</span><strong>${vis(soc.privacy.totals)}</strong></li>
        <li><span>Streaks</span><strong>${vis(soc.privacy.streaks)}</strong></li>
        <li><span>Milestones</span><strong>${vis(soc.privacy.milestones)}</strong></li>
      </ul>
      <button class="btn btn-ghost btn-sm" onClick=${onEditPrivacy}>Change sharing</button>
    </section>
  </div>`;
}
