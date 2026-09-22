const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.documentElement.lang='sv';
document.title='Pulse — en tydligare bild av din plats';
const setText=(selector,value)=>{const node=$(selector);if(node)node.textContent=value;};
setText('.active-nav','Utforska kartan');setText('#sources','Källstatus');setText('#about','Om datan ↗');
setText('.public-data','ENDAST OFFENTLIGA DATA');setText('.demo','KONCEPTDEMO');
setText('.intro .eyebrow','LITE MER MEDVETEN.');if($('.intro h1'))$('.intro h1').innerHTML='Din plats.<br>En tydligare bild.';
if($('.intro p'))$('.intro p').innerHTML='Se de senaste publika polisnotiserna<br>över hela Sverige.';
const search=$('#search');if(search){search.placeholder='Sök plats eller händelse…';search.setAttribute('aria-label','Sök plats eller händelse');}
setText('#map-title','Hela Sverige');setText('#map-subtitle','Publika notiser, grupperade per område.');
setText('.map-heading .eyebrow','DEN STÖRRE BILDEN');setText('.map-button span','Visa resultat');
setText('.legend-note','Antal grupperar notiser vid samma områdescentrum');setText('.map-note','ⓘ  Ungefärliga områdescentrum, inte händelseplatser. Notiser kan vara fördröjda.');
setText('#sources-dialog .eyebrow','KÄLLTRANSPARENS');setText('#sources-dialog h2','Vad kartan bygger på.');
setText('#sources-dialog p','Varje källa har en tydlig publik roll. Pulse använder inte person-, adress- eller bostadsuppgifter i denna vy.');
setText('#about-dialog .eyebrow','LÄR KÄNN DIN KÄLLA');setText('#about-dialog h2','Medvetenhet med sammanhang.');
const aboutContexts=document.querySelectorAll('#about-dialog .data-context');if(aboutContexts[1])aboutContexts[1].textContent='Skatteverkets sida beskriver aggregerad, maskinläsbar statistik. DIGG beskriver ramverket för öppna data. Domstolsverkets anslutning här gäller publicerad rättspraxis från högre instanser, inte ett komplett flöde från tingsrätter.';
const regionSelect=$('#region'),periodSelect=$('#period');
if(regionSelect)regionSelect.setAttribute('aria-label','Område');
if(periodSelect){periodSelect.setAttribute('aria-label','Tidsperiod');periodSelect.options[0].textContent='Senaste 24 timmarna';periodSelect.options[1].textContent='Senaste 3 dagarna';periodSelect.options[2].textContent='All tillgänglig data';}
document.querySelectorAll('#chips [data-cat]').forEach(button=>{button.textContent={all:'Alla notiser',traffic:'Trafik',crime:'Brott',other:'Övrigt'}[button.dataset.cat]||button.textContent;});
const parseTime=s=>Date.parse(String(s).trim().replace(/^(\d{4}-\d\d-\d\d) (\d{1,2}):(\d\d:\d\d)\s*([+-]\d\d:\d\d)$/ ,(_,d,h,ms,z)=>`${d}T${h.padStart(2,'0')}:${ms}${z}`));
const time=t=>Number.isFinite(t)?new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(t):'Tid saknas';
const category=t=>/trafik|rattfylleri/i.test(t)?'traffic':/stöld|rån|misshandel|mord|hot|bedrägeri|inbrott|narkotika|våld|skadegörelse|vapen|sexual|ofredande/i.test(t)?'crime':'other';
const symbols={traffic:'↗',crime:'◇',other:'◎'};
let all=[],visible=[],cat='all',selected=null,busy=false;
const map=L.map('map',{zoomControl:false}).setView([61,16],5);
L.control.zoom({position:'bottomright'}).addTo(map);
const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
const markers=L.layerGroup().addTo(map);
let tileNotice=false;tiles.on('tileerror',()=>{if(!tileNotice){toast('Some map tiles could not load. Reports are still available in the list.');tileNotice=true;}});
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,6500);}
function fit(){const points=visible.filter(e=>e.gps).map(e=>e.gps);if(points.length)map.fitBounds(points,{padding:[65,65],maxZoom:8});}
function render(){
  const q=$('#search').value.toLocaleLowerCase(),region=$('#region').value,hours=Number($('#period').value);
  visible=all.filter(e=>(!q||`${e.name} ${e.summary} ${e.location.name}`.toLocaleLowerCase().includes(q))&&(!region||e.location.name===region)&&(cat==='all'||e.cat===cat)&&(!hours||e.ts>=Date.now()-hours*3600000));
  $('#count').textContent=visible.length;$('#map-title').textContent=region||'Hela Sverige';$('#map-subtitle').textContent=`${visible.length} publika notiser i urvalet`;
  $('#feed').innerHTML=visible.length?visible.map(e=>`<button class="report ${selected===e.id?'selected':''}" data-id="${e.id}"><span class="report-icon ${e.cat}">${symbols[e.cat]}</span><span class="report-body"><span class="report-meta"><b>${esc(e.type)}</b><span>${time(e.ts)}</span></span><h3>${esc(e.name)}</h3><p>${esc(e.summary)}</p><span class="report-location">⌖ ${esc(e.location.name)}</span></span></button>`).join(''):'<div class="empty">Inga notiser matchar filtren.<br>Prova ett annat område eller en längre tidsperiod.</div>';
  markers.clearLayers();const grouped=new Map();for(const e of visible){if(!e.gps)continue;const key=e.gps.join(',');if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(e);}
  for(const group of grouped.values()){
    const e=group[0],c=group.every(r=>r.cat===e.cat)?e.cat:'other';
    L.marker(e.gps,{icon:L.divIcon({className:`area-marker ${c}`,html:String(group.length),iconSize:[33,33]}),title:`${e.location.name}: ${group.length} reports`,alt:`Reports for ${e.location.name}`}).addTo(markers).on('click',()=>{if(group.length>1){$('#region').value=e.location.name;render();}showDetail(e.id);});
  }
  if(selected&&!visible.some(e=>e.id===selected)){selected=null;$('#detail').hidden=true;}
}
function showDetail(id){
  const e=all.find(e=>e.id===id);if(!e)return;selected=id;render();
  let link='';try{const url=new URL(e.url,'https://polisen.se');if(url.origin==='https://polisen.se')link=`<a href="${esc(url.href)}" target="_blank" rel="noopener">Läs hela notisen på Polisen.se ↗</a>`;}catch{}
  $('#detail').innerHTML=`<button class="close" id="close-detail" aria-label="Stäng notis">×</button><div class="eyebrow">PUBLIK POLISNOTIS</div><h2>${esc(e.name)}</h2><p>${esc(e.summary)}</p><small>⌖ ${esc(e.location.name)}<br>Notistid: ${time(e.ts)} · svensk tid<br>${e.gps?'Ungefärligt kommun- eller länscentrum':'Platskoordinater saknas'}</small>${link}`;$('#detail').hidden=false;$('#close-detail').onclick=()=>{selected=null;$('#detail').hidden=true;render();};
  if(e.gps)map.flyTo(e.gps,Math.max(map.getZoom(),7),{duration:.6});
}
$('#feed').onclick=e=>{const button=e.target.closest('[data-id]');if(button)showDetail(Number(button.dataset.id));};
$('#search').oninput=()=>render();$('#region').onchange=()=>{render();fit();};$('#period').onchange=()=>{render();fit();};
$('#chips').onclick=e=>{const button=e.target.closest('[data-cat]');if(!button)return;cat=button.dataset.cat;document.querySelectorAll('[data-cat]').forEach(b=>{b.classList.toggle('chosen',b===button);b.setAttribute('aria-pressed',b===button);});render();};
const sourceLabels={active:'Ansluten',"review-required":'Granskning krävs',"not-connected":'Ej ansluten'};
function renderSources(sources){
  $('#source-status').innerHTML=sources.map(source=>{
    const status=Object.hasOwn(sourceLabels,source.status)?source.status:'not-connected';
    return `<article class="source-row"><header><h3>${esc(source.name)}</h3><span class="source-badge ${status}">${sourceLabels[status]}</span></header><p>${esc(source.detail)}</p><small>${esc(source.scope)} · ${esc(source.refresh)}</small></article>`;
  }).join('');
}
async function openSources(){
  $('#sources-dialog').showModal();$('#source-status').textContent='Läser källstatus…';
  try{const response=await fetch('/api/sources',{signal:AbortSignal.timeout(10_000)});if(!response.ok)throw Error('Sources unavailable');const data=await response.json();renderSources(Array.isArray(data.sources)?data.sources:[]);}
  catch{$('#source-status').textContent='Källstatus är tillfälligt otillgänglig. Publika polisnotiser är fortfarande tillgängliga.';}
  loadLegalUpdates();
}
function ensureLegalPanel(){
  let panel=$('#legal-updates');if(panel)return panel;
  panel=document.createElement('section');panel.id='legal-updates';panel.className='source-status';panel.innerHTML='<h3>Senaste rättspraxis</h3><p class="data-context">Källänkade publiceringar från Domstolsverket. Detta är en separat informationsyta och kopplas aldrig till personer, bostäder eller kartans områden.</p><div id="legal-list">Läser rättsuppdateringar…</div>';
  $('#source-status').after(panel);return panel;
}
async function loadLegalUpdates(){
  const panel=ensureLegalPanel(),list=$('#legal-list');
  try{const response=await fetch('/api/legal-updates',{signal:AbortSignal.timeout(15_000)});if(!response.ok)throw Error('Legal updates unavailable');const data=await response.json();
    list.innerHTML=(data.updates||[]).slice(0,6).map(item=>`<article class="source-row"><header><h4>${esc(item.court)}</h4><small>${esc(item.date||'Datum saknas')}</small></header><p>${esc(item.summary||'Ingen sammanfattning publicerad.')}</p><small>${esc(item.caseNumbers.join(', ')||'Målnummer saknas')} · <a href="${esc(item.source)}" target="_blank" rel="noopener">Öppna källa ↗</a></small></article>`).join('')||'<p class="data-context">Inga publiceringar hittades just nu.</p>';
  }catch{list.innerHTML='<p class="data-context">Rättsuppdateringar är tillfälligt otillgängliga.</p>';}
}
$('#reset').onclick=fit;$('#sources').onclick=openSources;$('#close-sources').onclick=()=>$('#sources-dialog').close();$('#about').onclick=()=>$('#about-dialog').showModal();$('#close-about').onclick=()=>$('#about-dialog').close();
async function refresh(){
  if(busy)return;busy=true;$('#refresh').disabled=true;
  try{
    const r=await fetch('/api/events',{signal:AbortSignal.timeout(20000)}),data=await r.json();if(!r.ok||!data.fetchedAt)throw Error(data.error||'Feed unavailable');
    all=data.events.filter(e=>Number.isSafeInteger(e.id)&&e.location&&typeof e.name==='string').map(e=>{const gps=String(e.location.gps).split(',').map(Number);return {...e,ts:parseTime(e.datetime),cat:category(e.type),gps:gps.length===2&&gps.every(Number.isFinite)&&Math.abs(gps[0])<=90&&Math.abs(gps[1])<=180?gps:null};}).sort((a,b)=>(b.ts||0)-(a.ts||0));
    const previous=$('#region').value;$('#region').innerHTML='<option value="">All Sweden</option>'+[...new Set(all.map(e=>e.location.name))].sort().map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');$('#region').value=previous;
    $('#status').textContent=data.stale?'Fördröjd källa':'Uppdateras automatiskt';$('#status-dot').classList.toggle('stale',data.stale);$('#updated').textContent=`Kontrollerad ${time(Date.parse(data.fetchedAt))}`;
    render();if(data.stale)toast('Källan kunde inte uppdateras. Visar senaste lyckade hämtning.');
  }catch(e){$('#status').textContent='Källan otillgänglig';$('#status-dot').classList.add('stale');if(!all.length)$('#feed').innerHTML='<div class="empty">Polisens öppna feed kunde inte nås. Vi försöker igen automatiskt.</div>';else toast('Anslutningen bröts. Befintliga notiser visas fortfarande.');}
  finally{busy=false;$('#refresh').disabled=false;}
}
$('#refresh').onclick=()=>refresh();refresh();setInterval(refresh,65000);
