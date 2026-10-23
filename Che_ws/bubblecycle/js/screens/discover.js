import { html, useEffect, useRef, useState } from '../lib.js';
import { Header, Icon, Chip, Skeleton, StateCard, DemoTag } from '../ui.js';
import { parseQuery, emptyFilters, CATEGORIES, FLAVOURS, BUDGETS } from '../logic/discover.js';
import { ALLERGENS } from '../data/products.js';
import { searchProducts, isDemo } from '../services/index.js';
import { guidanceFor, MATERIALS } from '../logic/rules.js';
import { useStore } from '../store.js';
import { fmtCHF } from '../utils.js';

const EXAMPLES = ['A soda', 'Something sweet', 'Fruity and vegan', 'Salty snack under CHF 3', 'Chocolate, nut-free'];
const DIETS = [{ key: 'any', label: 'Anything' }, { key: 'vegetarian', label: 'Vegetarian' }, { key: 'vegan', label: 'Vegan' }];
const allergenLabel = (k) => ALLERGENS.find((a) => a.key === k)?.label.toLowerCase() || k;
const catLabel = (k) => CATEGORIES.find((c) => c.key === k)?.label || '';

// A product photo is shown only if the data provides one. Otherwise a plain labelled tile —
// never an invented picture. A retailer feed would supply `photo`.
function Thumb({ p }) {
  return html`<div class="thumb" aria-hidden=${p.photo ? undefined : 'true'}>${p.photo ? html`<img src=${p.photo} alt=${p.name} loading="lazy" />` : html`<span>No photo<br />${catLabel(p.category)}</span>`}</div>`;
}

function ProductRow({ p, municipality }) {
  const [open, setOpen] = useState(false);
  const packaging = p.packaging.map((pk) => (pk.material ? `${pk.part}: ${MATERIALS[pk.material]?.label || pk.material}` : pk.part)).join(' · ');
  return html`<article class="product-row">
    <div class="product-main">
      <${Thumb} p=${p} />
      <div class="grow">
        <h3>${p.name}</h3>
        <p class="row-sub">${p.retailer} (example) · ${p.diet === 'vegan' ? 'Vegan' : 'Vegetarian'}</p>
        <p class="small packaging"><strong>Packaging</strong> ${packaging}</p>
        <p class="small">${p.labels.length
          ? p.labels.map((l) => html`<span class=${`tag ${l.verified ? 'tag-verified' : 'tag-unverified'}`}>${l.name}${l.verified ? '' : ' (unverified)'}</span> `)
          : html`<span class="muted">No certification information</span>`}</p>
      </div>
      <p class="price"><strong>${fmtCHF(p.price)}</strong><span class="muted small block">approx.</span></p>
    </div>
    <button class="link-btn small" aria-expanded=${open ? 'true' : 'false'} onClick=${() => setOpen(!open)}>${open ? 'Hide details' : 'Trade-offs and what to do with the packaging'}</button>
    ${open && html`<div class="stack-sm details">
      <div><h4 class="small-h">Trade-offs</h4><ul>${p.tradeoffs.map((t) => html`<li class="small">${t}</li>`)}</ul></div>
      <div><h4 class="small-h">After you’re done</h4><ul>${p.packaging.filter((pk) => pk.material).map((pk) => html`<li class="small"><strong>${pk.part}:</strong> ${guidanceFor(pk.material, municipality).where}</li>`)}</ul></div>
      ${(p.allergens.length > 0 || p.mayContain.length > 0) && html`<p class="small">
        ${p.allergens.length > 0 && html`Contains: ${p.allergens.map(allergenLabel).join(', ')}. `}
        ${p.mayContain.length > 0 && html`May contain: ${p.mayContain.map(allergenLabel).join(', ')}.`}
      </p>`}
      ${p.labels.some((l) => !l.verified) && html`<p class="small muted">Labels shown here are example data and haven’t been checked against an official source.</p>`}
      <p class="small muted">${p.demo ? 'Demo listing: ' : ''}the price is illustrative and availability isn’t checked. Read the real pack.</p>
    </div>`}
  </article>`;
}

