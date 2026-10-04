// Cache public presentation only. Auth, orders, payments and customer links stay network-only.
const CACHE='getcan-shell-v5';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/commercial','/icon-192.png','/icon-512.png'])).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim());});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 const shell=request.mode==='navigate'&&url.pathname==='/commercial'&&!url.search;
 const asset=url.pathname.startsWith('/_next/static/')||['/watercan.png','/icon-192.png','/icon-512.png','/icon-180.png'].includes(url.pathname);
 if(!shell&&!asset)return;
 event.respondWith(caches.open(CACHE).then(async cache=>{
  const cached=await cache.match(request);
  if(cached&&asset)return cached;
  const fresh=fetch(request).then(response=>{if(response.ok) return cache.put(request,response.clone()).then(()=>response);return response;});
  if(cached&&request.cache!=='reload'){event.waitUntil(fresh.catch(()=>{}));return cached;}
  return fresh;
 }));
});
