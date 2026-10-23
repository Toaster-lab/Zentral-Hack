import { html, useEffect, useRef, useState } from '../lib.js';
import { Header, Icon, MaterialChip, Skeleton, StateCard, DemoTag } from '../ui.js';
import { AddBarcodeSheet } from './addbarcode.js';
import { dexEntry } from '../data/bottledex.js';
import { MATERIALS, MUNICIPALITIES, guidanceFor, isCountable } from '../logic/rules.js';
import { lookupBarcode, findStations } from '../services/index.js';
import { DEMO_BARCODE_LIST, DEMO_BARCODE_COUNT } from '../data/barcodes.js';
import { useStore, updateProfile, recordScan, getState, removeCustomProduct } from '../store.js';
import { barcodeError, normaliseBarcode, fmtKm, loadScript } from '../utils.js';
import { config } from '../config.js';
import { defaultArea, areaContains } from '../data/areas.js';
import { navigate } from '../router.js';
import { openLogSheet } from './logsheet.js';

const ZXING_SRC = 'vendor/zxing.min.js';
const PICKABLE = ['glass', 'pet', 'plastic_bottle', 'aluminium', 'tin', 'paper', 'cardboard', 'beverage_carton', 'mixed_plastic', 'battery', 'textile', 'electronics', 'residual'];

