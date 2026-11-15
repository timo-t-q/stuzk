"use strict";
/* ====== Supabase (Settings → API). Publishable key je verejný, service_role sem NIKDY nedávaj. ====== */
const SUPABASE_URL = "https://xpkooenqnehepvcktful.supabase.co";
const SUPABASE_KEY = "sb_publishable_ubzHQp9SnacJ9E9xkbxuow_jGKBYYy9";

/* Stránky: index.html = diváci (view), tv.html = telka (tv), buzzer.html = bzučiak, admin.html = moderátor */
const PAGE = window.PAGE || "view";
const DEMO = /[?&]demo=1/.test(location.search) || !(SUPABASE_URL && SUPABASE_KEY);

/* ---------- vzorové otázky (body sú vymyslené, nahraďte vlastným prieskumom) ---------- */
const SAMPLE=[
 {q:"Čo študent najčastejšie povie, keď príde neskoro na hodinu?",answers:[{t:"Zaspal som",p:34},{t:"Meškal autobus",p:27},{t:"Bol som u lekára",p:15},{t:"Bola zápcha",p:10},{t:"Nezvonil mi budík",p:8},{t:"Zabudol som",p:6}]},
 {q:"Čo rodičia najčastejšie hovoria ráno pred školou?",answers:[{t:"Vstávaj!",p:38},{t:"Máš desiatu?",p:22},{t:"Obleč sa teplo",p:16},{t:"Zmeškáš autobus",p:13},{t:"Uč sa",p:7},{t:"Odlož mobil",p:4}]},
 {q:"Čo nesmie chýbať na stužkovej?",answers:[{t:"Stužky",p:30},{t:"Hudba",p:22},{t:"Jedlo",p:17},{t:"Tanec",p:14},{t:"Príhovor",p:9},{t:"Fotograf",p:8}]},
 {q:"Na čo sa študenti vyhovárajú, keď nemajú úlohu?",answers:[{t:"Zabudol som zošit doma",p:35},{t:"Nevedel som o nej",p:24},{t:"Nebol som v škole",p:17},{t:"Nešiel internet",p:12},{t:"Zjedol ju pes",p:7},{t:"Bol som chorý",p:5}]},
 {q:"Čo robí študent namiesto učenia na maturitu?",answers:[{t:"Je na mobile",p:36},{t:"Spí",p:21},{t:"Pozerá seriály",p:16},{t:"Hrá hry",p:13},{t:"Upratuje izbu",p:8},{t:"Je",p:6}]},
 {q:"Čo si rodičia myslia, že ich dieťa robí na počítači?",answers:[{t:"Učí sa",p:29},{t:"Hrá hry",p:27},{t:"Je na sociálnych sieťach",p:18},{t:"Pozerá videá",p:14},{t:"Programuje",p:12}]}
];
const DEF={v:0,theme:"classic",names:{a:"Tím A",b:"Tím B"},scores:{a:0,b:0},qi:0,revealed:[],strikes:0,mult:1,awarded:null,awardedPts:0,showQ:true,fx:{n:0,t:"",k:0}};
const clone=o=>JSON.parse(JSON.stringify(o));
const norm=s=>{const d=clone(DEF),x=s||{};return {...d,...x,names:{...d.names,...x.names},scores:{...d.scores,...x.scores},fx:{...d.fx,...x.fx},revealed:Array.isArray(x.revealed)?x.revealed:[]}};
const esc=t=>String(t??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const store=(st)=>({get:k=>{try{return st().getItem(k)}catch(e){return null}},set:(k,v)=>{try{st().setItem(k,v)}catch(e){}},del:k=>{try{st().removeItem(k)}catch(e){}}});
const LS=store(()=>localStorage),SS=store(()=>sessionStorage);

/* ---------- stav ---------- */
let row={state:clone(DEF),questions:[],buzz_armed:false,buzz_winner:null};
let ready=false,online=false,pending=0,gen=0;
const ui={tab:"game",draft:null,fresh:new Set(),strike:0,buzz:null,audio:false,localTheme:null,pinInput:"",passInput:"",pin:"",busy:false};
let adminPass=SS.get("pp-admin")||"",adminOk=false;
let bz=null; try{bz=JSON.parse(LS.get("pp-bz")||"null")}catch(e){}
const S=()=>norm(row.state);
const QS=()=>Array.isArray(row.questions)?row.questions:[];
const Q=()=>{const q=QS();return q.length?q[Math.min(S().qi,q.length-1)]:null};
const QI=()=>Math.min(S().qi,Math.max(0,QS().length-1));
const bank=s=>{const q=Q();if(!q||s.awarded)return 0;return s.revealed.reduce((n,i)=>n+(+q.answers[i]?.p||0),0)*s.mult};
const theme=()=>(ui.localTheme||S().theme)==="cisco"?"cisco":"classic";

function emit(prev){ if(norm(prev.state).theme!==S().theme) ui.localTheme=null; if(ready) effects(prev); render(); }
function apply(inc){
  const prev=row,next={...row};
  if(inc.state && (inc.state.v||0)>=(row.state.v||0)) next.state=inc.state;
  if(Array.isArray(inc.questions)) next.questions=inc.questions;
  if("buzz_armed" in inc) next.buzz_armed=!!inc.buzz_armed;
  if("buzz_winner" in inc) next.buzz_winner=inc.buzz_winner||null;
  row=next; emit(prev);
}
function patch(obj){ gen++; const prev=row; row={...row,...obj}; emit(prev); backend.write(obj); }
function setState(fn,extra){ const s=S(); fn(s); s.v=(s.v||0)+1; patch({state:s,...(extra||{})}); }

const toastEl=document.createElement("div"); toastEl.className="toast"; toastEl.setAttribute("role","status"); toastEl.hidden=true; document.body.appendChild(toastEl);
let toastT; function toast(m){ toastEl.textContent=m; toastEl.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>{toastEl.hidden=true},3500); }
function adminOut(msg){ adminOk=false; adminPass=""; SS.del("pp-admin"); if(msg) toast(msg); render(true); }
function bzOut(msg){ bz=null; LS.del("pp-bz"); ui.pinInput=""; if(msg) toast(msg); render(true); }

