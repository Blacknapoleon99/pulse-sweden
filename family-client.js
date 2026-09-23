// Family features use session cookies. The browser only reports GPS after a user presses Start.
const familyUi = { account: null, config: null, overview: null, watchId: null, point: null, inviteUrl: null, lastSent: 0 };
const familyRoot = document.getElementById('family-app');
async function familyRequest(path, method = 'GET', value = {}) {
  const response = await fetch('/api/family/' + path, { method, credentials: 'same-origin',
    headers: method === 'GET' ? {} : { 'Content-Type':'application/json', 'X-TryggPuls-Action':'1' },
    body: method === 'GET' ? undefined : JSON.stringify(value) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Försök igen senare');
  return data;
}
const inviteFromHash = () => location.hash.startsWith('#familj-invite=') ? location.hash.slice('#familj-invite='.length) : null;
const safeText = value => esc(value);

async function familyRefresh() {
  try {
    familyUi.config ||= await familyRequest('config');
    familyUi.overview = await familyRequest('me');
  } catch (err) {
    if (err.message.includes('Logga in')) familyUi.overview = null;
    else { familyRoot.innerHTML = `<p class="source-warning">Familjefunktioner är inte tillgängliga: ${safeText(err.message)}</p>`; return; }
  }
  renderFamilyApp();
}

function familyError(err) { showToast(err.message || 'Familjefunktionen svarar inte'); }
function familyForm(id, heading, fields, submit) {
  return `<form id="${id}" class="family-form"><h3>${heading}</h3>${fields}<button class="btn-primary" type="submit">${submit}</button></form>`;
}
function renderFamilyApp() {
  const info = familyUi.overview;
  window.familySharedZones = info?.zones || [];
  if (typeof renderFamilyZonesOnMap === 'function') renderFamilyZonesOnMap(false);
  if (!familyUi.config) { familyRoot.textContent = 'Familjefunktionen är inte tillgänglig.'; return; }
  const demoNote = familyUi.config.persistent ? '' : '<p class="source-warning">Lokal testmiljö: familjekonton sparas bara tills servern startas om. Publicerad tjänst kräver en beständig databas.</p>';
  if (!info) {
    familyRoot.innerHTML = `${demoNote}<p>Varje medlem använder ett eget konto. En inbjudan ger tillgång till samma familj. Position delas först när personen startar den på sin egen enhet.</p>
      ${familyForm('family-register','Skapa konto',`<label>Namn<input name="name" required maxlength="80" autocomplete="name"></label><label>E-post<input name="email" type="email" required autocomplete="email"></label><label>Lösenord (minst 12 tecken)<input name="password" type="password" required minlength="12" autocomplete="new-password"></label>`,'Skapa konto')}
      ${familyForm('family-login','Jag har redan konto',`<label>E-post<input name="email" type="email" required autocomplete="email"></label><label>Lösenord<input name="password" type="password" required autocomplete="current-password"></label>`,'Logga in')}`;
    for (const action of ['register','login']) familyRoot.querySelector('#family-' + action).addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form));
      try { await familyRequest(action,'POST',values); form.reset(); await familyRefresh(); }
      catch (err) { familyError(err); }
    });
    return;
  }
  const { user, family, members, zones, alerts } = info;
  const invitation = inviteFromHash();
  if (!family) {
    familyRoot.innerHTML = `${demoNote}<p>Inloggad som <strong>${safeText(user.display_name)}</strong>. Starta en familj eller använd en inbjudan.</p>
      ${familyForm('family-create','Skapa familj',`<label>Familjens namn<input name="name" required minlength="2" maxlength="80" placeholder="T.ex. Familjen Andersson"></label>`,'Skapa familj')}
      ${familyForm('family-join','Gå med i familj',`<label>Inbjudningskod<input name="token" required value="${safeText(invitation || '')}" autocomplete="off"></label>`,'Gå med')}
      <button id="family-logout" class="btn-secondary">Logga ut</button><button class="family-delete-account btn-secondary">Radera mitt konto</button>`;
    familyRoot.querySelector('#family-create').addEventListener('submit', event => familySubmit(event,'group'));
    familyRoot.querySelector('#family-join').addEventListener('submit', event => familySubmit(event,'join',true));
    familyRoot.querySelector('#family-logout').addEventListener('click', familyLogout);
    familyRoot.querySelector('.family-delete-account').addEventListener('click', familyDeleteAccount);
    return;
  }
  const isOwner = family.owner_id === user.id;
  const tracking = familyUi.watchId !== null;
  familyRoot.innerHTML = `${demoNote}
    <div class="family-heading"><div><div class="eyebrow">DELADE PLATSER & VARNINGAR</div><h2>${safeText(family.name)}</h2><p>Inloggad som ${safeText(user.display_name)} · ${members.length} medlem${members.length === 1 ? '' : 'mar'}</p></div><button id="family-logout" class="btn-secondary">Logga ut</button></div>
    <div class="family-consent"><h3>Min position</h3><p>${tracking ? 'GPS-delning pågår i den här öppna webbläsaren.' : 'GPS är pausad. Starta den själv på varje enhet. Senaste position används i högst 15 minuter efter att sidan stängts.'}</p>
      <div class="family-actions"><button id="family-start" class="btn-primary" ${tracking ? 'disabled' : ''}>📍 Starta min platsdelning</button><button id="family-stop" class="btn-secondary">Stoppa & radera min position</button></div>
      <small>Webbläsaren kan inte hålla GPS aktiv när sidan är stängd. Push kan nå dig om en ny polisnotis publiceras medan den senast delade positionen fortfarande är aktuell.</small></div>
    <div class="family-consent"><h3>Telefonaviseringar</h3><p>${familyUi.config.pushEnabled ? 'Aktivera push på varje telefon där du vill få familjens varningar.' : 'Push är inte konfigurerat på denna server.'}</p><button id="family-push" class="btn-secondary" ${familyUi.config.pushEnabled ? '' : 'disabled'}>🔔 Aktivera push</button></div>
    <section><h3>Medlemmar</h3><div class="family-list">${members.map(member => `<div><strong>${safeText(member.display_name)}</strong> · ${member.sharing && member.updated_at ? 'Delade senast ' + safeText(formatSwedishTime(Date.parse(member.updated_at))) : 'Ingen aktuell platsdelning'}</div>`).join('')}</div></section>
    ${isOwner ? `<section class="family-owner"><h3>Bjud in en medlem</h3><p>Engångslänk, giltig i 24 timmar. Den inbjudna personen skapar eller loggar in på sitt eget konto och väljer själv om GPS får delas.</p><button id="family-invite" class="btn-secondary">Skapa inbjudningslänk</button><div id="family-invite-result"></div></section>` : '<button id="family-leave" class="btn-secondary">Lämna familjen och stoppa platsdelning</button>'}
    <section><h3>Familjens zoner</h3><p class="data-note">En trygg plats larmar när en medlem lämnar den. En bevakad plats larmar vid inträde. Zoner är era egna val och är inte klassade av Polisen.</p>
      ${isOwner ? familyForm('family-zone-form','Lägg till zon',`<label>Namn<input name="name" required maxlength="80" placeholder="Hem, skola eller annan plats"></label><label>Plats<input id="family-zone-address" type="text" placeholder="Ange ort eller adress"></label><div id="family-zone-suggestions" class="suggestions-list" hidden></div><label>Typ<select name="kind"><option value="safe">Trygg plats · larm vid utträde</option><option value="watch">Bevakad plats · larm vid inträde</option></select></label><label>Radie<select name="radius"><option value="300">300 m</option><option value="500">500 m</option><option value="1000">1 000 m</option></select></label>`,'Spara zon') : ''}
      <div class="family-list">${zones.length ? zones.map(z => `<div><strong>${safeText(z.name)}</strong> · ${z.kind === 'safe' ? 'Trygg plats' : 'Bevakad plats'} · ${z.radius} m ${isOwner ? `<button class="family-delete-zone" data-id="${safeText(z.id)}" aria-label="Ta bort ${safeText(z.name)}">Ta bort</button>` : ''}</div>`).join('') : '<p>Inga delade zoner ännu.</p>'}</div></section>
    <section><h3>Senaste familjevarningar</h3><div class="family-list">${alerts.length ? alerts.map(a => `<article><strong>${safeText(a.title)}</strong><small>${safeText(formatSwedishTime(Date.parse(a.created_at)))}</small><p>${safeText(a.detail)}</p>${a.source_url?.startsWith('https://polisen.se/') ? `<a href="${safeText(a.source_url)}" target="_blank" rel="noopener">Läs polisnotisen ↗</a>` : ''}</article>`).join('') : '<p>Inga familjevarningar ännu.</p>'}</div></section>
    <section class="family-guidance"><h3>Om gängrekrytering</h3><p>Polisen beskriver rekrytering av unga som en risk på flera platser och även på nätet. Det finns ingen verifierad, aktuell nationell karta över rekryteringszoner i dessa datakällor. Läs Polisens publicerade råd och varningssignaler:</p>
      <a href="https://polisen.se/utsatt-for-brott/brott-mot-barn-och-unga/sa-rekryteras-barn-och-unga-in-i-kriminalitet/" target="_blank" rel="noopener">Så rekryteras barn och unga ↗</a><br><a href="https://polisen.se/aktuellt/nyheter/mitt/2026/maj/unga-rekryteras-till-kriminella-uppdrag-pa-flera-platser/" target="_blank" rel="noopener">Polisens exempel från Gästrikland, maj 2026 ↗</a>
    </section><button class="family-delete-account btn-secondary">Radera mitt konto</button>`;
  familyRoot.querySelector('#family-logout').addEventListener('click', familyLogout);
  familyRoot.querySelector('.family-delete-account').addEventListener('click', familyDeleteAccount);
  familyRoot.querySelector('#family-start').addEventListener('click', familyStartTracking);
  familyRoot.querySelector('#family-stop').addEventListener('click', familyStopTracking);
  familyRoot.querySelector('#family-push').addEventListener('click', familyEnablePush);
  familyRoot.querySelector('#family-invite')?.addEventListener('click', familyInvite);
  familyRoot.querySelector('#family-leave')?.addEventListener('click', async () => { try { await familyStopTracking(); await familyRequest('leave','POST'); await familyRefresh(); } catch (err) { familyError(err); } });
  familyRoot.querySelectorAll('.family-delete-zone').forEach(button => button.addEventListener('click', async () => {
    try { await familyRequest('zones/' + encodeURIComponent(button.dataset.id),'DELETE'); await familyRefresh(); } catch (err) { familyError(err); }
  }));
  if (isOwner) {
    const input = familyRoot.querySelector('#family-zone-address');
    const suggestions = familyRoot.querySelector('#family-zone-suggestions');
    setupPlaceSearch(input,suggestions,point => { familyUi.point = point; });
    familyRoot.querySelector('#family-zone-form').addEventListener('submit', async event => {
      event.preventDefault();
      if (!familyUi.point) { showToast('Sök och välj en plats ur listan.'); return; }
      const values = Object.fromEntries(new FormData(event.currentTarget));
      try { await familyRequest('zones','POST',{...values,lat:familyUi.point.lat,lon:familyUi.point.lon,radius:Number(values.radius)}); familyUi.point=null; await familyRefresh(); }
      catch (err) { familyError(err); }
    });
  }
}

