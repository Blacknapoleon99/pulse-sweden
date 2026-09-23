const collectionUrl = 'https://inspire.msb.se/skyddsrum/ogc/features/v1/collections/US_civilProtectionSite/items';
const sourceUrl = 'https://inspire.msb.se/skyddsrum/ogc/features/v1/openapi?f=text/html';
const ttlMs = 15 * 60_000;
const maxFeatures = 5_000;
const maxBytes = 8_000_000;
const cache = new Map();
const pending = new Map();
let lastError = null;

function distanceMeters(a, b) {
  const radians = value => value * Math.PI / 180;
  const dLat = radians(b.lat - a.lat), dLon = radians(b.lon - a.lon);
  const lat1 = radians(a.lat), lat2 = radians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function shelterPoints(feature) {
  const geometry = feature?.geometry;
  if (geometry?.type === 'Point' && Array.isArray(geometry.coordinates)) return [geometry.coordinates];
  if (geometry?.type === 'MultiPoint' && Array.isArray(geometry.coordinates)) return geometry.coordinates;
  return [];
}

export function normalizeShelterCollection(payload, { lat, lon, radiusMeters = 2_000 } = {}) {
  if (payload?.type !== 'FeatureCollection' || !Array.isArray(payload.features)) throw new Error('Oväntat GeoJSON-svar från skyddsrumsregistret');
  const origin = { lat: Number(lat), lon: Number(lon) };
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lon) || !Number.isFinite(radiusMeters)) throw new Error('Ogiltig sökposition');
  const items = [];
  for (const feature of payload.features) {
    const properties = feature.properties || {};
    const candidates = shelterPoints(feature).flatMap(point => {
      const [pointLon, pointLat] = point.map(Number);
      if (!Number.isFinite(pointLat) || !Number.isFinite(pointLon) || pointLat < 54 || pointLat > 70 || pointLon < 10 || pointLon > 25) return [];
      const distance = distanceMeters(origin, { lat: pointLat, lon: pointLon });
      return distance <= radiusMeters ? [{ lat: pointLat, lon: pointLon, distance }] : [];
    }).sort((a, b) => a.distance - b.distance);
    if (!candidates.length) continue;
    const closest = candidates[0];
    items.push({
      id: String(feature.id || properties.id || properties.inspireid || ''),
      code: String(properties.name || ''),
      capacity: Number.isFinite(Number(properties.numberofoccupants)) ? Number(properties.numberofoccupants) : null,
      lat: closest.lat,
      lon: closest.lon,
      distanceMeters: Math.round(closest.distance),
      source: sourceUrl
    });
  }
  return items.sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 12);
}

export function shelterStatus() {
  const newest = [...cache.values()].sort((a, b) => String(b.fetchedAt).localeCompare(String(a.fetchedAt)))[0];
  return { status: newest ? newest.stale ? 'stale' : 'ok' : lastError ? 'unavailable' : 'not_checked', fetchedAt: newest?.fetchedAt || null };
}

export async function readNearbyShelters(lat, lon, radiusMeters = 2_000, { fetcher = fetch, now = Date.now } = {}) {
  const origin = { lat: Number(lat), lon: Number(lon) };
  const radius = Number(radiusMeters);
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lon) || origin.lat < 54 || origin.lat > 70 || origin.lon < 10 || origin.lon > 25 || !Number.isFinite(radius) || radius < 500 || radius > 5_000) {
    throw Object.assign(new Error('Sökpositionen eller radien är ogiltig'), { status: 400 });
  }
  const cacheKey = `${origin.lat.toFixed(3)},${origin.lon.toFixed(3)},${radius}`;
  const cached = cache.get(cacheKey);
  if (cached && now() - Date.parse(cached.fetchedAt) < ttlMs) return cached;
  if (!pending.has(cacheKey)) {
    const job = (async () => {
      try {
        const paddedRadius = radius + 150;
        const latDelta = paddedRadius / 111_320;
        const lonDelta = paddedRadius / (111_320 * Math.cos(origin.lat * Math.PI / 180));
        const centerLat = Math.round(origin.lat * 1_000) / 1_000;
        const centerLon = Math.round(origin.lon * 1_000) / 1_000;
        const roundedLatDelta = latDelta + Math.abs(centerLat - origin.lat) + 0.00005;
        const roundedLonDelta = lonDelta + Math.abs(centerLon - origin.lon) + 0.00005;
        const bbox = [centerLon - roundedLonDelta, centerLat - roundedLatDelta, centerLon + roundedLonDelta, centerLat + roundedLatDelta].join(',');
        const url = new URL(collectionUrl);
        url.searchParams.set('f', 'application/geo+json');
        url.searchParams.set('limit', String(maxFeatures));
        url.searchParams.set('bbox', bbox);
        const response = await fetcher(url.href, { headers: { Accept: 'application/geo+json, application/geo+json-seq;q=0.9, application/json;q=0.8' }, signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw Object.assign(new Error(`Skyddsrumsregistret svarade ${response.status}`), { status: 502 });
        const text = await response.text();
        if (text.length > maxBytes) throw new Error('Skyddsrumsregistret skickade ett för stort svar');
        const payload = JSON.parse(text);
        const data = {
          items: normalizeShelterCollection(payload, { ...origin, radiusMeters: radius }),
          fetchedAt: new Date(now()).toISOString(),
          stale: false,
          status: 'ok',
          incomplete: Number(payload.numberMatched) > (payload.features || []).length,
          source: sourceUrl
        };
        cache.set(cacheKey, data);
        lastError = null;
        return data;
      } catch (error) {
        lastError = error.message || 'Skyddsrumsregistret kunde inte hämtas';
        const stale = cache.get(cacheKey);
        if (stale) return { ...stale, stale: true, status: 'stale', error: lastError };
        return { items: [], fetchedAt: null, stale: true, status: 'unavailable', error: lastError, source: sourceUrl };
      }
    })().finally(() => pending.delete(cacheKey));
    pending.set(cacheKey, job);
  }
  return pending.get(cacheKey);
}

export { sourceUrl as shelterSource };