/* ---------- pripojenie ---------- */
let backend;
if(!DEMO && window.supabase){
  const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  let chain=Promise.resolve();
  const load=async()=>{
    const g=gen;
    const {data,error}=await sb.from("game").select("*").eq("id",1).maybeSingle();
    if(error||!data){ if(!ready) toast(error?"Nepodarilo sa načítať hru zo Supabase":"V tabuľke game chýba riadok, spusti supabase.sql"); return; }
    if(g!==gen||pending>0) return;
    apply(data); ready=true;
  };
  backend={
    write(obj){ pending++; chain=chain.then(()=>sb.rpc("admin_write",{pass:adminPass,patch:obj}))
      .then(r=>{ if(r.error) throw r.error; if(r.data===false) adminOut("Heslo moderátora už neplatí"); })
      .catch(()=>toast("Zmena sa neuložila, skontroluj internet")).finally(()=>{pending--}); },
    async login(pass){ const {data,error}=await sb.rpc("admin_login",{pass}); if(error) throw error; return data; },
    async checkPin(p){ const {data,error}=await sb.rpc("check_pin",{p}); if(error) throw error; return !!data; },
    async buzz(p,team){ const {data,error}=await sb.rpc("buzz",{p,team}); return error?"err":data; }
  };
  sb.channel("game").on("postgres_changes",{event:"UPDATE",schema:"public",table:"game"},p=>{ if(pending===0&&ready) apply(p.new||{}); })
    .subscribe(st=>{ online=st==="SUBSCRIBED"; if(online) load(); render(); });
  load(); setInterval(load,4000);
}else{
  let bc=null; try{bc=new BroadcastChannel("pp-demo")}catch(e){}
  try{const saved=JSON.parse(LS.get("pp-demo")||"null"); if(saved&&saved.state) row=saved;}catch(e){}
  if(!QS().length) row.questions=clone(SAMPLE);
  const push=()=>{ LS.set("pp-demo",JSON.stringify(row)); if(bc) bc.postMessage(row); };
  if(bc) bc.onmessage=e=>{ const prev=row; row=e.data; emit(prev); };
  backend={
    write(obj){ if("pin" in obj) LS.set("pp-demo-pin",obj.pin); push(); },
    async login(pass){ return pass?{ok:true,pin:LS.get("pp-demo-pin")||""}:null; },
    async checkPin(p){ return !!p&&p===LS.get("pp-demo-pin"); },
    async buzz(p,team){ if(!p||p!==LS.get("pp-demo-pin")) return "pin"; if(row.buzz_armed&&!row.buzz_winner){ const prev=row; row={...row,buzz_winner:team}; emit(prev); push(); return "ok"; } return "late"; }
  };
  ready=true;
  if(!DEMO) toast("Nepodarilo sa načítať knižnicu Supabase, skontroluj internet");
}

