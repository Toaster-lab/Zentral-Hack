import { html, useState } from '../lib.js';
import { Header, Icon, Sheet, Segmented, Chip, BottleIcon } from '../ui.js';
import { BOTTLEDEX, TIER_LABEL, dexEntry } from '../data/bottledex.js';
import { BARCODES } from '../data/barcodes.js';
import { MATERIALS, guidanceFor } from '../logic/rules.js';
import { useStore } from '../store.js';
import { fmtDate } from '../utils.js';
import { navigate } from '../router.js';

const GROUPS = [
  { key: 'all', label: 'All', mats: null },
  { key: 'glass', label: 'Glass', mats: ['glass'] },
  { key: 'pet', label: 'PET', mats: ['pet'] },
  { key: 'metal', label: 'Cans and tins', mats: ['aluminium', 'tin'] },
  { key: 'paper', label: 'Cartons and paper', mats: ['beverage_carton', 'cardboard', 'paper'] },
  { key: 'hdpe', label: 'Plastic bottles', mats: ['plastic_bottle'] },
  { key: 'other', label: 'Other', mats: ['battery', 'mixed_plastic'] },
];
const pad = (n) => String(n).padStart(3, '0');

function EntrySheet({ entry, found, municipality, onClose }) {
  const g = guidanceFor(entry.material, municipality);
  const examples = Object.values(BARCODES).filter((b) => b.collect.includes(entry.id)).slice(0, 3);
  return html`<${Sheet} open=${true} onClose=${onClose} title=${found ? entry.name : `Entry #${pad(entry.no)}`}>
    <div class="stack">
      <div class="dex-detail">
        <${BottleIcon} entry=${entry} found=${!!found} size=${96} />
        <div class="stack-sm">
          <p class="muted small">#${pad(entry.no)} · ${MATERIALS[entry.material]?.label}</p>
          ${found ? html`<p><strong>${entry.size}</strong> · <span class="tag">${TIER_LABEL[entry.tier]}</span></p>
            <p class="small muted">Found ${fmtDate(found.firstTs)}${found.source === 'mine' ? ' with a barcode you added' : ''}</p>`
            : html`<p><strong>Not found yet</strong></p><p class="small muted">${TIER_LABEL[entry.tier]} · ${MATERIALS[entry.material]?.label}</p>`}
        </div>
      </div>
      ${found ? html`<div>
          <h3 class="small-h">What to do with it</h3>
          <p><strong>${g.where}</strong></p>
          <ol class="steps">${g.steps.map((s) => html`<li>${s}</li>`)}</ol>
          <p class="muted small">${entry.note}</p>
        </div>`
        : html`<div class="stack-sm">
          <p>Scan a product that comes in this container. You don’t need to buy anything: use something you already have.</p>
          ${examples.length > 0 && html`<div><h3 class="small-h">Demo products that unlock it</h3>
            <ul class="list">${examples.map((b) => html`<li><span class="grow"><span class="row-title block">${b.name}</span><span class="row-sub mono">${b.barcode}</span></span>
              <button class="btn btn-ghost btn-sm" onClick=${() => { onClose(); navigate(`scan?code=${b.barcode}`); }}>Try it</button></li>`)}</ul></div>`}
          <button class="btn btn-ghost btn-sm" style="align-self:flex-start" onClick=${() => { onClose(); navigate('scan?add=1'); }}>Add your own barcode</button>
        </div>`}
    </div>
  <//>`;
}

export default function Collection() {
  const s = useStore();
  const [group, setGroup] = useState('all');
  const [view, setView] = useState('all');
  const [open, setOpen] = useState(null);
  const found = s.collection;
  const total = BOTTLEDEX.length;
  const count = BOTTLEDEX.filter((e) => found[e.id]).length;
  const mats = GROUPS.find((g) => g.key === group).mats;
  const list = BOTTLEDEX
    .filter((e) => (mats ? mats.includes(e.material) : true))
    .filter((e) => (view === 'found' ? found[e.id] : view === 'missing' ? !found[e.id] : true));
  const viewing = open ? dexEntry(open) : null;

  return html`<div class="screen collection-screen">
    <${Header} back title="Bottledex" subtitle="Container types you’ve found" />

    <section class="section">
      <p class="lead">${count} of ${total} found</p>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax=${total} aria-valuenow=${count} aria-label="Bottledex progress"><span style=${`width:${Math.round((count / total) * 100)}%`}></span></div>
      <p class="muted small">Scan products you already have to fill it in. It’s a field guide, not a shopping list: please don’t buy things to complete it.</p>
    </section>

    <div class="stack-sm">
      <${Segmented} label="Show" value=${view} onChange=${setView} options=${[{ value: 'all', label: 'All' }, { value: 'found', label: 'Found' }, { value: 'missing', label: 'Not yet' }]} />
      <div class="chip-scroll" role="group" aria-label="Filter by material">${GROUPS.map((g) => html`<${Chip} selected=${group === g.key} onClick=${() => setGroup(g.key)}>${g.label}<//>`)}</div>
    </div>

    ${list.length === 0 ? html`<p class="muted">${view === 'found' ? 'Nothing found in this group yet.' : 'You’ve found everything in this group.'}</p>`
      : html`<ul class="dex-grid">${list.map((e) => {
          const f = found[e.id];
          return html`<li key=${e.id}><button class=${`dex-tile ${f ? 'found' : ''}`} onClick=${() => setOpen(e.id)} aria-label=${f ? `${e.name}, number ${e.no}, found` : `Number ${e.no}, not found yet`}>
            <span class="dex-no">#${pad(e.no)}</span>
            <${BottleIcon} entry=${e} found=${!!f} size=${56} />
            <span class="dex-name">${f ? e.name : 'Not found'}</span>
            ${f && html`<span class="dex-size">${e.size}</span>`}
          </button></li>`;
        })}</ul>`}

    <div class="list"><button class="list-row" onClick=${() => navigate('scan?add=1')}><${Icon} name="plus" size=${22} /><span class="grow"><span class="row-title block">Add a barcode</span><span class="row-sub">A product we don’t know yet, from your own kitchen</span></span><${Icon} name="chevron" size=${20} /></button></div>

    ${viewing && html`<${EntrySheet} entry=${viewing} found=${found[viewing.id]} municipality=${s.profile.municipality} onClose=${() => setOpen(null)} />`}
  </div>`;
}
