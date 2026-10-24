import { html, useEffect, useRef, useState } from '../lib.js';
import { Sheet, Icon, MaterialChip, StateCard, DemoTag, toast } from '../ui.js';
import { COUNTABLE, MATERIALS } from '../logic/rules.js';
import { EVIDENCE, FLAGS, locationCheck, evidenceFromLocation, reviewFlags } from '../logic/evidence.js';
import { pointsFor } from '../logic/activity.js';
import { addCheckin, getState, getContributorId, queuedCheckins, markSynced, savePhoto } from '../store.js';
import { findStations, submitCheckin } from '../services/index.js';
import { config } from '../config.js';
import { nowTs } from '../logic/clock.js';
import { uid, fmtKm } from '../utils.js';
import { navigate } from '../router.js';
import { useConfirm, SimulatedNote } from './authgate.js';
import { requireSignIn } from './account.js';
import { sendActivity, saveForLater, newKey, isOffline } from '../services/activity.js';
import { NetworkError } from '../services/api.js';
import { env } from '../env.js';

let opener = null;
export function openCheckIn(opts = {}) { opener?.(opts); }

const payloadOf = (c) => ({
  contributorId: getContributorId(), ts: c.ts, stationId: c.stationId,
  counts: c.entries.map((e) => ({ material: e.material, count: e.count })),
  evidence: c.evidence, locationResult: c.location.result, fp: c.fp, flags: c.flags,
});

export async function flushQueuedCheckins() {
  for (const c of queuedCheckins()) {
    try { await submitCheckin(payloadOf(c)); markSynced(c.id); } catch { return; }
  }
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation || !window.isSecureContext) { reject({ code: 0 }); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      reject,
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });
}

