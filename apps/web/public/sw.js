// One-time retirement worker for existing installations; no offline fetch handler.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const scope = self.registration.scope;
    for (const name of await caches.keys()) {
      if (name.startsWith("workbox-") && name.endsWith(scope)) await caches.delete(name);
    }
    // Take over cached clients without navigating or discarding unsaved input.
    await self.clients.claim();
    await self.registration.unregister();
  })());
});
