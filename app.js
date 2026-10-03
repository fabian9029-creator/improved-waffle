import './style.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { openStore } from './store.js';

(function(){
'use strict';

/* ---------- Konstanten ---------- */
const CATS=['Motor','Getriebe','Bremsen','Fahrwerk','Reifen & Räder','Elektrik','Flüssigkeiten','Karosserie & Innenraum','Sonstiges'];
const SPEC_KEYS=['Motoröl (Sorte)','Ölmenge mit Filter','Ölfilter (Teilenr.)','Luftfilter (Teilenr.)','Zündkerzen','Kühlmittel','Bremsflüssigkeit','Reifengröße','Reifendruck vorn / hinten','Radschrauben (Nm)','Ölablassschraube (Nm)'];
// [Name, Intervall km (0 = nur Zeit), Intervall Monate, Kategorie]
const INT_DEFAULTS=[
  ['Motoröl & Ölfilter',15000,12,'Motor'],
  ['Luftfilter',30000,24,'Motor'],
  ['Pollenfilter',15000,12,'Karosserie & Innenraum'],
  ['Zündkerzen',60000,48,'Motor'],
  ['Bremsflüssigkeit',0,24,'Bremsen'],
  ['Bremsbeläge & Scheiben prüfen',30000,24,'Bremsen'],
  ['Kühlmittel',0,60,'Flüssigkeiten'],
  ['Getriebeöl',60000,60,'Getriebe'],
  ['Zahnriemen & Wasserpumpe',120000,72,'Motor'],
  ['Räderwechsel Sommer/Winter',0,6,'Reifen & Räder'],
  ['Batterie prüfen',0,12,'Elektrik'],
  ['Wischerblätter',0,12,'Karosserie & Innenraum'],
  ['Klimaservice',0,24,'Karosserie & Innenraum']
];

/* ---------- Helfer ---------- */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4);
const pad=n=>String(n).padStart(2,'0');
const isoDate=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const today=()=>isoDate(new Date());
const parseD=s=>{const p=s.split('-').map(Number);return new Date(p[0],p[1]-1,p[2]);};
const addMonths=(s,n)=>{const d=parseD(s);const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));return isoDate(d);};
const daysBetween=(a,b)=>Math.round((parseD(b)-parseD(a))/86400000);
const fmtN=n=>Number(n).toLocaleString('de-DE',{maximumFractionDigits:0});
const eur=n=>Number(n).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const fmtDate=s=>s?parseD(s).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}):'';
const fmtMonth=s=>{if(!s)return '';const p=s.split('-');return p[1]+'/'+p[0];};
const num=s=>{if(s==null||String(s).trim()==='')return null;const n=Number(String(s).replace(',','.'));return isFinite(n)?n:null;};

/* ---------- Zustand ---------- */
let S={v:1,vehicles:[],logs:[],activeId:null};
const ui={tab:'home',ready:false,mode:'local',loadError:false,q:'',cat:'',year:'all',stat:''};
const veh=()=>S.vehicles.find(x=>x.id===S.activeId)||S.vehicles[0]||null;

function normalize(d){
  const out={v:1,vehicles:[],logs:[],activeId:null};
  if(d&&Array.isArray(d.vehicles)){
    out.vehicles=d.vehicles.map(v=>Object.assign({},v,{
      intervals:Array.isArray(v.intervals)?v.intervals:[],
      specs:Array.isArray(v.specs)?v.specs:[],
      notes:v.notes||'',km:Number(v.km)||0
    }));
  }
  if(d&&Array.isArray(d.logs)) out.logs=d.logs;
  out.activeId=(d&&d.activeId)||(out.vehicles[0]&&out.vehicles[0].id)||null;
  return out;
}

/* ---------- Speichern (SQLite auf dem Gerät) ---------- */
let store=null,saveTimer=null,saving=false,dirty=false;
function setStat(text,err){ui.stat=text;const el=$('#savestat');if(el){el.textContent=text;el.classList.toggle('err',!!err);}}
const where=()=>store&&store.mode==='sqlite'?'Gespeichert auf diesem Gerät':'Gespeichert in diesem Browser';
function touch(){
  if(ui.loadError||!store)return;
  dirty=true;setStat('Speichert …');
  clearTimeout(saveTimer);saveTimer=setTimeout(flush,500);
}
async function flush(){
  if(saving||!dirty)return;
  saving=true;dirty=false;
  try{
    await store.save(JSON.parse(JSON.stringify(S)));
    setStat(where());
  }catch(e){
    setStat('Speichern fehlgeschlagen. Lade vorsichtshalber eine Sicherung herunter.',true);
  }
  saving=false;
  if(dirty)saveTimer=setTimeout(flush,200);
}
async function load(){
  try{
    store=await openStore();
    const d=await store.load();
    if(d)S=normalize(d);
    ui.stat=store.mode==='sqlite'?'Daten liegen in der Datenbank auf diesem Gerät':'Daten liegen nur in diesem Browser';
  }catch(e){ui.loadError=true;}
  ui.ready=true;render();
}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&dirty){clearTimeout(saveTimer);flush();}});

