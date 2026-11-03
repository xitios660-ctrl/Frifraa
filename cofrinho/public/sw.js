const CACHE_NAME='cofrinho-party-shell-v4-secure-wallet';
const SHELL=['/wallet.js','/wallet.css','/items.js','/items/powerups-3d-v1.png','/','/index.html','/styles.css','/app.js','/icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name!==CACHE_NAME).map(name=>caches.delete(name)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET'||new URL(req.url).pathname.startsWith('/api/'))return;
  if(req.mode==='navigate'){event.respondWith(fetch(req).catch(()=>caches.match('/index.html')));return;}
  event.respondWith(caches.match(req).then(hit=>hit||fetch(req)));
});
