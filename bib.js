/* Reiter "Bibliotheken": alle Bibliotheken in Berlin, nächste zuerst, mit Öffnungszeiten.
   Daten: feste Liste wichtiger Bibliotheken + live aus OpenStreetMap (ganz Berlin, ohne Standort zu senden).
   Der Standort bleibt auf dem Gerät und wird nur zum Sortieren benutzt. */
(function(){
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const BHT={lat:52.5452,lon:13.3515};
const STABI="Mo-Sa 08:00-22:00; Su 10:00-18:00; PH off", HTW="Mo-Fr 10:00-21:00; Sa 12:00-18:00; PH off";
/* Kuratiert. h = geprüfte Zeiten (Quelle: Website der Bibliothek, Stand 11/2026), sonst null */
const CORE=[
 {id:"c-bht",name:"BHT Hochschulbibliothek",addr:"Luxemburger Str. 10, 13353 Berlin",lat:52.5452,lon:13.3515,h:null,web:"https://www.bht-berlin.de/bibliothek",uni:1,core:1},
 {id:"c-sbb1",name:"Staatsbibliothek · Haus Potsdamer Straße",addr:"Potsdamer Str. 33, 10785 Berlin",lat:52.5077,lon:13.3705,h:STABI,web:"https://staatsbibliothek-berlin.de/vor-ort/oeffnungszeiten",uni:1,core:1},
 {id:"c-sbb2",name:"Staatsbibliothek · Haus Unter den Linden",addr:"Unter den Linden 8, 10117 Berlin",lat:52.5178,lon:13.3925,h:STABI,web:"https://staatsbibliothek-berlin.de/vor-ort/oeffnungszeiten",uni:1,core:1},
 {id:"c-tu",name:"Universitätsbibliothek TU & UdK",addr:"Fasanenstr. 88, 10623 Berlin",lat:52.5101,lon:13.3298,h:null,web:"https://www.ub.tu-berlin.de",uni:1,core:1},
 {id:"c-hu",name:"Grimm-Zentrum (HU)",addr:"Geschwister-Scholl-Str. 1–3, 10117 Berlin",lat:52.5203,lon:13.3905,h:null,web:"https://www.ub.hu-berlin.de",uni:1,core:1},
 {id:"c-agb",name:"Amerika-Gedenkbibliothek (ZLB)",addr:"Blücherplatz 1, 10961 Berlin",lat:52.4985,lon:13.3940,h:null,web:"https://www.zlb.de",core:1},
 {id:"c-schiller",name:"Schiller-Bibliothek (Stadtbibliothek Mitte)",addr:"Müllerstr. 149, 13353 Berlin",lat:52.5486,lon:13.3527,h:null,web:"https://www.berlin.de/stadtbibliothek-mitte/",core:1},
 {id:"c-htw1",name:"HTW Bibliothek · Campus Treskowallee",addr:"Treskowallee 8, 10318 Berlin",lat:52.4929,lon:13.5254,h:HTW,web:"https://bibliothek.htw-berlin.de/ueber-uns/oeffnungszeiten",uni:1,core:1},
 {id:"c-htw2",name:"HTW Bibliothek · Campus Wilhelminenhof",addr:"Wilhelminenhofstr. 75A, 12459 Berlin",lat:52.4574,lon:13.5265,h:HTW,web:"https://bibliothek.htw-berlin.de/ueber-uns/oeffnungszeiten",uni:1,core:1},
 {id:"c-fu",name:"Philologische Bibliothek (FU)",addr:"Habelschwerdter Allee 45, 14195 Berlin",lat:52.4540,lon:13.2900,h:null,web:"https://www.fu-berlin.de/sites/ub/",uni:1,core:1},
];

/* ---------- Öffnungszeiten (OSM-Format, häufige Fälle) ---------- */
const DN=["Mo","Tu","We","Th","Fr","Sa","Su"], DL=["Mo","Di","Mi","Do","Fr","Sa","So"];
function parseOH(str){
  if(!str)return null;
  const s=str.trim();
  if(/^24\/7$/.test(s))return Array.from({length:7},()=>[[0,1440]]);
  const week=Array.from({length:7},()=>null);
  const rules=s.replace(/(\d|off|closed),\s*(?=(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)/g,"$1; ").split(/\s*(?:;|\|\|)\s*/).filter(Boolean);
  for(let r of rules){
    if(/^(PH|SH)\b/.test(r)&&!/^(PH|SH)\s*,\s*(Mo|Tu|We|Th|Fr|Sa|Su)/.test(r))continue;
    r=r.replace(/(^|,)\s*(PH|SH)\b/g,"").replace(/^,/,"").trim();
    if(!r)continue;
    const m=r.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?\s*(.*)$/);
    if(!m)return null;
    let days=[0,1,2,3,4,5,6];
    if(m[1]){days=[];for(const part of m[1].split(/\s*,\s*/)){const [a,b]=part.split(/\s*-\s*/).map(x=>DN.indexOf(x));if(b===undefined)days.push(a);else{for(let i=a;;i=(i+1)%7){days.push(i);if(i===b)break}}}}
    const rest=m[2].trim();
    if(!m[1]&&!rest)continue;
    if(/^(off|closed)$/i.test(rest)){days.forEach(d=>week[d]=[]);continue}
    if(rest==="24/7"||rest==="00:00-24:00"){days.forEach(d=>week[d]=[[0,1440]]);continue}
    const iv=[];
    for(const t of rest.split(/\s*,\s*/)){
      const x=t.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/); if(!x)return null;
      const a=+x[1]*60+ +x[2]; let b=+x[3]*60+ +x[4]; if(b<=a)b=1440; iv.push([a,Math.min(b,1440)]);
    }
    days.forEach(d=>week[d]=iv);
  }
  if(week.every(w=>w===null))return null;
  return week.map(w=>w||[]);
}
const hm=m=>m>=1440?"24:00":String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
function status(week,now=new Date()){
  if(!week)return {k:"unk",t:"Zeiten unbekannt"};
  const d=(now.getDay()+6)%7, m=now.getHours()*60+now.getMinutes();
  const cur=week[d].find(([a,b])=>a<=m&&m<b);
  if(cur){
    if(cur[1]>=1440&&week[(d+1)%7].some(([a])=>a===0)&&week.every(w=>w.some(([a,b])=>a===0&&b>=1440)))return {k:"open",t:"Rund um die Uhr geöffnet"};
    const left=cur[1]-m;
    return {k:left<=60?"soon":"open",t:(left<=60?"Schließt bald · ":"Geöffnet bis ")+hm(cur[1])};
  }
  for(let i=0;i<8;i++){
    const dd=(d+i)%7, nx=week[dd].filter(([a])=>i>0||a>m).sort((x,y)=>x[0]-y[0])[0];
    if(nx)return {k:"closed",t:"Geschlossen · öffnet "+(i===0?"heute":i===1?"morgen":DL[dd])+" "+hm(nx[0])};
  }
  return {k:"closed",t:"Geschlossen"};
}
const dayTxt=w=>w.length?w.map(([a,b])=>hm(a)+"–"+hm(b)).join(", "):"geschlossen";

/* ---------- Entfernung ---------- */
function dist(a,b){const R=6371,t=x=>x*Math.PI/180,dl=t(b.lat-a.lat),dn=t(b.lon-a.lon);const h=Math.sin(dl/2)**2+Math.cos(t(a.lat))*Math.cos(t(b.lat))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
const km=d=>d<1?Math.round(d*1000/10)*10+" m":(d<10?d.toFixed(1).replace(".",","):Math.round(d))+" km";

/* ---------- Live-Daten aus OpenStreetMap ---------- */
const KEY="sp:bib:v1", MAXAGE=7*864e5;
const Q='[out:json][timeout:40];area["name"="Berlin"]["admin_level"="4"]->.a;nwr["amenity"="library"](area.a);out center tags;';
const EPS=["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"];
const S={tried:false,pos:null,posState:"idle",live:null,liveAt:0,loading:false,err:"",filter:"alle",more:false,open:null};
try{const c=JSON.parse(localStorage.getItem(KEY)||"null");if(c&&c.items){S.live=c.items;S.liveAt=c.at}}catch(e){}
try{const p=JSON.parse(sessionStorage.getItem("sp:bib:pos")||"null");if(p){S.pos=p;S.posState="ok"}}catch(e){}
function simplify(els){
  return els.map(e=>{const t=e.tags||{},lat=e.lat??(e.center&&e.center.lat),lon=e.lon??(e.center&&e.center.lon);
    if(!t.name||lat==null)return null;
    const addr=[[t["addr:street"],t["addr:housenumber"]].filter(Boolean).join(" "),[t["addr:postcode"],t["addr:city"]||"Berlin"].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const uni=/universit|hochschul|academic|college|campus|institut|fakultät|fachbereich|staatsbibliothek|\b(tu|fu|hu|htw|bht|hwr|udk)\b/i.test(t.name+" "+(t.operator||"")+" "+(t.library||""));
    return {id:e.type[0]+e.id,name:t.name,addr,lat,lon,oh:t.opening_hours||"",web:t.website||t["contact:website"]||"",uni:uni?1:0}}).filter(Boolean);
}
async function loadLive(force){
  if(S.loading)return; if(!force&&((S.live&&Date.now()-S.liveAt<MAXAGE)||S.tried))return;
  S.tried=true;
  if(!navigator.onLine){return}
  S.loading=true;S.err="";rerender();
  for(const ep of EPS){
    try{
      const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),45000);
      const r=await fetch(ep,{method:"POST",body:"data="+encodeURIComponent(Q),headers:{"content-type":"application/x-www-form-urlencoded"},signal:ctl.signal});
      clearTimeout(to); if(!r.ok)throw new Error("HTTP "+r.status);
      const j=await r.json(); const items=simplify(j.elements||[]); if(!items.length)throw new Error("leer");
      S.live=items;S.liveAt=Date.now();try{localStorage.setItem(KEY,JSON.stringify({at:S.liveAt,items}))}catch(e){}
      S.loading=false;rerender();return;
    }catch(e){S.err=String(e.message||e)}
  }
  S.loading=false;rerender();
}
function askPos(){
  if(!navigator.geolocation){S.posState="na";return}
  S.posState="asking";
  navigator.geolocation.getCurrentPosition(p=>{S.pos={lat:p.coords.latitude,lon:p.coords.longitude};S.posState="ok";try{sessionStorage.setItem("sp:bib:pos",JSON.stringify(S.pos))}catch(e){}rerender()},
    e=>{S.posState=e.code===1?"denied":"fail";rerender()},{enableHighAccuracy:false,timeout:12000,maximumAge:300000});
}
function rerender(){if(location.hash.replace("#","")==="bibliotheken"&&window.render)window.render()}

/* Kuratierte + Live-Einträge zusammenführen (gleicher Ort ≈ gleiche Bibliothek) */
function allLibs(){
  const core=CORE.map(c=>({...c,oh:c.h||"",src:c.h?"web":""}));
  const out=[...core];
  for(const l of (S.live||[])){
    const twin=core.find(c=>dist(c,l)<0.15);
    if(twin){if(!twin.oh&&l.oh){twin.oh=l.oh;twin.src="osm"}continue}
    out.push({...l,src:l.oh?"osm":""});
  }
  return out;
}

function routeUrl(l){
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  return ios?`https://maps.apple.com/?daddr=${l.lat},${l.lon}&dirflg=r`:`https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lon}&travelmode=transit`;
}

window.vBib=function(){
  if(S.posState==="idle")setTimeout(askPos,0);
  setTimeout(()=>loadLive(false),0);
  const from=S.pos||BHT, now=new Date(), today=(now.getDay()+6)%7;
  let libs=allLibs().map(l=>{const w=parseOH(l.oh);return {...l,w,st:status(w,now),d:dist(from,l)}});
  const cnt={alle:libs.length,offen:libs.filter(l=>l.st.k==="open"||l.st.k==="soon").length,uni:libs.filter(l=>l.uni).length};
  if(S.filter==="offen")libs=libs.filter(l=>l.st.k==="open"||l.st.k==="soon");
  if(S.filter==="uni")libs=libs.filter(l=>l.uni);
  libs.sort((a,b)=>a.d-b.d);
  const shown=S.more?libs:libs.slice(0,25);
  const posTxt=S.posState==="ok"?"Sortiert nach deinem Standort":S.posState==="asking"?"Standort wird ermittelt … solange ab BHT sortiert":S.posState==="denied"?"Standort nicht freigegeben · sortiert ab BHT":"Sortiert ab BHT (Luxemburger Str.)";
  const card=(l,i)=>{
    const open=S.open===l.id;
    const todayH=l.w?dayTxt(l.w[today]):"";
    return `<li class="bib${i===0?" first":""}">
      <div class="bib-top"><span class="bib-dist">${km(l.d)}</span><span class="pill bib-st ${l.st.k}">${esc(l.st.t)}</span></div>
      <button type="button" class="bib-name" data-bibopen="${esc(l.id)}" aria-expanded="${open}">${esc(l.name)}</button>
      <div class="bib-meta">${l.addr?`<span>${esc(l.addr)}</span>`:""}${l.w?`<span>Heute ${esc(todayH)}</span>`:""}${l.uni?`<span>Uni/Hochschule</span>`:""}</div>
      ${open?`<div class="bib-week">${l.w?`<table>${DL.map((n,d)=>`<tr${d===today?' class="today"':""}><th>${n}</th><td>${esc(dayTxt(l.w[d]))}</td></tr>`).join("")}</table><p class="ann">${l.src==="web"?"Laut Website der Bibliothek (Stand 11/2026).":"Laut OpenStreetMap. Feiertage und Semesterferien können abweichen."}</p>`:`<p class="ann">${l.oh?`Zeiten: ${esc(l.oh)}`:"Für diese Bibliothek sind keine Öffnungszeiten hinterlegt."}${l.web?" Bitte auf der Website nachsehen.":""}</p>`}</div>`:""}
      <div class="btnrow bib-btns"><a class="btn small primary" href="${routeUrl(l)}" target="_blank" rel="noopener">Route</a>${l.web?`<a class="btn small" href="${esc(l.web)}" target="_blank" rel="noopener">Website</a>`:""}<button type="button" class="btn small" data-bibopen="${esc(l.id)}">${open?"Weniger":"Alle Zeiten"}</button></div>
    </li>`};
  const age=S.liveAt?Math.round((Date.now()-S.liveAt)/864e5):null;
  return `<div class="stack">
  <div><div class="eyebrow">In deiner Nähe</div><h1>Bibliotheken</h1><p class="lead">${esc(posTxt)}.</p></div>
  <div class="btnrow">${["alle","offen","uni"].map(f=>`<button class="chip" data-bibf="${f}" aria-pressed="${S.filter===f}">${f==="alle"?"Alle":f==="offen"?"Jetzt offen":"Uni &amp; Hochschule"} <small>${cnt[f]}</small></button>`).join("")}
    ${S.posState!=="ok"?`<button class="chip" data-bibpos="1">Standort verwenden</button>`:""}</div>
  ${S.loading&&!S.live?`<div class="notice">Lade alle Bibliotheken in Berlin …</div>`:""}
  ${!S.live&&!S.loading?`<div class="notice">${navigator.onLine?"Gerade nur die wichtigsten Bibliotheken.":"Offline: gerade nur die wichtigsten Bibliotheken."} Sobald du online bist, lädt die App alle Bibliotheken in Berlin und speichert sie für unterwegs.${S.err?` <button class="btn small" data-bibreload="1">Nochmal versuchen</button>`:""}</div>`:""}
  ${shown.length?`<ul class="clean bib-list">${shown.map(card).join("")}</ul>`:`<p class="empty">Gerade ist keine Bibliothek geöffnet, deren Zeiten bekannt sind.</p>`}
  ${libs.length>shown.length?`<button class="btn" data-bibmore="1">Alle ${libs.length} anzeigen</button>`:""}
  <p class="ann">Dein Standort bleibt auf dem Handy und wird nur zum Sortieren benutzt. Bibliotheksdaten: © OpenStreetMap-Mitwirkende${age!==null?` · Stand vor ${age===0?"weniger als einem Tag":age+" Tag"+(age===1?"":"en")}`:""}${S.live?` · <button class="linkbtn" data-bibreload="1">${S.loading?"lädt …":"aktualisieren"}</button>`:""}.</p>
  </div>`;
};

document.addEventListener("click",e=>{
  const t=e.target.closest("[data-bibopen],[data-bibf],[data-bibpos],[data-bibmore],[data-bibreload]"); if(!t)return;
  e.preventDefault(); e.stopPropagation();
  if(t.dataset.bibopen){S.open=S.open===t.dataset.bibopen?null:t.dataset.bibopen}
  else if(t.dataset.bibf){S.filter=t.dataset.bibf}
  else if(t.dataset.bibpos){askPos()}
  else if(t.dataset.bibmore){S.more=true}
  else if(t.dataset.bibreload){loadLive(true);return}
  rerender();
},true);
window.SPBib={parseOH,status,S,CORE};
})();
