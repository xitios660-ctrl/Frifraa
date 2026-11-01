const CACHE = 'bomba-party-v29-tv-feature-pill';
const SHELL = ['/', '/items/powerups-3d-v1.png', '/items.js', '/joystick.js', '/maps.js', '/camera.js', '/effects.js', '/skins/gustavo-walk-v1.png', '/netcode.js', '/animation.js', '/skins/mary-walk-v1.png', '/skins/kaique-walk-v1.png', '/skins/jheniffer-walk-v1.png', '/physics.js', '/styles.css', '/game.js', '/manifest.webmanifest', '/icons/party-four-v1-192.png', '/icons/party-four-v1-512.png', '/icons/party-four-v1-180.png', '/skins/mary.webp', '/skins/kaique.webp', '/skins/jheniffer.webp'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(url=>new Request(url,{cache:'reload'})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/')));
    return;
  }
  if (new URL(event.request.url).pathname === '/items.js' || new URL(event.request.url).pathname === '/joystick.js' || new URL(event.request.url).pathname === '/maps.js' || new URL(event.request.url).pathname === '/camera.js' || new URL(event.request.url).pathname === '/effects.js' || new URL(event.request.url).pathname === '/netcode.js' || new URL(event.request.url).pathname === '/animation.js' || new URL(event.request.url).pathname === '/physics.js' || new URL(event.request.url).pathname === '/game.js' || new URL(event.request.url).pathname === '/styles.css') {
    event.respondWith(fetch(event.request,{cache:'no-cache'}).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
