const CACHE_NAME = "neusecast-player-shell-v4";

async function cacheNavigation(request, response) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

async function cachedNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  return cached ?? Response.error();
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((names) => Promise.all(
        names.filter((name) => name.startsWith("neusecast-player-shell-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      )),
    ]),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "REVOKE_PLAYER" || typeof event.data.playerKey !== "string") return;
  const playerPath = `/player/${encodeURIComponent(event.data.playerKey)}`;
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const requests = await cache.keys();
      await Promise.all(requests
        .filter((request) => new URL(request.url).pathname === playerPath)
        .map((request) => cache.delete(request)));
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (
    request.mode === "navigate"
    && url.pathname.startsWith("/player/")
    && url.searchParams.get("preview") !== "1"
    && !url.searchParams.has("pair")
  ) {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            await cacheNavigation(request, response).catch(() => undefined);
          }
          return response;
        })
        .catch(() => cachedNavigation(request)),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/_next/image")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        }).catch(() => cached ?? Response.error());
        return cached ?? network;
      }),
    );
  }
});
