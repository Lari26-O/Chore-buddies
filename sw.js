// Chore Buddies offline helper: the app page always tries the network first (so updates show up),
// and voice clips and icons are kept on the phone after the first time they are used.
const CACHE = 'chore-buddies-v12';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html', './manifest.webmanifest', './icon-192.png', './voice/manifest.json']).catch(() => {}))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const fresh = e.request.mode === 'navigate' || u.pathname.endsWith('.html') || u.pathname.endsWith('/voice/manifest.json');
  if (fresh){
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
  } else {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok){ const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })));
  }
});
