const $ = selector => document.querySelector(selector);
let token = '';
let previewUrls = [];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

async function refreshCommunity() {
  const data = await adminRequest('/api/admin/community');
  previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls = [];
  const actionForm = (target, actions) => `<form data-community-action class="admin-zone-actions"><input type="hidden" name="targetId" value="${escapeHtml(target)}"><label>Åtgärd<select name="action">${actions.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><label>Orsak<textarea name="reason" required minlength="3" maxlength="600" rows="2"></textarea></label><button class="btn-secondary" type="submit">Spara granskningsåtgärd</button></form>`;
  const photos = data.photos.map(report=>`<article class="admin-zone"><div><strong>Obekräftad användarrapport</strong><h3>${escapeHtml(report.title)}</h3><p>${escapeHtml(report.body)}</p><p>${escapeHtml(report.author.alias)} · gäller till ${escapeHtml(report.expiresAt)}</p><img data-community-photo="${escapeHtml(report.id)}" alt="Privat bild för personalens granskning" style="max-width:100%;max-height:320px"><p><a href="/community#report=${encodeURIComponent(report.id)}" target="_blank" rel="noopener">Öppna rapport</a></p></div>${actionForm(report.id,[['approve-photo','Godkänn bilden'],['reject-photo','Avvisa bilden'],['remove-report','Ta bort rapporten']])}</article>`).join('');
  const flags = data.flags.map(flag=>{
    const reportTarget = flag.targetType==='comment'?'remove-comment':flag.targetType==='author'?'suspend-author':'remove-report';
    const author = flag.content?.author;
    return `<article class="admin-zone"><div><strong>Anmälan: ${escapeHtml(flag.targetType)}</strong><p>${escapeHtml(flag.reason)}</p><h3>${escapeHtml(flag.content?.title||author?.alias||'Innehållet är redan borttaget')}</h3><p>${escapeHtml(flag.content?.body||'')}</p>${flag.content?.id?`<a href="/community#report=${encodeURIComponent(flag.content.id)}">Öppna rapport</a>`:''}</div>${flag.content?actionForm(flag.targetId,[[reportTarget,'Ta bort innehåll / stäng av användare'],...(flag.targetType==='author'?[['restore-author','Återställ användare']]:[]) ]):''}${author&&flag.targetType!=='author'?actionForm(author.key,[['suspend-author','Stäng av bidragsgivare'],['restore-author','Återställ bidragsgivare']]):''}${actionForm(flag.id,[['action-flag','Markera hanterad'],['dismiss-flag','Avsluta utan åtgärd']])}</article>`;
  }).join('');
  $('#community-queue').innerHTML = photos+flags || '<p>Ingen bild eller anmälan väntar på granskning.</p>';
  $('#community-audit').innerHTML = data.audit.map(item=>`<p>${escapeHtml(item.created_at)} · ${escapeHtml(item.actor)} · ${escapeHtml(item.action)} · ${escapeHtml(item.reason)}</p>`).join('') || '<p>Inga granskningsåtgärder ännu.</p>';
  $('#community-admin-status').textContent = `${data.photos.length} bilder · ${data.flags.length} anmälningar`;
  await Promise.allSettled([...document.querySelectorAll('[data-community-photo]')].map(async img=>{
    const response=await fetch(`/api/admin/community/reports/${img.dataset.communityPhoto}/photo`,{headers:{Authorization:`Bearer ${token}`}});
    if(!response.ok)throw new Error('Bilden kunde inte hämtas');const blob=await response.blob();const url=URL.createObjectURL(blob);previewUrls.push(url);img.src=url;
  }));
}
document.addEventListener('submit',async event=>{
  const form=event.target.closest('[data-community-action]');if(!form)return;event.preventDefault();const button=form.querySelector('button');button.disabled=true;
  try {await adminRequest('/api/admin/community/actions','POST',Object.fromEntries(new FormData(form)));await refreshCommunity();}
  catch(error){$('#community-admin-status').textContent=error.message;}finally{button.disabled=false;}
});

