const CACHE_NAME = 'dm-pwa-v25';
const ASSETS = [
  '/app/',
  '/app/index.html',
  '/app/css/style.css?v=25',
  '/app/css/chat.css?v=2',
  '/app/js/app.js?v=25',
  '/app/js/firebase-config.js?v=25',
  '/app/js/chat.js?v=2',
  '/app/js/dashboard.js?v=25',
  '/app/js/personality.js?v=25',
  '/app/js/sgsurvey.js?v=25',
  '/app/js/results.js?v=25',
  '/app/js/profile.js?v=25',
  '/app/js/resources.js?v=25',
  '/app/js/data.js?v=25',
  '/app/js/jspdf.min.js',
  '/DiscoverMoreLogo.png',
  '/Icon_Android.jpg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network-first for everything — fall back to cache only if offline
  e.respondWith(
    fetch(e.request).then(response => {
      // Update cache with fresh response
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return response;
    }).catch(() => caches.match(e.request))
  );
});