// ---- Camera ----------------------------------------------------------------
function CameraScanner({ onCode, onClose }) {
  const video = useRef();
  const [state, setState] = useState('requesting'); // requesting | active | denied | nocamera | unsupported | error
  const [detail, setDetail] = useState('');

  useEffect(() => {
    let stream; let stopped = false; let timer; let reader;
    const finish = (code) => { if (!stopped) { stopped = true; onCode(code); } };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setState('unsupported'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch (e) {
        setState(e.name === 'NotAllowedError' || e.name === 'SecurityError' ? 'denied' : e.name === 'NotFoundError' || e.name === 'OverconstrainedError' ? 'nocamera' : 'error');
        setDetail(e.message);
        return;
      }
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.current.srcObject = stream;
      try { await video.current.play(); } catch { /* autoplay quirks; stream still shows */ }
      setState('active');

      let detector = null;
      if ('BarcodeDetector' in window) {
        try {
          const supported = await window.BarcodeDetector.getSupportedFormats();
          const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter((f) => supported.includes(f));
          if (formats.length) detector = new window.BarcodeDetector({ formats });
        } catch { detector = null; }
      }
      if (detector) {
        timer = setInterval(async () => {
          if (stopped || video.current?.readyState < 2) return;
          try { const codes = await detector.detect(video.current); if (codes[0]) finish(codes[0].rawValue); } catch { /* keep trying */ }
        }, 350);
        return;
      }
      try {
        await loadScript(ZXING_SRC);
        reader = new window.ZXing.BrowserMultiFormatReader();
        reader.decodeFromStream(stream, video.current, (result) => { if (result) finish(result.getText()); });
      } catch (e) {
        setState('unsupported'); setDetail(e.message);
      }
    })();

    return () => {
      stopped = true;
      clearInterval(timer);
      try { reader?.reset(); } catch { /* ignore */ }
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const messages = {
    denied: ['Camera access is off', 'You can allow camera access in your browser settings to scan, or type the barcode below.'],
    nocamera: ['No camera found', 'This device doesn’t seem to have a camera. Type the barcode below instead.'],
    unsupported: ['Live scanning isn’t available here', 'This browser can’t scan barcodes with the camera. Type the barcode below instead.'],
    error: ['The camera didn’t start', 'The camera couldn’t start. Close other apps that use it and try again, or type the barcode below.'],
  };
  if (messages[state]) {
    const [title, text] = messages[state];
    return html`<${StateCard} icon="camera" tone="peach" title=${title} action=${html`<button class="btn btn-ghost btn-sm" onClick=${onClose}>OK</button>`}>${text}<//>`;
  }
  return html`<div class="camera-box">
    <video ref=${video} playsinline muted aria-label="Camera preview"></video>
    <div class="scan-frame" aria-hidden="true"><span class="scan-line"></span></div>
    <p class="camera-hint">${state === 'requesting' ? 'Waiting for camera permission…' : 'Point the camera at a barcode'}</p>
    <button class="btn btn-ghost btn-sm camera-close" onClick=${onClose}><${Icon} name="x" size=${18} /> Stop camera</button>
  </div>`;
}

// ---- Result ----------------------------------------------------------------
function NearbyFor({ materials, place }) {
  const [state, setState] = useState({ status: 'loading', rows: [] });
  const key = materials.join(',');
  useEffect(() => {
    let alive = true;
    if (!materials.length) { setState({ status: 'ready', rows: [] }); return undefined; }
    setState({ status: 'loading', rows: [] });
    findStations({ center: place, materials: [] })
      .then((all) => {
        if (!alive) return;
        const rows = materials.map((m) => ({ material: m, station: all.find((s) => s.materials.includes(m)) }));
        setState({ status: 'ready', rows });
      })
      .catch((e) => alive && setState({ status: 'error', rows: [], error: e.message }));
    return () => { alive = false; };
  }, [key, place.lat, place.lng]);

  if (!materials.length) return null;
  return html`<section class="card">
    <h3>Nearby stations <span class="muted small">· near ${place.label}</span></h3>
    ${state.status === 'loading' && html`<div class="skeleton" style="width:80%"></div><div class="skeleton" style="width:60%"></div>`}
    ${state.status === 'error' && html`<p class="note tone-peach">Couldn’t load stations: ${state.error}</p>`}
    ${state.status === 'ready' && html`<ul class="plain-list">
      ${state.rows.map((r) => html`<li>
        <${MaterialChip} small material=${r.material} />
        ${r.station
          ? html`<button class="link-btn" onClick=${() => navigate(`map?m=${r.material}`)}>${r.station.name} · ${fmtKm(r.station.distanceKm)}</button>${r.station.source === 'demo' && html` <${DemoTag}>Demo<//>`}`
          : html`<span class="muted small">No known station in Rotkreuz accepts this yet — <button class="link-btn small" onClick=${() => navigate('map')}>help add one</button></span>`}
      </li>`)}
    </ul>`}
    <p class="muted small">Based on ${place.label}. Change your area on the Map tab.</p>
  </section>`;
}

function Result({ product, municipality, place, onReset, unlocked = [] }) {
  // confirmed[i] = material chosen by the user for components that need confirmation
  const [confirmed, setConfirmed] = useState({});
  const comps = product.components.map((c, i) => ({ ...c, material: c.confirm ? confirmed[i] : c.material }));
  const pending = comps.filter((c) => !c.material).length;
  const resolved = comps.filter((c) => c.material);
  const stationMaterials = [...new Set(resolved.map((c) => c.material).filter(isCountable))];
  const muni = MUNICIPALITIES[municipality];

  const logEntries = stationMaterials.map((m) => ({ material: m, count: 1 }));

  return html`<div class="stack">
    <section class="card product-head">
      <div>
        <h2>${product.name}</h2>
        <p class="muted small">Barcode ${product.barcode}</p>
        ${product.source === 'demo' && html`<${DemoTag}>Demo product<//>`}
        ${product.source === 'mine' && html`<span class="tag">Added by you</span>`}
        ${product.source === 'openfoodfacts' && html`<span class="tag tag-self">From Open Food Facts (community data)</span>`}
      </div>
    </section>

    ${unlocked.length > 0 && html`<p class="note tone-mint" role="status"><span>New in your Bottledex: <strong>${unlocked.map((id) => dexEntry(id)?.name).filter(Boolean).join(', ')}</strong>. <button class="link-btn" onClick=${() => navigate('collection')}>See the collection</button></span></p>`}

    <div class="row between center muni-row">
      <span class="small">Rules for <strong>${muni.name}</strong></span>
      <select aria-label="Municipality" value=${municipality} onChange=${(e) => updateProfile({ municipality: e.target.value })}>
        ${Object.entries(MUNICIPALITIES).map(([k, v]) => html`<option value=${k}>${v.name}</option>`)}
      </select>
    </div>

    ${place.municipality && place.municipality !== 'other' && place.municipality !== municipality && html`<p class="small center">
      You last searched near ${MUNICIPALITIES[place.municipality].name}. <button class="link-btn" onClick=${() => updateProfile({ municipality: place.municipality })}>Use ${MUNICIPALITIES[place.municipality].name} rules</button>
    </p>`}

    ${pending > 0 && html`<p class="note tone-lavender"><${Icon} name="info" size=${18} /> <span>A barcode doesn’t tell us everything about the packaging. Please confirm ${pending === 1 ? 'one part' : `${pending} parts`} below.</span></p>`}

    ${product.components.map((c, i) => {
      const material = comps[i].material;
      const g = material ? guidanceFor(material, municipality) : null;
      return html`<section class="card component" key=${i}>
        <div class="row between center">
          <h3>${c.part}</h3>
          ${material && html`<${MaterialChip} small material=${material} />`}
        </div>
        ${c.confirm && html`<div class="confirm-box">
          <p class="small strong">What is the ${c.part.toLowerCase()} made of?</p>
          <div class="chip-wrap">
            ${c.options.map((o) => html`<${MaterialChip} small material=${o} selected=${confirmed[i] === o} onClick=${() => setConfirmed({ ...confirmed, [i]: o })} />`)}
            <button type="button" class=${`chip chip-sm ${confirmed[i] === 'residual' && !c.options.includes('residual') ? 'selected' : ''}`} onClick=${() => setConfirmed({ ...confirmed, [i]: 'residual' })}>Not sure</button>
          </div>
          ${confirmed[i] === 'residual' && !c.options.includes('residual') && html`<p class="muted small">When unsure, household waste is the safe choice — wrong items can spoil a whole recycling batch.</p>`}
        </div>`}
        ${g && html`<div class="guidance">
          <p class="where"><${Icon} name="pin" size=${18} /> <strong>${g.where}</strong></p>
          <ol class="steps">${g.steps.map((st) => html`<li>${st}</li>`)}</ol>
          ${c.note && html`<p class="small">${c.note}</p>`}
          ${g.note && html`<p class="muted small">${g.note}</p>`}
        </div>`}
      </section>`;
    })}

    <p class="muted small">General Swiss guidance (simplified demo). Always follow your municipality’s official rules.</p>

    <${NearbyFor} materials=${stationMaterials} place=${place} />

    <div class="row gap sticky-actions">
      <button class="btn btn-ghost" onClick=${onReset}><${Icon} name="scan" /> Scan another</button>
      <button class="btn btn-primary" disabled=${!logEntries.length || pending > 0} onClick=${() => openLogSheet({ entries: logEntries, source: 'scan' })}>
        <${Icon} name="plus" /> Log ${logEntries.length ? 'these items' : 'items'}
      </button>
    </div>
    ${pending > 0 && html`<p class="muted small center">Confirm the packaging first to log it.</p>`}
    ${!pending && !logEntries.length && html`<p class="muted small center">None of these parts count as accepted recyclables, so there’s nothing to log.</p>`}
  </div>`;
}

function UnknownProduct({ code, municipality, place, onReset, offEnabled, onAdd }) {
  const [picked, setPicked] = useState([]);
  const toggle = (m) => setPicked((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));
  const product = picked.length ? {
    name: 'Your item', barcode: code, source: 'user',
    components: picked.map((m) => ({ part: MATERIALS[m].label, material: m })),
  } : null;
  return html`<div class="stack">
    <${StateCard} icon="search" tone="lavender" title="We don’t know this product yet">
      Barcode ${code} isn’t in our ${offEnabled ? 'demo data or Open Food Facts' : 'demo data'}. Tell us what the packaging is made of and we’ll explain how to recycle it.
      ${!offEnabled && html`<p class="small">Tip: you can turn on Open Food Facts lookups in Profile › Data sources.</p>`}
      <button class="btn btn-primary btn-sm" style="align-self:flex-start" onClick=${() => onAdd(code)}>Add this barcode</button>
    <//>
    <section class="card">
      <h3>What’s the packaging made of?</h3>
      <p class="muted small">Pick every part (e.g. glass jar + metal lid).</p>
      <div class="chip-wrap">${PICKABLE.map((m) => html`<${MaterialChip} small material=${m} selected=${picked.includes(m)} onClick=${() => toggle(m)} />`)}</div>
    </section>
    ${product ? html`<${Result} key=${picked.join(',')} product=${product} municipality=${municipality} place=${place} onReset=${onReset} />`
      : html`<button class="btn btn-ghost" onClick=${onReset}><${Icon} name="scan" /> Scan another</button>`}
  </div>`;
}

export default function Scan({ params }) {
  const s = useStore();
  const [mode, setMode] = useState('idle'); // idle | camera | loading | result | unknown | error
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [code, setCode] = useState('');
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  const [unlocked, setUnlocked] = useState([]);
  const [adding, setAdding] = useState(null); // null = closed, string = barcode to prefill
  const [showAll, setShowAll] = useState(false);
  const place = s.lastPlace && areaContains(defaultArea(), s.lastPlace) ? s.lastPlace : config.defaultCenter;

  async function lookup(raw) {
    const c = normaliseBarcode(raw);
    const err = barcodeError(c);
    if (err) { setInputError(err); setMode('idle'); return; }
    setInputError(''); setCode(c); setMode('loading');
    try {
      const mine = getState().customProducts[c];
      const p = mine ? { ...mine, source: 'mine', custom: true } : await lookupBarcode(c, { allowOpenFoodFacts: s.profile.useOpenFoodFacts });
      if (p) { setUnlocked(recordScan(p)); setProduct(p); setMode('result'); } else { setUnlocked([]); setMode('unknown'); }
    } catch (e) {
      setError(e.message || 'Lookup failed'); setMode('error');
    }
  }

  const reset = () => { setMode('idle'); setProduct(null); setInput(''); setCode(''); setUnlocked([]); };

  useEffect(() => {
    if (params?.get('add')) setAdding('');
    const c = params?.get('code');
    if (c) { setInput(c); lookup(c); }
  }, []);

  return html`<div class="screen scan-screen">
    <${Header} title="Scan an item" subtitle="Find out how to recycle its packaging" />

    ${(mode === 'idle' || mode === 'camera') && html`<div class="stack">
      ${mode === 'camera'
        ? html`<${CameraScanner} onCode=${(c) => { setInput(c); lookup(c); }} onClose=${() => setMode('idle')} />`
        : html`<button class="scan-cta" onClick=${() => setMode('camera')}>
            <span class="scan-cta-icon"><${Icon} name="camera" size=${36} /></span>
            <span><strong>Scan with camera</strong><span class="small muted">We only use the camera while this screen is open.</span></span>
          </button>`}

      <form class="card stack-sm" onSubmit=${(e) => { e.preventDefault(); lookup(input); }}>
        <label class="field">
          <span class="strong"><${Icon} name="keyboard" size=${18} /> Or type the barcode</span>
          <input type="text" inputmode="numeric" autocomplete="off" placeholder="e.g. 2000000000015" value=${input}
            onInput=${(e) => setInput(e.target.value)} aria-invalid=${inputError ? 'true' : 'false'} aria-describedby="barcode-err" />
        </label>
        ${inputError && html`<p id="barcode-err" class="note tone-peach" role="alert">${inputError}</p>`}
        <div class="row gap"><button class="btn btn-primary" type="submit">Look it up</button><button type="button" class="btn btn-ghost" onClick=${() => setAdding(input)}><${Icon} name="plus" size=${18} /> Add a barcode</button></div>
      </form>

      <section class="card">
        <h3 class="small-h">Try a demo barcode <${DemoTag} /></h3>
        <div class="demo-codes">
          ${(showAll ? DEMO_BARCODE_LIST : DEMO_BARCODE_LIST.slice(0, 8)).map((d) => html`<button class="demo-code" onClick=${() => { setInput(d.code); lookup(d.code); }}>
            <span><strong>${d.name}</strong><span class="muted small mono">${d.code}</span></span>
          </button>`)}
          <button class="demo-code" onClick=${() => { setInput('2000000000992'); lookup('2000000000992'); }}>
            <span><strong>Unknown product</strong><span class="muted small mono">2000000000992</span></span>
          </button>
        </div>
        <button class="link-btn small" onClick=${() => setShowAll(!showAll)}>${showAll ? 'Show fewer' : `Show all ${DEMO_BARCODE_COUNT} demo barcodes`}</button>
      </section>

      ${Object.keys(s.customProducts).length > 0 && html`<section class="section">
        <h2>Your barcodes</h2>
        <div class="list">${Object.values(s.customProducts).map((c) => html`<div class="list-row" key=${c.barcode}>
          <button class="link-btn grow" style="text-decoration:none;color:inherit" onClick=${() => { setInput(c.barcode); lookup(c.barcode); }}><span class="row-title block">${c.name}</span><span class="row-sub mono">${c.barcode}</span></button>
          <button class="btn btn-ghost btn-sm" onClick=${() => removeCustomProduct(c.barcode)} aria-label=${`Remove ${c.name}`}>Remove</button>
        </div>`)}</div>
      </section>`}
    </div>`}

    ${mode === 'loading' && html`<p class="muted center">Looking up ${code}…</p><${Skeleton} lines=${2} /><${Skeleton} lines=${4} />`}
    ${mode === 'error' && html`<${StateCard} icon="alert" tone="peach" title="Lookup failed"
        action=${html`<div class="row gap"><button class="btn btn-primary btn-sm" onClick=${() => lookup(code)}>Try again</button><button class="btn btn-ghost btn-sm" onClick=${reset}>Back</button></div>`}>${error}<//>`}
    ${mode === 'result' && product && html`<${Result} key=${product.barcode} product=${product} municipality=${s.profile.municipality} place=${place} onReset=${reset} unlocked=${unlocked} />`}
    ${mode === 'unknown' && html`<${UnknownProduct} code=${code} municipality=${s.profile.municipality} place=${place} onReset=${reset} offEnabled=${s.profile.useOpenFoodFacts} onAdd=${setAdding} />`}
    ${adding !== null && html`<${AddBarcodeSheet} initialCode=${adding} onClose=${() => setAdding(null)} onSaved=${(p) => { setAdding(null); setInput(p.barcode); lookup(p.barcode); }} />`}
  </div>`;
}
