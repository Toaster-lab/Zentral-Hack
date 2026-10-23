// Tiny demo gazetteer so manual place search works offline.
// Replace with a geocoder (swisstopo / Nominatim) in services/live.js.
// Places inside a supported area carry an `areaId`; the rest exist only so we can answer
// politely ("We’re starting in Rotkreuz") instead of "not found".
export const PLACES = [
  { names: ['rotkreuz', 'risch rotkreuz', 'risch', 'rotkreuz zg'], label: 'Rotkreuz', lat: 47.1416, lng: 8.4308, areaId: 'rotkreuz', municipality: 'risch' },
  { names: ['bahnhof rotkreuz', 'bahnhof', 'rotkreuz bahnhof', 'train station'], label: 'Bahnhof Rotkreuz', lat: 47.1416, lng: 8.4308, areaId: 'rotkreuz', municipality: 'risch' },
  { names: ['ökihof', 'oekihof', 'okihof', 'ökihof rotkreuz', 'oekihof rotkreuz'], label: 'Ökihof Rotkreuz', lat: 47.1419, lng: 8.4329, areaId: 'rotkreuz', municipality: 'risch' },
  // Outside the launch area (answered with the "starting in Rotkreuz" message).
  { names: ['zug', 'zoug'], label: 'Zug', lat: 47.1724, lng: 8.5176 },
  { names: ['cham'], label: 'Cham', lat: 47.1816, lng: 8.4637 },
  { names: ['baar'], label: 'Baar', lat: 47.1963, lng: 8.5294 },
  { names: ['luzern', 'lucerne', 'lucerna'], label: 'Luzern', lat: 47.0502, lng: 8.3093 },
  { names: ['küssnacht', 'kuessnacht', 'küssnacht am rigi'], label: 'Küssnacht', lat: 47.0850, lng: 8.4390 },
  { names: ['zürich', 'zurich', 'zuerich', 'zurigo'], label: 'Zürich', lat: 47.3769, lng: 8.5417 },
  { names: ['bern', 'berne', 'berna'], label: 'Bern', lat: 46.948, lng: 7.4474 },
  { names: ['basel', 'bâle', 'bale', 'basilea'], label: 'Basel', lat: 47.5596, lng: 7.5886 },
  { names: ['lausanne', 'losanna'], label: 'Lausanne', lat: 46.5197, lng: 6.6323 },
  { names: ['genève', 'geneve', 'geneva', 'genf', 'ginevra'], label: 'Genève', lat: 46.2044, lng: 6.1432 },
];

// Postcodes that belong to a supported area.
export const AREA_POSTCODES = { 6343: 'rotkreuz' };