/* ---------- zvuky (len telka) ---------- */
let ac=null;
function tone(f,t0,d,type,g){ const o=ac.createOscillator(),G=ac.createGain(),t=ac.currentTime+t0; o.type=type||"sine"; o.frequency.value=f;
  G.gain.setValueAtTime(g||.2,t); G.gain.exponentialRampToValueAtTime(.001,t+d); o.connect(G).connect(ac.destination); o.start(t); o.stop(t+d+.05); }
const sfx={ ding(){tone(880,0,.2);tone(1320,.13,.6)}, strike(){tone(140,0,.8,"sawtooth",.35);tone(147,0,.8,"square",.18)},
  buzz(){tone(520,0,.13,"square",.22);tone(780,.14,.4,"square",.22)}, win(){[523,659,784,1047].forEach((f,i)=>tone(f,i*.11,.35,"triangle",.25))} };
const play=n=>{ if(ac&&PAGE==="tv") try{sfx[n]()}catch(e){} };

function effects(p){
  const a=norm(p.state),b=S();
  if(PAGE==="tv"||PAGE==="view"){
    if(a.qi===b.qi){ const fresh=b.revealed.filter(i=>!a.revealed.includes(i));
      if(fresh.length){ fresh.forEach(i=>ui.fresh.add(i)); play("ding"); setTimeout(()=>fresh.forEach(i=>ui.fresh.delete(i)),700); } }
    if(b.fx.n!==a.fx.n&&b.fx.t==="strike"){ ui.strike=b.fx.k||1; play("strike"); clearTimeout(ui.t1); ui.t1=setTimeout(()=>{ui.strike=0;render()},1500); }
    if(!p.buzz_winner&&row.buzz_winner){ ui.buzz=row.buzz_winner; play("buzz"); clearTimeout(ui.t2); ui.t2=setTimeout(()=>{ui.buzz=null;render()},2300); }
    if(!a.awarded&&b.awarded) play("win");
  }
  if(PAGE==="buzzer"&&bz&&!p.buzz_winner&&row.buzz_winner===bz.team){ try{navigator.vibrate&&navigator.vibrate(250)}catch(e){} }
}

/* ---------- vykreslenie ---------- */
const app=document.getElementById("app");
const conn=()=>DEMO?`<span><i class="dot demo"></i>Demo režim</span>`:`<span><i class="dot ${online?"on":""}"></i>${online?"Pripojené":"Odpojené"}</span>`;
const themes=()=>{const t=theme();return `<div class="themes" role="group" aria-label="Vzhľad"><button data-act="theme" data-v="classic" class="${t==="classic"?"on":""}">Klasika</button><button data-act="theme" data-v="cisco" class="${t==="cisco"?"on":""}">Cisco</button></div>`};

