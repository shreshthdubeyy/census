const CACHE_NAME = 'census-connect-v1';
const ASSETS = [
  'index.html',
  'kiosk.html',
  'style.css',
  'app.js',
  'kiosk.js',
  'Logo.png',
  'Hero.png',
  'manifest.json'
];

// Install Event - cache core shell assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Service Worker: Caching App Shell Assets');
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - clear old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('Service Worker: Clearing Old Cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Network first fallback to cache for robustness
self.addEventListener('fetch', event => {
  // Do not intercept Apps Script POST/GET calls (always let them hit network live)
  if (event.request.url.includes('script.google.com')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