/* ---------- Berechnung ---------- */
function calc(v,it){
  const t=today();
  let pk=null,pt=null,remKm=null,remDays=null,due=null;
  if(it.km>0&&it.lastKm!=null){pk=(v.km-it.lastKm)/it.km;remKm=it.lastKm+it.km-v.km;}
  if(it.months>0&&it.lastDate){due=addMonths(it.lastDate,it.months);remDays=daysBetween(t,due);pt=1-remDays/(it.months*30.44);}
  const ps=[pk,pt].filter(x=>x!=null);
  const p=ps.length?Math.max.apply(null,ps):null;
  const status=p==null?'unknown':p>=1?'over':p>=0.85?'soon':'ok';
  const parts=[];
  if(remKm!=null)parts.push(remKm>=0?'noch '+fmtN(remKm)+' km':fmtN(-remKm)+' km drüber');
  if(remDays!=null)parts.push(remDays>=0?'bis '+fmtDate(due):fmtN(-remDays)+' Tage drüber');
  return {p:p,status:status,detail:parts.join(' · ')};
}
function huInfo(v){
  if(!v.hu)return null;
  const p=v.hu.split('-').map(Number);
  const end=isoDate(new Date(p[0],p[1],0));
  const d=daysBetween(today(),end);
  const status=d<0?'over':d<=60?'soon':'ok';
  const txt=d<0?'seit '+fmtN(-d)+' Tagen überfällig':d===0?'heute letzter Tag':d<=60?'noch '+fmtN(d)+' Tage':'in '+Math.round(d/30.44)+' Monaten';
  return {status:status,txt:txt,label:fmtMonth(v.hu)};
}
const mkInt=a=>({id:uid(),name:a[0],km:a[1],months:a[2],cat:a[3],lastKm:null,lastDate:''});
const mkSpecs=()=>SPEC_KEYS.map(k=>({k:k,v:''}));

