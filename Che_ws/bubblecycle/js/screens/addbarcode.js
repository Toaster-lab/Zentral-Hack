// "Add a barcode": save a product the app doesn't know. It stays on this device. For a
// real launch, submissions would go to a shared product database with review.
import { html, useState } from '../lib.js';
import { Sheet, Icon, MaterialChip } from '../ui.js';
import { BOTTLEDEX, dexEntry } from '../data/bottledex.js';
import { MATERIALS } from '../logic/rules.js';
import { addCustomProduct } from '../store.js';
import { barcodeError, normaliseBarcode } from '../utils.js';

const EXTRA = ['glass', 'pet', 'plastic_bottle', 'aluminium', 'tin', 'paper', 'cardboard', 'mixed_plastic'];
const pad = (n) => String(n).padStart(3, '0');
const GROUPS = [...new Set(BOTTLEDEX.map((e) => e.material))].map((m) => ({ material: m, label: MATERIALS[m]?.label || m, items: BOTTLEDEX.filter((e) => e.material === m) }));

export function AddBarcodeSheet({ initialCode = '', onClose, onSaved }) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState('');
  const [dexId, setDexId] = useState('');
  const [extra, setExtra] = useState([]);
  const [error, setError] = useState('');

  function submit(e) {
    e.preventDefault();
    const c = normaliseBarcode(code);
    const bad = barcodeError(c);
    if (bad) { setError(bad); return; }
    const entry = dexEntry(dexId);
    const components = [
      ...(entry ? [{ part: entry.name, material: entry.material }] : []),
      ...extra.map((m) => ({ part: MATERIALS[m].label, material: m })),
    ];
    const res = addCustomProduct({ barcode: c, name, components, collect: entry ? [entry.id] : [] });
    if (!res.ok) { setError(res.error); return; }
    onSaved(res.product);
  }
  const toggle = (m) => setExtra((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m]));

  return html`<${Sheet} open=${true} onClose=${onClose} title="Add a barcode">
    <form class="stack" onSubmit=${submit} novalidate>
      <p class="muted">Add a product the app doesn’t know. It stays on this device, and what you enter is self-reported. Saving it also adds its container to your Bottledex.</p>
      <label class="field"><span class="strong">Barcode</span>
        <input type="text" inputmode="numeric" autocomplete="off" value=${code} onInput=${(e) => setCode(e.target.value)} placeholder="8, 12 or 13 digits" aria-invalid=${error && /barcode|digit/i.test(error) ? 'true' : 'false'} /></label>
      <label class="field"><span class="strong">Product name</span>
        <input type="text" maxlength="60" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="e.g. Sparkling water, 75 cl" /></label>
      <label class="field"><span class="strong">What is the main container?</span>
        <select value=${dexId} onChange=${(e) => setDexId(e.target.value)}>
          <option value="">Something else (choose parts below)</option>
          ${GROUPS.map((g) => html`<optgroup label=${g.label}>${g.items.map((e) => html`<option value=${e.id}>#${pad(e.no)} ${e.name}, ${e.size}</option>`)}</optgroup>`)}
        </select></label>
      <div class="stack-sm"><span class="strong">Other parts${dexId ? ' (optional)' : ''}</span>
        <span class="muted small">For example a metal lid, a plastic cap or a cardboard sleeve.</span>
        <div class="chip-wrap">${EXTRA.map((m) => html`<${MaterialChip} small material=${m} selected=${extra.includes(m)} onClick=${() => toggle(m)} />`)}</div></div>
      ${error && html`<p class="note tone-peach" role="alert"><${Icon} name="alert" size=${18} /> ${error}</p>`}
      <div class="row gap"><button type="button" class="btn btn-ghost" onClick=${onClose}>Cancel</button><button class="btn btn-primary" type="submit">Save barcode</button></div>
    </form>
  <//>`;
}
