// DEMO admin review queue. No login: in a real launch this must sit behind authentication
// and authorisation, with an audit log. Approve, edit, merge duplicates or reject.
import { html, useEffect, useState } from '../lib.js';
import { Header, Icon, MaterialChip, Segmented, Skeleton, StateCard, DemoTag, toast } from '../ui.js';
import { adminQueue, adminReview, adminResetDemo } from '../services/index.js';
import { syncContributionRewards } from '../store.js';
import { STATION_FILTERS } from '../logic/rules.js';
import { LOCATION_TYPES, REJECT_REASONS, issueByKey, itemTitle, rewardFor } from '../logic/community.js';
import { relTime } from '../utils.js';

const MATERIAL_CHOICES = [...STATION_FILTERS, 'green_waste'];

function Rejector({ onReject, onCancel, busy }) {
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const [other, setOther] = useState('');
  return html`<div class="stack-sm review-box">
    <span class="strong small">Why isn’t it being added? (the contributor sees this)</span>
    <div class="chip-wrap">${REJECT_REASONS.map((r) => html`<button type="button" class=${`chip chip-sm ${reason === r ? 'selected' : ''}`} aria-pressed=${reason === r ? 'true' : 'false'} onClick=${() => setReason(r)}>${r}</button>`)}</div>
    ${reason === 'Other' && html`<input type="text" maxlength="120" placeholder="Short reason" value=${other} onInput=${(e) => setOther(e.target.value)} aria-label="Reason" />`}
    <div class="row gap"><button class="btn btn-ghost btn-sm" onClick=${onCancel}>Cancel</button><button class="btn btn-primary btn-sm danger-fill" disabled=${busy} onClick=${() => onReject(reason === 'Other' ? other.trim() || 'Other' : reason)}>Reject</button></div>
  </div>`;
}

