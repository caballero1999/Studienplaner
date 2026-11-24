/* Studienplaner: lokaler Speicher, Erinnerungen, Kalender-Export, Backup.
   Der Speicher bietet dieselbe Schnittstelle wie die alte Artifact-Datenbank
   (collection().onSnapshot, doc().set/update/delete), damit die App unverändert bleibt.
   Später kann hier eine Synchronisierung (z. B. Supabase) angedockt werden. */
(function(){
"use strict";
const KEY="sp:data:v1", SET_KEY="sp:settings:v1", SHOWN_KEY="sp:shown:v1";
const COLS=["modules","events","ideas","schedule"];
let data=null;
const listeners=[];

function readLS(k,def){try{const v=localStorage.getItem(k);return v?JSON.parse(v):def}catch(e){return def}}
function writeLS(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}

async function load(){
  data=readLS(KEY,null);
  if(!data){
    let seed=null;
    // 1) unverschlüsselte Startdaten (nur lokal), 2) verschlüsselte (online), 3) Sicherung
    try{const r=await fetch("seed.json",{cache:"no-cache"});if(r.ok)seed=await r.json()}catch(e){}
    if(!seed){
      let enc=null;try{const r=await fetch("seed.enc.json",{cache:"no-cache"});if(r.ok)enc=await r.json()}catch(e){}
      seed=await unlockScreen(enc);
    }
    data=seed||{};
    COLS.forEach(c=>{data[c]=data[c]||{}});
    data._meta={created:new Date().toISOString(),source:"seed"};
    persist();
  }
  COLS.forEach(c=>{data[c]=data[c]||{}});
}
const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function decrypt(enc,pw){
  const base=await crypto.subtle.importKey("raw",new TextEncoder().encode(pw),"PBKDF2",false,["deriveKey"]);
  const key=await crypto.subtle.deriveKey({name:"PBKDF2",salt:b64(enc.salt),iterations:enc.iter,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["decrypt"]);
  const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:b64(enc.iv)},key,b64(enc.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
/* Erster Start online: Passwort für die verschlüsselten Startdaten oder Sicherung laden */
function unlockScreen(enc){
  return new Promise(resolve=>{
    const show=()=>{
      const d=document.createElement("div");
      d.setAttribute("style","position:fixed;inset:0;z-index:50;background:var(--bg,#f3f5f6);display:flex;align-items:center;justify-content:center;padding:24px");
      d.innerHTML=`<form style="background:var(--panel,#fff);border:1px solid var(--line,#dde3e7);border-radius:12px;padding:22px;max-width:380px;width:100%;display:flex;flex-direction:column;gap:12px">
        <img src="icons/icon-192.png" alt="" width="56" height="56" style="border-radius:12px">
        <h2 style="margin:0">Willkommen im Studienplaner</h2>
        <p style="margin:0;color:var(--muted,#5a6772)">${enc?"Gib einmalig dein Passwort ein, damit deine Module und Termine entschlüsselt und auf diesem Gerät gespeichert werden.":"Lade eine Sicherungsdatei, um deine Daten zu übernehmen."}</p>
        ${enc?`<input type="password" id="sp-pw" autocomplete="current-password" placeholder="Passwort" style="font:inherit;font-size:16px;padding:10px;border:1px solid var(--line,#dde3e7);border-radius:8px;background:var(--bg,#f3f5f6);color:inherit">
        <button class="btn primary" type="submit">Entsperren</button>`:""}
        <p id="sp-err" role="alert" style="margin:0;color:var(--bad,#b3362c);min-height:1.2em"></p>
        <label class="btn" style="flex-direction:row;justify-content:center;color:inherit">Sicherung laden<input type="file" id="sp-file" accept="application/json,.json" hidden></label>
        <button type="button" class="btn" id="sp-empty" style="color:var(--muted,#5a6772)">Leer starten</button>
      </form>`;
      document.body.appendChild(d);
      const err=m=>d.querySelector("#sp-err").textContent=m;
      const done=v=>{d.remove();resolve(v)};
      d.querySelector("form").addEventListener("submit",async e=>{
        e.preventDefault();const pw=d.querySelector("#sp-pw").value;if(!pw)return;err("Entschlüssele …");
        try{done(await decrypt(enc,pw))}catch(x){err("Das Passwort stimmt nicht.")}
      });
      d.querySelector("#sp-file").addEventListener("change",async e=>{
        const f=e.target.files[0];if(!f)return;
        try{const v=JSON.parse(await f.text());if(!v.modules)throw 0;done(v)}catch(x){err("Die Datei ist keine gültige Sicherung.")}
      });
      d.querySelector("#sp-empty").addEventListener("click",()=>done({}));
      const pw=d.querySelector("#sp-pw");if(pw)pw.focus();
    };
    if(document.body)show();else document.addEventListener("DOMContentLoaded",show);
  });
}
function persist(){
  data._meta=Object.assign({},data._meta,{updated:new Date().toISOString()});
  if(!writeLS(KEY,data)) console.warn("Speichern im Browser fehlgeschlagen");
  try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
}
function emit(){listeners.forEach(l=>{try{l()}catch(e){console.error(e)}});Reminders.refresh()}
window.addEventListener("storage",e=>{if(e.key===KEY){data=readLS(KEY,data);emit()}});

function snap(col){
  const docs=Object.keys(data[col]||{}).map(id=>({id,data:()=>JSON.parse(JSON.stringify(data[col][id]))}));
  return {docs,metadata:{fromCache:false}};
}
function split(path){const [c,id]=path.split("/");return {c,id}}

const LocalDB={
  ready:null,
  collection(c){return{onSnapshot(cb){const f=()=>cb(snap(c));listeners.push(f);LocalDB.ready.then(f);return()=>{}}}},
  doc(path){
    const {c,id}=split(path);
    return{
      onSnapshot(cb){const f=()=>{const v=data[c]&&data[c][id];cb({exists:!!v,data:()=>v?JSON.parse(JSON.stringify(v)):undefined})};listeners.push(f);LocalDB.ready.then(f);return()=>{}},
      async set(body){data[c]=data[c]||{};data[c][id]=JSON.parse(JSON.stringify(body));persist();emit()},
      async update(patch){data[c]=data[c]||{};data[c][id]=Object.assign({},data[c][id],JSON.parse(JSON.stringify(patch)));persist();emit()},
      async delete(){if(data[c])delete data[c][id];persist();emit()}
    };
  },
  exportJSON(){return JSON.stringify(data,null,1)},
  importJSON(text){const d=JSON.parse(text);if(!d||typeof d!=="object"||!d.modules)throw new Error("Keine gültige Sicherung");data=d;COLS.forEach(c=>{data[c]=data[c]||{}});persist();emit()},
  events(){return Object.keys(data.events||{}).map(id=>Object.assign({id},data.events[id]))},
  meta(){return data._meta||{}}
};
LocalDB.ready=load();
window.LocalDB=LocalDB;

/* ---------------- Erinnerungen ----------------
   Was funktioniert ohne Server:
   - Solange die App offen ist oder geöffnet wird, kommen fällige Erinnerungen als Mitteilung.
   - Android/Chrome (installiert): Hintergrundprüfung ca. einmal täglich (Periodic Background Sync).
   - Zuverlässig auf jedem Handy: Termine mit Wecker in den Handy-Kalender übernehmen (.ics).
   Echte Push-Nachrichten bei geschlossener App auf dem iPhone brauchen einen kleinen Server (Phase 2). */
const DEF_SET={enabled:false,leads:[7,1,0],types:["Klausur","Abgabe"],hour:8};
const Reminders={
  settings(){return Object.assign({},DEF_SET,readLS(SET_KEY,{}))},
  save(s){writeLS(SET_KEY,s);this.refresh()},
  supported(){return "Notification" in window&&"serviceWorker" in navigator},
  permission(){return "Notification" in window?Notification.permission:"unsupported"},
  async enable(){
    if(!("Notification" in window))return "unsupported";
    const p=await Notification.requestPermission();
    if(p==="granted"){const s=this.settings();s.enabled=true;this.save(s);await this.registerPeriodic();this.check()}
    return p;
  },
  disable(){const s=this.settings();s.enabled=false;this.save(s)},
  /* Alle geplanten Erinnerungen (Zeitpunkt, Titel, Text) */
  plan(){
    const s=this.settings(),out=[];
    LocalDB.events().forEach(e=>{
      if(!e.date||!s.types.includes(e.type))return;
      const [y,m,d]=e.date.split("-").map(Number);
      const [hh,mm]=(e.time||"").split(":").map(Number);
      const start=new Date(y,m-1,d,isNaN(hh)?9:hh,isNaN(mm)?0:mm);
      s.leads.forEach(lead=>{
        let at;
        if(lead===0) at=e.time?new Date(start.getTime()-2*3600e3):new Date(y,m-1,d,Math.min(s.hour,7),0);
        else at=new Date(y,m-1,d-lead,s.hour,0);
        const when=lead===0?(e.time?"heute um "+e.time+" Uhr":"heute"):lead===1?"morgen":"in "+lead+" Tagen";
        out.push({key:e.id+"@"+lead+"@"+e.date+(e.time||""),at:at.getTime(),until:start.getTime()+3600e3,
          title:e.type+" "+when,body:e.title+(e.place?" · "+e.place:"")+(e.assumed?" (Datum unsicher)":""),tag:e.id});
      });
    });
    return out.sort((a,b)=>a.at-b.at);
  },
  upcoming(n){const now=Date.now();return this.plan().filter(r=>r.at>now).slice(0,n||5)},
  async check(){
    const s=this.settings(); if(!s.enabled||this.permission()!=="granted")return;
    const shown=readLS(SHOWN_KEY,{}),now=Date.now();
    const due=this.plan().filter(r=>r.at<=now&&now<r.until&&!shown[r.key]);
    if(!due.length)return;
    const reg=await navigator.serviceWorker.ready;
    for(const r of due.slice(-4)){ // höchstens 4 auf einmal
      await reg.showNotification(r.title,{body:r.body,tag:r.key,icon:"icons/icon-192.png",badge:"icons/badge-96.png",data:{url:"./#pruefungen"}});
    }
    due.forEach(r=>shown[r.key]=now); writeLS(SHOWN_KEY,shown); this.mirror();
  },
  /* Plan für den Service Worker ablegen (der kann localStorage nicht lesen) */
  async mirror(){
    try{
      const c=await caches.open("sp-reminders");
      const s=this.settings();
      await c.put("reminders.json",new Response(JSON.stringify({enabled:s.enabled,plan:this.plan(),shown:readLS(SHOWN_KEY,{})}),{headers:{"content-type":"application/json"}}));
    }catch(e){}
  },
  async registerPeriodic(){
    try{
      const reg=await navigator.serviceWorker.ready;
      if(!("periodicSync" in reg))return false;
      const st=await navigator.permissions.query({name:"periodic-background-sync"});
      if(st.state!=="granted")return false;
      await reg.periodicSync.register("sp-reminders",{minInterval:12*3600e3});
      return true;
    }catch(e){return false}
  },
  async test(){
    if(this.permission()!=="granted"){const p=await this.enable();if(p!=="granted")return p}
    const reg=await navigator.serviceWorker.ready;
    await reg.showNotification("So sehen Erinnerungen aus",{body:"Klausur in 7 Tagen · Beispiel",icon:"icons/icon-192.png",badge:"icons/badge-96.png",tag:"test"});
    return "granted";
  },
  refresh(){this.mirror();this.check()}
};
window.Reminders=Reminders;

/* Shown-Liste mit dem Service Worker abgleichen */
if("serviceWorker" in navigator){
  navigator.serviceWorker.addEventListener("message",e=>{
    if(e.data&&e.data.type==="shown"){const s=readLS(SHOWN_KEY,{});Object.assign(s,e.data.keys);writeLS(SHOWN_KEY,s)}
  });
}
document.addEventListener("visibilitychange",()=>{if(!document.hidden)Reminders.check()});
setInterval(()=>Reminders.check(),10*60e3);
LocalDB.ready.then(()=>Reminders.refresh());

/* ---------------- Kalender-Export (.ics) mit Weckern ---------------- */
function icsEsc(s){return String(s||"").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/([,;])/g,"\\$1")}
function fold(l){const o=[];while(l.length>74){o.push(l.slice(0,74));l=" "+l.slice(74)}o.push(l);return o.join("\r\n")}
function ics(types){
  const s=Reminders.settings(),now=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"");
  const L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Studienplaner//DE","CALSCALE:GREGORIAN","X-WR-CALNAME:Studienplaner"];
  LocalDB.events().filter(e=>e.date&&(!types||types.includes(e.type))).forEach(e=>{
    const d=e.date.replace(/-/g,"");
    L.push("BEGIN:VEVENT","UID:"+e.id+"@studienplaner","DTSTAMP:"+now);
    if(e.time){
      const [h,m]=e.time.split(":");const st=d+"T"+h.padStart(2,"0")+m.padStart(2,"0")+"00";
      const en=new Date(+d.slice(0,4),+d.slice(4,6)-1,+d.slice(6),+h+2,+m);
      const ens=en.getFullYear()+String(en.getMonth()+1).padStart(2,"0")+String(en.getDate()).padStart(2,"0")+"T"+String(en.getHours()).padStart(2,"0")+String(en.getMinutes()).padStart(2,"0")+"00";
      L.push("DTSTART;TZID=Europe/Berlin:"+st,"DTEND;TZID=Europe/Berlin:"+ens);
    }else{
      const endD=e.end&&e.end>e.date?e.end:e.date;const x=new Date(+endD.slice(0,4),+endD.slice(5,7)-1,+endD.slice(8,10)+1);
      L.push("DTSTART;VALUE=DATE:"+d,"DTEND;VALUE=DATE:"+x.getFullYear()+String(x.getMonth()+1).padStart(2,"0")+String(x.getDate()).padStart(2,"0"));
    }
    L.push("SUMMARY:"+icsEsc(e.title));
    if(e.place)L.push("LOCATION:"+icsEsc(e.place));
    const desc=[e.notes,e.assumed?"Unsicher: "+e.assumed:""].filter(Boolean).join("\n");
    if(desc)L.push("DESCRIPTION:"+icsEsc(desc));
    if(e.type==="Klausur"||e.type==="Abgabe"){
      s.leads.forEach(lead=>{
        const trig=lead===0?(e.time?"-PT2H":"PT8H"):e.time?"-P"+lead+"D":"-P"+(lead-1)+"DT"+(24-s.hour)+"H";
        L.push("BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:"+icsEsc(e.title),"TRIGGER:"+trig,"END:VALARM");
      });
    }
    L.push("END:VEVENT");
  });
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n");
}
function download(name,text,type){
  const b=new Blob([text],{type});const u=URL.createObjectURL(b);const a=document.createElement("a");
  a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(u);a.remove()},1000);
}
window.SPTools={
  exportICS(types){download("studienplaner-termine.ics",ics(types),"text/calendar")},
  exportBackup(){download("studienplaner-sicherung-"+new Date().toISOString().slice(0,10)+".json",LocalDB.exportJSON(),"application/json")},
  importBackup(file){return file.text().then(t=>LocalDB.importJSON(t))},
  ics
};

/* ---------------- Installation ---------------- */
let deferredPrompt=null;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;document.dispatchEvent(new Event("sp:installable"))});
window.SPInstall={
  canPrompt:()=>!!deferredPrompt,
  async prompt(){if(!deferredPrompt)return false;deferredPrompt.prompt();const r=await deferredPrompt.userChoice;deferredPrompt=null;return r.outcome==="accepted"},
  standalone:()=>matchMedia("(display-mode: standalone)").matches||navigator.standalone===true,
  ios:()=>/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)
};
if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(e=>console.warn("SW",e)))}
})();
