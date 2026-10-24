import { html, useEffect, useRef, useState } from '../lib.js';
import { Header, Icon, Chip, Skeleton, StateCard, DemoTag } from '../ui.js';
import { parseQuery, emptyFilters, CATEGORIES } from '../logic/discover.js';
import { ALLERGENS, PRODUCTS } from '../data/products.js';
import { TEAM_SOURCE, EXAMPLE_NOTE, EXAMPLE_DETAILS_NOTE, migrosSources } from '../data/catalogue.js';
import { searchProducts } from '../services/index.js';
import { guidanceFor, MATERIALS } from '../logic/rules.js';
import { useStore } from '../store.js';
import { fmtCHF } from '../utils.js';

const EXAMPLES = ['Red Bull', 'A soda', 'Something sweet', 'Salty snack under CHF 3', 'Chocolate, nut-free'];
// Only the types that exist in the pilot catalogue are offered as filters.
const TYPES = CATEGORIES.filter((c) => PRODUCTS.some((p) => p.category === c.key));
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
  const migros = migrosSources(p);
  const dietLabel = p.diet === 'vegan' ? 'Vegan' : p.diet === 'vegetarian' ? 'Vegetarian' : p.diet === 'neither' ? 'Not vegetarian' : null;
  return html`<article class="product-row">
    <div class="product-main">
      <${Thumb} p=${p} />
      <div class="grow">
        <h3>${p.name}</h3>
        <p class="row-sub">${p.retailer ? `${p.retailer} · ` : ''}${p.size} · ${p.packagingLabel}</p>
        <p class="small packaging"><strong>Packaging</strong> ${packaging}</p>
        <p class="small muted">${dietLabel ? `Diet: ${dietLabel}` : 'Diet: not available'}</p>
        <p class="small">${p.labels.length
          ? p.labels.map((l) => html`<span class=${`tag ${l.verified ? 'tag-verified' : 'tag-unverified'}`}>${l.name}${l.verified ? '' : ' (unverified)'}</span> `)
          : html`<span class="muted">Certifications: not available</span>`}</p>
      </div>
      <p class="price">${p.priceChf != null ? html`<strong>${p.priceEstimate ? '~' : ''}${fmtCHF(p.priceChf)}</strong>${p.priceEstimate ? html`<br /><span class="muted small">estimate</span>` : ''}` : html`<span class="muted small">Price not available</span>`}</p>
    </div>
    <p class="small muted">${p.source === 'sample' ? html`<${DemoTag}>Example product<//> ${EXAMPLE_NOTE}.` : html`${TEAM_SOURCE}.${p.exampleDetails ? ` ${EXAMPLE_DETAILS_NOTE}` : ''}`}${migros ? html` Source: Migros (${migros.fields.join(', ')}), retrieved ${migros.retrievedAt}: <a href=${migros.url} target="_blank" rel="noopener noreferrer">${new URL(migros.url).hostname}</a>.` : ''}</p>
    <button class="link-btn small" aria-expanded=${open ? 'true' : 'false'} onClick=${() => setOpen(!open)}>${open ? 'Hide details' : 'What to do with the packaging'}</button>
    ${open && html`<div class="stack-sm details">
      <div><h4 class="small-h">How to recycle it</h4>${p.recycling ? html`<p class="small">${p.recycling}</p>` : ''}<ul>${p.packaging.filter((pk) => pk.material).map((pk) => html`<li class="small"><strong>${pk.part}:</strong> ${guidanceFor(pk.material, municipality).where}</li>`)}</ul></div>
      <p class="small">${p.allergens ? (p.allergens.length ? `Contains: ${p.allergens.map(allergenLabel).join(', ')}.` : 'Contains none of the listed allergens.') : 'Allergens: not available.'}
        ${p.mayContain && p.mayContain.length > 0 ? ` May contain: ${p.mayContain.map(allergenLabel).join(', ')}.` : ''}</p>
      <p class="small">${p.ingredients ? html`<strong>Ingredients:</strong> ${p.ingredients}` : 'Ingredients: not available.'}</p>
      <p class="small muted">Availability and stock are not checked. Read the real pack.</p>
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
  const refineRef = useRef();

  function run(q) {
    const parsed = parseQuery(q);
    setFilters(parsed.filters);
    setSubmitted({ text: q, ...parsed });
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
    <${Header} title="Find a drink" subtitle="See the packaging and how to recycle it" />

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
      ${(submitted.otherRetailer || submitted.retailer) && html`<p class="note"><${Icon} name="info" size=${18} /> This is not a live retailer catalogue: three drinks come from the team and the rest are labelled examples, so shop-specific searches can’t be answered.</p>`}

      <details class="refine" ref=${refineRef}>
        <summary><strong>Filters</strong> <span class="muted small">${activeCount ? `${activeCount} on` : 'type, diet, allergies'}</span></summary>
        <div class="refine-group" role="group" aria-label="Type of product">
          <span class="small-h">Type</span>
          <div class="chip-wrap">${TYPES.map((c) => html`<${Chip} selected=${filters.categories.includes(c.key)} onClick=${() => toggleIn('categories', c.key)}>${c.label}<//>`)}</div>
        </div>
        <div class="refine-group" role="group" aria-label="Diet">
          <span class="small-h">Diet</span>
          <div class="chip-wrap">${DIETS.map((d) => html`<${Chip} selected=${filters.diet === d.key} onClick=${() => set({ diet: d.key })}>${d.label}<//>`)}</div>
        </div>
        <div class="refine-group" role="group" aria-label="Free from">
          <span class="small-h">Free from</span>
          <div class="chip-wrap">${ALLERGENS.map((a) => html`<${Chip} selected=${filters.freeFrom.includes(a.key)} onClick=${() => toggleIn('freeFrom', a.key)}>${a.label}<//>`)}</div>
        </div>
        <p class="muted small">Diet, allergen and price details are not available for these drinks yet, so those filters hide them rather than guess.</p>
        ${filters.freeFrom.length > 0 && html`<p class="muted small">Products that contain or may contain these allergens are hidden. Always check the real pack.</p>`}
      </details>

      <p class="note"><${Icon} name="info" size=${18} /> <span>Three drinks (Red Bull, Focus Water Reload, Limonade Minze Bio) were supplied by the team; the other products are made-up examples marked as such. Prices and details are not from Migros and anything not shown is not available. We don’t rank products by environmental impact.</span></p>

      ${status === 'loading' && html`<${Skeleton} lines=${3} /><${Skeleton} lines=${3} />`}
      ${status === 'error' && html`<${StateCard} icon="alert" tone="peach" title="Products didn’t load" action=${html`<button class="btn btn-primary btn-sm" onClick=${() => setReload((x) => x + 1)}>Try again</button>`}>${error}. Check your connection, then try again.<//>`}

      ${status === 'ready' && res.unknown.length > 0 && html`<${StateCard} icon="search" tone="lavender" title=${`Not in this pilot catalogue: “${res.unknown.join('”, “')}”`}
          action=${html`<p class="small">Try: ${EXAMPLES.map((ex, i) => html`<button type="button" class="link-btn small" onClick=${() => { setText(ex); run(ex); }}>${ex}</button>${i < EXAMPLES.length - 1 ? ' · ' : ''}`)}</p>`}>
          The pilot has a small range, so it shows nothing instead of something unrelated.<//>`}
      ${status === 'ready' && res.unknown.length === 0 && res.nothingAsked && html`<${StateCard} icon="search" tone="lavender" title="Tell me a bit more">Name a drink (Red Bull, Focus Water, Limonade) or a type (soda, water, energy drink).<//>`}
      ${status === 'ready' && res.unknown.length === 0 && !res.nothingAsked && items.length === 0 && html`<${StateCard} icon="search" tone="lavender" title=${what ? `No ${what} matches these filters` : 'No matches'}
          action=${html`<button class="btn btn-ghost btn-sm" onClick=${() => setFilters({ ...emptyFilters(), categories: filters.categories })}>${filters.categories.length ? 'Clear the other filters' : 'Clear all filters'}</button>`}>
          ${res.noData?.length ? `We don’t have ${res.noData.map((k) => ({ diet: 'diet', allergens: 'allergen', price: 'price' })[k]).join(', ')} information for ${what || 'these drinks'}, so this filter can’t match them. ` : 'Nothing in the pilot catalogue fits all of these filters. '}Removing one might help.<//>`}
      ${status === 'ready' && items.length > 0 && html`<div>
        <h2 class="results-h">${items.length} result${items.length > 1 ? 's' : ''}${what ? `: ${what}` : ''}</h2>
        <div class="product-list">${items.map((p) => html`<${ProductRow} key=${p.id} p=${p} municipality=${s.profile.municipality} />`)}</div>
      </div>`}
    </section>`}
  </div>`;
}
