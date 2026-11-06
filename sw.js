// Keeps the app files so it opens without internet; refreshes them when online.
// Only same-origin GETs and the Firebase SDK files are touched: Firestore and Auth traffic never is.
const CACHE = 'financas-v1';
const FILES = [
  './index.html',
  './css/app.css',
  './icons/icon-180.png',
  './icons/icon-512.png',
  './js/account.js',
  './js/backup.js',
  './js/demo-data.js',
  './js/device-state.js',
  './js/firebase.js',
  './js/logic/categories.js',
  './js/logic/format.js',
  './js/logic/messages.js',
  './js/logic/route.js',
  './js/logic/stats.js',
  './js/main.js',
  './js/pin.js',
  './js/store-firestore.js',
  './js/store-memory.js',
  './js/ui/categories.js',
  './js/ui/catsheet.js',
  './js/ui/dialog.js',
  './js/ui/dom.js',
  './js/ui/form.js',
  './js/ui/lock.js',
  './js/ui/login.js',
  './js/ui/month.js',
  './js/ui/pinpad.js',
  './js/ui/profiles.js',
  './js/ui/year.js',
  './manifest.webmanifest',
];
const SDK = [
  'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js',
];
const SDK_PREFIX = 'https://www.gstatic.com/firebasejs/13.2.0/';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES);
    // SDK files: saved when reachable; they are also saved the first time the app uses them.
    await Promise.all(SDK.map(url => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const ours = url.origin === self.location.origin;
  if (!ours && !req.url.startsWith(SDK_PREFIX)) return;
  event.respondWith(answer(event, req, ours));
});

async function answer(event, req, ours) {
  const cache = await caches.open(CACHE);
  const key = ours && req.mode === 'navigate' ? './index.html' : req;
  const cached = await cache.match(key, { ignoreSearch: ours });
  const refresh = fetch(req).then(res => {
    if (res.ok) cache.put(key, res.clone());
    return res;
  });
  if (cached) {
    event.waitUntil(refresh.catch(() => {}));
    return cached;
  }
  return refresh;
}
