const CACHE_NAME = 'dm-pwa-v1';
const ASSETS = [
  '/app/',
  '/app/index.html',
  '/app/css/style.css',
  '/app/js/app.js',
  '/app/js/firebase-config.js',
  '/app/js/auth.js',
  '/app/js/dashboard.js',
  '/app/js/personality.js',
  '/app/js/sgsurvey.js',
  '/app/js/results.js',
  '/app/js/profile.js',
  '/app/js/resources.js',
  '/app/js/data.js',
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
  // Network-first for Firebase API calls, cache-first for app shell
  if (e.request.url.includes('firebasejs') || e.request.url.includes('googleapis') || e.request.url.includes('firebaseio')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  } else {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
