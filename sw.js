// CRYPT service worker: rete prima, cache solo come ripiego offline.
// Non serve piu' cambiare il nome della cache a ogni modifica di index.html:
// quando sei online scarica sempre la versione nuova.
const CACHE = 'crypt-runtime-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !/^https?:/.test(req.url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const net = await fetch(req);
      // Salva anche le librerie da CDN e i font (risposte opache) per l'uso offline
      if (net && (net.ok || net.type === 'opaque')) cache.put(req, net.clone());
      return net;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const home = (await cache.match('./index.html')) || (await cache.match('./'));
        if (home) return home;
      }
      throw err;
    }
  })());
});
