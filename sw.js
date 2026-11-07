// Keeps the app files so it opens without internet; refreshes them when online.
// Only same-origin GETs and the Firebase SDK files are touched: Firestore and Auth traffic never is.
// VERSION is a hash of the app files: run `npm run bump` after any change (a test checks it).
const VERSION = '7ef9fee3b566';
const CACHE = 'financas-' + VERSION;
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
  './js/logic/export.js',
  './js/logic/format.js',
  './js/logic/messages.js',
  './js/logic/route.js',
  './js/logic/signout.js',
  './js/logic/stats.js',
  './js/main.js',
  './js/pin.js',
  './js/store-firestore.js',
  './js/store-memory.js',
  './js/xlsx.js',
  './js/ui/categories.js',
  './js/ui/catsheet.js',
  './js/ui/dialog.js',
  './js/ui/dom.js',
  './js/ui/export.js',
  './js/ui/form.js',
  './js/ui/layout.js',
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

// A new version installs into its own cache and takes over on the next launch (no skipWaiting),
// so one session never mixes old and new modules.
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const fresh = url => new Request(url, { cache: 'reload' }); // bypass the HTTP cache
    await Promise.all(FILES.map(async url => {
      const res = await fetch(fresh(url));
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      await cache.put(url, res);
    }));
    // SDK files: saved when reachable; they are also saved the first time the app uses them.
    await Promise.all(SDK.map(url => cache.add(fresh(url)).catch(() => {})));
  })());
});

// claim() only lets the very first install control the page already open; later versions
// activate when no old page is left, so it cannot mix versions.
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('financas-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const ours = new URL(req.url).origin === self.location.origin;
  if (!ours && !req.url.startsWith(SDK_PREFIX)) return;
  event.respondWith(answer(event, req, ours));
});

// Cache first; only a miss goes to the network (and is then saved for next time).
async function answer(event, req, ours) {
  const cache = await caches.open(CACHE);
  const key = ours && req.mode === 'navigate' ? './index.html' : req;
  const cached = await cache.match(key, { ignoreSearch: ours });
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) event.waitUntil(cache.put(key, res.clone()).catch(() => {}));
  return res;
}
