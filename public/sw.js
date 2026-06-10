// [sync] pwa §6 — app-shell service worker
// network-first for navigation; offline fallback to /offline
// never intercepts: /parties/, ws(s)://, or cross-origin

const CACHE_NAME = 'couchcircle-shell-v1';
const PRECACHE_URLS = ['/', '/offline'];

// ── install: precache the app shell ───────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// ── activate: sweep old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ── fetch: network-first navigations only ────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // early-return (no respondWith) for:
  // 1. non-GET requests
  // 2. cross-origin requests
  // 3. /parties/* (PartyKit WS + HTTP endpoints)
  // 4. websocket upgrades (ws: / wss:)
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/parties/')) return;
  if (request.destination === 'websocket') return;

  // only handle navigation requests (HTML documents)
  if (request.mode !== 'navigate') return;

  // network-first: try the network; fall back to cached /offline on failure
  event.respondWith(
    fetch(request)
      .then((response) => {
        // update the cache with the fresh response for the app shell URLs
        if (PRECACHE_URLS.includes(url.pathname)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(async () => {
        // offline fallback: serve cached /offline page
        const cached = await caches.match('/offline');
        if (cached) return cached;
        // last resort: bare response (shouldn't happen after install)
        return new Response('the couch needs wifi 🛋️', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        });
      }),
  );
});
