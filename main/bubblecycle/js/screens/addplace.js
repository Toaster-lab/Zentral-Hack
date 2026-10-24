// "Add a place": 1) place the pin  2) say what it is  3) confirmation (pending review).
import { html, useEffect, useRef, useState } from '../lib.js';
import { Header, Icon, MaterialChip, Segmented, DemoTag, StateCard } from '../ui.js';
import { PinPicker } from './pinpicker.js';
import { PlaceSheet, SourceTag } from './place.js';
import { STATION_FILTERS } from '../logic/rules.js';
import { LOCATION_TYPES, PHOTO_REMINDER } from '../logic/community.js';
import { nearbyLocations, submitPlace } from '../services/index.js';
import { getContributorId } from '../store.js';
import { config } from '../config.js';
import { defaultArea, areaContains, OUTSIDE_MESSAGE } from '../data/areas.js';
import { readPhoto } from '../utils.js';
import { navigate } from '../router.js';

const area = defaultArea();
const MATERIAL_CHOICES = [...STATION_FILTERS, 'green_waste'];

function Steps({ step }) {
  const items = ['Pin', 'Details', 'Done'];
  return html`<ol class="steps-bar" aria-label="Progress">${items.map((t, i) => html`<li class=${i + 1 === step ? 'current' : i + 1 < step ? 'past' : ''} aria-current=${i + 1 === step ? 'step' : undefined}><span>${i + 1 < step ? '✓' : i + 1}</span>${t}</li>`)}</ol>`;
}

