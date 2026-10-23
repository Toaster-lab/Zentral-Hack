// Small map with a draggable pin. Tap the map or drag the pin; arrow buttons nudge it for
// keyboard / precise adjustment. Calls onChange({ lat, lng }) on every move.
import { html, useEffect, useRef, useState } from '../lib.js';
import { Icon, StateCard, iconSvg } from '../ui.js';
import { config } from '../config.js';
import { areaContains, areaRing } from '../data/areas.js';
import { OUTSIDE_MESSAGE } from '../data/areas.js';

const NUDGE_M = 4;

export function PinPicker({ value, onChange, area, height = 280 }) {
  const el = useRef();
  const map = useRef();
  const marker = useRef();
  const cb = useRef(onChange);
  cb.current = onChange;
  const [locating, setLocating] = useState(false);
  const [gpsMsg, setGpsMsg] = useState('');
  const inside = areaContains(area, value);

  useEffect(() => {
    const L = window.L;
    if (!L) return undefined;
    const m = L.map(el.current, { zoomControl: true }).setView([value.lat, value.lng], 18);
    L.tileLayer(config.tiles.url, { maxZoom: 19, attribution: config.tiles.attribution }).addTo(m);
    L.polygon([[[85, -180], [85, 180], [-85, 180], [-85, -180]], areaRing(area)], { stroke: false, fillColor: '#5b3fb8', fillOpacity: 0.18, interactive: false }).addTo(m);
    L.circle([area.center.lat, area.center.lng], { radius: area.radiusM, color: '#5b3fb8', weight: 2, dashArray: '6 6', fill: false, interactive: false }).addTo(m);
    const mk = L.marker([value.lat, value.lng], {
      draggable: true, title: 'Drag me to the exact spot', alt: 'Place pin',
      icon: L.divIcon({ className: '', html: `<div class="station-marker selected">${iconSvg('pin', 18)}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] }),
    }).addTo(m);
    mk.on('dragend', () => { const p = mk.getLatLng(); cb.current({ lat: p.lat, lng: p.lng }); });
    m.on('click', (e) => { mk.setLatLng(e.latlng); cb.current({ lat: e.latlng.lat, lng: e.latlng.lng }); });
    map.current = m; marker.current = mk;
    return () => m.remove();
  }, []);

  // Keep marker in sync when the position is changed from outside (GPS, nudge buttons).
  useEffect(() => {
    const mk = marker.current;
    if (!mk) return;
    const cur = mk.getLatLng();
    if (Math.abs(cur.lat - value.lat) > 1e-9 || Math.abs(cur.lng - value.lng) > 1e-9) {
      mk.setLatLng([value.lat, value.lng]);
      map.current.panTo([value.lat, value.lng]);
    }
  }, [value.lat, value.lng]);

  const nudge = (dLatM, dLngM) => onChange({
    lat: value.lat + dLatM / 111320,
    lng: value.lng + dLngM / (111320 * Math.cos((value.lat * Math.PI) / 180)),
  });

  function useMyLocation() {
    setGpsMsg('');
    if (!navigator.geolocation) { setGpsMsg('Location isn’t available in this browser — tap the map to drop the pin instead.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!areaContains(area, p)) { setGpsMsg(`You seem to be outside the launch area. ${OUTSIDE_MESSAGE} Tap the map to drop the pin instead.`); return; }
        onChange(p);
      },
      (err) => {
        setLocating(false);
        setGpsMsg(err.code === 1 ? 'Location access is off — no problem, just tap the map or drag the pin to the spot.' : 'We couldn’t get your location. Tap the map to drop the pin instead.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  if (!window.L) return html`<${StateCard} icon="alert" tone="peach" title="The map couldn’t load">Check your connection and try again.<//>`;
  return html`<div class="stack-sm">
    <div class="map-wrap"><div ref=${el} class="map pin-map" style=${`height:${height}px;min-height:0`} role="region" aria-label="Map for placing the pin. Tap to move the pin."></div></div>
    <div class="row between center wrap gap-sm">
      <button type="button" class="btn btn-ghost btn-sm" style="flex:none" onClick=${useMyLocation} disabled=${locating}><${Icon} name="locate" size=${18} /> ${locating ? 'Finding you…' : 'Use my location'}</button>
      <div class="nudge" role="group" aria-label=${`Nudge the pin by about ${NUDGE_M} metres`}>
        <button type="button" class="icon-btn" aria-label="Nudge north" onClick=${() => nudge(NUDGE_M, 0)}><${Icon} name="up" size=${18} /></button>
        <button type="button" class="icon-btn" aria-label="Nudge south" onClick=${() => nudge(-NUDGE_M, 0)}><${Icon} name="down" size=${18} /></button>
        <button type="button" class="icon-btn" aria-label="Nudge west" onClick=${() => nudge(0, -NUDGE_M)}><${Icon} name="back" size=${18} /></button>
        <button type="button" class="icon-btn" aria-label="Nudge east" onClick=${() => nudge(0, NUDGE_M)}><${Icon} name="right" size=${18} /></button>
      </div>
    </div>
    ${gpsMsg && html`<p class="note tone-peach" role="alert"><${Icon} name="info" size=${18} /> ${gpsMsg}</p>`}
    ${!inside && html`<p class="note tone-lavender" role="alert"><${Icon} name="info" size=${18} /> <span>${OUTSIDE_MESSAGE} Move the pin inside the unshaded circle (the supported area).</span></p>`}
  </div>`;
}
