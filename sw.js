const CACHE_NAME = 'indagualirios-v4-1-historico-vendas';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './backup.js',
  './app.js',
  './manifest.json',
  './sw.js'
];

/* INSTALL: cachear todos os assets essenciais */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

/* ACTIVATE: limpar caches antigos e assumir controle imediato */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* FETCH: cache-first, network fallback, offline fallback para index.html */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Nao cachear requests para API do Telegram
  if (event.request.url.includes('api.telegram.org')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