function tvHTML(){
  const s=S(),q=Q(),cis=theme()==="cisco",n=QS().length,rev=new Set(s.revealed);
  const team=t=>`<aside class="team ${t} ${row.buzz_winner===t?"buzzed":""} ${s.awarded===t?"won":""}"><div class="tname">${esc(s.names[t])}</div><div class="score">${s.scores[t]}</div>${cis?`<div class="ports">${"<i></i>".repeat(8)}</div><div class="tstat">${row.buzz_winner===t?"line protocol is up":"notconnect"}</div>`:""}</aside>`;
  let main;
  if(!q){ main=`<div class="empty">Hra sa ešte nezačala.</div>`; }
  else{
    const len=q.answers.length;
    const tiles=q.answers.map((a,i)=>{ const on=rev.has(i);
      return `<li class="tile ${on?"on":""} ${ui.fresh.has(i)?"fresh":""}"><span class="num">${cis?"Gi0/"+(i+1):i+1}</span>${on?`<span class="txt">${esc(a.t)}</span><span class="pts">${esc(a.p)}</span>`:(cis?`<span class="txt hid">down</span>`:"")}${cis?`<i class="led"></i>`:""}</li>`; }).join("");
    const qt=s.showQ?esc(q.q):(cis?"********":"Otázka príde o chvíľu");
    main=`<div class="question">${cis?`<span class="prompt">stuzkova#</span>`:""}<span>${qt}</span></div>
      <div class="bank"><span>${cis?"bank":"Banka"}</span><b>${bank(s)}</b>${s.mult>1?`<em>×${s.mult}</em>`:""}</div>
      <div class="frame"><ol class="board ${len<=4?"one":""}" style="--rows:${len<=4?len:Math.ceil(len/2)}">${tiles}</ol></div>
      <div class="strikes" aria-label="Chyby: ${s.strikes} z 3">${[0,1,2].map(i=>`<span class="${i<s.strikes?"on":""}">✕</span>`).join("")}</div>`;
  }
  const bn=ui.buzz?esc(s.names[ui.buzz]):"";
  const tools=PAGE==="tv"?`${ui.audio?"":`<button class="snd" data-act="sound">Zapnúť zvuk</button>`}<button data-act="full">Celá obrazovka</button>`:"";
  return `<div class="tv ${PAGE}">
    <header class="bar">${n?`<span>Otázka ${QI()+1} z ${n}</span>`:""}${conn()}${tools}</header>
    ${team("a")}<main>${main}</main>${team("b")}
    ${ui.buzz?`<div class="banner ${ui.buzz}">${cis?`%LINK-3-UPDOWN: ${bn}, changed state to up`:`Prvý bzučiak: ${bn}`}</div>`:""}
    ${ui.strike?`<div class="flash">${"<span>✕</span>".repeat(ui.strike)}${cis?"<p>% Invalid input detected</p>":""}</div>`:""}
  </div>`;
}

function buzzerHTML(){
  const s=S();
  if(!bz) return `<div class="login"><h1>Bzučiak</h1><p>Zadaj PIN od moderátora a vyber svoj tím.</p>
    <input class="pin" data-in="pinInput" value="${esc(ui.pinInput)}" inputmode="numeric" maxlength="5" autocomplete="off" placeholder="•••••" aria-label="PIN, 5 číslic">
    <button class="btn ta" data-act="join" data-v="a" ${ui.busy?"disabled":""}>${esc(s.names.a)}</button>
    <button class="btn tb" data-act="join" data-v="b" ${ui.busy?"disabled":""}>${esc(s.names.b)}</button>
    <p>${conn()}</p></div>`;
  const t=bz.team,w=row.buzz_winner,st=w?(w===t?"won":"lost"):(row.buzz_armed?"armed":"locked");
  const msg={won:"Ste prví!",lost:"Prvý bol súper",armed:"Stlač!",locked:"Čakaj na moderátora"}[st];
  return `<div class="buz ${t} ${st}"><div class="bname">${esc(s.names[t])}</div>
    <button class="big" data-buzz="${t}" aria-live="polite">${msg}</button>
    <small>${conn()}</small><button class="back" data-act="leave">Odhlásiť bzučiak</button></div>`;
}

function adminHTML(){
  if(!adminOk) return `<div class="login"><h1>Moderátor</h1><p>Zadaj heslo moderátora.</p>
    <input type="password" data-in="passInput" value="${esc(ui.passInput)}" autocomplete="current-password" aria-label="Heslo moderátora">
    <button class="btn pri" data-act="login" ${ui.busy?"disabled":""}>Prihlásiť</button><p>${conn()}</p></div>`;
  const s=S(),q=Q(),n=QS().length,w=row.buzz_winner;
  const tabs=`<nav class="tabs">${[["game","Hra"],["q","Otázky"],["set","Nastavenia"]].map(([k,l])=>`<button data-act="tab" data-v="${k}" class="${ui.tab===k?"on":""}">${l}</button>`).join("")}</nav>`;
  const pinCard=`<div class="card"><h2>PIN pre bzučiaky</h2>${ui.pin?`<div class="pinbig">${esc(ui.pin)}</div><p>Tento PIN zadajú hráči na stránke bzučiaka. Nový PIN odhlási telefóny so starým.</p>`:`<p>PIN ešte nie je vygenerovaný, bez neho sa bzučiaky neprihlásia.</p>`}
    <button class="btn ${ui.pin?"":"pri"}" data-act="newpin">${ui.pin?"Vygenerovať nový PIN":"Vygenerovať PIN"}</button></div>`;
  let body="";
  if(ui.tab==="game"){
    if(!q) body=pinCard+`<div class="card"><p>Zatiaľ tu nie sú žiadne otázky.</p><button class="btn pri" data-act="seed">Načítať vzorové otázky</button><button class="btn" data-act="tab" data-v="q">Napísať vlastné</button></div>`;
    else{
      const rev=new Set(s.revealed),bk=bank(s);
      body=`${ui.pin?"":pinCard}
      <div class="card"><div class="row"><button class="btn" data-act="prev" ${QI()===0?"disabled":""}>‹ Späť</button><span class="grow" style="text-align:center">Otázka ${QI()+1} z ${n}</span><button class="btn pri" data-act="next" ${QI()>=n-1?"disabled":""}>Ďalšia ›</button></div>
        <p class="qtext">${esc(q.q)}</p>
        <div class="row"><button class="btn grow" data-act="showq">${s.showQ?"Skryť otázku na telke":"Ukázať otázku na telke"}</button><button class="btn" data-act="mult">Body ×${s.mult}</button></div></div>
      <div class="card"><h2>Bzučiak${ui.pin?` (PIN ${esc(ui.pin)})`:""}</h2>
        <p class="status ${w||""}">${w?`Prvý bol: ${esc(s.names[w])}`:(row.buzz_armed?"Odomknutý, čaká sa na stlačenie":"Zamknutý")}</p>
        <div class="row"><button class="btn pri grow" data-act="arm">${w||row.buzz_armed?"Odomknúť znova":"Odomknúť bzučiak"}</button><button class="btn" data-act="lock">Zamknúť</button></div>
        <div class="row"><span>Ručne:</span><button class="btn ta grow" data-act="manual" data-v="a">${esc(s.names.a)}</button><button class="btn tb grow" data-act="manual" data-v="b">${esc(s.names.b)}</button></div></div>
      <div class="card"><h2>Odpovede (ťukni a odkryje sa na telke)</h2>
        ${q.answers.map((a,i)=>`<button class="btn ans ${rev.has(i)?"on":""}" data-act="reveal" data-v="${i}"><span>${i+1}. ${esc(a.t)}</span><b>${esc(a.p)}</b></button>`).join("")}</div>
      <div class="card"><h2>Chyby: ${s.strikes} z 3</h2>
        <div class="row"><button class="btn bad grow" data-act="strike">✕ Chyba</button><button class="btn" data-act="wrong">✕ bez počítania</button><button class="btn" data-act="clear">Zmazať</button></div></div>
      <div class="card"><h2>Banka: ${bk} bodov</h2>
        ${s.awarded?`<p>Pripísané: ${esc(s.names[s.awarded])} (+${s.awardedPts})</p><div class="row"><button class="btn grow" data-act="undo">Vrátiť späť</button><button class="btn grow" data-act="all">Odkryť zvyšné odpovede</button></div>`
        :`<div class="row"><button class="btn ta grow" data-act="award" data-v="a">Body pre: ${esc(s.names.a)}</button><button class="btn tb grow" data-act="award" data-v="b">Body pre: ${esc(s.names.b)}</button></div>`}
        <div class="row" style="justify-content:space-between"><span class="sc" style="color:var(--a)">${esc(s.names.a)} ${s.scores.a}</span><span class="sc" style="color:var(--b)">${s.scores.b} ${esc(s.names.b)}</span></div></div>`;
    }
  }else if(ui.tab==="q"){
    const d=ui.draft||(ui.draft=clone(QS()));
    body=`<div class="card"><p>Úpravy sa prejavia až po uložení. Ukladaj pred hrou, uloženie začne aktuálne kolo odznova.</p>
      <div class="row"><button class="btn pri grow" data-act="saveq">Uložiť otázky</button><button class="btn" data-act="sampleq">Vzorové</button></div></div>
      ${d.map((qq,qi)=>`<div class="card"><div class="row"><h2 class="grow">Otázka ${qi+1}</h2><button class="x" data-act="delq" data-q="${qi}" aria-label="Zmazať otázku ${qi+1}">✕</button></div>
        <input data-f="q" data-q="${qi}" value="${esc(qq.q)}" placeholder="Znenie otázky" aria-label="Znenie otázky ${qi+1}">
        ${qq.answers.map((a,ai)=>`<div class="row" style="flex-wrap:nowrap"><input data-f="t" data-q="${qi}" data-a="${ai}" value="${esc(a.t)}" placeholder="Odpoveď" aria-label="Odpoveď ${ai+1}"><input class="p" type="number" inputmode="numeric" data-f="p" data-q="${qi}" data-a="${ai}" value="${esc(a.p)}" aria-label="Body"><button class="x" data-act="dela" data-q="${qi}" data-a="${ai}" aria-label="Zmazať odpoveď">✕</button></div>`).join("")}
        ${qq.answers.length<8?`<button class="btn" data-act="adda" data-q="${qi}">Pridať odpoveď</button>`:""}</div>`).join("")}
      <button class="btn" data-act="addq">Pridať otázku</button>`;
  }else{
    body=pinCard+`<div class="card"><h2>Tímy</h2><div class="row"><label>Názov tímu A<input data-set="name" data-v="a" value="${esc(s.names.a)}"></label><label>Názov tímu B<input data-set="name" data-v="b" value="${esc(s.names.b)}"></label></div>
      <div class="row"><label>Skóre tímu A<input type="number" inputmode="numeric" data-set="score" data-v="a" value="${s.scores.a}"></label><label>Skóre tímu B<input type="number" inputmode="numeric" data-set="score" data-v="b" value="${s.scores.b}"></label></div></div>
      <div class="card"><h2>Nová hra</h2><p>Vynuluje skóre a vráti sa na prvú otázku. Otázky ostanú.</p><button class="btn bad" data-act="newgame">Začať novú hru</button></div>
      <div class="card"><h2>Zariadenie</h2><p>${conn()}</p><button class="btn" data-act="logout">Odhlásiť moderátora</button></div>`;
  }
  return `<div class="mod">${tabs}${body}</div>`;
}

function render(force){
  document.documentElement.dataset.theme=theme();
  const ae=document.activeElement;
  if(!force&&ae&&ae.tagName==="INPUT"&&app.contains(ae)) return;   // neprekresľuj počas písania
  const html=PAGE==="admin"?adminHTML():PAGE==="buzzer"?buzzerHTML():tvHTML();
  app.innerHTML=themes()+html;
  document.body.style.overflow=PAGE==="tv"?"hidden":"auto";
}

/* ---------- ovládanie ---------- */
function resetRound(s){ s.revealed=[];s.strikes=0;s.awarded=null;s.awardedPts=0;s.showQ=true; }
const BUZZ_OFF={buzz_armed:false,buzz_winner:null};
const adminActs={
  tab:v=>{ui.tab=v; if(v==="q") ui.draft=clone(QS()); render(true);},
  logout:()=>adminOut(),
  newpin:()=>{ const n=crypto.getRandomValues(new Uint32Array(1))[0]%100000; ui.pin=String(n).padStart(5,"0"); backend.write({pin:ui.pin}); render(true); toast("Nový PIN platí: "+ui.pin); },
  seed:()=>patch({questions:clone(SAMPLE)}),
  prev:()=>setState(s=>{s.qi=Math.max(0,QI()-1);resetRound(s)},BUZZ_OFF),
  next:()=>setState(s=>{s.qi=Math.min(QS().length-1,QI()+1);resetRound(s)},BUZZ_OFF),
  showq:()=>setState(s=>{s.showQ=!s.showQ}),
  mult:()=>setState(s=>{s.mult=s.mult>=3?1:s.mult+1}),
  arm:()=>patch({buzz_armed:true,buzz_winner:null}),
  lock:()=>patch(BUZZ_OFF),
  manual:v=>patch({buzz_armed:true,buzz_winner:v}),
  reveal:v=>setState(s=>{const i=+v;s.revealed=s.revealed.includes(i)?s.revealed.filter(x=>x!==i):[...s.revealed,i]}),
  strike:()=>setState(s=>{s.strikes=Math.min(3,s.strikes+1);s.fx={n:s.fx.n+1,t:"strike",k:s.strikes}}),
  wrong:()=>setState(s=>{s.fx={n:s.fx.n+1,t:"strike",k:1}}),
  clear:()=>setState(s=>{s.strikes=0}),
  award:v=>setState(s=>{const p=bank(s);s.scores[v]+=p;s.awarded=v;s.awardedPts=p}),
  undo:()=>setState(s=>{if(s.awarded){s.scores[s.awarded]-=s.awardedPts;s.awarded=null;s.awardedPts=0}}),
  all:()=>setState(s=>{const q=Q();s.revealed=q?q.answers.map((_,i)=>i):[]}),
  newgame:()=>setState(s=>{s.scores={a:0,b:0};s.qi=0;s.mult=1;resetRound(s)},BUZZ_OFF),
  addq:()=>{ui.draft.push({q:"",answers:[{t:"",p:0},{t:"",p:0},{t:"",p:0},{t:"",p:0}]});render(true)},
  delq:(v,el)=>{ui.draft.splice(+el.dataset.q,1);render(true)},
  adda:(v,el)=>{ui.draft[+el.dataset.q].answers.push({t:"",p:0});render(true)},
  dela:(v,el)=>{ui.draft[+el.dataset.q].answers.splice(+el.dataset.a,1);render(true)},
  sampleq:()=>{ui.draft=clone(SAMPLE);render(true);toast("Vzorové otázky sú načítané, ešte ich ulož")},
  saveq:()=>{ const qs=ui.draft.map(q=>({q:q.q.trim(),answers:q.answers.filter(a=>String(a.t).trim()).map(a=>({t:String(a.t).trim(),p:Math.max(0,parseInt(a.p,10)||0)}))})).filter(q=>q.q&&q.answers.length);
    setState(s=>{s.qi=Math.min(s.qi,Math.max(0,qs.length-1));resetRound(s)},{questions:qs,...BUZZ_OFF}); ui.draft=clone(qs); render(true); toast("Otázky sú uložené"); }
};
const acts={
  theme:v=>{ if(PAGE==="admin"&&adminOk) setState(s=>{s.theme=v}); else { ui.localTheme=v; render(); } },
  full:()=>{try{document.documentElement.requestFullscreen()}catch(e){}},
  sound:()=>{try{ac=new (window.AudioContext||window.webkitAudioContext)();ac.resume();ui.audio=true;sfx.ding()}catch(e){ui.audio=true} render();},
  login:async()=>{ const pass=ui.passInput; if(!pass||ui.busy) return; ui.busy=true;
    try{ const r=await backend.login(pass); if(r&&r.ok){ adminPass=pass; adminOk=true; ui.pin=r.pin||""; ui.passInput=""; SS.set("pp-admin",pass); wake(); } else toast("Nesprávne heslo"); }
    catch(e){ toast("Prihlásenie zlyhalo. Je v Supabase spustený supabase.sql?"); }
    ui.busy=false; render(true); },
  join:async v=>{ const p=ui.pinInput.trim(); if(ui.busy) return; if(!/^\d{5}$/.test(p)) return toast("PIN má 5 číslic"); ui.busy=true;
    try{ if(await backend.checkPin(p)){ bz={team:v,pin:p}; LS.set("pp-bz",JSON.stringify(bz)); wake(); } else toast("Nesprávny PIN"); }
    catch(e){ toast("Overenie zlyhalo, skontroluj internet"); }
    ui.busy=false; render(true); },
  leave:()=>bzOut()
};
async function doBuzz(){ if(!bz) return; const r=await backend.buzz(bz.pin,bz.team);
  if(r==="ok") apply({buzz_winner:bz.team}); else if(r==="pin") bzOut("PIN už neplatí, zadaj nový"); else if(r==="err") toast("Nejde internet"); }

let wl=null;
async function wake(){ try{ if(navigator.wakeLock) wl=await navigator.wakeLock.request("screen"); }catch(e){} }
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) wake(); });

document.addEventListener("pointerdown",e=>{ if(e.target.closest("[data-buzz]")){ e.preventDefault(); doBuzz(); } });
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-act]"); if(!b||b.disabled) return;
  const name=b.dataset.act, f=acts[name]||(PAGE==="admin"&&adminOk?adminActs[name]:null); if(!f) return;
  const ae=document.activeElement; if(ae&&ae.tagName==="INPUT") ae.blur();
  f(b.dataset.v,b);
});
document.addEventListener("keydown",e=>{ if(e.key==="Enter"&&e.target.dataset&&e.target.dataset.in==="passInput") acts.login(); });
document.addEventListener("input",e=>{ const t=e.target;
  if(t.dataset.in){ ui[t.dataset.in]=t.value; return; }
  if(t.dataset.f&&ui.draft){ const q=ui.draft[+t.dataset.q]; if(!q) return;
    if(t.dataset.f==="q") q.q=t.value; else q.answers[+t.dataset.a][t.dataset.f]=t.value; } });
document.addEventListener("change",e=>{ const t=e.target; if(!t.dataset.set||!adminOk) return;
  if(t.dataset.set==="name") setState(s=>{s.names[t.dataset.v]=t.value.trim()||(t.dataset.v==="a"?"Tím A":"Tím B")});
  else setState(s=>{s.scores[t.dataset.v]=parseInt(t.value,10)||0}); });
document.addEventListener("focusout",()=>setTimeout(render,0));

/* ---------- štart ---------- */
render();
if(PAGE==="tv") wake();
if(PAGE==="admin"&&adminPass) backend.login(adminPass).then(r=>{ if(r&&r.ok){adminOk=true;ui.pin=r.pin||"";render(true)} else adminOut(); }).catch(()=>{});
if(PAGE==="buzzer"&&bz) backend.checkPin(bz.pin).then(ok=>{ if(ok) wake(); else bzOut("PIN už neplatí, zadaj nový"); }).catch(()=>{});
