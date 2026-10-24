// Place card + detail sheet (view, confirm, suggest a correction, report an issue).
import { html, useState } from '../lib.js';
import { Icon, MaterialChip, Sheet, DemoTag, toast } from '../ui.js';
import { PinPicker } from './pinpicker.js';
import { STATION_FILTERS, MATERIALS } from '../logic/rules.js';
import { ISSUES, LOCATION_TYPES, issueByKey } from '../logic/community.js';
import { isOpenNow, hoursSummary, directionsUrl } from '../logic/hours.js';
import { submitReport, confirmPlace } from '../services/index.js';
import { getContributorId, awardConfirmation } from '../store.js';
import { TEAM_LOCATION_SOURCE } from '../data/catalogue.js';
import { config } from '../config.js';
import { AREAS } from '../data/areas.js';
import { fmtKm, relTime } from '../utils.js';
import { openLogSheet } from './logsheet.js';
import { openCheckIn } from './checkin.js';

const MATERIAL_CHOICES = [...STATION_FILTERS, 'green_waste'];
// Pilot: places are not changed or removed, so only temporary issues (full, damaged) can be reported.
const LOCKED = config.pilot.lockCatalogue;
const REPORTABLE = LOCKED ? ISSUES.filter((i) => i.temporary) : ISSUES;

export function SourceTag({ loc }) {
  if (loc.pending) return html`<span class="tag tag-pending">Pending review · only you see this</span>`;
  if (loc.source === 'team') return html`<span class="tag tag-self">Supplied by the team</span>`;
  if (loc.source === 'community') return html`<span class="tag tag-verified">Community · approved</span>`;
  return html`<${DemoTag}>Demo location<//>`;
}

export function TempIssues({ loc }) {
  if (!loc.tempIssues?.length) return null;
  return html`<span class="row gap-sm wrap">${loc.tempIssues.map((t) => html`<span class="tag tag-warn" title="Temporary: clears automatically">Reported: ${issueByKey(t.issue).label.toLowerCase()} · ${relTime(t.ts)}</span>`)}</span>`;
}

export function LocationCard({ loc, onOpen }) {
  const open = loc.hours ? isOpenNow(loc.hours) : null;
  const mats = loc.type === 'station' ? (loc.materials.length ? loc.materials.slice(0, 4).map((m) => MATERIALS[m]?.label).join(', ') + (loc.materials.length > 4 ? ` +${loc.materials.length - 4}` : '') : 'Accepted materials not listed yet') : '';
  return html`<button class=${`list-row place-row ${loc.pending ? 'is-pending' : ''}`} onClick=${() => onOpen(loc)}>
    <span class=${`place-icon ${loc.type}`} aria-hidden="true"><${Icon} name=${LOCATION_TYPES[loc.type].icon} size=${20} /></span>
    <span class="grow">
      <span class="row-title block">${loc.name}</span>
      <span class="row-sub block">${LOCATION_TYPES[loc.type].label}${open !== null ? ` · ${open ? 'Open now' : 'Closed now'}` : ''}${mats ? ` · ${mats}` : ''}</span>
      <span class="row gap-sm wrap" style="margin-top:4px"><${SourceTag} loc=${loc} /><${TempIssues} loc=${loc} /></span>
    </span>
    ${loc.distanceKm != null && html`<span class="muted small nowrap">${fmtKm(loc.distanceKm)}</span>`}
  </button>`;
}

function Field({ label, children, hint }) {
  return html`<label class="field"><span class="strong">${label}</span>${children}${hint && html`<span class="muted small">${hint}</span>`}</label>`;
}

