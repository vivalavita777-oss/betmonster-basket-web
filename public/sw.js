const SHELL_CACHE = "basket-monster-shell-v3";
const STATIC_CACHE = "basket-monster-static-v3";
const PAGE_CACHE = "basket-monster-pages-v3";
const SHELL = ["/", "/offline", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      const keep = new Set([SHELL_CACHE, STATIC_CACHE, PAGE_CACHE]);
      return Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key)));
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/api/backend/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(staleWhileRevalidate(event.request, STATIC_CACHE));
    return;
  }

  if (SHELL.includes(url.pathname)) {
    event.respondWith(cacheFirst(event.request, SHELL_CACHE));
    return;
  }

  event.respondWith(
    networkFirst(event.request, PAGE_CACHE)
  );
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  const cache = await caches.open(cacheName);
  cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fresh = fetch(request).then((response) => {
    cache.put(request, response.clone());
    return response;
  });
  return cached || fresh;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await caches.match("/offline"));
  }
}