function fingerprint(source) {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(source, 0, 0, 8, 8);
  const d = x.getImageData(0, 0, 8, 8).data;
  const g = Array.from({ length: 64 }, (_, i) => 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
  const mean = g.reduce((a, b) => a + b, 0) / 64;
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += ((g[i] > mean) * 8 + (g[i + 1] > mean) * 4 + (g[i + 2] > mean) * 2 + (g[i + 3] > mean)).toString(16);
  return hex;
}

export function DataFlow() {
  return html`<div class="stack-sm">
    <details class="card-inset">
      <summary class="strong">Where your data goes</summary>
      <div class="stack-sm" style="margin-top:8px">
        <p class="small"><strong>Stays on this device:</strong> your exact position (used once, then dropped), the photo (deleted after the check-in unless you keep it), your nickname and settings.</p>
        <p class="small"><strong>Would be synced for rewards and challenges:</strong> the station, materials and counts, the time, whether the device was near the station (and GPS accuracy), a coarse photo fingerprint used to spot repeated photos (not the photo), a random device ID, and the review status. <${DemoTag}>Simulated here<//></p>
        <p class="small"><strong>Shared only if you choose:</strong> your nickname and totals on the leaderboard, and what you allow friends to see in Social.</p>
        <p class="small muted">Limits: checks that run on a device can be altered by a determined person. Spotting repeats across accounts needs a little shared information, which is why the synced items exist. ${env.api ? 'The server keeps the review status and decides what counts.' : 'In this demo no server exists, so nothing is actually sent.'}</p>
      </div>
    </details>
  </div>`;
}

function Capture({ onShot, onCancel }) {
  const video = useRef();
  const [state, setState] = useState('requesting');

  useEffect(() => {
    let stream; let stopped = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setState('unsupported'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch (e) {
        setState(e.name === 'NotAllowedError' || e.name === 'SecurityError' ? 'denied' : e.name === 'NotFoundError' || e.name === 'OverconstrainedError' ? 'nocamera' : 'error');
        return;
      }
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.current.srcObject = stream;
      try { await video.current.play(); } catch { setState('active'); }
      setState('active');
    })();
    return () => { stopped = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  function shoot() {
    const v = video.current;
    if (!v?.videoWidth) return;
    const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    onShot({ jpeg: c.toDataURL('image/jpeg', 0.72), fp: fingerprint(c) });
  }

  const messages = {
    denied: ['Camera access is off', 'You can allow the camera in your browser settings, or continue without a photo.'],
    nocamera: ['No camera found', 'This device doesn’t seem to have a camera. You can continue without a photo.'],
    unsupported: ['The camera isn’t available here', 'This browser or connection can’t open the camera (it needs https or localhost). You can continue without a photo.'],
    error: ['The camera didn’t start', 'Close other apps that use the camera and try again, or continue without a photo.'],
  };
  if (messages[state]) {
    const [title, text] = messages[state];
    return html`<${StateCard} icon="camera" tone="peach" title=${title} action=${html`<button class="btn btn-ghost btn-sm" onClick=${onCancel}>Continue without a photo</button>`}>${text}<//>`;
  }
  return html`<div class="camera-box">
    <video ref=${video} playsinline muted aria-label="Camera preview"></video>
    <p class="camera-hint">${state === 'requesting' ? 'Waiting for camera permission…' : 'Items next to the container. No people.'}</p>
    <div class="row gap" style="position:absolute;left:0;right:0;bottom:12px;justify-content:center">
      <button class="btn btn-primary btn-sm" disabled=${state !== 'active'} onClick=${shoot}><${Icon} name="camera" size=${18} /> Take photo</button>
      <button class="btn btn-ghost btn-sm" onClick=${onCancel}>Skip</button>
    </div>
  </div>`;
}

const GEO_TEXT = {
  denied: ['Location access is off', 'You can allow it in your browser settings and try again, or continue without. The check-in will then be self-reported.'],
  unavailable: ['Location isn’t available', 'Your device couldn’t give a position (or this page isn’t on https). You can continue; the check-in will be self-reported.'],
};

export function CheckInHost() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('what');
  const [startedAt, setStartedAt] = useState(0);
  const [stations, setStations] = useState({ status: 'loading', rows: [] });
  const [station, setStation] = useState(null);
  const [entries, setEntries] = useState([]);
  const [geo, setGeo] = useState({ status: 'idle' });
  const [capturing, setCapturing] = useState(false);
  const [shot, setShot] = useState(null);
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState(null);
  const inflight = useRef(false);   // a second tap while the first is still running does nothing
  const draft = useRef({ hash: '', key: '' }); // the same check-in keeps the same submission key, so a retry can't count twice
  const confirm = useConfirm();

  useEffect(() => {
    opener = (opts) => {
      setStation(opts.station || null);
      setEntries(opts.materials?.length ? opts.materials.map((m) => ({ material: m, count: 1 })) : []);
      setGeo({ status: 'idle' }); setShot(null); setKeep(false); setCapturing(false); setError(''); setOutcome(null); setBusy(false); inflight.current = false; draft.current = { hash: '', key: '' };
      setStartedAt(nowTs()); setStep('what'); setOpen(true);
      setStations({ status: 'loading', rows: [] });
      findStations({ center: config.defaultCenter })
        .then((rows) => setStations({ status: 'ready', rows }))
        .catch((e) => setStations({ status: 'error', rows: [], error: e.message }));
    };
    const sync = () => flushQueuedCheckins();
    window.addEventListener('online', sync);
    sync();
    return () => { opener = null; window.removeEventListener('online', sync); };
  }, []);

  const close = () => { setShot(null); setCapturing(false); setOpen(false); };
  if (!open) return null;

  const total = entries.reduce((s, e) => s + Number(e.count || 0), 0);
  const toggleMaterial = (m) => setEntries((es) => (es.some((e) => e.material === m) ? es.filter((e) => e.material !== m) : [...es, { material: m, count: 1 }]));
  const setCount = (m, n) => setEntries((es) => es.map((e) => (e.material === m ? { ...e, count: Math.max(1, Math.min(config.limits.maxItemsPerLog, Number(n) || 1)) } : e)));
  const choices = station?.materials?.length ? COUNTABLE.filter((m) => station.materials.includes(m)) : COUNTABLE;

  const storedLocation = geo.status === 'done' ? { result: geo.loc.result, accuracyM: geo.loc.accuracyM } : { result: ['denied', 'unavailable'].includes(geo.status) ? geo.status : 'none' };

  const candidate = () => ({
    ts: nowTs(), startedAt, stationId: station.id, at: { lat: station.lat, lng: station.lng },
    entries: entries.map((e) => ({ material: e.material, count: Number(e.count) })),
    location: storedLocation, fp: shot?.fp || null,
  });

  async function checkLocation() {
    setGeo({ status: 'asking' });
    try {
      const pos = await getPosition();
      setGeo({ status: 'done', loc: locationCheck(pos, station) });
    } catch (e) {
      setGeo({ status: e?.code === 1 ? 'denied' : 'unavailable' });
    }
  }

  function keyFor(c) {
    const hash = JSON.stringify([c.stationId, c.entries, c.location.result, c.fp]);
    if (draft.current.hash !== hash) draft.current = { hash, key: newKey() };
    return draft.current.key;
  }

  const sendPayload = (c, key) => ({
    key, kind: 'checkin', entries: c.entries, stationId: c.stationId, source: 'checkin',
    location: { result: c.location.result }, fp: c.fp || undefined, startedAt: c.startedAt,
  });

  function saveOffline(c, key) {
    saveForLater({ key, kind: 'checkin', label: `${station.name}: ${c.entries.map((e) => `${e.count} × ${MATERIALS[e.material].label.toLowerCase()}`).join(', ')}`, payload: sendPayload(c, key) });
    if (shot && keep) savePhoto(shot.jpeg);
    setShot(null);
    setOutcome({ serverQueued: true, checkin: { status: 'queued', flags: [], evidence: evidenceFromLocation(c.location) }, result: null });
    setStep('done');
  }

  async function submit() {
    if (inflight.current) return;
    inflight.current = true; setBusy(true); setError('');
    const c = candidate();
    try {
      const key = keyFor(c);
      if (env.api) {
        if (!(await requireSignIn())) return;
        if (isOffline()) { saveOffline(c, key); return; }
      }
      // Confirm it's you: the last step, after everything is filled in.
      const conf = await confirm.run({ purpose: 'activity', keys: [key] });
      if (!conf.ok) return;

      if (env.api) {
        const out = await sendActivity({ ...sendPayload(c, key), confirmationId: conf.confirmationId });
        if (shot && keep) savePhoto(shot.jpeg);
        setShot(null);
        setOutcome({ checkin: out, result: out.status === 'counted' ? { points: out.points, accepted: out.accepted } : null, method: conf.method });
        setStep('done');
        if (out.status === 'counted') toast(`+${out.points} points · ${out.accepted} item${out.accepted > 1 ? 's' : ''} counted`);
        return;
      }

      const rec = {
        id: uid(), ...c, stationName: station.name, evidence: evidenceFromLocation(c.location),
        flags: reviewFlags(getState().checkins, c), photo: { taken: !!shot, kept: !!(shot && keep) },
      };
      let offline = !navigator.onLine;
      if (!offline) { try { await submitCheckin(payloadOf(rec)); } catch { offline = true; } }
      const out = addCheckin({ ...rec, offline });
      if (!out.ok) { setError(out.error); return; }
      if (shot && keep) savePhoto(shot.jpeg);
      setShot(null); setOutcome({ ...out, offline, method: conf.method }); setStep('done');
      if (out.result) toast(`+${out.result.points} points · ${out.result.accepted} item${out.result.accepted > 1 ? 's' : ''} counted`);
    } catch (err) {
      if (env.api && err instanceof NetworkError) saveOffline(c, keyFor(c));
      else setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      inflight.current = false; setBusy(false);
    }
  }

  const stepNo = { what: 1, where: 2, photo: 3, review: 4 }[step];
  const header = stepNo ? html`<p class="muted small">Step ${stepNo} of 4</p>` : null;
  const title = { what: 'Check in', where: 'Check in: location', photo: 'Check in: photo', review: 'Check in: review', done: 'Check-in sent' }[step];

  return html`<${Sheet} open=${true} onClose=${close} dismissable=${!busy || confirm.waiting} title=${title}>
    <div class="stack">
      ${header}

      ${step === 'what' && html`<div class="stack">
        <p class="muted small">Check-ins add evidence to a recycling log. They show you were near the station; they can’t show what was put in the container.</p>
        ${station
          ? html`<p><${Icon} name="pin" size=${16} /> <strong>${station.name}</strong> <button class="link-btn small" onClick=${() => { setStation(null); setEntries([]); }}>Change</button></p>`
          : html`<div class="stack-sm">
              <span class="strong">Which station?</span>
              ${stations.status === 'loading' && html`<div class="skeleton" style="width:70%"></div>`}
              ${stations.status === 'error' && html`<p class="note tone-peach" role="alert">Couldn’t load stations: ${stations.error}</p>`}
              ${stations.status === 'ready' && !stations.rows.length && html`<p class="note tone-lavender">No stations to choose from yet.</p>`}
              <div class="chip-wrap">${stations.rows.map((s) => html`<button type="button" class="chip" onClick=${() => { setStation(s); setEntries([]); }}>${s.name} · ${fmtKm(s.distanceKm)}</button>`)}</div>
            </div>`}
        ${station && html`<div class="stack-sm">
          <span class="strong">What are you recycling?</span>
          ${!station.materials?.length && html`<p class="muted small">We don’t know yet what this station accepts, so all materials are shown.</p>`}
          <div class="chip-wrap">${choices.map((m) => html`<${MaterialChip} small material=${m} selected=${entries.some((e) => e.material === m)} onClick=${() => toggleMaterial(m)} />`)}</div>
          ${entries.map((e) => html`<div class="row between center" key=${e.material}>
            <span>${MATERIALS[e.material].label}</span>
            <div class="stepper">
              <button type="button" class="icon-btn" aria-label=${`One less ${MATERIALS[e.material].label}`} onClick=${() => setCount(e.material, Number(e.count) - 1)}><${Icon} name="minus" /></button>
              <input type="number" inputmode="numeric" min="1" max=${config.limits.maxItemsPerLog} aria-label=${`Number of ${MATERIALS[e.material].label} items`} value=${e.count} onInput=${(ev) => setCount(e.material, ev.target.value)} />
              <button type="button" class="icon-btn" aria-label=${`One more ${MATERIALS[e.material].label}`} onClick=${() => setCount(e.material, Number(e.count) + 1)}><${Icon} name="plus" /></button>
            </div>
          </div>`)}
        </div>`}
        <button class="btn btn-primary btn-block" disabled=${!station || !entries.length} onClick=${() => setStep('where')}>Next</button>
      </div>`}

      ${step === 'where' && html`<div class="stack">
        <p>We’ll ask for your location once, now, to see whether your device is near <strong>${station.name}</strong>. Your exact position isn’t stored or sent; only the result is kept.</p>
        ${geo.status === 'idle' && html`<button class="btn btn-primary btn-block" onClick=${checkLocation}><${Icon} name="locate" /> Check my location</button>`}
        ${geo.status === 'asking' && html`<p class="muted" role="status">Checking… your browser may ask for permission.</p>`}
        ${geo.status === 'done' && geo.loc.result === 'near' && html`<p class="note tone-mint" role="status"><${Icon} name="check" size=${18} /> <span><strong>Your device is near the station</strong> (GPS accuracy about ±${geo.loc.accuracyM} m). This check-in will be marked “Location checked”.</span></p>`}
        ${geo.status === 'done' && geo.loc.result === 'far' && html`<p class="note tone-peach" role="status"><${Icon} name="alert" size=${18} /> <span><strong>Your device looks about ${geo.loc.distanceM} m from the station</strong> (accuracy ±${geo.loc.accuracyM} m). GPS can be off between buildings. You can try again or continue; the check-in will be self-reported and may be held for a quick look.</span></p>`}
        ${geo.status === 'done' && geo.loc.result === 'inaccurate' && html`<p class="note tone-peach" role="status"><${Icon} name="alert" size=${18} /> <span><strong>The GPS signal is too rough to check</strong> (about ±${geo.loc.accuracyM} m). Try again in the open, or continue as self-reported. Nothing is held for this reason alone.</span></p>`}
        ${GEO_TEXT[geo.status] && html`<p class="note tone-peach" role="alert"><${Icon} name="alert" size=${18} /> <span><strong>${GEO_TEXT[geo.status][0]}.</strong> ${GEO_TEXT[geo.status][1]}</span></p>`}
        <div class="row gap">
          ${geo.status !== 'idle' && geo.status !== 'asking' && html`<button class="btn btn-ghost" onClick=${checkLocation}>Try again</button>`}
          ${geo.status === 'idle' ? html`<button class="btn btn-ghost" onClick=${() => setStep('photo')}>Skip, self-reported</button>`
            : geo.status !== 'asking' && html`<button class="btn btn-primary" onClick=${() => setStep('photo')}>Continue</button>`}
        </div>
        <button class="link-btn small" style="align-self:flex-start" onClick=${() => setStep('what')}>Back</button>
      </div>`}

      ${step === 'photo' && html`<div class="stack">
        <p>A photo of your items next to the recycling container can support your check-in. It doesn’t prove anything was deposited. It’s optional, shrunk on this device and thrown away after the check-in unless you keep it.</p>
        <p class="note tone-lavender"><${Icon} name="info" size=${18} /> <span>Keep people, faces and number plates out of the frame.</span></p>
        ${capturing && html`<${Capture} onShot=${(s) => { setShot(s); setCapturing(false); }} onCancel=${() => setCapturing(false)} />`}
        ${!capturing && shot && html`<img class="place-photo" src=${shot.jpeg} alt="Your photo of the items and the container" />
          <label class="row gap center small"><input type="checkbox" checked=${keep} onChange=${(e) => setKeep(e.target.checked)} /> Keep this photo on this device (you can delete it in Profile)</label>
          <div class="row gap"><button class="btn btn-ghost" onClick=${() => { setShot(null); setKeep(false); setCapturing(true); }}>Retake</button><button class="btn btn-primary" onClick=${() => setStep('review')}>Use this photo</button></div>`}
        ${!capturing && !shot && html`<div class="row gap">
          <button class="btn btn-primary" onClick=${() => setCapturing(true)}><${Icon} name="camera" size=${18} /> Open camera</button>
          <button class="btn btn-ghost" onClick=${() => setStep('review')}>Skip photo</button>
        </div>`}
        ${!capturing && html`<button class="link-btn small" style="align-self:flex-start" onClick=${() => setStep('where')}>Back</button>`}
      </div>`}

      ${step === 'review' && (() => {
        const c = candidate();
        const evidence = evidenceFromLocation(c.location);
        const flags = reviewFlags(getState().checkins, c);
        const pts = pointsFor(total, false);
        return html`<div class="stack">
          <section class="card-inset">
            <p><strong>${station.name}</strong></p>
            <ul class="plain-list">${entries.map((e) => html`<li key=${e.material}><${MaterialChip} small material=${e.material} /> × ${e.count}</li>`)}</ul>
            <p class="small"><span class=${`tag ${evidence === 'location' ? 'tag-verified' : 'tag-self'}`}>${EVIDENCE[evidence].label}</span> ${EVIDENCE[evidence].hint}</p>
            <p class="small muted">Photo: ${shot ? (keep ? 'taken, kept on this device' : 'taken, will be deleted after submitting') : 'none'}</p>
          </section>
          ${flags.length > 0 && html`<div class="note tone-lavender" role="status"><${Icon} name="info" size=${18} /> <span><strong>This may be held for a quick check</strong> before points are credited. That’s a signal, not an accusation.
            <ul>${flags.map((f) => html`<li key=${f}>${FLAGS[f].label}: ${FLAGS[f].hint}</li>`)}</ul></span></div>`}
          ${!navigator.onLine && html`<p class="note tone-peach" role="status"><${Icon} name="alert" size=${18} /> <span>You’re offline. This check-in will be saved on this device and sent when you’re back online. Credit stays pending until then.</span></p>`}
          <p class="small">If counted: about <strong>${pts} points</strong> and ${total} item${total === 1 ? '' : 's'}.</p>
          <${DataFlow} />
          ${error && html`<p class="note tone-peach" role="alert"><${Icon} name="alert" size=${18} /> ${error}</p>`}
          ${confirm.panel}
          ${!confirm.waiting && html`<div class="row gap"><button class="btn btn-ghost" disabled=${busy} onClick=${() => setStep('photo')}>Back</button><button class="btn btn-primary" disabled=${busy} onClick=${submit}>${busy ? (confirm.busy ? 'Waiting for your device…' : 'Sending…') : confirm.failed ? 'Try again' : 'Confirm and submit'}</button></div>`}
          <p class="muted small">You’ll be asked to unlock your device to confirm it’s you.</p>
        </div>`;
      })()}

      ${step === 'done' && outcome && html`<div class="stack">
        ${outcome.checkin.status === 'counted' && html`<div class="success-pop">
          <p class="big"><strong>+${outcome.result.points} points</strong></p>
          <p>${outcome.result.accepted} item${outcome.result.accepted > 1 ? 's' : ''} counted · <span class=${`tag ${outcome.checkin.evidence === 'location' ? 'tag-verified' : 'tag-self'}`}>${EVIDENCE[outcome.checkin.evidence].label}</span></p>
        </div>`}
        ${outcome.checkin.status === 'review' && html`<${StateCard} icon="clock" tone="lavender" title="Held for a quick check">
          Nothing is counted yet and about ${pointsFor(total, false)} points are pending. This isn’t a penalty. You can add a note or withdraw it from Activity.
          <ul>${outcome.checkin.flags.map((f) => html`<li key=${f}>${FLAGS[f].label}</li>`)}</ul>
        <//>`}
        ${outcome.checkin.status === 'queued' && !outcome.serverQueued && html`<${StateCard} icon="clock" tone="lavender" title="Saved on this device">
          We couldn’t reach the service (or you’re offline). It will be sent automatically when you’re back online. Nothing is counted and no points are credited until then.
        <//>`}
        ${outcome.serverQueued && html`<${StateCard} icon="clock" tone="lavender" title="Saved on this device, not sent">
          You’re offline. When you’re back online you’ll be asked to confirm it’s you, and the server will check it before anything is counted. It may still be refused.
        <//>`}
        <${SimulatedNote} method=${outcome.method} />
        <div class="row gap">
          <button class="btn btn-ghost" onClick=${close}>Done</button>
          <button class="btn btn-primary" onClick=${() => { close(); navigate('activity'); }}>See activity</button>
        </div>
      </div>`}
    </div>
  <//>`;
}
