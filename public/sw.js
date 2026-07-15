const versionParam = new URL(self.location.href).searchParams.get('v') || 'dev';
const SHELL_CACHE = `climbset-shell-${versionParam}`;
const IMAGE_CACHE = `climbset-images-${versionParam}`;
const SHELL_ROUTES = ['/', '/editor', '/profile', '/settings', '/login', '/signup'];
const IMMUTABLE_ASSETS = new Set([
  '/manifest.json',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/walls/default-wall.jpg',
]);
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll([...SHELL_ROUTES, ...IMMUTABLE_ASSETS].map((path) => new Request(path)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) =>
              (key.startsWith('climbset-shell-') && key !== SHELL_CACHE) ||
              (key.startsWith('climbset-images-') && key !== IMAGE_CACHE)
            )
            .map((key) => caches.delete(key))
        )
      ),
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(SHELL_CACHE).then((cache) =>
        fetch(request)
          .then((response) => {
            if (response.ok) void cache.put(request, response.clone());
            return response;
          })
          .catch(() =>
            cache.match(request)
              .then((cached) => cached || cache.match(url.pathname))
              .then((cached) => cached || cache.match('/'))
              .then((cached) => cached || Response.error())
          )
      )
    );
    return;
  }

  const isWallImage = url.pathname.includes('/storage/v1/object/public/walls/');
  const isImmutableAsset =
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static/') || IMMUTABLE_ASSETS.has(url.pathname));

  if (!isWallImage && !isImmutableAsset) return;
  const cacheName = isWallImage ? IMAGE_CACHE : SHELL_CACHE;
  event.respondWith(
    caches.open(cacheName).then((cache) =>
      cache.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok || response.type === 'opaque') {
            void cache.put(request, response.clone());
          }
          return response;
        });
      })
    )
  );
});
