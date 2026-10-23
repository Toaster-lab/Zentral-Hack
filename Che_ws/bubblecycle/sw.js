// BubbleCycle service worker: lets the app open offline and be installed.
// - App files: network first (so updates show up), falling back to the cache when offline.
// - vendor/ and icons/: cache first (they never change between versions).
// - Anything on another origin (map tiles, Open Food Facts) is not touched.
const VERSION = 'bubblecycle-v1';
const STATIC = [
  './', 'index.html', 'manifest.webmanifest',
  'css/styles.css', 'css/theme.css',
  'vendor/preact-htm.js', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'vendor/qrcode.min.js', 'vendor/fonts/fonts.css',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  const immutable = /\/(vendor|icons)\//.test(url.pathname);
  if (immutable) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => store(req, res))));
    return;
  }
  event.respondWith(
    fetch(req).then((res) => store(req, res)).catch(() =>
      caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});

function store(req, res) {
  if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
  return res;
}