export function PlaceSheet({ loc, onClose, userPos, onChanged }) {
  const [mode, setMode] = useState('view'); // view | report | correct | done
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  // report form
  const [issue, setIssue] = useState('');
  const [note, setNote] = useState('');
  const [newPos, setNewPos] = useState(null);
  // correction form
  const [mats, setMats] = useState(loc.materials || []);
  const [hoursText, setHoursText] = useState(loc.hoursText || '');
  const [access, setAccess] = useState(loc.access || '');
  const [desc, setDesc] = useState(loc.description || '');

  if (!loc) return null;
  const area = AREAS[loc.areaId];
  const isStation = loc.type === 'station';
  const open = loc.hours ? isOpenNow(loc.hours) : null;
  const guard = async (fn) => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ tone: 'peach', text: e.message || 'Something went wrong. Please try again.' }); } finally { setBusy(false); }
  };

  const confirm = () => guard(async () => {
    const r = await confirmPlace({ locationId: loc.id, contributorId: getContributorId() });
    if (!r.ok) { setMsg({ tone: 'lavender', text: r.error }); return; }
    const pts = awardConfirmation(loc.name);
    toast(pts ? `Confirmed. You earned ${pts} points.` : 'Confirmed. Thanks for checking.');
    onChanged?.();
  });

  const sendReport = () => guard(async () => {
    if (!issue) { setMsg({ tone: 'peach', text: 'Please choose what’s wrong.' }); return; }
    const r = await submitReport({ locationId: loc.id, issue, note, newPos: issue === 'wrong_location' ? newPos : null, contributorId: getContributorId() });
    if (!r.ok) { setMsg({ tone: 'peach', text: r.error }); return; }
    setDone(r.item); setMode('done'); onChanged?.();
  });

  const sendCorrection = () => guard(async () => {
    const suggested = {};
    if (isStation && [...mats].sort().join() !== [...(loc.materials || [])].sort().join()) suggested.materials = mats;
    if (hoursText.trim() !== (loc.hoursText || '')) suggested.hoursText = hoursText.trim();
    if (access.trim() !== (loc.access || '')) suggested.access = access.trim();
    if (desc.trim() !== (loc.description || '')) suggested.description = desc.trim();
    if (!Object.keys(suggested).length) { setMsg({ tone: 'peach', text: 'Change at least one thing, then send.' }); return; }
    const r = await submitReport({ locationId: loc.id, issue: 'incorrect_info', note, suggested, contributorId: getContributorId() });
    if (!r.ok) { setMsg({ tone: 'peach', text: r.error }); return; }
    setDone(r.item); setMode('done'); onChanged?.();
  });

  const title = mode === 'report' ? 'Report an issue' : mode === 'correct' ? 'Suggest a correction' : mode === 'done' ? 'Sent' : loc.name;
  const toggleMat = (m) => setMats((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m]));
  const err = msg && html`<p class=${`note tone-${msg.tone}`} role="alert"><${Icon} name="info" size=${18} /> ${msg.text}</p>`;

  return html`<${Sheet} open=${true} onClose=${onClose} title=${title}>
    ${mode === 'view' && html`<div class="stack">
      <div class="row gap-sm wrap"><span class="tag">${LOCATION_TYPES[loc.type].label}</span><${SourceTag} loc=${loc} /></div>
      ${loc.source === 'demo' && html`<p class="note tone-lavender"><${Icon} name="info" size=${18} /> <span><strong>Demo location.</strong> Made up for testing — it isn’t a real collection point.</span></p>`}
      ${loc.pending && html`<p class="note tone-lavender"><${Icon} name="info" size=${18} /> <span><strong>Pending review.</strong> A reviewer will check your submission. Until then only you can see it on the map.</span></p>`}
      <${TempIssues} loc=${loc} />
      ${loc.description && html`<p>${loc.description}</p>`}
      ${loc.access && html`<p class="small"><strong>Getting there:</strong> ${loc.access}</p>`}
      ${loc.photo && html`<img class="place-photo" src=${loc.photo} alt=${`Photo of ${loc.name}, shared by the community`} />`}
      ${(loc.hours || loc.hoursText) && html`<div>
        <h3 class="small-h"><${Icon} name="clock" size=${18} /> Opening hours ${open !== null && html`<span class=${`tag ${open ? 'tag-open' : 'tag-closed'}`}>${open ? 'Open now' : 'Closed now'}</span>`}</h3>
        ${loc.hours ? html`<ul class="hours">${hoursSummary(loc.hours).map((h) => html`<li class=${h.today ? 'today' : ''}><span>${h.days}</span><span>${h.text}</span></li>`)}</ul>` : html`<p class="small">${loc.hoursText}</p>`}
      </div>`}
      ${isStation && html`<div>
        <h3 class="small-h">Accepts</h3>
        ${loc.materials.length
          ? html`<div class="chip-wrap">${loc.materials.map((m) => html`<${MaterialChip} small material=${m} />`)}</div>`
          : html`<p class="muted small">We don’t know yet which materials are accepted. Know them? Tap “Suggest a correction”.</p>`}
      </div>`}
      <div class="provenance small muted">
        <p><${Icon} name="shield" size=${16} /> ${loc.pending ? 'Not confirmed yet.' : loc.lastConfirmedAt ? html`Last confirmed <strong>${relTime(loc.lastConfirmedAt)}</strong> by the community${loc.confirmations > 1 ? ` (${loc.confirmations} confirmations)` : ''}.` : 'Not confirmed by the community yet.'}</p>
        ${loc.source === 'team' && html`<p>${TEAM_LOCATION_SOURCE}: its position and accepted materials. Not officially verified. Name, address, opening hours and operator are not known.</p>`}
      </div>
      ${err}
      ${!loc.pending && html`<div class="stack-sm">
        <div class="row gap">
          <a class="btn btn-ghost" href=${directionsUrl(loc, userPos)} target="_blank" rel="noopener noreferrer"><${Icon} name="directions" /> Directions</a>
          ${isStation && html`<button class="btn btn-primary" onClick=${() => { onClose(); openLogSheet({ stationId: loc.id, stationName: loc.name, entries: loc.materials.length ? [{ material: loc.materials.find((m) => m !== 'green_waste') || null, count: 1 }].filter((e) => e.material) : [] }); }}><${Icon} name="plus" /> Log here</button>`}
        </div>
        ${isStation && html`<button class="btn btn-ghost btn-block" onClick=${() => { onClose(); openCheckIn({ station: loc, materials: [] }); }}><${Icon} name="locate" /> Check in here (adds location evidence)</button>`}
        <button class="btn btn-ghost btn-block" disabled=${busy} onClick=${confirm}><${Icon} name="check" /> Yes, it’s still here</button>
        <div class="row gap">
          ${!LOCKED && html`<button class="btn btn-ghost btn-sm" onClick=${() => { setMsg(null); setMode('correct'); }}><${Icon} name="edit" size=${18} /> Suggest a correction</button>`}
          <button class="btn btn-ghost btn-sm" onClick=${() => { setMsg(null); setMode('report'); }}><${Icon} name="flag" size=${18} /> Report an issue</button>
        </div>
        <p class="muted small center">Confirming a place can earn a few points. These don’t count as recycling and don’t change the leaderboard.</p>
      </div>`}
    </div>`}

    ${mode === 'report' && html`<form class="stack" onSubmit=${(e) => { e.preventDefault(); sendReport(); }}>
      <p class="muted small">About <strong>${loc.name}</strong></p>
      <fieldset class="issue-list">
        <legend class="strong">What’s the problem?</legend>
        ${REPORTABLE.map((i) => html`<label class=${`issue-option ${issue === i.key ? 'selected' : ''}`}>
          <input type="radio" name="issue" value=${i.key} checked=${issue === i.key} onChange=${() => { setIssue(i.key); setMsg(null); }} />
          <span class="grow"><strong>${i.label}</strong><span class="muted small block">${i.hint}</span></span>
          <span class=${`tag ${i.temporary ? 'tag-warn' : 'tag-self'}`}>${i.temporary ? 'Temporary' : 'Needs review'}</span>
        </label>`)}
      </fieldset>
      ${issue === 'wrong_location' && html`<div class="stack-sm">
        <p class="strong">Where is it really? <span class="muted">(optional — drag the pin)</span></p>
        <${PinPicker} area=${area} value=${newPos || { lat: loc.lat, lng: loc.lng }} onChange=${setNewPos} height=${230} />
      </div>`}
      ${issue === 'removed' && html`<p class="note tone-lavender"><${Icon} name="info" size=${18} /> Only choose this if it’s gone for good. For something temporary, choose “Damaged or inaccessible”.</p>`}
      <${Field} label="Anything to add? (optional)"><textarea rows="2" maxlength="300" value=${note} onInput=${(e) => setNote(e.target.value)} placeholder="Keep it short — please don’t include personal details."></textarea><//>
      ${err}
      <div class="row gap"><button type="button" class="btn btn-ghost" onClick=${() => setMode('view')}>Back</button><button class="btn btn-primary" type="submit" disabled=${busy}>${busy ? 'Sending…' : 'Send report'}</button></div>
    </form>`}

    ${mode === 'correct' && html`<form class="stack" onSubmit=${(e) => { e.preventDefault(); sendCorrection(); }}>
      <p class="muted small">Fix anything that’s wrong about <strong>${loc.name}</strong>. A reviewer checks it before the map changes.</p>
      ${isStation && html`<div class="stack-sm"><span class="strong">Accepted materials</span><div class="chip-wrap">${MATERIAL_CHOICES.map((m) => html`<${MaterialChip} small material=${m} selected=${mats.includes(m)} onClick=${() => toggleMat(m)} />`)}</div></div>`}
      <${Field} label="Opening hours" hint="e.g. Mo-Fr 08:00-17:00; Sa 09:00-12:00"><input type="text" maxlength="200" value=${hoursText} onInput=${(e) => setHoursText(e.target.value)} /><//>
      <${Field} label="How to get in / use it"><input type="text" maxlength="300" value=${access} onInput=${(e) => setAccess(e.target.value)} placeholder="e.g. behind the building, key needed" /><//>
      <${Field} label="Description"><textarea rows="2" maxlength="300" value=${desc} onInput=${(e) => setDesc(e.target.value)}></textarea><//>
      <${Field} label="Why? (optional)"><input type="text" maxlength="300" value=${note} onInput=${(e) => setNote(e.target.value)} /><//>
      ${err}
      <div class="row gap"><button type="button" class="btn btn-ghost" onClick=${() => setMode('view')}>Back</button><button class="btn btn-primary" type="submit" disabled=${busy}>${busy ? 'Sending…' : 'Send correction'}</button></div>
    </form>`}

    ${mode === 'done' && done && html`<div class="success-pop">
      ${done.temporary
        ? html`<p><strong>Reported — thank you!</strong></p><p class="muted">It now shows on the place as a temporary issue and clears by itself. It doesn’t change the place’s details.</p>`
        : html`<p><span class="tag tag-pending">Pending review</span></p><p class="muted">A reviewer will look at your ${done.issue === 'incorrect_info' ? 'correction' : 'report'}. The place stays as it is until then, and you can follow it under Profile › My contributions.</p>`}
      <button class="btn btn-primary" onClick=${onClose}>Done</button>
    </div>`}
  <//>`;
}
