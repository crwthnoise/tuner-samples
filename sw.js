/* THREAT service worker — caches the app shell so it opens offline after the first visit.
   Bump CACHE when you deploy a new version so phones pick it up. */
const CACHE = 'threat-v9.1';
const SHELL = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) {
    /* remote sample audio (e.g. raw.githubusercontent.com): cache after first play so it works offline */
    if (/\.(wav|mp3|m4a|aac|aif|aiff|flac|ogg|caf)$/i.test(url.pathname)) { e.respondWith(caches.match(e.request).then(m => m || fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; }))); return; }
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request))); return;
  }
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(m => m || caches.match('./index.html'))));
});
