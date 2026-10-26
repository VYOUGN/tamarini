// Keeps the whole app on the phone so it opens in the gym with no internet.
// Bump VERSION whenever any file below changes; the phone picks up the new copy on its next open.
const VERSION = 'tamarini-v2';
const FILES = [
  './',
  './index.html',
  './help.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Sync calls go to Google and must never be served from the cache.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      // A page that isn't cached (or a link with a query) tries the network, and falls back to the app.
      if (req.mode === 'navigate') return fetch(req).catch(() => caches.match('./index.html'));
      return fetch(req);
    })
  );
});
