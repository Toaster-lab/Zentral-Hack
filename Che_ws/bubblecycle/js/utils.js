import { startOfDayZ } from './logic/zurich.js';
import { nowTs } from './logic/clock.js';

export const sleep =(ms) => new Promise((r) => setTimeout(r, ms));

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const fmtKm = (km) => (km < 1 ? `${Math.round((km * 1000) / 10) * 10} m` : `${km.toFixed(1)} km`);
export const fmtCHF = (n) => `CHF ${n.toFixed(2)}`;

export function eanCheckDigit(body) {
  // Works for EAN-13 (12-digit body) and EAN-8 / UPC-A bodies alike.
  let sum = 0;
  const digits = body.split('').reverse();
  digits.forEach((d, i) => { sum += Number(d) * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10;
}

export function normaliseBarcode(raw) {
  return String(raw || '').replace(/[\s-]/g, '');
}

// Returns null when valid, otherwise a friendly error message.
export function barcodeError(code) {
  if (!code) return 'Please enter a barcode.';
  if (!/^\d+$/.test(code)) return 'Barcodes only contain digits.';
  if (![8, 12, 13].includes(code.length)) return 'Barcodes usually have 8, 12 or 13 digits.';
  const body = code.slice(0, -1);
  if (eanCheckDigit(body) !== Number(code.at(-1))) return 'That number doesn’t look quite right — please check the digits.';
  return null;
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

// Start of the day in Europe/Zurich (daily limits reset at Zurich midnight).
export function startOfDay(ts = nowTs()) { return startOfDayZ(ts); }

export function relTime(ts) {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d > 1 ? 's' : ''} ago`;
  return new Date(ts).toLocaleDateString('de-CH');
}

export const fmtDate = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// Resizes a user photo to a small JPEG on the device. Re-encoding through a canvas also
// drops EXIF metadata (including GPS position and camera details).
export function readPhoto(file, maxSide = 720, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) { reject(new Error('Please choose an image file.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('We couldn’t read that image. Try another one.')); };
    img.src = url;
  });
}

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { existing.dataset.loaded ? resolve() : existing.addEventListener('load', resolve); return; }
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => { s.dataset.loaded = '1'; resolve(); };
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}
