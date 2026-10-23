// Base public locations for the supported area(s).
//  - source 'osm':  real nodes from an OpenStreetMap snapshot (community-made data, not
//                   officially verified — labelled "OpenStreetMap" in the UI).
//  - source 'demo': made-up locations, flagged `sample: true` and labelled "Demo location".
// Approved community submissions live in the community backend (services/community.js).
import { OSM_SNAPSHOT } from './osm-rotkreuz.js';
import { parseOpeningHours } from '../logic/hours.js';

const OSM_MATERIALS = {
  'recycling:glass_bottles': 'glass', 'recycling:glass': 'glass',
  'recycling:plastic_bottles': 'plastic_bottle',
  'recycling:paper': 'paper', 'recycling:cardboard': 'cardboard',
  'recycling:cans': 'aluminium', 'recycling:aluminium': 'aluminium',
  'recycling:batteries': 'battery', 'recycling:clothes': 'textile', 'recycling:shoes': 'textile',
  'recycling:green_waste': 'green_waste', 'recycling:electrical_items': 'electronics',
};

function fromOsm(el) {
  const t = el.tags;
  const base = {
    id: `osm-${el.osm}`, areaId: 'rotkreuz', lat: el.lat, lng: el.lon,
    source: 'osm', sourceRef: `https://www.openstreetmap.org/node/${el.osm.slice(1)}`, sourceDate: OSM_SNAPSHOT.fetched,
    sample: false, access: '', photo: null, lastConfirmedAt: null,
  };
  if (t.amenity === 'recycling') {
    const materials = [...new Set(Object.entries(OSM_MATERIALS).filter(([k]) => t[k] === 'yes').map(([, v]) => v))];
    const hours = parseOpeningHours(t.opening_hours);
    return {
      ...base, type: 'station',
      name: t.name || (t.recycling_type === 'centre' ? 'Recycling centre' : 'Recycling container'),
      materials, materialsKnown: materials.length > 0,
      hours, hoursText: t.opening_hours || '', description: t.description || '', website: t.website || '',
    };
  }
  const dog = t.waste === 'dog_excrement';
  return {
    ...base, type: 'bin', name: dog ? 'Dog waste bin' : 'Public waste bin', materials: [], materialsKnown: true,
    hours: null, hoursText: '', description: dog ? 'Dog waste only.' : '',
  };
}

const DEMO = [
  { id: 'demo-glass-can', name: 'Glass & can point', lat: 47.1433, lng: 8.4297, materials: ['glass', 'aluminium', 'tin'] },
  { id: 'demo-pet-battery', name: 'PET & battery return point', lat: 47.1398, lng: 8.4338, materials: ['pet', 'plastic_bottle', 'battery'] },
  { id: 'demo-paper', name: 'Paper & cardboard point', lat: 47.1447, lng: 8.4268, materials: ['paper', 'cardboard'] },
  { id: 'demo-textile', name: 'Textile container', lat: 47.1379, lng: 8.4289, materials: ['textile'] },
].map((d) => ({
  ...d, areaId: 'rotkreuz', type: 'station', name: `${d.name} (demo)`, source: 'demo', sample: true, materialsKnown: true,
  hours: Array(7).fill('00:00-24:00'), hoursText: '', description: 'Demo location for testing — not a real collection point.',
  access: '', photo: null, lastConfirmedAt: null,
}));

export const SEED_LOCATIONS = [...OSM_SNAPSHOT.elements.map(fromOsm), ...DEMO];
export const OSM_SNAPSHOT_DATE = OSM_SNAPSHOT.fetched;