function AddPlaceForm({ params }) {
  const start = { lat: Number(params.get('lat')), lng: Number(params.get('lng')) };
  const [pos, setPos] = useState(areaContains(area, start) ? start : area.center);
  const [step, setStep] = useState(1);
  const [type, setType] = useState('station');
  const [mats, setMats] = useState([]);
  const [notSure, setNotSure] = useState(false);
  const [name, setName] = useState('');
  const [hoursText, setHoursText] = useState('');
  const [access, setAccess] = useState('');
  const [desc, setDesc] = useState('');
  const [photo, setPhoto] = useState(null);
  const [photoErr, setPhotoErr] = useState('');
  const [nearby, setNearby] = useState([]);
  const [dismissed, setDismissed] = useState([]);
  const [existing, setExisting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const inside = areaContains(area, pos);
  const h1 = useRef();

  // Look for places already on the map near the pin (suggest updating instead of duplicating).
  useEffect(() => {
    let alive = true;
    if (!inside) { setNearby([]); return undefined; }
    const t = setTimeout(() => {
      nearbyLocations({ areaId: area.id, point: pos, radiusM: config.contribution.duplicateRadiusM.station })
        .then((r) => alive && setNearby(r)).catch(() => alive && setNearby([]));
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [pos.lat, pos.lng, inside]);

  useEffect(() => { h1.current?.focus?.(); window.scrollTo(0, 0); }, [step]);

  const dupes = nearby.filter((l) => l.distanceM <= config.contribution.duplicateRadiusM[l.type] && !dismissed.includes(l.id));

  async function onPhoto(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setPhotoErr('');
    try { setPhoto(await readPhoto(f)); } catch (err) { setPhotoErr(err.message); }
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (type === 'station' && !mats.length && !notSure) { setError('Pick the accepted materials, or choose “Not sure”.'); return; }
    setBusy(true);
    try {
      const r = await submitPlace({ areaId: area.id, contributorId: getContributorId(), payload: { type, name, lat: pos.lat, lng: pos.lng, materials: mats, notSure, hoursText, access, description: desc, photo } });
      if (!r.ok) { setError(r.error); return; }
      setResult(r.item); setStep(3);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally { setBusy(false); }
  }

  const toggleMat = (m) => { setNotSure(false); setMats((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m])); };

  return html`<div class="screen add-screen">
    <${Header} back title=${step === 3 ? 'Submitted' : 'Add a place'} subtitle=${step === 3 ? '' : 'Pin it, describe it, send it for review'} />
    <${Steps} step=${step} />
    <h2 class="sr-only" tabindex="-1" ref=${h1}>${['', 'Step 1: place the pin', 'Step 2: details', 'Submitted'][step]}</h2>

    ${step === 1 && html`<div class="stack">
      <p class="muted">Drop the pin on the exact spot — tap the map, drag the pin, or use your location. You’re adding to <strong>${area.name}</strong>.</p>
      <${PinPicker} area=${area} value=${pos} onChange=${setPos} height=${300} />
      ${inside && dupes.length > 0 && html`<section class="card tone-peach stack-sm" aria-live="polite">
        <h3>Is it one of these?</h3>
        <p class="small">There ${dupes.length === 1 ? 'is a place' : 'are places'} already on the map very close to your pin. Updating one is better than adding a duplicate.</p>
        ${dupes.map((d) => html`<div class="dupe-row">
          <span class="grow"><strong>${d.name}</strong><span class="muted small block">${Math.round(d.distanceM)} m away · <${SourceTag} loc=${d} /></span></span>
          <button type="button" class="btn btn-ghost btn-sm" onClick=${() => setExisting(d)}>Update this one</button>
          <button type="button" class="btn btn-ghost btn-sm" onClick=${() => setDismissed([...dismissed, d.id])}>Different place</button>
        </div>`)}
      </section>`}
      <button class="btn btn-primary btn-block" disabled=${!inside || dupes.length > 0} onClick=${() => setStep(2)}>${dupes.length > 0 ? 'Check the places above first' : 'Pin looks right — next'}</button>
      ${!inside && html`<p class="muted small center">${OUTSIDE_MESSAGE}</p>`}
    </div>`}

    ${step === 2 && html`<form class="stack" onSubmit=${submit}>
      <div class="field">
        <span class="strong">What kind of place is it?</span>
        <${Segmented} label="Place type" value=${type} onChange=${setType} options=${[{ value: 'station', label: 'Recycling station' }, { value: 'bin', label: 'Public trash bin' }]} />
      </div>
      ${type === 'station' && html`<div class="stack-sm">
        <span class="strong">What can you recycle there?</span>
        <div class="chip-wrap">
          ${MATERIAL_CHOICES.map((m) => html`<${MaterialChip} small material=${m} selected=${mats.includes(m)} onClick=${() => toggleMat(m)} />`)}
          <button type="button" class=${`chip chip-sm ${notSure ? 'selected' : ''}`} aria-pressed=${notSure ? 'true' : 'false'} onClick=${() => { setNotSure(!notSure); setMats([]); }}>Not sure</button>
        </div>
      </div>`}
      <label class="field"><span class="strong">Name <span class="muted">(optional)</span></span>
        <input type="text" maxlength="80" value=${name} onInput=${(e) => setName(e.target.value)} placeholder=${type === 'station' ? 'e.g. Glass point by the bakery' : 'e.g. Bin next to the bench'} /></label>

      <section class="card stack-sm">
        <h3><${Icon} name="image" size=${20} /> Photo <span class="muted small">(optional)</span></h3>
        ${photo ? html`<img class="place-photo" src=${photo} alt="Your photo of the place" />` : html`<p class="muted small">A photo helps reviewers and neighbours recognise the spot.</p>`}
        <div class="row gap">
          <label class="btn btn-ghost btn-sm file-btn"><${Icon} name="camera" size=${18} /> ${photo ? 'Change photo' : 'Add a photo'}<input type="file" accept="image/*" capture="environment" onChange=${onPhoto} /></label>
          ${photo && html`<button type="button" class="btn btn-ghost btn-sm" onClick=${() => setPhoto(null)}>Remove</button>`}
        </div>
        <p class="note tone-lavender small"><${Icon} name="shield" size=${18} /> <span>${PHOTO_REMINDER} Location data in the photo is removed.</span></p>
        ${photoErr && html`<p class="note tone-peach" role="alert">${photoErr}</p>`}
      </section>

      <details class="card">
        <summary><strong>More details</strong> <span class="muted small">hours, access, description</span></summary>
        <div class="stack" style="margin-top:12px">
          <label class="field"><span class="strong">Opening hours</span><input type="text" maxlength="200" value=${hoursText} onInput=${(e) => setHoursText(e.target.value)} placeholder="e.g. Mo-Fr 08:00-17:00 — or “always open”" /></label>
          <label class="field"><span class="strong">How to get in or use it</span><input type="text" maxlength="300" value=${access} onInput=${(e) => setAccess(e.target.value)} placeholder="e.g. behind the building, key needed" /></label>
          <label class="field"><span class="strong">Anything else?</span><textarea rows="2" maxlength="300" value=${desc} onInput=${(e) => setDesc(e.target.value)}></textarea></label>
        </div>
      </details>

      <p class="muted small">Don’t include personal details. Only the place itself is shown publicly — never who added it or where you’ve been.</p>
      ${error && html`<p class="note tone-peach" role="alert"><${Icon} name="alert" size=${18} /> ${error}</p>`}
      <div class="row gap">
        <button type="button" class="btn btn-ghost" onClick=${() => setStep(1)}>Back</button>
        <button class="btn btn-primary" type="submit" disabled=${busy}>${busy ? 'Sending…' : 'Submit for review'}</button>
      </div>
    </form>`}

    ${step === 3 && result && html`<div class="stack">
      <section class="card success-pop">
        <h2>Sent for review</h2>
        <p><span class="tag tag-pending">Pending review</span></p>
        <p>Your ${LOCATION_TYPES[result.payload.type].label.toLowerCase()} is with our reviewers. Only you can see it on the map until it’s approved.</p>
      </section>
      <section class="card stack-sm">
        <h3>What happens next</h3>
        <ol class="next-list">
          <li>A reviewer checks the pin${result.payload.photo ? ', photo' : ''} and details.</li>
          <li>If it’s good it goes live for everyone — you’ll see “Approved” under Profile › My contributions.</li>
          <li>You earn <strong>+${config.contribution.placeApproved}${result.payload.photo ? ` (+${config.contribution.photoBonus} for the photo)` : ''} points</strong> once it’s approved. A photo adds a small bonus.</li>
        </ol>
        <p class="muted small">Contribution points can be spent on rewards. They don’t count as recycling and don’t change the leaderboard.</p>
      </section>
      <div class="row gap">
        <button class="btn btn-ghost" onClick=${() => navigate('contributions')}>My contributions</button>
        <button class="btn btn-primary" onClick=${() => navigate('map')}><${Icon} name="map" /> Back to map</button>
      </div>
      <button class="link-btn center" onClick=${() => { setResult(null); setStep(1); setMats([]); setName(''); setPhoto(null); setDesc(''); setAccess(''); setHoursText(''); setNotSure(false); }}>Add another place</button>
    </div>`}

    ${existing && html`<${PlaceSheet} key=${existing.id} loc=${existing} onClose=${() => setExisting(null)} onChanged=${() => {}} />`}
  </div>`;
}

// Pilot: the map is fixed to one recycling point, so nothing can be added to it.
export default function AddPlace(props) {
  if (!config.pilot.lockCatalogue) return html`<${AddPlaceForm} ...${props} />`;
  return html`<div class="screen">
    <${Header} back title="Add a place" />
    <${StateCard} icon="pin" tone="lavender" title="New places can’t be added right now"
      action=${html`<button class="btn btn-primary btn-sm" onClick=${() => navigate('map')}>Back to the map</button>`}>
      This pilot map has one recycling point. You can still confirm it’s there or report that it’s full or damaged.
    <//>
  </div>`;
}