export default function Discover({ params }) {
  const s = useStore();
  const [text, setText] = useState(params.get('q') || '');
  const [submitted, setSubmitted] = useState(null);
  const [filters, setFilters] = useState(emptyFilters());
  const [status, setStatus] = useState('idle');
  const [res, setRes] = useState({ items: [], unknown: [], nothingAsked: false });
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [askDiet, setAskDiet] = useState(false);
  const refineRef = useRef();

  function run(q) {
    const parsed = parseQuery(q);
    setFilters(parsed.filters);
    setSubmitted({ text: q, ...parsed });
    // Only ask the follow-up when the search didn't already mention diet or allergies.
    setAskDiet(parsed.filters.diet === 'any' && parsed.filters.freeFrom.length === 0);
  }

  useEffect(() => { if (params.get('q')) run(params.get('q')); }, []);

  useEffect(() => {
    if (!submitted) return undefined;
    let alive = true;
    setStatus('loading');
    searchProducts({ filters, terms: submitted.terms, text: submitted.text })
      .then((r) => { if (alive) { setRes(r); setStatus('ready'); } })
      .catch((e) => { if (alive) { setError(e.message); setStatus('error'); } });
    return () => { alive = false; };
  }, [submitted, JSON.stringify(filters), reload]);

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const toggleIn = (key, v) => setFilters((f) => ({ ...f, [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v] }));
  const activeCount = (filters.diet !== 'any' ? 1 : 0) + filters.freeFrom.length + (filters.budget ? 1 : 0) + filters.categories.length + filters.flavours.length;
  const items = res.items.slice(0, 8);
  const what = filters.categories.map((k) => catLabel(k).toLowerCase()).join(' or ');

  return html`<div class="screen discover-screen">
    <${Header} title="Find a snack or drink" subtitle="Compare packaging, diet and price before you buy" />

    <form class="stack-sm" onSubmit=${(e) => { e.preventDefault(); if (text.trim()) run(text.trim()); }} role="search">
      <label class="field">
        <span class="strong">What are you looking for?</span>
        <div class="row gap">
          <span class="search-field"><${Icon} name="search" size=${20} /><input type="text" placeholder="For example: soda, chocolate, salty snack" value=${text} onInput=${(e) => setText(e.target.value)} /></span>
          <button class="btn btn-primary" style="flex:none" type="submit">Search</button>
        </div>
      </label>
      ${!submitted && html`<p class="small muted">Try: ${EXAMPLES.map((ex, i) => html`<button type="button" class="link-btn small" onClick=${() => { setText(ex); run(ex); }}>${ex}</button>${i < EXAMPLES.length - 1 ? ' · ' : ''}`)}</p>`}
    </form>

    ${submitted && html`<section class="stack">
      ${submitted.understood.length > 0 && html`<p class="small"><span class="muted">Searching for:</span> ${submitted.understood.join(', ')}</p>`}
      ${submitted.otherRetailer && html`<p class="note"><${Icon} name="info" size=${18} /> This demo only has example data for Migros, so ${submitted.otherRetailer[0].toUpperCase() + submitted.otherRetailer.slice(1)} products can’t be shown. These are Migros examples.</p>`}

      ${askDiet && html`<div class="stack-sm">
        <p><strong>Any dietary needs?</strong> <span class="muted">Optional</span></p>
        <div class="chip-wrap">
          ${DIETS.map((d) => html`<${Chip} selected=${filters.diet === d.key} onClick=${() => set({ diet: d.key })}>${d.label}<//>`)}
          <button type="button" class="chip" onClick=${() => { refineRef.current.open = true; refineRef.current.scrollIntoView({ block: 'start' }); }}>Allergies…</button>
        </div>
      </div>`}

      <details class="refine" ref=${refineRef}>
        <summary><strong>Filters</strong> <span class="muted small">${activeCount ? `${activeCount} on` : 'type, diet, allergies, budget'}</span></summary>
        <div class="refine-group" role="group" aria-label="Type of product">
          <span class="small-h">Type</span>
          <div class="chip-wrap">${CATEGORIES.map((c) => html`<${Chip} selected=${filters.categories.includes(c.key)} onClick=${() => toggleIn('categories', c.key)}>${c.label}<//>`)}</div>
        </div>
        <div class="refine-group" role="group" aria-label="Flavour">
          <span class="small-h">Flavour</span>
          <div class="chip-wrap">${FLAVOURS.map((t) => html`<${Chip} selected=${filters.flavours.includes(t.key)} onClick=${() => toggleIn('flavours', t.key)}>${t.label}<//>`)}</div>
        </div>
        <div class="refine-group" role="group" aria-label="Diet">
          <span class="small-h">Diet</span>
          <div class="chip-wrap">${DIETS.map((d) => html`<${Chip} selected=${filters.diet === d.key} onClick=${() => set({ diet: d.key })}>${d.label}<//>`)}</div>
        </div>
        <div class="refine-group" role="group" aria-label="Free from">
          <span class="small-h">Free from</span>
          <div class="chip-wrap">${ALLERGENS.map((a) => html`<${Chip} selected=${filters.freeFrom.includes(a.key)} onClick=${() => toggleIn('freeFrom', a.key)}>${a.label}<//>`)}</div>
        </div>
        <div class="refine-group" role="group" aria-label="Budget">
          <span class="small-h">Budget</span>
          <div class="chip-wrap">${BUDGETS.map((b) => html`<${Chip} selected=${filters.budget === b.key} onClick=${() => set({ budget: b.key })}>${b.label}<//>`)}</div>
        </div>
        ${filters.freeFrom.length > 0 && html`<p class="muted small">Products that contain or may contain these allergens are hidden. Always check the real pack.</p>`}
      </details>

      ${isDemo('products') && html`<p class="note"><${Icon} name="info" size=${18} /> <span>These are demo products. We don’t rank them by environmental impact. We show the packaging and label information that’s available so you can decide.</span></p>`}

      ${status === 'loading' && html`<${Skeleton} lines=${3} /><${Skeleton} lines=${3} />`}
      ${status === 'error' && html`<${StateCard} icon="alert" tone="peach" title="Products didn’t load" action=${html`<button class="btn btn-primary btn-sm" onClick=${() => setReload((x) => x + 1)}>Try again</button>`}>${error}. Check your connection, then try again.<//>`}

      ${status === 'ready' && res.unknown.length > 0 && html`<${StateCard} icon="search" tone="lavender" title=${`No demo products match “${res.unknown.join('”, “')}”`}
          action=${html`<p class="small">Try: ${CATEGORIES.slice(0, 4).map((c, i) => html`<button type="button" class="link-btn small" onClick=${() => { setText(c.label); run(c.label); }}>${c.label}</button>${i < 3 ? ' · ' : ''}`)}</p>`}>
          The demo has a small range, so it shows nothing instead of something unrelated.<//>`}
      ${status === 'ready' && res.unknown.length === 0 && res.nothingAsked && html`<${StateCard} icon="search" tone="lavender" title="Tell me a bit more">Name a kind of product (soda, chocolate, yoghurt) or a taste (sweet, salty).<//>`}
      ${status === 'ready' && res.unknown.length === 0 && !res.nothingAsked && items.length === 0 && html`<${StateCard} icon="search" tone="lavender" title=${what ? `No ${what} matches these filters` : 'No matches'}
          action=${html`<button class="btn btn-ghost btn-sm" onClick=${() => setFilters({ ...emptyFilters(), categories: filters.categories })}>${filters.categories.length ? 'Clear the other filters' : 'Clear all filters'}</button>`}>
          Nothing in the demo data fits all of these filters. Removing one might help.<//>`}
      ${status === 'ready' && items.length > 0 && html`<div>
        <h2 class="results-h">${items.length} result${items.length > 1 ? 's' : ''}${what ? `: ${what}` : ''}</h2>
        <div class="product-list">${items.map((p) => html`<${ProductRow} key=${p.id} p=${p} municipality=${s.profile.municipality} />`)}</div>
      </div>`}
    </section>`}
  </div>`;
}
