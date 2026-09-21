/* Service worker: ничего не кэшируем (данные всегда живые), единственная
   работа — показать оффлайн-страницу, когда в цеху пропала сеть. */
const OFFLINE_CACHE = 'offline-v1';
const OFFLINE_PAGE = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.add(OFFLINE_PAGE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith((async () => {
    try {
      return await fetch(event.request);
    } catch (error) {
      const cache = await caches.open(OFFLINE_CACHE);
      return cache.match(OFFLINE_PAGE);
    }
  })());
});
