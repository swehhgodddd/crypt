// CRYPT service worker: rete prima, cache solo come ripiego offline.
// Non serve piu' cambiare il nome della cache a ogni modifica di index.html:
// quando sei online scarica sempre la versione nuova.
const CACHE = 'crypt-runtime-v1';
// Cache temporanea per i brani condivisi da altre app (Android): l'app li legge e li svuota all'avvio.
const SHARE_CACHE = 'crypt-share-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE && key !== SHARE_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

// "Condividi" -> Crypt: riceve i file in POST, li mette in cache e riapre l'app con ?shared=N
async function handleShare(req) {
  const home = new URL('./index.html', self.registration.scope);
  try {
    const form = await req.formData();
    const files = form.getAll('audio').filter((f) => f && typeof f === 'object' && 'name' in f && f.size > 0);
    const cache = await caches.open(SHARE_CACHE);
    for (const k of await cache.keys()) await cache.delete(k);
    let i = 0;
    for (const f of files) {
      const key = new URL('./_shared/' + (i++), self.registration.scope).href;
      await cache.put(key, new Response(f, {
        headers: {
          'Content-Type': f.type || 'audio/mpeg',
          'X-File-Name': encodeURIComponent(f.name || 'track')
        }
      }));
    }
    home.search = '?shared=' + files.length;
  } catch (err) {
    // se qualcosa va storto riapre comunque l'app
  }
  return Response.redirect(home.href, 303);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/share-target')) {
    event.respondWith(handleShare(req));
    return;
  }

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
