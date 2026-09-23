const $ = selector => document.querySelector(selector);
let token = '';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

async function adminRequest(path, method = 'GET', body) {
  const response = await fetch(path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json', 'X-TryggPuls-Action': '1' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Servern svarade ${response.status}`);
  return data;
}

function renderZones(items) {
  const container = $('#admin-zones');
  container.innerHTML = items.length ? items.map(zone => `<article class="admin-zone"><div><span class="admin-status status-${escapeHtml(zone.status)}">${escapeHtml(({ draft: 'Utkast', review: 'Redo för publicering', published: 'Publicerad', ended: 'Avslutad' })[zone.status] || zone.status)}</span><h3>${escapeHtml(zone.name)}</h3><p>${escapeHtml(zone.sourceTitle)} · ${escapeHtml(zone.sourceDate?.slice(0, 10) || '')}</p><a href="${escapeHtml(zone.sourceUrl)}" target="_blank" rel="noopener">Öppna myndighetskällan ↗</a><p>Giltig: ${escapeHtml(zone.validFrom?.slice(0, 16) || '')}${zone.validTo ? ` – ${escapeHtml(zone.validTo.slice(0, 16))}` : ''}</p></div><div class="admin-zone-actions">${zone.status === 'draft' ? `<button data-action="review" data-id="${escapeHtml(zone.id)}" class="btn-secondary">Markera granskad</button>` : ''}${zone.status === 'review' ? `<button data-action="publish" data-id="${escapeHtml(zone.id)}" class="btn-primary">Publicera zon</button>` : ''}${zone.status === 'published' ? `<button data-action="end" data-id="${escapeHtml(zone.id)}" class="btn-danger">Avsluta zon</button>` : ''}</div></article>`).join('') : '<p>Inga zoner registrerade.</p>';
}

async function refresh() {
  const { items } = await adminRequest('/api/admin/zones');
  renderZones(items);
}

$('#admin-connect').addEventListener('click', async () => {
  token = $('#admin-token').value.trim();
  if (!token) { $('#admin-status').textContent = 'Skriv administratörsnyckeln.'; return; }
  $('#admin-status').textContent = 'Kontrollerar åtkomst…';
  try {
    await refresh();
    $('#zone-form').hidden = false;
    $('#admin-refresh').disabled = false;
    $('#admin-status').textContent = 'Ansluten. Zonlistan är uppdaterad.';
  } catch (error) { token = ''; $('#admin-status').textContent = error.message; }
});

$('#admin-refresh').addEventListener('click', async () => {
  try { await refresh(); $('#admin-status').textContent = 'Zonlistan är uppdaterad.'; }
  catch (error) { $('#admin-status').textContent = error.message; }
});

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
