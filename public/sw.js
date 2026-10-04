// Cache public presentation only. Auth, orders, payments and customer links stay network-only.
const CACHE='getcan-shell-v6',META='getcan-meta';
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

// Pushes carry no payload: read the latest message stored for this device.
self.addEventListener('push',event=>{event.waitUntil((async()=>{
 let message={title:'GetCan',body:'You have an update.',url:'/commercial'};
 try{const subscription=await self.registration.pushManager.getSubscription();if(subscription){const response=await fetch('/api/commercial/push?endpoint='+encodeURIComponent(subscription.endpoint),{cache:'no-store'});if(response.ok)message=await response.json();}}catch{}
 await self.registration.showNotification(message.title,{body:message.body,icon:'/icon-192.png',badge:'/icon-192.png',tag:'getcan',renotify:true,data:{url:message.url}});
})());});
// A customer's own order page is remembered on the device so a delivery alert opens it.
self.addEventListener('message',event=>{if(event.data?.type==='customer-page'&&/^\/c\/[a-f0-9]{64}$/.test(event.data.url))event.waitUntil(caches.open(META).then(cache=>cache.put('/__customer-page',new Response(event.data.url))));});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{
 let url=event.notification.data?.url||'/commercial';
 if(url==='customer'){const saved=await (await caches.open(META)).match('/__customer-page');url=saved?await saved.text():'/';}
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 const existing=windows.find(client=>new URL(client.url).pathname===url);
 if(existing)return existing.focus();
 return self.clients.openWindow(url);
})());});
