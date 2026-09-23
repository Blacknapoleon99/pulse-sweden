import { routeDistanceMeters } from './route-analysis.mjs';

export const SMHI_FIRE_RISK_URL = 'https://www.smhi.se/data/temperatur-och-vind/brandrisk';
const API_ROOT = 'https://opendata-download-metfcst.smhi.se/api/category/fwif1g/version/1';
const riskLabels = new Map([
  [1, 'Mycket liten'], [2, 'Liten'], [3, 'Måttlig'],
  [4, 'Stor'], [5, 'Mycket stor'], [6, 'Extremt stor']
]);

function normalizePeriod(row) {
  const parameters = Object.fromEntries((row.parameters || []).map(parameter => [parameter.name, parameter.values?.[0]]));
  const numberOrNull = value => value === undefined || value === null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const rawClass = numberOrNull(parameters.fwiindex);
  const riskClass = Number.isInteger(rawClass) && riskLabels.has(rawClass) ? rawClass : null;
  return {
    validTime: row.validTime || null,
    riskClass,
    riskLabel: riskClass ? riskLabels.get(riskClass) : 'Data saknas / ej säsong',
    fwi: numberOrNull(parameters.fwi),
    grassFireClass: numberOrNull(parameters.grassfire) !== null && numberOrNull(parameters.grassfire) >= 0 ? numberOrNull(parameters.grassfire) : null,
    temperatureC: numberOrNull(parameters.t),
    windMetersPerSecond: numberOrNull(parameters.ws),
    humidityPercent: numberOrNull(parameters.r)
  };
}

export function buildFireRiskUrl(lat, lon, period = 'hourly') {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new TypeError('Ogiltiga koordinater');
  }
  if (!['hourly', 'daily'].includes(period)) throw new TypeError('Ogiltig prognosperiod');
  return `${API_ROOT}/${period}/geotype/point/lon/${encodeURIComponent(lon)}/lat/${encodeURIComponent(lat)}/data.json`;
}

export function sampleRouteForFireRisk(coordinates, { maxSamples = 12, spacingMeters = 10_000 } = {}) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
  const segmentLengths = [];
  let totalMeters = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const length = routeDistanceMeters(coordinates[i - 1], coordinates[i]);
    segmentLengths.push(length);
    totalMeters += length;
  }
  if (!Number.isFinite(totalMeters) || totalMeters <= 0) return [];

  const count = Math.min(Math.max(2, maxSamples), Math.max(2, Math.ceil(totalMeters / spacingMeters) + 1));
  const samples = [];
  for (let i = 0; i < count; i++) {
    const distanceMeters = totalMeters * i / (count - 1);
    let distanceIntoRoute = distanceMeters;
    let segment = 0;
    while (segment < segmentLengths.length - 1 && distanceIntoRoute > segmentLengths[segment]) {
      distanceIntoRoute -= segmentLengths[segment];
      segment++;
    }
    const fraction = segmentLengths[segment] ? Math.min(1, distanceIntoRoute / segmentLengths[segment]) : 0;
    const start = coordinates[segment], end = coordinates[segment + 1];
    const lon = start[0] + (end[0] - start[0]) * fraction;
    const lat = start[1] + (end[1] - start[1]) * fraction;
    samples.push({ distanceMeters: Math.round(distanceMeters), lat, lon });
  }
  return samples;
}

export function selectFireRiskPeriod(periods, expectedAt, { maxDistanceMs = 3 * 60 * 60 * 1000 } = {}) {
  const targetTime = Date.parse(expectedAt);
  if (!Number.isFinite(targetTime) || !Array.isArray(periods) || !periods.length) return null;
  let closest = null, closestDistance = Infinity;
  for (const period of periods) {
    const time = Date.parse(period.validTime);
    if (!Number.isFinite(time)) continue;
    const distance = Math.abs(time - targetTime);
    if (distance < closestDistance) { closest = period; closestDistance = distance; }
  }
  return closestDistance <= maxDistanceMs ? closest : null;
}