function PlaceReview({ item, run, busy }) {
  const p = item.payload;
  const [panel, setPanel] = useState(null); // edit | merge | reject
  const [e, setE] = useState({ name: p.name, type: p.type, materials: p.materials, hoursText: p.hoursText, access: p.access, description: p.description, removePhoto: false });
  const set = (patch) => setE((x) => ({ ...x, ...patch }));
  const toggleMat = (m) => set({ materials: e.materials.includes(m) ? e.materials.filter((x) => x !== m) : [...e.materials, m] });
  const edits = panel === 'edit' ? e : undefined;

  return html`<article class="card stack-sm">
    <div class="row between center gap-sm wrap">
      <strong>${p.name || `New ${LOCATION_TYPES[p.type].label.toLowerCase()}`}</strong>
      <span class="tag tag-pending">Pending</span>
    </div>
    <p class="small muted">${relTime(item.createdAt)} · pin ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)} ${item.demo ? html`· <${DemoTag}>Demo submission<//>` : ''}</p>
    <p class="small"><strong>${LOCATION_TYPES[p.type].label}</strong>${p.type === 'station' ? (p.materials.length ? '' : ' · materials: not sure') : ''}</p>
    ${p.type === 'station' && p.materials.length > 0 && html`<div class="chip-wrap">${p.materials.map((m) => html`<${MaterialChip} small material=${m} />`)}</div>`}
    ${p.hoursText && html`<p class="small"><strong>Hours:</strong> ${p.hoursText}</p>`}
    ${p.access && html`<p class="small"><strong>Access:</strong> ${p.access}</p>`}
    ${p.description && html`<p class="small">${p.description}</p>`}
    ${p.photo && html`<div class="stack-sm"><img class="place-photo" src=${p.photo} alt="Contributor photo for review" /><p class="small muted"><${Icon} name="shield" size=${16} /> Check the photo for people, faces or number plates before approving.</p></div>`}
    ${item.duplicates.length > 0 && html`<div class="note tone-peach"><${Icon} name="alert" size=${18} /> <span><strong>Possible duplicate${item.duplicates.length > 1 ? 's' : ''}:</strong> ${item.duplicates.map((d) => `${d.name} (${d.distanceM} m)`).join(', ')}</span></div>`}

    ${panel === 'edit' && html`<div class="stack-sm review-box">
      <label class="field"><span class="strong small">Name</span><input type="text" value=${e.name} onInput=${(x) => set({ name: x.target.value })} /></label>
      <${Segmented} label="Type" value=${e.type} onChange=${(v) => set({ type: v, materials: v === 'bin' ? [] : e.materials })} options=${[{ value: 'station', label: 'Station' }, { value: 'bin', label: 'Bin' }]} />
      ${e.type === 'station' && html`<div class="chip-wrap">${MATERIAL_CHOICES.map((m) => html`<${MaterialChip} small material=${m} selected=${e.materials.includes(m)} onClick=${() => toggleMat(m)} />`)}</div>`}
      <label class="field"><span class="strong small">Hours</span><input type="text" value=${e.hoursText} onInput=${(x) => set({ hoursText: x.target.value })} /></label>
      <label class="field"><span class="strong small">Access</span><input type="text" value=${e.access} onInput=${(x) => set({ access: x.target.value })} /></label>
      <label class="field"><span class="strong small">Description</span><input type="text" value=${e.description} onInput=${(x) => set({ description: x.target.value })} /></label>
      ${p.photo && html`<label class="toggle-row"><span class="toggle-text"><strong>Remove photo</strong><span class="muted small">Use if it shows people or private property.</span></span><input type="checkbox" role="switch" checked=${e.removePhoto} onChange=${(x) => set({ removePhoto: x.target.checked })} /><span class="toggle" aria-hidden="true"></span></label>`}
    </div>`}

    ${panel === 'merge' && html`<div class="stack-sm review-box">
      <span class="strong small">Merge into an existing place (its details are kept; missing ones are filled in)</span>
      ${item.duplicates.length === 0 ? html`<p class="muted small">No existing place of the same type is close by.</p>` : item.duplicates.map((d) => html`<button class="btn btn-ghost btn-sm" disabled=${busy} onClick=${() => run({ id: item.id, action: 'merge', mergeInto: d.id })}>${d.name} · ${d.distanceM} m</button>`)}
      <button class="btn btn-ghost btn-sm" onClick=${() => setPanel(null)}>Cancel</button>
    </div>`}

    ${panel === 'reject' && html`<${Rejector} busy=${busy} onCancel=${() => setPanel(null)} onReject=${(reason) => run({ id: item.id, action: 'reject', reason })} />`}

    ${(panel === null || panel === 'edit') && html`<div class="row gap wrap review-actions">
      <button class="btn btn-primary btn-sm" disabled=${busy} onClick=${() => run({ id: item.id, action: 'approve', edits })}><${Icon} name="check" size=${18} /> ${panel === 'edit' ? 'Save & approve' : 'Approve'}</button>
      <button class="btn btn-ghost btn-sm" onClick=${() => setPanel(panel === 'edit' ? null : 'edit')}><${Icon} name="edit" size=${18} /> ${panel === 'edit' ? 'Cancel edit' : 'Edit'}</button>
      <button class="btn btn-ghost btn-sm" onClick=${() => setPanel('merge')}>Merge</button>
      <button class="btn btn-ghost btn-sm danger" onClick=${() => setPanel('reject')}>Reject</button>
    </div>`}
    <p class="muted small">Approving earns the contributor +${rewardFor(item, 'approved').points} points.</p>
  </article>`;
}

function ChangeReview({ item, run, busy }) {
  const [panel, setPanel] = useState(null);
  const loc = item.location;
  const [lat, setLat] = useState(item.newPos?.lat ?? '');
  const [lng, setLng] = useState(item.newPos?.lng ?? '');
  const issue = issueByKey(item.issue);
  const s = item.suggested;
  return html`<article class="card stack-sm">
    <div class="row between center gap-sm wrap"><strong>${itemTitle(item, loc?.name)}</strong><span class="tag tag-pending">Pending</span></div>
    <p class="small muted">${relTime(item.createdAt)} ${item.demo ? html`· <${DemoTag}>Demo submission<//>` : ''}</p>
    ${item.note && html`<p class="small">“${item.note}”</p>`}
    ${s && html`<div class="small"><strong>Suggested changes</strong><ul>
      ${s.materials && html`<li>Materials: ${s.materials.map((m) => html`<${MaterialChip} small material=${m} />`)} ${' '}</li>`}
      ${s.hoursText !== undefined && html`<li>Hours: ${s.hoursText || '(cleared)'}</li>`}
      ${s.access !== undefined && html`<li>Access: ${s.access || '(cleared)'}</li>`}
      ${s.description !== undefined && html`<li>Description: ${s.description || '(cleared)'}</li>`}
    </ul></div>`}
    ${item.issue === 'removed' && html`<p class="note tone-peach"><${Icon} name="alert" size=${18} /> Approving hides this place from the map for everyone.</p>`}
    ${item.issue === 'wrong_location' && html`<div class="stack-sm review-box"><span class="strong small">New position ${item.newPos ? '(from the contributor)' : '(none given — enter coordinates or reject)'}</span>
      <div class="row gap"><input type="number" step="any" aria-label="Latitude" placeholder="Latitude" value=${lat} onInput=${(e) => setLat(e.target.value)} /><input type="number" step="any" aria-label="Longitude" placeholder="Longitude" value=${lng} onInput=${(e) => setLng(e.target.value)} /></div></div>`}
    ${panel === 'reject' && html`<${Rejector} busy=${busy} onCancel=${() => setPanel(null)} onReject=${(reason) => run({ id: item.id, action: 'reject', reason })} />`}
    ${panel !== 'reject' && html`<div class="row gap wrap review-actions">
      <button class="btn btn-primary btn-sm" disabled=${busy} onClick=${() => run({ id: item.id, action: 'approve', edits: item.issue === 'wrong_location' ? { lat, lng } : undefined })}><${Icon} name="check" size=${18} /> Approve & apply</button>
      <button class="btn btn-ghost btn-sm danger" onClick=${() => setPanel('reject')}>Reject</button>
    </div>`}
  </article>`;
}

export default function Admin() {
  const [tab, setTab] = useState('places');
  const [state, setState] = useState({ status: 'loading', q: { places: [], changes: [], temps: [] } });
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    adminQueue().then((q) => alive && setState({ status: 'ready', q })).catch((e) => alive && setState({ status: 'error', q: state.q, error: e.message }));
    return () => { alive = false; };
  }, [reload]);

  async function run(args) {
    setBusy(true);
    try {
      const r = await adminReview(args);
      if (!r.ok) { toast(r.error, 'peach'); return; }
      toast(args.action === 'reject' ? 'Rejected — the contributor will see your reason' : args.action === 'merge' ? 'Merged into the existing place' : args.action === 'clear' ? 'Marked as resolved' : 'Approved — the map has been updated', args.action === 'reject' ? 'peach' : 'mint');
      await syncContributionRewards(); // if the contributor is this device, points arrive immediately
      setReload((x) => x + 1);
    } catch (e) { toast(e.message || 'Something went wrong', 'peach'); } finally { setBusy(false); }
  }

  const { q } = state;
  return html`<div class="screen admin-screen">
    <${Header} back title="Review queue" subtitle="Approve what goes on the public map" />
    <p class="note tone-lavender"><${Icon} name="shield" size=${18} /> <span><strong>DEMO admin view.</strong> There’s no login here and the data lives on this device. A real launch needs authenticated reviewers, an audit log and a server.</span></p>

    <${Segmented} label="Queue" value=${tab} onChange=${setTab} options=${[
      { value: 'places', label: `Places (${q.places.length})` },
      { value: 'changes', label: `Changes (${q.changes.length})` },
      { value: 'temps', label: `Temporary (${q.temps.length})` },
    ]} />

    ${state.status === 'loading' && html`<${Skeleton} lines=${4} />`}
    ${state.status === 'error' && html`<${StateCard} icon="alert" tone="peach" title="Couldn’t load the queue" action=${html`<button class="btn btn-primary btn-sm" onClick=${() => { setState({ status: 'loading', q }); setReload((x) => x + 1); }}>Try again</button>`}>${state.error}<//>`}

    ${state.status === 'ready' && tab === 'places' && (q.places.length === 0
      ? html`<${StateCard} icon="check" tone="mint" title="All caught up">No new places are waiting for review.<//>`
      : q.places.map((i) => html`<${PlaceReview} key=${i.id} item=${i} run=${run} busy=${busy} />`))}

    ${state.status === 'ready' && tab === 'changes' && (q.changes.length === 0
      ? html`<${StateCard} icon="check" tone="mint" title="No changes waiting">Reports about wrong locations, wrong info and removed places show up here.<//>`
      : q.changes.map((i) => html`<${ChangeReview} key=${i.id} item=${i} run=${run} busy=${busy} />`))}

    ${state.status === 'ready' && tab === 'temps' && html`<div class="stack">
      <p class="muted small">Temporary issues (full, damaged) show on the place and clear by themselves. They don’t change the record — you can clear one early if it’s fixed.</p>
      ${q.temps.length === 0 ? html`<${StateCard} icon="check" tone="mint" title="No open temporary issues">Nothing is reported as full or damaged right now.<//>`
        : q.temps.map((i) => html`<div class="card row gap center" key=${i.id}>
            <span class="grow"><strong>${issueByKey(i.issue).label}</strong><span class="muted small block">${i.location?.name || 'Removed place'} · ${relTime(i.createdAt)}</span></span>
            <button class="btn btn-ghost btn-sm" disabled=${busy} onClick=${() => run({ id: i.id, action: 'clear' })}>Mark resolved</button>
          </div>`)}
    </div>`}

    <button class="btn btn-ghost btn-sm danger" disabled=${busy} onClick=${async () => { await adminResetDemo(); toast('Demo community data reset', 'peach'); setReload((x) => x + 1); }}><${Icon} name="refresh" size=${18} /> Reset demo community data</button>
  </div>`;
}
