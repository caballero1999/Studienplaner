/* Altklausuren: verschlüsselt im Repo (altk/*.bin), nur auf dem Gerät mit deinem Passwort lesbar.
   Der Schlüssel wird nach einmaliger Eingabe auf dem Gerät gespeichert (nicht auslesbar, nur zum Entschlüsseln). */
(function(){
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
function idb(){return new Promise((res,rej)=>{const r=indexedDB.open("sp-keys",1);r.onupgradeneeded=()=>r.result.createObjectStore("k");r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function kget(){try{const db=await idb();return await new Promise(res=>{const q=db.transaction("k").objectStore("k").get("altk");q.onsuccess=()=>res(q.result||null);q.onerror=()=>res(null)})}catch(e){return null}}
async function kput(v){try{const db=await idb();await new Promise(res=>{const t=db.transaction("k","readwrite");t.objectStore("k").put(v,"altk");t.oncomplete=res;t.onerror=res})}catch(e){}}
let meta=null,metaErr=false,key=null,index=null,tried=false;
async function getMeta(){
  if(meta)return meta;
  const r=await fetch("altk/meta.json",{cache:"no-cache"}); if(!r.ok){metaErr=true;throw new Error("nicht online")}
  meta=await r.json(); return meta;
}
async function derive(pw){
  const m=await getMeta();
  const base=await crypto.subtle.importKey("raw",new TextEncoder().encode(pw),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt:b64(m.salt),iterations:m.iter,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["decrypt"]);
}
async function dec(buf,k){const u=new Uint8Array(buf);return crypto.subtle.decrypt({name:"AES-GCM",iv:u.slice(0,12)},k||key,u.slice(12))}
async function fetchIndex(k){
  const r=await fetch("altk/index.bin",{cache:"no-cache"}); if(!r.ok)throw new Error("Index fehlt");
  return JSON.parse(new TextDecoder().decode(await dec(await r.arrayBuffer(),k)));
}
async function ensure(){
  if(index)return "ok";
  try{await getMeta()}catch(e){return "none"}
  if(!key&&!tried){tried=true;const s=await kget();if(s&&s.salt===meta.salt)key=s.key}
  if(!key)return "locked";
  try{index=await fetchIndex();return "ok"}catch(e){key=null;return "locked"}
}
async function unlock(pw){
  const k=await derive(pw);
  const ix=await fetchIndex(k);           // wirft bei falschem Passwort
  key=k;index=ix;await kput({key:k,salt:meta.salt});
}
function filesFor(m){
  if(!index)return [];
  const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9äöüß]/g,"");
  const e=index.find(x=>norm(x.mod)===norm(m.name)||(m.altkDir&&norm(x.dir)===norm(m.altkDir)));
  return e?e.files:[];
}
const kb=n=>n>1048576?(n/1048576).toFixed(1).replace(".",",")+" MB":Math.max(1,Math.round(n/1024))+" KB";

async function render(box,m){
  if(!box)return;
  const st=await ensure();
  if(!box.isConnected)return;
  const pc=m.altk?`${m.altk} Altklausur${m.altk===1?"":"en"} im Ordner „Altklausuren${m.altkDir?" › "+esc(m.altkDir):""}“ auf deinem PC.`:"";
  if(st==="none"){box.innerHTML=m.altk?`<p class="muted altk-note">${pc} Sie erscheinen hier, sobald sie hochgeladen sind.</p>`:`<p class="empty">Keine Altklausuren vorhanden.</p>`;return}
  if(st==="locked"){
    box.innerHTML=`<form class="altk-lock" data-altklock="1"><p class="muted altk-note">Deine Altklausuren sind verschlüsselt. Gib einmal dein App-Passwort ein, danach öffnen sie sich auf diesem Gerät direkt.</p>
      <div class="addrow"><input type="password" autocomplete="current-password" placeholder="App-Passwort" aria-label="App-Passwort" required><button class="btn primary" type="submit">Entsperren</button></div><p class="altk-err" role="alert"></p></form>`;
    box.querySelector("form").addEventListener("submit",async e=>{e.preventDefault();const f=e.target,pw=f.querySelector("input").value,er=f.querySelector(".altk-err");er.textContent="Entschlüssele …";
      try{await unlock(pw);render(box,m)}catch(x){er.textContent="Das Passwort stimmt nicht."}});
    return;
  }
  const fs=filesFor(m);
  box.innerHTML=fs.length?`<ul class="clean altk-list">${fs.map(f=>`<li><button type="button" class="altk-file" data-altkopen="${esc(f.id)}"><span class="altk-ic" aria-hidden="true">PDF</span><span class="altk-nm">${esc(f.name.replace(/\.pdf$/i,""))}</span><span class="altk-sz">${kb(f.size)}</span></button></li>`).join("")}</ul>`
    :`<p class="empty">${m.altk?pc+" In der App ist noch keine davon.":"Keine Altklausuren vorhanden."}</p>`;
  box.querySelectorAll("[data-altkopen]").forEach(b=>b.addEventListener("click",()=>openFile(fs.find(f=>f.id===b.dataset.altkopen))));
}

/* ---------- PDF-Viewer ---------- */
let pdfjs=null;
async function lib(){
  if(pdfjs)return pdfjs;
  pdfjs=await import(new URL("vendor/pdf.min.mjs",location.href).href);
  pdfjs.GlobalWorkerOptions.workerSrc=new URL("vendor/pdf.worker.min.mjs",location.href).href;
  return pdfjs;
}
async function openFile(f){
  if(!f)return;
  const v=document.createElement("div");v.className="pdfv";v.setAttribute("role","dialog");v.setAttribute("aria-modal","true");
  v.innerHTML=`<div class="pdfv-bar"><b class="pdfv-t">${esc(f.name.replace(/\.pdf$/i,""))}</b><span class="pdfv-p"></span><button class="btn small" data-pdfdl>Speichern</button><button class="btn small primary" data-pdfclose>Schließen</button></div><div class="pdfv-body"><p class="pdfv-msg">Wird entschlüsselt …</p></div>`;
  document.body.appendChild(v);document.documentElement.classList.add("noscroll");
  let url=null,doc=null,dead=false;
  const close=()=>{dead=true;v.remove();document.documentElement.classList.remove("noscroll");if(url)URL.revokeObjectURL(url);if(doc)doc.destroy();document.removeEventListener("keydown",kd)};
  const kd=e=>{if(e.key==="Escape")close()};document.addEventListener("keydown",kd);
  v.querySelector("[data-pdfclose]").addEventListener("click",close);
  const body=v.querySelector(".pdfv-body"),msg=v.querySelector(".pdfv-msg");
  try{
    const r=await fetch("altk/"+f.id+".bin"); if(!r.ok)throw new Error("Datei nicht erreichbar"+(navigator.onLine?"":" (offline und noch nie geöffnet)"));
    const pdf=new Uint8Array(await dec(await r.arrayBuffer()));
    url=URL.createObjectURL(new Blob([pdf],{type:"application/pdf"}));
    v.querySelector("[data-pdfdl]").addEventListener("click",()=>{const a=document.createElement("a");a.href=url;a.download=f.name;document.body.appendChild(a);a.click();a.remove()});
    msg.textContent="Wird geladen …";
    const L=await lib(); if(dead)return;
    doc=await L.getDocument({data:pdf.slice()}).promise; if(dead)return;
    msg.remove(); v.querySelector(".pdfv-p").textContent=doc.numPages+" Seite"+(doc.numPages===1?"":"n");
    const W=Math.min(body.clientWidth-16,1000),dpr=Math.min(window.devicePixelRatio||1,2.5);
    for(let i=1;i<=doc.numPages&&!dead;i++){
      const pg=await doc.getPage(i),vp0=pg.getViewport({scale:1}),sc=W/vp0.width,vp=pg.getViewport({scale:sc*dpr});
      const c=document.createElement("canvas");c.width=Math.floor(vp.width);c.height=Math.floor(vp.height);c.style.width=Math.floor(vp.width/dpr)+"px";c.style.height=Math.floor(vp.height/dpr)+"px";c.className="pdfv-page";
      body.appendChild(c);await pg.render({canvasContext:c.getContext("2d"),viewport:vp}).promise;
    }
  }catch(e){msg.textContent="Konnte nicht geöffnet werden: "+(e.message||e)}
}
window.SPAltk={render,unlock:pw=>unlock(pw).catch(()=>{}),openFile};
})();
