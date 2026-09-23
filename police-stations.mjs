import { policeApiFetch } from './police-api.mjs';

const endpoint = 'https://polisen.se/api/policestations';
const ttlMs = 24 * 60 * 60_000;
let cache = null, attemptedAt = 0, pending = null, lastError = null;
const detailTtlMs = 6 * 60 * 60_000;
const detailsCache = new Map();
const detailsPending = new Map();

export function normalizePoliceStations(rows) {
  if (!Array.isArray(rows)) throw new Error('Oväntat svar från Polisens stations-API');
  return rows.flatMap(row => {
    const location = row.location || {};
    const gps = String(location.gps || '').split(',').map(Number);
    const lat = Number(location.latitude ?? location.lat ?? gps[0] ?? row.latitude);
    const lon = Number(location.longitude ?? location.lon ?? gps[1] ?? row.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 54 || lat > 70 || lon < 10 || lon > 25) return [];
    return [{ id: String(row.id), name: String(row.name || ''), address: String(location.address || location.name || ''), lat, lon, services: Array.isArray(row.services) ? row.services.map(s => typeof s === 'string' ? s : s.name).filter(Boolean) : [], url: String(row.Url || row.url || `https://polisen.se/om-polisen/kontakt/polisstationer/`) }];
  });
}

export function policeStationsStatus() {
  return { status: !cache ? lastError ? 'unavailable' : 'not_checked' : lastError ? 'stale' : 'ok', fetchedAt: cache?.fetchedAt || null };
}

export async function readPoliceStations({ fetcher = policeApiFetch, now = Date.now } = {}) {
  if (!pending && (!attemptedAt || now() - attemptedAt >= ttlMs || (lastError && now() - attemptedAt >= 60_000))) {
    attemptedAt = now();
    pending = (async () => {
      try {
        const response = await fetcher(endpoint, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`Polisens API svarade ${response.status}`);
        cache = { items: normalizePoliceStations(await response.json()), fetchedAt: new Date(now()).toISOString() };
        lastError = null;
      } catch (error) { lastError = error.message || 'Kunde inte hämta polisstationer'; }
      finally { pending = null; }
    })();
  }
  await pending;
  return { items: cache?.items || [], fetchedAt: cache?.fetchedAt || null, stale: Boolean(lastError), status: cache ? lastError ? 'stale' : 'ok' : 'unavailable', error: lastError || undefined, source: endpoint };
}

export function normalizePoliceStationDetails(row) {
  if (!row || !/^\d{1,8}$/.test(String(row.id))) throw Object.assign(new Error('Stationens öppettider kunde inte hittas'), { status: 404 });
  return {
    id: String(row.id),
    name: String(row.name || ''),
    services: Array.isArray(row.services) ? row.services.map(service => ({
      name: String(service.name || ''),
      openingHours: Array.isArray(service.openingHours) ? service.openingHours.map(day => ({
        name: String(day.name || ''), date: day.date || null, isClosed: Boolean(day.isClosed), from: day.from || null, to: day.to || null
      })) : []
    })) : [],
    source: String(row.Url || row.url || 'https://polisen.se/om-polisen/om-webbplatsen/oppna-data/api-over-polisstationer/')
  };
}

export async function readPoliceStationDetails(id, { fetcher = policeApiFetch, now = Date.now } = {}) {
  if (!/^\d{1,8}$/.test(String(id))) throw Object.assign(new Error('Ogiltigt stations-id'), { status: 400 });
  const key = String(id), cached = detailsCache.get(key);
  if (cached && now() - cached.cachedAt < detailTtlMs) return cached.value;
  if (!detailsPending.has(key)) {
    const pending = (async () => {
      const response = await fetcher(`${endpoint}/${id}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw Object.assign(new Error(`Polisens API svarade ${response.status}`), { status: response.status === 429 ? 429 : 502 });
      const rows = await response.json();
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row || String(row.id) !== key) throw Object.assign(new Error('Stationens öppettider kunde inte hittas'), { status: 404 });
      const value = normalizePoliceStationDetails(row);
      detailsCache.set(key, { value, cachedAt: now() });
      return value;
    })().finally(() => detailsPending.delete(key));
    detailsPending.set(key, pending);
  }
  return detailsPending.get(key);
}
