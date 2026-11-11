/* Minimal offline-first service worker: cache the app shell so it
   opens instantly and works with no network, once first loaded. */
const CACHE = 'stockbill-v5';
const ASSETS = [
  './', './index.html', './styles.css', './db.js',
  './core.js', './data.js', './pdf.js', './backup.js', './home.js', './settings.js',
  './suppliers.js', './customers.js', './items.js', './inventory.js', './vendors.js', './sell.js',
  './dashboard.js', './main.js', './lib/jspdf.umd.min.js',
  './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) {
    // Cross-origin (just the decorative Google Fonts CSS/files now): network-first so
    // it stays current when online, but cache whatever succeeds so a later fully-offline
    // load still renders (just without the custom fonts if they were never cached).
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}); }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // Same-origin app shell: cache-first so the app opens instantly and works with zero network.
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => cached))
  );
});
