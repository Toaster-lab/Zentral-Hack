import { html, useEffect, useRef, useState } from '../lib.js';
import { Header, Icon, MaterialChip, Segmented, Skeleton, StateCard, iconSvg } from '../ui.js';
import { STATION_FILTERS } from '../logic/rules.js';
import { LOCATION_TYPES } from '../logic/community.js';
import { loadLocations, geocode, isDemo } from '../services/index.js';
import { useStore, setState, getContributorId, syncContributionRewards } from '../store.js';
import { config } from '../config.js';
import { defaultArea, areaBBox, areaRing, areaForPoint, OUTSIDE_MESSAGE } from '../data/areas.js';
import { haversineKm } from '../utils.js';
import { navigate } from '../router.js';
import { LocationCard, PlaceSheet } from './place.js';

const area = defaultArea();
const MATERIAL_FILTERS = [...STATION_FILTERS];

function LeafletMap({ locations, selectedId, onSelect, userPos, focus, onView, overlay }) {
  const el = useRef();
  const map = useRef();
  const layer = useRef();
  const cb = useRef({ onView });
  cb.current = { onView };
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    const L = window.L;
    if (!L) return undefined;
    const m = L.map(el.current, { zoomControl: false, minZoom: 12 }).setView([area.center.lat, area.center.lng], area.zoom);
    const box = areaBBox(area, 2.4);
    m.setMaxBounds([[box.south, box.west], [box.north, box.east]]);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    let errors = 0;
    L.tileLayer(config.tiles.url, { maxZoom: 19, attribution: config.tiles.attribution })
      .on('tileerror', () => { if (++errors > 4) setTileError(true); }).addTo(m);
    // Supported area: dim everything outside the circle and outline it.
    L.polygon([[[85, -180], [85, 180], [-85, 180], [-85, -180]], areaRing(area)], { stroke: false, fillColor: '#5b3fb8', fillOpacity: 0.18, interactive: false }).addTo(m);
    L.circle([area.center.lat, area.center.lng], { radius: area.radiusM, color: '#5b3fb8', weight: 2.5, dashArray: '8 7', fill: false, interactive: false }).addTo(m);
    const north = areaRing(area, 4)[1];
    L.marker(north, { interactive: false, keyboard: false, icon: L.divIcon({ className: '', html: `<div class="area-label">${area.name} launch area</div>`, iconSize: [160, 24], iconAnchor: [80, 30] }) }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    let t;
    const report = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const b = m.getBounds(); const c = m.getCenter();
        cb.current.onView({ bbox: { south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast() }, center: { lat: c.lat, lng: c.lng } });
      }, 250);
    };
    m.on('moveend', report);
    report();
    return () => { clearTimeout(t); m.remove(); };
  }, []);

  useEffect(() => { if (focus && map.current) map.current.setView([focus.lat, focus.lng], focus.zoom || 16, { animate: true }); }, [focus?.nonce]);

  useEffect(() => {
    const L = window.L;
    if (!L || !layer.current) return;
    layer.current.clearLayers();
    if (userPos) {
      L.marker([userPos.lat, userPos.lng], { icon: L.divIcon({ className: '', html: '<div class="me-marker" aria-hidden="true"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }), keyboard: false, title: 'You are here' }).addTo(layer.current);
    }
    locations.forEach((l) => {
      const cls = ['station-marker', l.type === 'bin' ? 'bin' : '', l.source === 'demo' ? 'demo' : '', l.pending ? 'pending' : '', l.id === selectedId ? 'selected' : ''].join(' ');
      const warn = l.tempIssues?.length ? '<i class="warn-dot">!</i>' : '';
      const mk = L.marker([l.lat, l.lng], {
        title: l.name, alt: l.name,
        icon: L.divIcon({ className: '', html: `<div class="${cls}">${iconSvg(LOCATION_TYPES[l.type].icon, 18)}${warn}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] }),
      });
      mk.on('click', () => onSelect(l));
      mk.on('keypress', (e) => { if (e.originalEvent.key === 'Enter') onSelect(l); });
      mk.addTo(layer.current);
    });
  }, [locations, selectedId, userPos]);

  if (!window.L) return html`<div class="stack">${overlay}<${StateCard} icon="alert" tone="peach" title="The map couldn’t load">Check your connection — the list view still works.<//></div>`;
  return html`<div class="map-wrap">
    <div ref=${el} class="map" role="region" aria-label="Map of recycling stations and public bins in Rotkreuz"></div>
    <div class="map-overlay">${overlay}</div>
    ${tileError && html`<p class="map-banner">Map tiles aren’t loading. Try the list view.</p>`}
  </div>`;
}

export default function MapScreen({ params }) {
  const s = useStore();
  const [focus, setFocus] = useState(null);
  const [view, setView] = useState({ bbox: areaBBox(area, 1), center: area.center });
  const [userPos, setUserPos] = useState(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [filters, setFilters] = useState(params.get('m') ? params.get('m').split(',') : []);
  const [mode, setMode] = useState('map');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState({ locations: [], pending: [] });
  const [selectedId, setSelectedId] = useState(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState(null);
  const [reload, setReload] = useState(0);
  const bboxKey = [view.bbox.south, view.bbox.north, view.bbox.west, view.bbox.east].map((n) => n.toFixed(4)).join();

  // Load only the supported area and the part currently in view.
  useEffect(() => {
    let alive = true;
    loadLocations({ areaId: area.id, bbox: view.bbox, contributorId: getContributorId() })
      .then((res) => { if (alive) { setData(res); setStatus('ready'); } })
      .catch((e) => { if (alive) { setError(e.message); setStatus('error'); } });
    return () => { alive = false; };
  }, [bboxKey, reload]);

  // Review outcomes may have arrived since last visit: pay out contribution points.
  useEffect(() => { syncContributionRewards().then((p) => p && setNotice({ tone: 'mint', text: `Your contributions earned ${p} points.` })); }, []);

  const all = [...data.pending, ...data.locations];
  const shown = all
    .filter((l) => (type === 'all' ? true : l.type === type))
    .filter((l) => (filters.length ? l.type === 'station' && l.materialsKnown !== false && filters.every((m) => l.materials.includes(m)) : true))
    .map((l) => ({ ...l, distanceKm: haversineKm(view.center, l) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const selected = all.find((l) => l.id === selectedId) || null;
  const stationCount = shown.filter((l) => l.type === 'station').length;
  const binCount = shown.length - stationCount;

  const flyTo = (p, zoom = 16) => setFocus({ lat: p.lat, lng: p.lng, zoom, nonce: Date.now() });

  function useMyLocation() {
    setNotice(null);
    if (!navigator.geolocation) { setNotice({ tone: 'peach', text: 'Location isn’t available in this browser. Type a place or postcode instead.' }); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!areaForPoint(p)) { setNotice({ tone: 'lavender', text: `${OUTSIDE_MESSAGE} Showing Rotkreuz for now.` }); flyTo(area.center, area.zoom); return; }
        setUserPos(p); flyTo(p, 17);
        // Store only a coarse (~1 km) position so the exact location never persists.
        setState({ lastPlace: { lat: Math.round(p.lat * 100) / 100, lng: Math.round(p.lng * 100) / 100, label: 'your area', municipality: area.municipality } });
      },
      (err) => {
        setLocating(false);
        setNotice({ tone: 'peach', text: err.code === 1
          ? 'Location access is turned off for BubbleCycle. No problem — search for a place instead, or allow location in your browser settings.'
          : 'We couldn’t get your location just now. Try again, or search for a place.' });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  async function search(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setNotice(null);
    try {
      const place = await geocode(query);
      if (!place) { setNotice({ tone: 'peach', text: `We couldn’t find “${query}”.${isDemo('geocoding') ? ' Try “Rotkreuz”, “Bahnhof Rotkreuz”, “Ökihof” or the postcode 6343.' : ''}` }); return; }
      if (place.outside || !place.areaId) { setNotice({ tone: 'lavender', text: `${OUTSIDE_MESSAGE}${place.label ? ` (${place.label} isn’t covered yet.)` : ''}` }); return; }
      flyTo(place, 16);
      setState({ lastPlace: { lat: place.lat, lng: place.lng, label: place.label, municipality: place.municipality } });
    } catch (err) {
      setNotice({ tone: 'peach', text: `Place search failed: ${err.message}` });
    }
  }

  const toggle = (m) => setFilters((f) => (f.includes(m) ? f.filter((x) => x !== m) : [...f, m]));

  // Search + filters: floats over the map in map view, sits above the list in list view.
  const floating = mode === 'map' && status !== 'error';
  const controls = html`<div class="map-controls">
    <form class="search-row" onSubmit=${search} role="search">
      <label class="search-field">
        <${Icon} name="search" size=${20} />
        <input type="search" placeholder="Place or postcode, e.g. 6343" value=${query} onInput=${(e) => setQuery(e.target.value)} aria-label="Search for a place or postcode" />
      </label>
      <button type="button" class="btn btn-round" onClick=${useMyLocation} aria-label="Use my location" disabled=${locating}><${Icon} name="locate" /></button>
    </form>
    <div class="chip-scroll" role="group" aria-label="Filters">
      ${[['all', 'All places'], ['station', 'Recycling points'], ['bin', 'Trash bins']].map(([k, label]) => html`<button type="button" class=${`chip chip-sm ${type === k ? 'selected' : ''}`} aria-pressed=${type === k ? 'true' : 'false'} onClick=${() => setType(k)}>${label}</button>`)}
      ${type !== 'bin' && MATERIAL_FILTERS.map((m) => html`<${MaterialChip} small material=${m} selected=${filters.includes(m)} onClick=${() => toggle(m)} />`)}
    </div>
  </div>`;

  return html`<div class="screen map-screen">
    <${Header} title="Map" subtitle=${`${area.name}, ${area.region}`}
      right=${html`<button class="btn btn-primary btn-sm" style="flex:none" onClick=${() => navigate(`add?lat=${view.center.lat.toFixed(6)}&lng=${view.center.lng.toFixed(6)}`)}><${Icon} name="plus" size=${18} /> Add a place</button>`} />

    <p class="note tone-lavender small"><${Icon} name="pin" size=${18} /> <span>Rotkreuz only for now (dashed circle). More places are coming.</span></p>

    ${locating && html`<p class="muted small center">Finding you…</p>`}
    ${notice && html`<p class=${`note tone-${notice.tone}`} role="alert"><${Icon} name="info" size=${18} /> ${notice.text}</p>`}
    ${!floating && controls}

    <div class="row between center">
      <${Segmented} label="View" value=${mode} onChange=${setMode} options=${[{ value: 'map', label: 'Map', icon: 'map' }, { value: 'list', label: 'List', icon: 'list' }]} />
      <span class="muted small">${status === 'ready' ? `${stationCount} station${stationCount === 1 ? '' : 's'} · ${binCount} bin${binCount === 1 ? '' : 's'}` : ''}</span>
    </div>
    ${status === 'error' && html`<${StateCard} icon="alert" tone="peach" title="Couldn’t load places" action=${html`<button class="btn btn-primary btn-sm" onClick=${() => { setStatus('loading'); setReload((x) => x + 1); }}><${Icon} name="refresh" size=${18} /> Try again</button>`}>${error}<//>`}

    ${status !== 'error' && mode === 'map' && html`<${LeafletMap} locations=${shown} selectedId=${selectedId} onSelect=${(l) => setSelectedId(l.id)} userPos=${userPos} focus=${focus} onView=${setView} overlay=${controls} />`}

    ${status === 'loading' && mode === 'list' && html`<${Skeleton} /><${Skeleton} />`}
    ${status === 'ready' && shown.length === 0 && html`<${StateCard} icon="pin" tone="lavender" title="Nothing to show here"
        action=${html`<div class="row gap">${(filters.length || type !== 'all') && html`<button class="btn btn-ghost btn-sm" onClick=${() => { setFilters([]); setType('all'); }}>Clear filters</button>`}<button class="btn btn-primary btn-sm" onClick=${() => navigate(`add?lat=${view.center.lat.toFixed(6)}&lng=${view.center.lng.toFixed(6)}`)}>Add a place</button></div>`}>
        ${filters.length || type !== 'all' ? 'No known place matches these filters in this part of the map.' : 'There are no places in this part of the map yet. If you know one, you can add it.'}
      <//>`}
    ${status === 'ready' && mode === 'list' && html`<div class="stack"><div class="list">${shown.slice(0, 40).map((l) => html`<${LocationCard} key=${l.id} loc=${l} onOpen=${(x) => setSelectedId(x.id)} />`)}</div>${shown.length > 40 && html`<p class="muted small center">Showing the 40 closest. Zoom the map to see more.</p>`}</div>`}
    ${status === 'ready' && mode === 'map' && shown.length > 0 && html`<div class="stack">
      <h2>Closest to the map centre</h2>
      <div class="list">${shown.slice(0, 3).map((l) => html`<${LocationCard} key=${l.id} loc=${l} onOpen=${(x) => setSelectedId(x.id)} />`)}</div>
      ${shown.length > 3 && html`<button class="btn btn-ghost btn-sm" onClick=${() => setMode('list')}>See all ${shown.length} in list</button>`}
    </div>`}

    <p class="muted small legend">
      <span class="tag tag-osm">OpenStreetMap</span> real, community-made data ·
      <span class="tag tag-demo">Demo location</span> made up for testing ·
      <span class="tag tag-verified">Community</span> approved by a reviewer
    </p>

    ${selected && html`<${PlaceSheet} key=${selected.id} loc=${selected} userPos=${userPos} onClose=${() => setSelectedId(null)} onChanged=${() => setReload((x) => x + 1)} />`}
  </div>`;
}
