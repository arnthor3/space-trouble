const CACHE_NAME = "space-trouble-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

// Install Event
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event
self.addEventListener("fetch", (e) => {
  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        // Cache new static requests on the fly (except hot-reloading scripts or dev server endpoints)
        if (
          e.request.url.startsWith(self.location.origin) &&
          e.request.method === "GET" &&
          !e.request.url.includes("hot-update") &&
          !e.request.url.includes("@vite") &&
          !e.request.url.includes("ws") &&
          !e.request.url.includes("sw.js")
        ) {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, networkResponse.clone());
            return networkResponse;
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // If network request fails, serve from cache if available
        return caches.match(e.request);
      })
  );
});
