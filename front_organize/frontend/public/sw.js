const CACHE = 'organize-shell-__BUILD_ID__';
const SHELL = [
  '/', '/offline.html', '/assets/app.js', '/assets/app.css',
  '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('organize-shell-') && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () =>
      await caches.match('/offline.html') || Response.error()));
    return;
  }

  const isAppAsset = url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname);
  if (!isAppAsset) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return await caches.match(request, { ignoreSearch: true }) || Response.error();
    }
  })());
});
