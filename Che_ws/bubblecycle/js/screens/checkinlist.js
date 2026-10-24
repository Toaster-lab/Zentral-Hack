import { html, useState } from '../lib.js';
import { Icon, DemoTag, toast } from '../ui.js';
import { MATERIALS } from '../logic/rules.js';
import { EVIDENCE, FLAGS } from '../logic/evidence.js';
import { pointsFor } from '../logic/activity.js';
import { useStore, appealCheckin, withdrawCheckin, resolveCheckin, removeOutbox, CHECKIN_PENDING } from '../store.js';
import { relTime } from '../utils.js';
import { env } from '../env.js';
import { useConfirm } from './authgate.js';
import { requireSignIn } from './account.js';
import { appealOnServer, withdrawOnServer, sendWaiting, isOffline } from '../services/activity.js';

const STATUS = {
  counted: ['Counted', 'tag-verified'],
  review: ['Held for review', 'tag-warn'],
  appealed: ['Appeal sent', 'tag-warn'],
  queued: ['Waiting to send', 'tag-warn'],
  declined: ['Not counted', 'tag-self'],
};

// Things saved on this device while offline. They are not counted, not accepted and not visible to anyone
// until the server has checked them.
export function OutboxList() {
  const s = useStore();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  if (!env.api || !s.outbox.length) return null;
  const waiting = s.outbox.filter((o) => o.status === 'queued');

  async function send() {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await requireSignIn())) return;
      const r = await sendWaiting(confirm.run);
      if (r.confirmFailed) return;
      toast(r.rejected ? `${r.sent} sent, ${r.rejected} not accepted` : `${r.sent} sent`, r.rejected ? 'peach' : 'mint');
    } finally { setBusy(false); }
  }

  return html`<section class="section" aria-labelledby="ob-h">
    <h2 id="ob-h">Saved on this device</h2>
    <p class="muted small">These haven’t been sent. They don’t count for points, quests or the leaderboard until the server accepts them, and it may refuse some.</p>
    <ul class="plain-list">
      ${s.outbox.map((o) => html`<li key=${o.id} class="card-inset" style="width:100%">
        <div class="row between center">
          <strong>${o.kind === 'checkin' ? 'Check-in' : 'Log'}</strong>
          <span class=${`tag ${o.status === 'queued' ? 'tag-warn' : 'tag-self'}`}>${o.status === 'queued' ? 'Waiting to send' : o.status === 'expired' ? 'Expired' : 'Not accepted'}</span>
        </div>
        <p class="small muted">${relTime(o.queuedAt)} · ${o.label}</p>
        ${o.error && html`<p class="small">${o.error}</p>`}
        ${o.status !== 'queued' && html`<button class="btn btn-ghost btn-sm" onClick=${() => removeOutbox(o.id)}>Dismiss</button>`}
        ${o.status === 'queued' && html`<button class="link-btn small" onClick=${() => removeOutbox(o.id)}>Delete</button>`}
      </li>`)}
    </ul>
    ${confirm.panel}
    ${waiting.length > 0 && !confirm.waiting && html`<button class="btn btn-primary" style="align-self:flex-start" disabled=${busy || isOffline()} onClick=${send}>
      ${isOffline() ? 'Waiting for a connection' : busy ? (confirm.busy ? 'Waiting for your device…' : 'Sending…') : confirm.failed ? 'Try again' : `Confirm and send ${waiting.length}`}</button>`}
  </section>`;
}

export function CheckinList() {
  const s = useStore();
  const [appealing, setAppealing] = useState(null);
  const [note, setNote] = useState('');
  if (!s.checkins.length) return null;

  const withdraw = async (c) => {
    try { if (env.api) await withdrawOnServer(c.id); else withdrawCheckin(c.id); toast('Withdrawn'); } catch (e) { toast(e.message, 'peach'); }
  };
  const sendNote = async (c) => {
    try { if (env.api) await appealOnServer(c.id, note); else appealCheckin(c.id, note); setAppealing(null); toast('Note sent with your check-in'); } catch (e) { toast(e.message, 'peach'); }
  };
  const decide = (c, approve) => {
    const res = resolveCheckin(c.id, approve);
    toast(approve ? (res.ok ? `+${res.points} points · counted` : `Not counted: ${res.error}`) : 'Marked as not counted', approve && res.ok ? 'mint' : 'peach');
  };

  return html`<section class="section" aria-labelledby="ci-h">
    <h2 id="ci-h">Check-ins</h2>
    <p class="muted small">Only you can see the review status and warning signals. They never appear on the leaderboard or in Social.</p>
    <ul class="plain-list">
      ${s.checkins.slice(0, 10).map((c) => {
        const [label, cls] = STATUS[c.status];
        const pending = CHECKIN_PENDING.includes(c.status);
        const total = c.entries.reduce((n, e) => n + e.count, 0);
        return html`<li key=${c.id} class="card-inset" style="width:100%">
          <div class="row between center">
            <strong>${c.stationName}</strong>
            <span class=${`tag ${cls}`}>${label}</span>
          </div>
          <p class="small muted">${relTime(c.ts)} · ${c.entries.map((e) => `${e.count} × ${MATERIALS[e.material].label.toLowerCase()}`).join(', ')} · <span class="tag tag-self">${EVIDENCE[c.evidence].label}</span></p>
          ${pending && html`<p class="small">Credit pending: about ${pointsFor(total, false)} points. Nothing is counted until this is settled.</p>`}
          ${c.status === 'queued' && html`<p class="small muted">It will be sent when you’re back online.</p>`}
          ${c.flags.length > 0 && pending && html`<ul class="small">${c.flags.map((f) => html`<li key=${f}>${FLAGS[f].label}. ${FLAGS[f].hint}</li>`)}</ul>`}
          ${c.note && html`<p class="small muted">${c.status === 'declined' ? 'Reason' : 'Your note'}: ${c.note}</p>`}
          ${(c.status === 'review' || c.status === 'appealed') && appealing !== c.id && html`<div class="row gap">
            <button class="btn btn-ghost btn-sm" onClick=${() => { setAppealing(c.id); setNote(c.note || ''); }}><${Icon} name="edit" size=${16} /> ${c.status === 'appealed' ? 'Edit note' : 'Add a note or appeal'}</button>
            <button class="btn btn-ghost btn-sm" onClick=${() => withdraw(c)}>Withdraw</button>
          </div>`}
          ${appealing === c.id && html`<form class="stack-sm" onSubmit=${(e) => { e.preventDefault(); sendNote(c); }}>
            <label class="field"><span class="strong">What should the reviewer know?</span>
              <textarea maxlength="200" rows="3" value=${note} onInput=${(e) => setNote(e.target.value)} placeholder="e.g. a big trip for our street clean-up, or poor GPS between buildings"></textarea></label>
            <div class="row gap"><button type="button" class="btn btn-ghost btn-sm" onClick=${() => setAppealing(null)}>Cancel</button><button class="btn btn-primary btn-sm" type="submit">Send</button></div>
          </form>`}
          ${!env.api && (c.status === 'review' || c.status === 'appealed') && html`<div class="row gap center small"><${DemoTag}>Demo reviewer<//>
            <button class="btn btn-ghost btn-sm" onClick=${() => decide(c, true)}>Approve</button>
            <button class="btn btn-ghost btn-sm" onClick=${() => decide(c, false)}>Decline</button></div>`}
        </li>`;
      })}
    </ul>
  </section>`;
}
