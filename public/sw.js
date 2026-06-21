// Rethink Field service worker — caches the operator app shell so /field opens
// on a flaky connection. Deliberately minimal and hand-rolled (no Workbox):
// runtime caching only, and it NEVER intercepts mutations (server actions are
// POSTs, which are passed straight through to the network).

const CACHE = "rethink-field-v1";

self.addEventListener("install", () => {
  // Activate immediately; we cache lazily on first navigation rather than
  // precaching (which would couple install success to a network fetch).
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // server actions / mutations: leave alone
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Field navigations: network-first, fall back to the cached shell offline.
  if (request.mode === "navigate" && url.pathname.startsWith("/field")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/field", copy));
          return res;
        })
        .catch(() => caches.match("/field")),
    );
    return;
  }

  // Hashed build assets and icons: cache-first (safe — content-addressed).
  if (url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icon-")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
  }
});