export function createFireRiskService({ fetcher = fetch, now = Date.now, ttlMs = 20 * 60 * 1000, timeoutMs = 10_000 } = {}) {
  const cache = new Map();
  const pending = new Map();
  const retryAfter = new Map();
  let lastError = null;
  let lastFetchedAt = null;
  let lastStale = false;

  const snapshot = () => ({
    status: lastError ? (lastFetchedAt ? 'stale' : 'unavailable') : lastFetchedAt ? lastStale ? 'stale' : 'ok' : 'not_checked',
    fetchedAt: lastFetchedAt,
    error: lastError
  });

  async function read(lat, lon, period = 'hourly') {
    let url;
    try { url = buildFireRiskUrl(lat, lon, period); }
    catch (error) { return { status: 'unavailable', error: error.message, fetchedAt: null, periods: [] }; }

    const cacheKey = `${period}:${Number(lat).toFixed(3)}:${Number(lon).toFixed(3)}`;
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > now()) return { ...hit.result, cached: true };
    if (retryAfter.get(cacheKey) > now()) {
      return hit ? { ...hit.result, status: 'stale', stale: true, error: lastError || undefined } : { status: 'unavailable', source: SMHI_FIRE_RISK_URL, period, coordinate: { lat, lon }, fetchedAt: null, periods: [], error: lastError || 'SMHI:s källa väntar på ett nytt försök' };
    }
    if (!pending.has(cacheKey)) {
      const job = (async () => {
        try {
          const response = await fetcher(url, { headers: { Accept: 'application/json', 'User-Agent': 'TryggPuls/2.1' }, signal: AbortSignal.timeout(timeoutMs) });
          if (!response.ok) throw new Error(`SMHI svarade med HTTP ${response.status}`);
          const raw = await response.json();
          if (!Array.isArray(raw?.timeSeries)) throw new Error('SMHI:s brandriskdata hade ett oväntat format');
          const approvedAt = raw.approvedTime || null;
          const fetchedAt = new Date(now()).toISOString();
          const approvedAge = approvedAt ? now() - Date.parse(approvedAt) : Infinity;
          const stale = !Number.isFinite(approvedAge) || approvedAge > 36 * 60 * 60 * 1000;
          const periods = raw.timeSeries.map(normalizePeriod).filter(value => {
            const validTime = Date.parse(value.validTime);
            return Number.isFinite(validTime) && validTime >= now() - 60 * 60 * 1000;
          }).slice(0, period === 'hourly' ? 48 : 6);
          const result = {
            status: stale ? 'stale' : 'ok',
            source: SMHI_FIRE_RISK_URL,
            period,
            coordinate: { lat, lon },
            resolutionKm: 2.5,
            approvedAt,
            referenceTime: raw.referenceTime || null,
            fetchedAt,
            stale,
            periods
          };
          cache.set(cacheKey, { result, expiresAt: now() + ttlMs });
          while (cache.size > 500) cache.delete(cache.keys().next().value);
          lastError = null;
          lastFetchedAt = fetchedAt;
          lastStale = stale;
          retryAfter.delete(cacheKey);
          return result;
        } catch (error) {
          lastError = error.message || 'SMHI:s brandriskdata kunde inte hämtas';
          retryAfter.set(cacheKey, now() + 60_000);
          lastStale = true;
          const previous = cache.get(cacheKey)?.result;
          if (previous) return { ...previous, status: 'stale', stale: true, error: lastError };
          return { status: 'unavailable', source: SMHI_FIRE_RISK_URL, period, coordinate: { lat, lon }, fetchedAt: null, periods: [], error: lastError };
        }
      })().finally(() => pending.delete(cacheKey));
      pending.set(cacheKey, job);
    }
    return pending.get(cacheKey);
  }

  return { read, snapshot, clear: () => { cache.clear(); pending.clear(); retryAfter.clear(); lastError = null; lastFetchedAt = null; lastStale = false; } };
}
