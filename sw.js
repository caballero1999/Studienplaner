/* Service Worker: macht die App offline nutzbar und zeigt Erinnerungen im Hintergrund. */
const VERSION="sp-v6";
const SHELL=["./","index.html","store.js","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/badge-96.png","icons/apple-touch-icon.png"];
const OPTIONAL=["seed.enc.json"];

self.addEventListener("install",e=>{
  e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:"reload"}))).then(()=>Promise.all(OPTIONAL.map(u=>c.add(u).catch(()=>{}))))).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION&&k!=="sp-reminders"&&k!=="sp-fonts").map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

/* Erst aus dem Speicher, im Hintergrund aktualisieren (schnell + offline) */
self.addEventListener("fetch",e=>{
  const req=e.request; if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.hostname.endsWith("fonts.googleapis.com")||url.hostname.endsWith("fonts.gstatic.com")){
    e.respondWith(caches.open("sp-fonts").then(async c=>{const hit=await c.match(req);if(hit)return hit;const r=await fetch(req);c.put(req,r.clone());return r}));
    return;
  }
  if(url.origin!==self.location.origin)return;
  /* Immer zuerst die neueste Version aus dem Netz holen (am HTTP-Cache vorbei),
     nur ohne Netz oder bei sehr langsamem Netz die gespeicherte Version nehmen. */
  e.respondWith(caches.open(VERSION).then(async c=>{
    const key=req.mode==="navigate"?"index.html":req;
    const net=fetch(req.mode==="navigate"?new Request("index.html",{cache:"no-cache"}):new Request(req,{cache:"no-cache"}))
      .then(r=>{if(r.ok)c.put(key,r.clone());return r});
    const slow=new Promise(res=>setTimeout(res,4000));
    try{
      const r=await Promise.race([net,slow.then(()=>null)]);
      if(r)return r;
      const hit=await c.match(key,{ignoreSearch:true});
      return hit||await net;
    }catch(err){
      const hit=await c.match(key,{ignoreSearch:true});
      if(hit)return hit; throw err;
    }
  }));
});
self.addEventListener("message",e=>{if(e.data==="version"&&e.source)e.source.postMessage({type:"version",version:VERSION})});

/* Hintergrundprüfung (Android/Chrome, installierte App) */
async function checkReminders(){
  const c=await caches.open("sp-reminders");
  const r=await c.match("reminders.json"); if(!r)return;
  const st=await r.json(); if(!st.enabled)return;
  const now=Date.now(),shown=st.shown||{},newly={};
  const due=(st.plan||[]).filter(x=>x.at<=now&&now<x.until&&!shown[x.key]);
  for(const x of due.slice(-4)){
    await self.registration.showNotification(x.title,{body:x.body,tag:x.key,icon:"icons/icon-192.png",badge:"icons/badge-96.png",data:{url:"./#pruefungen"}});
  }
  due.forEach(x=>{shown[x.key]=now;newly[x.key]=now});
  st.shown=shown;
  await c.put("reminders.json",new Response(JSON.stringify(st),{headers:{"content-type":"application/json"}}));
  const cl=await self.clients.matchAll(); cl.forEach(w=>w.postMessage({type:"shown",keys:newly}));
}
self.addEventListener("periodicsync",e=>{if(e.tag==="sp-reminders")e.waitUntil(checkReminders())});

/* Vorbereitet für Phase 2: echte Push-Nachrichten vom Server */
self.addEventListener("push",e=>{
  let d={}; try{d=e.data?e.data.json():{}}catch(_){d={title:"Studienplaner",body:e.data&&e.data.text()}}
  e.waitUntil(self.registration.showNotification(d.title||"Studienplaner",{body:d.body||"",icon:"icons/icon-192.png",badge:"icons/badge-96.png",tag:d.tag,data:{url:d.url||"./"}}));
});

self.addEventListener("notificationclick",e=>{
  e.notification.close();
  const url=(e.notification.data&&e.notification.data.url)||"./";
  e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(cl=>{
    for(const w of cl){if("focus" in w){w.navigate&&w.navigate(url);return w.focus()}}
    return self.clients.openWindow(url);
  }));
});
