// Supported service areas. Every location record carries an `areaId`, and the map only
// loads locations for one area and the current view. To launch another town, add an entry
// here, load its locations (seed file or live provider) and add it to the gazetteer —
// no screen code needs to change.
import { haversineKm } from '../utils.js';

export const AREAS = {
  rotkreuz: {
    id: 'rotkreuz',
    name: 'Rotkreuz',
    region: 'Risch, Canton Zug',
    country: 'CH',
    center: { lat: 47.1416, lng: 8.4308 },
    radiusM: 2200,
    zoom: 15,
    municipality: 'risch',
  },
};

export const DEFAULT_AREA_ID = 'rotkreuz';
export const defaultArea = () => AREAS[DEFAULT_AREA_ID];

export const areaContains = (area, p) => haversineKm(area.center, p) * 1000 <= area.radiusM;
export const areaForPoint = (p) => Object.values(AREAS).find((a) => areaContains(a, p)) || null;

// Rectangle that fully covers the area (used for the first load and map limits).
export function areaBBox(area, padFactor = 1) {
  const dLat = (area.radiusM * padFactor) / 111320;
  const dLng = (area.radiusM * padFactor) / (111320 * Math.cos((area.center.lat * Math.PI) / 180));
  return { south: area.center.lat - dLat, north: area.center.lat + dLat, west: area.center.lng - dLng, east: area.center.lng + dLng };
}

// Points of a circle, used to draw the supported-area outline on the map.
export function areaRing(area, steps = 72) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const dLat = (Math.sin(a) * area.radiusM) / 111320;
    const dLng = (Math.cos(a) * area.radiusM) / (111320 * Math.cos((area.center.lat * Math.PI) / 180));
    pts.push([area.center.lat + dLat, area.center.lng + dLng]);
  }
  return pts;
}

export const OUTSIDE_MESSAGE = 'We’re starting in Rotkreuz. More places are coming!';