async function familySubmit(event, action, removeInvite = false) {
  event.preventDefault();
  const form = event.currentTarget;
  try { await familyRequest(action,'POST',Object.fromEntries(new FormData(form))); form.reset(); if (removeInvite) history.replaceState(null,'','#familj'); await familyRefresh(); }
  catch (err) { familyError(err); }
}
async function familyLogout() {
  familyUi.watchId !== null && navigator.geolocation.clearWatch(familyUi.watchId);
  familyUi.watchId = null;
  try {
    const registration = await navigator.serviceWorker?.getRegistration('/family-sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) { await familyRequest('push','DELETE',{endpoint:subscription.endpoint}); await subscription.unsubscribe(); }
    await familyRequest('logout','POST'); familyUi.overview = null; renderFamilyApp();
  } catch (err) { familyError(err); }
}
async function familyDeleteAccount() {
  if (!confirm('Radera ditt konto och dina sparade familjeuppgifter permanent?')) return;
  if (familyUi.watchId !== null) navigator.geolocation.clearWatch(familyUi.watchId);
  familyUi.watchId = null;
  try { await familyRequest('account','DELETE'); familyUi.overview = null; renderFamilyApp(); showToast('Kontot är raderat.'); }
  catch (err) { familyError(err); }
}
function familyStartTracking() {
  if (!navigator.geolocation) { showToast('GPS stöds inte av den här webbläsaren.'); return; }
  if (familyUi.watchId !== null) return;
  familyUi.lastSent = 0;
  familyUi.watchId = navigator.geolocation.watchPosition(async position => {
    if (familyUi.watchId === null || Date.now() - familyUi.lastSent < 20_000) return;
    familyUi.lastSent = Date.now();
    try {
      const result = await familyRequest('location','POST',{lat:position.coords.latitude,lon:position.coords.longitude,accuracy:position.coords.accuracy});
      if (result.accuracyWarning) showToast('GPS är för osäker för zonvarning. Positionen visas ändå i familjen.');
      if (!result.policeAvailable) showToast('Polisens data är tillfälligt otillgänglig. Zonvarningar fungerar fortfarande.');
      await familyRefresh();
    } catch (err) { familyError(err); }
  }, err => { familyUi.watchId !== null && navigator.geolocation.clearWatch(familyUi.watchId); familyUi.watchId=null; showToast(err.message || 'GPS kunde inte hämtas'); renderFamilyApp(); },{enableHighAccuracy:true,maximumAge:15000,timeout:12000});
  renderFamilyApp();
}
async function familyStopTracking() {
  if (familyUi.watchId !== null) navigator.geolocation.clearWatch(familyUi.watchId);
  familyUi.watchId = null;
  familyUi.lastSent = 0;
  try { await familyRequest('stop','POST'); await familyRefresh(); showToast('Platsdelning stoppad och den senaste positionen raderad.'); }
  catch (err) { familyError(err); }
}
async function familyInvite() {
  try {
    const { token } = await familyRequest('invite','POST');
    const url = `${location.origin}/#familj-invite=${token}`;
    familyUi.inviteUrl = url;
    const result = familyRoot.querySelector('#family-invite-result');
    result.innerHTML = `<label>Inbjudningslänk<input readonly aria-label="Inbjudningslänk" value="${safeText(url)}"></label><button type="button" class="btn-secondary">Kopiera länk</button>`;
    result.querySelector('button').addEventListener('click', () => navigator.clipboard.writeText(url).then(() => showToast('Länken kopierad.')).catch(() => showToast('Markera länken och kopiera den manuellt.')));
  } catch (err) { familyError(err); }
}
function vapidBytes(value) {
  const padding = '='.repeat((4-value.length%4)%4);
  const decoded = atob((value+padding).replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from(decoded,ch => ch.charCodeAt(0));
}
async function familyEnablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) { showToast('Push stöds inte i den här webbläsaren.'); return; }
  try {
    const registration = await navigator.serviceWorker.register('/family-sw.js');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { showToast('Tillåt aviseringar för att aktivera push.'); return; }
    const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:vapidBytes(familyUi.config.vapidPublic)});
    await familyRequest('push','POST',{subscription:subscription.toJSON()});
    showToast('Push aktiverat på den här enheten.');
  } catch (err) { familyError(err); }
}
document.addEventListener('DOMContentLoaded', () => {
  familyRefresh();
  setInterval(() => { if (!document.hidden && familyUi.overview) familyRefresh(); },30_000);
});