/* ---------- Ansichten ---------- */
function odo(n){
  const s=String(Math.max(0,Math.round(n))).padStart(6,'0');
  let lead=true;
  return s.split('').map((d,i)=>{
    if(d!=='0')lead=false;
    const z=lead&&i<s.length-1;
    const g=i>0&&(s.length-i)%3===0;
    return '<span class="dg'+(z?' z':'')+(g?' g':'')+'">'+d+'</span>';
  }).join('');
}
function headerHTML(v){
  const chips=S.vehicles.map(x=>'<button class="chip'+(v&&x.id===v.id?' on':'')+'" data-act="pick" data-id="'+x.id+'">'+esc(x.name)+'</button>').join('');
  const tabs=[['home','Übersicht'],['log','Logbuch'],['specs','Datenblatt'],['cost','Kosten']];
  return '<header class="top"><div class="wrap"><span class="brand">Schrauberbuch</span>'+
    '<div class="chips" role="group" aria-label="Fahrzeug wählen">'+chips+'<button class="chip add" data-act="newVeh"'+(ui.ready&&!ui.loadError?'':' disabled')+'>+ Fahrzeug</button></div></div></header>'+
    (v?'<nav class="tabs" aria-label="Bereiche"><div class="wrap" role="tablist">'+tabs.map(t=>'<button class="tab" role="tab" aria-selected="'+(ui.tab===t[0])+'" data-act="tab" data-tab="'+t[0]+'">'+t[1]+'</button>').join('')+'</div></nav>':'');
}
function emptyHTML(){
  if(ui.loadError){
    return '<section class="card welcome"><h1>Garage lässt sich nicht laden</h1><p>Deine Daten sind nicht verloren. Beim Laden ist etwas schiefgegangen, deshalb wird vorerst nichts überschrieben.</p><button class="btn" data-act="reload">Seite neu laden</button></section>';
  }
  const off=ui.ready?'':' disabled';
  return '<section class="card welcome"><h1>'+(ui.ready?'Dein erstes Fahrzeug':'Garage wird geladen …')+'</h1>'+
    '<p>Hier führst du Wartung und Reparaturen an deinen Autos: Intervalle nach Kilometern und Monaten, ein Logbuch mit Teilenummern, ein Datenblatt für Öl, Reifendruck und Anzugsmomente, dazu die Kosten und was du gegenüber der Werkstatt gespart hast.</p>'+
    '<div class="row-actions"><button class="btn" data-act="newVeh"'+off+'>Fahrzeug anlegen</button><button class="btn ghost" data-act="loadExample"'+off+'>Mit Beispieldaten ansehen</button></div></section>';
}
function homeHTML(v){
  const rows=v.intervals.map(it=>({it:it,c:calc(v,it)}));
  const order={over:0,soon:1,ok:2,unknown:3};
  rows.sort((a,b)=>order[a.c.status]-order[b.c.status]||(b.c.p||0)-(a.c.p||0));
  const n={over:0,soon:0,unknown:0};rows.forEach(r=>{if(n[r.c.status]!=null)n[r.c.status]++;});
  const sum=[];
  if(n.over)sum.push(n.over+' überfällig');
  if(n.soon)sum.push(n.soon+' bald fällig');
  if(n.unknown)sum.push(n.unknown+' ohne Stand');
  if(!sum.length&&rows.length)sum.push('nichts fällig');
  const hu=huInfo(v);
  const huRow=hu?'<div class="hu"><span class="lbl">HU/TÜV</span><span class="mono">bis '+hu.label+'</span><span class="pill '+hu.status+'">'+hu.txt+'</span><button class="link" data-act="editVeh" data-id="'+v.id+'">ändern</button></div>'
    :'<div class="hu"><span class="lbl">HU/TÜV</span><button class="link" data-act="editVeh" data-id="'+v.id+'">Termin eintragen</button></div>';
  const list=rows.length?'<ul class="list">'+rows.map(r=>intRow(r.it,r.c)).join('')+'</ul>'
    :'<div class="list"><p class="empty-note">Noch keine Intervalle. Lege eigene an oder starte mit gängigen Richtwerten.</p></div>';
  return '<section class="card"><div class="veh-top"><div class="veh-name"><h1>'+esc(v.name)+(v.example?'<span class="tag">Beispiel</span>':'')+'</h1>'+
    '<p class="sub">'+[v.engine,v.year].filter(Boolean).map(esc).join(' · ')+'</p></div>'+
    (v.plate?'<span class="plate"><i>D</i><b>'+esc(v.plate)+'</b></span>':'')+'</div>'+
    '<div class="odo-row"><div class="odo" role="img" aria-label="Kilometerstand '+fmtN(v.km)+' Kilometer">'+odo(v.km)+'<span class="odo-unit">km</span></div>'+
    '<form class="kmform" data-form="km"><label class="sr" for="kmQuick">Neuer Kilometerstand</label><input id="kmQuick" name="km" type="number" inputmode="numeric" min="0" placeholder="Neuer Stand" required><button class="btn ghost" type="submit">Eintragen</button></form></div>'+
    huRow+
    '<div><button class="link" data-act="editVeh" data-id="'+v.id+'">Fahrzeugdaten bearbeiten</button></div></section>'+
    '<section><div class="sec-head"><h2>Anstehend</h2><span class="summary">'+sum.join(' · ')+'</span></div>'+list+
    '<div class="row-actions"><button class="btn ghost small" data-act="newInt">+ Intervall</button>'+(rows.length<INT_DEFAULTS.length?'<button class="link" data-act="addDefaults">Richtwerte ergänzen</button>':'')+'</div></section>';
}
function intRow(it,c){
  const pill={over:'Überfällig',soon:'Bald fällig',ok:'In Ordnung',unknown:'Stand fehlt'}[c.status];
  const pct=c.p==null?0:Math.max(0,Math.min(1,c.p))*100;
  const every='alle '+[it.km>0?fmtN(it.km)+' km':null,it.months>0?it.months+' Monate':null].filter(Boolean).join(' / ');
  const meta=c.status==='unknown'?'Noch kein Wechsel eingetragen · '+every:(c.detail+' · '+every);
  return '<li class="int '+c.status+'"><div><div class="int-title"><b>'+esc(it.name)+'</b><span class="pill '+c.status+'">'+pill+'</span></div>'+
    '<div class="bar" role="img" aria-label="'+Math.round(pct)+' Prozent des Intervalls verbraucht"><i style="width:'+pct.toFixed(1)+'%"></i></div>'+
    '<p class="int-meta">'+esc(meta)+'</p></div>'+
    '<div class="int-actions"><button class="btn small" data-act="done" data-id="'+it.id+'">Erledigt</button><button class="link" data-act="editInt" data-id="'+it.id+'">Bearbeiten</button></div></li>';
}
function vehLogs(v){return S.logs.filter(l=>l.vid===v.id).sort((a,b)=>b.date.localeCompare(a.date)||(b.km-a.km));}
function logListHTML(v){
  const all=vehLogs(v);
  const q=ui.q.trim().toLowerCase();
  const logs=all.filter(l=>(!ui.cat||l.cat===ui.cat)&&(!q||(l.title+' '+(l.parts||'')+' '+(l.note||'')).toLowerCase().includes(q)));
  if(!all.length)return '<div class="list"><p class="empty-note">Noch keine Einträge. Trage die erste Arbeit ein, zum Beispiel den letzten Ölwechsel, damit die Intervalle ihren Startpunkt kennen.</p></div>';
  if(!logs.length)return '<div class="list"><p class="empty-note">Keine Einträge zu diesem Filter.</p></div>';
  const total=logs.reduce((s,l)=>s+(l.cost||0),0);
  return '<p class="summary" style="margin-bottom:8px">'+logs.length+' Einträge · '+eur(total)+'</p><ul class="list logs">'+logs.map(l=>{
    const saved=l.who==='self'&&l.quote>l.cost?l.quote-l.cost:0;
    const meta=[l.cat,l.who==='self'?'selbst gemacht':'Werkstatt',l.hours?String(l.hours).replace('.',',')+' Std.':''].filter(Boolean).join(' · ');
    return '<li><button class="log" data-act="editLog" data-id="'+l.id+'"><span class="log-date">'+fmtDate(l.date)+'<small>'+fmtN(l.km)+' km</small></span>'+
      '<span class="log-body"><b>'+esc(l.title)+'</b><span class="meta">'+esc(meta)+'</span>'+(l.parts?'<span class="parts">'+esc(l.parts)+'</span>':'')+'</span>'+
      '<span class="log-cost">'+eur(l.cost||0)+(saved?'<small>gespart '+eur(saved)+'</small>':'')+'</span></button></li>';
  }).join('')+'</ul>';
}
function logHTML(v){
  return '<section><div class="head-tools sec-head"><h2>Logbuch</h2><button class="btn small" data-act="newLog">+ Eintrag</button></div>'+
    '<div class="filters" style="margin-bottom:12px"><label class="sr" for="logq">Suchen</label><input id="logq" type="search" placeholder="Suchen, z. B. Bremse oder Teilenummer" value="'+esc(ui.q)+'">'+
    '<label class="sr" for="logcat">Kategorie</label><select id="logcat"><option value="">Alle Kategorien</option>'+CATS.map(c=>'<option'+(ui.cat===c?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select></div>'+
    '<div id="loglist">'+logListHTML(v)+'</div></section>';
}
function specsHTML(v){
  const rows=v.specs.map((s,i)=>'<div class="spec"><label class="sr" for="sk'+i+'">Bezeichnung</label><input type="text" id="sk'+i+'" class="sk" data-i="'+i+'" value="'+esc(s.k)+'"><label class="sr" for="sv'+i+'">Wert</label><input type="text" id="sv'+i+'" class="sv" data-i="'+i+'" value="'+esc(s.v)+'" placeholder="—"><button class="x" data-act="delSpec" data-i="'+i+'" aria-label="Zeile entfernen">×</button></div>').join('');
  return '<section><div class="sec-head"><h2>Datenblatt</h2><span class="summary">Öl, Druck, Drehmomente</span></div><div class="list">'+rows+
    '<div class="spec-foot"><button class="link" data-act="addSpec">+ Zeile hinzufügen</button></div></div></section>'+
    '<section><div class="sec-head"><h2>Notizen</h2></div><label class="sr" for="vnotes">Notizen zum Fahrzeug</label><textarea id="vnotes" rows="5" placeholder="Eigenheiten, Werkzeug-Tipps, Reihenfolge beim Schrauben …">'+esc(v.notes)+'</textarea></section>';
}
function bars(items){
  const max=Math.max.apply(null,items.map(i=>i.value).concat([1]));
  return '<ul class="bars">'+items.map(i=>'<li><span>'+esc(i.label)+'</span><span class="bv">'+eur(i.value)+'</span><span class="bt"><i style="width:'+(i.value/max*100).toFixed(1)+'%"></i></span></li>').join('')+'</ul>';
}
function costHTML(v){
  const all=vehLogs(v);
  if(!all.length)return '<section><div class="sec-head"><h2>Kosten</h2></div><div class="list"><p class="empty-note">Sobald du Einträge mit Kosten im Logbuch hast, siehst du hier, wohin das Geld geht und was du gespart hast.</p></div></section>';
  const years=Array.from(new Set(all.map(l=>l.date.slice(0,4)))).sort().reverse();
  if(ui.year!=='all'&&years.indexOf(ui.year)<0)ui.year='all';
  const logs=ui.year==='all'?all:all.filter(l=>l.date.startsWith(ui.year));
  const sum=f=>logs.reduce((s,l)=>s+f(l),0);
  const total=sum(l=>l.cost||0);
  const selfCost=sum(l=>l.who==='self'?(l.cost||0):0);
  const saved=sum(l=>l.who==='self'&&l.quote>l.cost?l.quote-l.cost:0);
  const hours=sum(l=>l.hours||0);
  const byCat={};logs.forEach(l=>{byCat[l.cat]=(byCat[l.cat]||0)+(l.cost||0);});
  const catItems=Object.keys(byCat).map(k=>({label:k,value:byCat[k]})).sort((a,b)=>b.value-a.value);
  const byYear={};all.forEach(l=>{const y=l.date.slice(0,4);byYear[y]=(byYear[y]||0)+(l.cost||0);});
  const yearItems=Object.keys(byYear).sort().reverse().map(y=>({label:y,value:byYear[y]}));
  return '<section><div class="head-tools sec-head"><h2>Kosten</h2><label class="sr" for="yearsel">Zeitraum</label><select id="yearsel" style="width:auto"><option value="all">Alle Jahre</option>'+years.map(y=>'<option'+(ui.year===y?' selected':'')+'>'+y+'</option>').join('')+'</select></div>'+
    '<div class="stats"><div class="stat"><div class="lbl">Ausgaben gesamt</div><div class="val">'+eur(total)+'</div></div>'+
    '<div class="stat"><div class="lbl">Davon selbst gemacht</div><div class="val">'+eur(selfCost)+'</div></div>'+
    '<div class="stat"><div class="lbl">Gespart gegenüber Werkstatt</div><div class="val">'+eur(saved)+'</div></div>'+
    '<div class="stat"><div class="lbl">Zeit in der Garage</div><div class="val">'+String(Math.round(hours*100)/100).replace('.',',')+' Std.</div></div></div></section>'+
    '<section><div class="sec-head"><h2>Nach Kategorie</h2></div>'+bars(catItems)+'</section>'+
    (yearItems.length>1&&ui.year==='all'?'<section><div class="sec-head"><h2>Nach Jahr</h2></div>'+bars(yearItems)+'</section>':'');
}
function footHTML(){
  if(ui.loadError)return '';
  return '<footer class="foot wrap"><div class="row"><button class="btn ghost small" data-act="backup"'+(ui.ready?'':' disabled')+'>Sicherung speichern</button>'+
    '<label class="btn ghost small foot-file">Sicherung laden<input type="file" id="restoreFile" accept=".json,application/json"></label></div>'+
    '<p id="savestat" aria-live="polite" class="'+(/fehl|voll/.test(ui.stat)?'err':'')+'">'+esc(ui.stat)+'</p>'+
    '<p>Intervalle sind Richtwerte. Maßgeblich bleibt der Serviceplan deines Fahrzeugs.</p></footer>';
}
function render(){
  const v=veh();
  const ok=ui.ready&&!ui.loadError&&v;
  let body;
  if(!ok)body=emptyHTML();
  else body=ui.tab==='log'?logHTML(v):ui.tab==='specs'?specsHTML(v):ui.tab==='cost'?costHTML(v):homeHTML(v);
  $('#app').innerHTML=headerHTML(ok?v:null)+'<main class="wrap">'+body+'</main>'+footHTML();
}

/* ---------- Dialoge ---------- */
function modal(html){
  const r=$('#modal');
  r.innerHTML='<div class="scrim" data-act="closeModal"></div><div class="panel" role="dialog" aria-modal="true">'+html+'</div>';
  r.hidden=false;document.body.classList.add('lock');
  const f=r.querySelector('input:not([type=hidden]):not([type=radio]),select,textarea,.btn');
  if(f)f.focus();
}
function closeModal(){const r=$('#modal');r.hidden=true;r.innerHTML='';document.body.classList.remove('lock');}
const fld=(id,label,control,hint,cls)=>'<div class="fld'+(cls?' '+cls:'')+'"><label for="'+id+'">'+label+'</label>'+control+(hint?'<small>'+hint+'</small>':'')+'</div>';
const catOptions=sel=>CATS.map(c=>'<option'+(c===sel?' selected':'')+'>'+esc(c)+'</option>').join('');
const delBlock=(label,warn,act,id)=>'<div class="danger"><button type="button" class="link bad" data-act="askDel">'+label+'</button><div class="confirm" hidden><p>'+warn+'</p><button type="button" class="btn bad" data-act="'+act+'" data-id="'+id+'">Ja, endgültig löschen</button><button type="button" class="btn ghost" data-act="cancelDel">Nein</button></div></div>';

function openVeh(id){
  const v=id?S.vehicles.find(x=>x.id===id):null;
  const e=v||{name:'',plate:'',engine:'',year:'',km:'',hu:''};
  modal('<form data-form="veh" data-id="'+(v?v.id:'')+'"><h2>'+(v?'Fahrzeug bearbeiten':'Neues Fahrzeug')+'</h2>'+
    fld('f_name','Name','<input id="f_name" name="name" type="text" required maxlength="60" value="'+esc(e.name)+'" placeholder="z. B. Golf VII">')+
    '<div class="grid2">'+fld('f_plate','Kennzeichen','<input id="f_plate" name="plate" type="text" maxlength="14" value="'+esc(e.plate)+'" placeholder="AB-CD 123">')+
    fld('f_year','Baujahr','<input id="f_year" name="year" type="number" inputmode="numeric" min="1900" max="2100" value="'+esc(e.year)+'">')+'</div>'+
    fld('f_engine','Motor / Variante','<input id="f_engine" name="engine" type="text" maxlength="60" value="'+esc(e.engine)+'" placeholder="z. B. 1.4 TSI, 103 kW">')+
    '<div class="grid2">'+fld('f_km','Kilometerstand','<input id="f_km" name="km" type="number" inputmode="numeric" min="0" required value="'+esc(e.km)+'">')+
    fld('f_hu','HU/TÜV gültig bis','<input id="f_hu" name="hu" type="month" value="'+esc(e.hu)+'">')+'</div>'+
    (v?'':'<label class="check"><input type="checkbox" name="defaults" checked> Standard-Wartungsintervalle anlegen<small>Richtwerte, bitte mit dem Serviceplan deines Autos abgleichen.</small></label>')+
    '<div class="actions"><button class="btn" type="submit">Speichern</button><button class="btn ghost" type="button" data-act="closeModal">Abbrechen</button></div>'+
    (v?delBlock('Fahrzeug löschen','Das Fahrzeug mit allen Intervallen und Logbuch-Einträgen wird gelöscht.','delVeh',v.id):'')+'</form>');
}
function openInt(id){
  const v=veh();const it=id?v.intervals.find(x=>x.id===id):null;
  const e=it||{name:'',km:15000,months:12,cat:'Motor',lastKm:'',lastDate:''};
  modal('<form data-form="int" data-id="'+(it?it.id:'')+'"><h2>'+(it?'Intervall bearbeiten':'Neues Intervall')+'</h2>'+
    fld('i_name','Bezeichnung','<input id="i_name" name="name" type="text" required maxlength="60" value="'+esc(e.name)+'" placeholder="z. B. Differenzialöl">')+
    '<div class="grid2">'+fld('i_km','Alle … km','<input id="i_km" name="km" type="number" inputmode="numeric" min="0" value="'+esc(e.km)+'">','0 = nur nach Zeit')+
    fld('i_months','Oder alle … Monate','<input id="i_months" name="months" type="number" inputmode="numeric" min="0" value="'+esc(e.months)+'">','0 = nur nach Kilometern')+'</div>'+
    fld('i_cat','Kategorie','<select id="i_cat" name="cat">'+catOptions(e.cat)+'</select>')+
    '<div class="grid2">'+fld('i_lastkm','Zuletzt bei km','<input id="i_lastkm" name="lastKm" type="number" inputmode="numeric" min="0" value="'+esc(e.lastKm==null?'':e.lastKm)+'">')+
    fld('i_lastdate','Zuletzt am','<input id="i_lastdate" name="lastDate" type="date" value="'+esc(e.lastDate)+'">')+'</div>'+
    '<div class="actions"><button class="btn" type="submit">Speichern</button><button class="btn ghost" type="button" data-act="closeModal">Abbrechen</button></div>'+
    (it?delBlock('Intervall löschen','Der Intervall wird entfernt. Logbuch-Einträge bleiben erhalten.','delInt',it.id):'')+'</form>');
}
function openLog(id,pre){
  const v=veh();const l=id?S.logs.find(x=>x.id===id):null;
  const e=l||Object.assign({date:today(),km:v.km,title:'',cat:'Motor',who:'self',cost:'',quote:'',hours:'',parts:'',note:'',iid:''},pre||{});
  const titles=Array.from(new Set(v.intervals.map(i=>i.name).concat(vehLogs(v).map(x=>x.title))));
  modal('<form data-form="log" data-id="'+(l?l.id:'')+'"><h2>'+(l?'Eintrag bearbeiten':'Arbeit eintragen')+'</h2>'+
    '<div class="grid2">'+fld('l_date','Datum','<input id="l_date" name="date" type="date" required value="'+esc(e.date)+'">')+
    fld('l_km','Kilometerstand','<input id="l_km" name="km" type="number" inputmode="numeric" min="0" required value="'+esc(e.km)+'">')+'</div>'+
    fld('l_title','Arbeit','<input id="l_title" name="title" type="text" required maxlength="80" list="l_titles" value="'+esc(e.title)+'" placeholder="z. B. Ölwechsel"><datalist id="l_titles">'+titles.map(t=>'<option value="'+esc(t)+'">').join('')+'</datalist>')+
    fld('l_cat','Kategorie','<select id="l_cat" name="cat">'+catOptions(e.cat)+'</select>')+
    '<div class="fld"><span style="font-size:13px;font-weight:600;color:var(--muted)">Ausgeführt von</span><div class="seg" role="radiogroup" aria-label="Ausgeführt von"><label><input type="radio" name="who" value="self"'+(e.who==='self'?' checked':'')+'><span>Selbst</span></label><label><input type="radio" name="who" value="shop"'+(e.who==='shop'?' checked':'')+'><span>Werkstatt</span></label></div></div>'+
    '<div class="grid2">'+fld('l_cost','Kosten gesamt (€)','<input id="l_cost" name="cost" type="number" inputmode="decimal" min="0" step="0.01" value="'+esc(e.cost)+'">','Teile und Material, bei Werkstatt die Rechnung')+
    fld('l_hours','Zeit in der Garage (Std.)','<input id="l_hours" name="hours" type="number" inputmode="decimal" min="0" step="0.25" value="'+esc(e.hours)+'">')+'</div>'+
    fld('l_quote','Was hätte die Werkstatt verlangt? (€)','<input id="l_quote" name="quote" type="number" inputmode="decimal" min="0" step="0.01" value="'+esc(e.quote)+'">','Optional, daraus entsteht deine Ersparnis','quote')+
    fld('l_iid','Intervall zurücksetzen','<select id="l_iid" name="iid"><option value="">Keins</option>'+v.intervals.map(i=>'<option value="'+i.id+'"'+(i.id===e.iid?' selected':'')+'>'+esc(i.name)+'</option>').join('')+'</select>','Setzt „Zuletzt“ auf dieses Datum und diesen Kilometerstand')+
    fld('l_parts','Teile und Teilenummern','<textarea id="l_parts" name="parts" rows="2" placeholder="Hersteller, Teilenummer, Menge">'+esc(e.parts)+'</textarea>')+
    fld('l_note','Notizen','<textarea id="l_note" name="note" rows="2" placeholder="Drehmomente, Besonderheiten, was du nächstes Mal anders machst">'+esc(e.note)+'</textarea>')+
    '<div class="actions"><button class="btn" type="submit">Speichern</button><button class="btn ghost" type="button" data-act="closeModal">Abbrechen</button></div>'+
    (l?delBlock('Eintrag löschen','Dieser Logbuch-Eintrag wird gelöscht.','delLog',l.id):'')+'</form>');
  syncQuote();
}
function syncQuote(){
  const f=$('#modal form[data-form="log"]');if(!f)return;
  const q=f.querySelector('.fld.quote');const who=f.querySelector('input[name=who]:checked');
  if(q)q.hidden=!(who&&who.value==='self');
}
function confirmModal(title,text,act){
  modal('<h2>'+title+'</h2><p style="margin-bottom:14px">'+text+'</p><div class="actions"><button class="btn" data-act="'+act+'">Ja, ersetzen</button><button class="btn ghost" data-act="closeModal">Abbrechen</button></div>');
}

/* ---------- Speichern der Formulare ---------- */
function saveVeh(f){
  const fd=new FormData(f);const id=f.dataset.id;
  const data={name:String(fd.get('name')).trim(),plate:String(fd.get('plate')||'').trim().toUpperCase(),engine:String(fd.get('engine')||'').trim(),year:num(fd.get('year'))||'',km:Math.round(num(fd.get('km'))||0),hu:String(fd.get('hu')||'')};
  if(!data.name)return;
  if(id){Object.assign(S.vehicles.find(x=>x.id===id),data);}
  else{
    const v=Object.assign({id:uid(),intervals:[],specs:mkSpecs(),notes:''},data);
    if(fd.get('defaults'))v.intervals=INT_DEFAULTS.map(mkInt);
    S.vehicles.push(v);S.activeId=v.id;ui.tab='home';
  }
  closeModal();touch();render();
}
function saveInt(f){
  const fd=new FormData(f);const v=veh();const id=f.dataset.id;
  const data={name:String(fd.get('name')).trim(),km:Math.round(num(fd.get('km'))||0),months:Math.round(num(fd.get('months'))||0),cat:String(fd.get('cat')),lastKm:num(fd.get('lastKm')),lastDate:String(fd.get('lastDate')||'')};
  if(!data.name)return;
  if(id)Object.assign(v.intervals.find(x=>x.id===id),data);else v.intervals.push(Object.assign({id:uid()},data));
  closeModal();touch();render();
}
function saveLog(f){
  const fd=new FormData(f);const v=veh();const id=f.dataset.id;
  const e={id:id||uid(),vid:v.id,date:String(fd.get('date')),km:Math.round(num(fd.get('km'))||0),title:String(fd.get('title')).trim(),cat:String(fd.get('cat')),who:String(fd.get('who')),
    cost:num(fd.get('cost'))||0,quote:fd.get('who')==='self'?(num(fd.get('quote'))||0):0,hours:num(fd.get('hours'))||0,parts:String(fd.get('parts')||'').trim(),note:String(fd.get('note')||'').trim(),iid:String(fd.get('iid')||'')};
  if(!e.title||!e.date)return;
  const i=S.logs.findIndex(x=>x.id===e.id);
  if(i>=0)S.logs[i]=e;else S.logs.push(e);
  if(e.km>v.km)v.km=e.km;
  if(e.iid){
    const it=v.intervals.find(x=>x.id===e.iid);
    if(it&&(!it.lastDate||e.date>=it.lastDate)){it.lastKm=e.km;it.lastDate=e.date;}
  }
  closeModal();touch();render();
}
function saveKm(f){
  const n=num(new FormData(f).get('km'));const v=veh();
  if(n==null||n<0||!v)return;
  v.km=Math.round(n);touch();render();
}

/* ---------- Beispieldaten, Sicherung ---------- */
function loadExample(){
  const t=today();const m=n=>addMonths(t,-n);
  const ints=INT_DEFAULTS.map(mkInt);
  const set=(name,km,date)=>{const it=ints.find(i=>i.name===name);it.lastKm=km;it.lastDate=date;return it;};
  const oil=set('Motoröl & Ölfilter',128500,m(10));
  const pollen=set('Pollenfilter',126000,m(14));
  set('Luftfilter',120500,m(14));
  set('Zündkerzen',95000,m(30));
  const brakefl=set('Bremsflüssigkeit',null,m(26));
  const pads=set('Bremsbeläge & Scheiben prüfen',130000,m(8));
  set('Kühlmittel',null,m(40));
  const tyres=set('Räderwechsel Sommer/Winter',137400,m(5));
  set('Batterie prüfen',null,m(7));
  set('Wischerblätter',null,m(11));
  set('Klimaservice',null,m(10));
  const vid=uid();
  const specs=mkSpecs();
  const sv=(k,val)=>{const s=specs.find(x=>x.k===k);if(s)s.v=val;};
  sv('Motoröl (Sorte)','5W-30, VW 504 00');sv('Ölmenge mit Filter','4,0 l');sv('Reifengröße','205/55 R16 91V');sv('Reifendruck vorn / hinten','2,4 / 2,4 bar');sv('Radschrauben (Nm)','120');sv('Ölablassschraube (Nm)','30');
  const hu=isoDate(new Date(new Date().getFullYear(),new Date().getMonth()+5,1)).slice(0,7);
  S={v:1,activeId:vid,vehicles:[{id:vid,example:true,name:'Golf VII 1.4 TSI',plate:'AB-CD 123',engine:'1.4 TSI, 103 kW',year:2016,km:142380,hu:hu,intervals:ints,specs:specs,notes:'Beispielfahrzeug. Lösche es, sobald du dein eigenes Auto angelegt hast.'}],logs:[
    {id:uid(),vid:vid,date:m(10),km:128500,title:'Ölwechsel mit Filter',cat:'Motor',who:'self',cost:74.9,quote:189,hours:1.5,parts:'Mann HU 7020 z, 4 l 5W-30',note:'Neue Dichtung an der Ablassschraube.',iid:oil.id},
    {id:uid(),vid:vid,date:m(14),km:126000,title:'Pollenfilter getauscht',cat:'Karosserie & Innenraum',who:'self',cost:14.5,quote:59,hours:0.3,parts:'Aktivkohle-Pollenfilter',note:'',iid:pollen.id},
    {id:uid(),vid:vid,date:m(8),km:130000,title:'Bremsbeläge vorn gewechselt',cat:'Bremsen',who:'self',cost:118.4,quote:340,hours:2.5,parts:'Belagsatz Vorderachse, Scheiben geprüft',note:'Führungsbolzen gefettet.',iid:pads.id},
    {id:uid(),vid:vid,date:m(5),km:137400,title:'Räder auf Sommerreifen',cat:'Reifen & Räder',who:'self',cost:0,quote:40,hours:1.2,parts:'',note:'Radschrauben mit 120 Nm angezogen.',iid:tyres.id},
    {id:uid(),vid:vid,date:m(26),km:112000,title:'Bremsflüssigkeit gewechselt',cat:'Bremsen',who:'shop',cost:62,quote:0,hours:0,parts:'DOT 4',note:'',iid:brakefl.id}
  ]};
  ui.tab='home';touch();render();
}
async function backup(){
  const json=JSON.stringify(S,null,2);
  if(Capacitor.isNativePlatform()){
    try{
      const f=await Filesystem.writeFile({path:'schrauberbuch-'+today()+'.json',data:json,directory:Directory.Cache,encoding:Encoding.UTF8});
      await Share.share({title:'Schrauberbuch-Sicherung',dialogTitle:'Sicherung speichern oder senden',files:[f.uri]});
      setStat('Sicherung bereit');
      return;
    }catch(e){
      if(/cancel/i.test(String((e&&e.message)||e)))return;
    }
  }
  modal('<h2>Sicherung</h2><p style="margin-bottom:10px">Kopiere diesen Text und bewahre ihn in einer Datei auf. Über „Sicherung laden“ spielst du ihn wieder ein.</p><textarea id="bk" class="big" readonly></textarea><div class="actions"><button class="btn" data-act="copyBk">Kopieren</button><button class="btn ghost" data-act="closeModal">Schließen</button></div>');
  $('#bk').value=json;
}
let pendingRestore=null;
function readRestore(file){
  const rd=new FileReader();
  rd.onload=()=>{
    try{
      const d=JSON.parse(String(rd.result));
      if(!d||!Array.isArray(d.vehicles)||!Array.isArray(d.logs))throw new Error('format');
      pendingRestore=d;
      confirmModal('Sicherung einspielen','Die Sicherung enthält '+d.vehicles.length+' Fahrzeug(e) und '+d.logs.length+' Einträge. Deine aktuellen Daten werden dadurch ersetzt.','applyRestore');
    }catch(e){modal('<h2>Datei nicht lesbar</h2><p style="margin-bottom:14px">Das ist keine Sicherung aus dem Schrauberbuch. Wähle die .json-Datei, die du zuvor gespeichert hast.</p><div class="actions"><button class="btn" data-act="closeModal">Schließen</button></div>');}
  };
  rd.readAsText(file);
}

/* ---------- Ereignisse ---------- */
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b)return;
  const act=b.dataset.act,id=b.dataset.id;
  const v=veh();
  switch(act){
    case 'pick':S.activeId=id;ui.q='';ui.cat='';ui.year='all';render();break;
    case 'tab':ui.tab=b.dataset.tab;render();window.scrollTo(0,0);break;
    case 'newVeh':openVeh();break;
    case 'editVeh':openVeh(id);break;
    case 'newInt':openInt();break;
    case 'editInt':openInt(id);break;
    case 'addDefaults':{
      const have=new Set(v.intervals.map(i=>i.name));
      INT_DEFAULTS.forEach(a=>{if(!have.has(a[0]))v.intervals.push(mkInt(a));});
      touch();render();break;
    }
    case 'done':{const it=v.intervals.find(x=>x.id===id);openLog(null,{title:it.name,cat:it.cat||'Sonstiges',iid:it.id});break;}
    case 'newLog':openLog();break;
    case 'editLog':openLog(id);break;
    case 'addSpec':v.specs.push({k:'',v:''});touch();render();{const els=document.querySelectorAll('.sk');const last=els[els.length-1];if(last)last.focus();}break;
    case 'delSpec':v.specs.splice(+b.dataset.i,1);touch();render();break;
    case 'closeModal':closeModal();break;
    case 'askDel':b.hidden=true;b.nextElementSibling.hidden=false;break;
    case 'cancelDel':{const c=b.closest('.confirm');c.hidden=true;c.previousElementSibling.hidden=false;break;}
    case 'delVeh':S.vehicles=S.vehicles.filter(x=>x.id!==id);S.logs=S.logs.filter(l=>l.vid!==id);S.activeId=S.vehicles[0]?S.vehicles[0].id:null;closeModal();touch();render();break;
    case 'delInt':v.intervals=v.intervals.filter(x=>x.id!==id);closeModal();touch();render();break;
    case 'delLog':S.logs=S.logs.filter(x=>x.id!==id);closeModal();touch();render();break;
    case 'loadExample':loadExample();break;
    case 'reload':location.reload();break;
    case 'backup':backup();break;
    case 'copyBk':{
      const ta=$('#bk');
      const sel=()=>{ta.focus();ta.select();};
      if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(ta.value).then(()=>{b.textContent='Kopiert';},sel);}else sel();
      break;
    }
    case 'applyRestore':
      if(pendingRestore){S=normalize(pendingRestore);pendingRestore=null;ui.tab='home';closeModal();touch();render();}
      break;
  }
});
document.addEventListener('submit',e=>{
  const f=e.target;e.preventDefault();
  const k=f.dataset.form;
  if(k==='veh')saveVeh(f);else if(k==='int')saveInt(f);else if(k==='log')saveLog(f);else if(k==='km')saveKm(f);
});
document.addEventListener('input',e=>{
  const t=e.target;const v=veh();
  if(t.id==='logq'){ui.q=t.value;$('#loglist').innerHTML=logListHTML(v);}
  else if(t.matches&&t.matches('.sk,.sv')&&v){v.specs[+t.dataset.i][t.classList.contains('sk')?'k':'v']=t.value;touch();}
  else if(t.id==='vnotes'&&v){v.notes=t.value;touch();}
});
document.addEventListener('change',e=>{
  const t=e.target;const v=veh();
  if(t.id==='logcat'){ui.cat=t.value;$('#loglist').innerHTML=logListHTML(v);}
  else if(t.id==='yearsel'){ui.year=t.value;render();}
  else if(t.name==='who')syncQuote();
  else if(t.id==='restoreFile'&&t.files&&t.files[0]){readRestore(t.files[0]);t.value='';}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#modal').hidden)closeModal();});

if(Capacitor.isNativePlatform()){
  CapApp.addListener('backButton',()=>{
    if(!$('#modal').hidden){closeModal();}
    else if(ui.tab!=='home'&&veh()){ui.tab='home';render();}
    else{CapApp.exitApp();}
  });
}
render();
load();
})();