async function adminRequest(path, method = 'GET', body) {
  const response = await fetch(path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json', 'X-TryggPuls-Action': '1' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Servern svarade ${response.status}`);
  return data;
}

function renderZones(items, canReview) {
  const container = $('#admin-zones');
  container.innerHTML = items.length ? items.map(zone => `<article class="admin-zone"><div><span class="admin-status status-${escapeHtml(zone.status)}">${escapeHtml(({ draft: 'Utkast', review: 'Redo för publicering', published: 'Publicerad', ended: 'Avslutad' })[zone.status] || zone.status)}</span><h3>${escapeHtml(zone.name)}</h3><p>${escapeHtml(zone.sourceTitle)} · ${escapeHtml(zone.sourceDate?.slice(0, 10) || '')}</p><a href="${escapeHtml(zone.sourceUrl)}" target="_blank" rel="noopener">Öppna myndighetskällan ↗</a><p>Giltig: ${escapeHtml(zone.validFrom?.slice(0, 16) || '')}${zone.validTo ? ` – ${escapeHtml(zone.validTo.slice(0, 16))}` : ''}</p></div><div class="admin-zone-actions">${canReview && zone.status === 'draft' ? `<button data-action="review" data-id="${escapeHtml(zone.id)}" class="btn-secondary">Markera granskad</button>` : ''}${canReview && zone.status === 'review' ? `<button data-action="publish" data-id="${escapeHtml(zone.id)}" class="btn-primary">Publicera zon</button>` : ''}${canReview && zone.status === 'published' ? `<button data-action="end" data-id="${escapeHtml(zone.id)}" class="btn-danger">Avsluta zon</button>` : ''}</div></article>`).join('') : '<p>Inga zoner registrerade.</p>';
}

async function refresh() {
  const [zoneResponse, mapResponse] = await Promise.all([
    adminRequest('/api/admin/zones'),
    adminRequest('/api/admin/map-items'),
  ]);
  $('#zone-form').hidden = mapResponse.canCreate !== true;
  $('#map-item-form').hidden = mapResponse.canCreate !== true;
  renderZones(zoneResponse.items, mapResponse.canReview === true);
  renderMapItems(mapResponse.items, mapResponse.canReview === true);
  $('#community-moderation').hidden = mapResponse.canReview !== true;
  if (mapResponse.canReview === true) {
    try { await refreshCommunity(); }
    catch(error) { $('#community-admin-status').textContent = error.message; }
  }
  $('#admin-status').textContent = `${mapResponse.role || 'behörig'} · ${mapResponse.canCreate ? 'kan skapa utkast' : 'kan läsa publiceringar'} · ${mapResponse.canReview ? 'kan granska och publicera' : 'publicering kräver granskarroll'}.`;
}

function renderMapItems(items, canReview) {
  $('#admin-map-items').innerHTML = items.length ? items.map(item => `<article class="admin-zone"><div><span class="admin-status status-${escapeHtml(item.status)}">${escapeHtml(({ draft: 'Utkast', review: 'Redo för publicering', published: 'Publicerad', ended: 'Avslutad' })[item.status] || item.status)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.kind === 'safety-notice' ? 'Säkerhetsnotis' : 'Servicepunkt')} · ${escapeHtml(item.lat)}, ${escapeHtml(item.lon)}</p><p>${escapeHtml(item.description)}</p><a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(item.sourceTitle)} ↗</a><p>Giltig till ${escapeHtml(item.validTo?.slice(0, 16) || '')}</p></div><div class="admin-zone-actions">${canReview && item.status === 'draft' ? `<button data-item-action="review" data-id="${escapeHtml(item.id)}" class="btn-secondary">Markera granskad</button>` : ''}${canReview && item.status === 'review' ? `<button data-item-action="publish" data-id="${escapeHtml(item.id)}" class="btn-primary">Publicera markör</button>` : ''}${canReview && item.status === 'published' ? `<button data-item-action="end" data-id="${escapeHtml(item.id)}" class="btn-danger">Avsluta</button>` : ''}</div></article>`).join('') : '<p>Inga markörer registrerade.</p>';
}

$('#admin-connect').addEventListener('click', async () => {
  token = $('#admin-token').value.trim();
  if (!token) { $('#admin-status').textContent = 'Skriv administratörsnyckeln.'; return; }
  $('#admin-status').textContent = 'Kontrollerar åtkomst…';
  try {
    await refresh();
    $('#admin-refresh').disabled = false;
    $('#admin-status').textContent = 'Ansluten. Administrationslistorna är uppdaterade.';
  } catch (error) { token = ''; $('#admin-status').textContent = error.message; }
});

$('#admin-refresh').addEventListener('click', async () => {
  try { await refresh(); $('#admin-status').textContent = 'Zonlistan är uppdaterad.'; }
  catch (error) { $('#admin-status').textContent = error.message; }
});

const zoneForm = $('#zone-form');
const zoneKind = zoneForm.elements.kind;
const validFromField = zoneForm.elements.validFrom;
const validToField = zoneForm.elements.validTo;
function localDateTimeValue(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function updateValidityLimit() {
  validToField.removeAttribute('max');
  if (zoneKind.value !== 'security-zone') return;
  const start = new Date(validFromField.value || Date.now());
  if (!Number.isFinite(start.getTime())) return;
  const latestEnd = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
  validToField.max = localDateTimeValue(latestEnd);
}
zoneKind.addEventListener('change', updateValidityLimit);
validFromField.addEventListener('change', updateValidityLimit);
updateValidityLimit();

$('#zone-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  try {
    data.geometry = JSON.parse(data.geometry);
    for (const field of ['sourceDate', 'validFrom', 'validTo']) if (data[field]) data[field] = new Date(data[field]).toISOString();
    await adminRequest('/api/admin/zones', 'POST', data);
    form.reset(); await refresh(); $('#admin-status').textContent = 'Utkastet sparades. Granska källa, karta och giltighet före publicering.';
  } catch (error) { $('#admin-status').textContent = error instanceof SyntaxError ? 'GeoJSON kunde inte läsas.' : error.message; }
});

$('#admin-zones').addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  button.disabled = true;
  try { await adminRequest(`/api/admin/zones/${encodeURIComponent(button.dataset.id)}/${button.dataset.action}`, 'POST', {}); await refresh(); }
  catch (error) { $('#admin-status').textContent = error.message; button.disabled = false; }
});

const mapItemForm = $('#map-item-form');
$('#map-item-form').addEventListener('submit', async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  for (const field of ['lat', 'lon']) data[field] = Number(data[field]);
  for (const field of ['sourceDate', 'validFrom', 'validTo']) data[field] = new Date(data[field]).toISOString();
  try {
    await adminRequest('/api/admin/map-items', 'POST', data);
    mapItemForm.reset();
    await refresh();
    $('#admin-status').textContent = 'Markören sparades som utkast. Granska källa, koordinat och giltighet innan publicering.';
  } catch (error) { $('#admin-status').textContent = error.message; }
});

$('#admin-map-items').addEventListener('click', async event => {
  const button = event.target.closest('[data-item-action]');
  if (!button) return;
  button.disabled = true;
  try {
    await adminRequest(`/api/admin/map-items/${encodeURIComponent(button.dataset.id)}/${button.dataset.itemAction}`, 'POST', {});
    await refresh();
  } catch (error) { $('#admin-status').textContent = error.message; button.disabled = false; }
});
