// RECYCL IT! service worker: the app opens offline after one completed visit, and updates safely.
//
// - Shell: every local HTML, CSS, JS, icon, font and library file is stored at install (sw-manifest.js lists them
//   and carries a version hash of their contents). The cache is named after that version, so a release always gets
//   a fresh cache and the old one is removed when the new worker activates.
// - Updates: a new worker installs in the background and WAITS. The app shows "A new version is ready" and the
//   person chooses when to switch (after finishing whatever form is open), so nothing typed is lost.
// - Never cached: the API (/api/), anything on another origin (map tiles, Open Food Facts), non-GET requests and any
//   file that isn't part of the shell. Accounts, balances and evidence therefore never end up in a general cache.
//   (Photos taken at a check-in live in the page's own storage on the device, never in this cache.)
// - js/env.js tells the app whether a server is present, so it is fetched from the network first and only falls
//   back to its stored copy when offline.
importScripts('sw-manifest.js');

const { version, files } = self.BC_PRECACHE;
const CACHE = `bubblecycle-${version}`;
const ENV = 'js/env.js';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // `reload` skips the browser's HTTP cache so the stored copy really is this version.
    // (A duplicate URL in one addAll call makes it fail, so the list is de-duplicated.)
    await cache.addAll([...new Set([...files, ENV])].map((f) => new Request(f, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('bubblecycle-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;       // let the browser handle it
  if (url.pathname.includes('/api/')) return;                                     // live data is never stored

  const scope = new URL(self.registration.scope).pathname;
  const rel = url.pathname.startsWith(scope) ? url.pathname.slice(scope.length) : url.pathname;

  if (rel === ENV) {
    event.respondWith(fetch(req).then(async (res) => {
      if (res.ok) (await caches.open(CACHE)).put(ENV, res.clone());
      return res;
    }).catch(() => caches.match(ENV)));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(caches.match('index.html').then((hit) => hit || fetch(req)).catch(() => caches.match('offline.html')));
    return;
  }

  if (files.includes(rel)) {
    event.respondWith(caches.match(rel).then((hit) => hit || fetch(req)));
  }
});
