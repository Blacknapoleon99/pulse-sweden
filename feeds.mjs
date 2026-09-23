// Independent caches keep a failed source from erasing another source's data.
export function createFeed({ url, normalize, ttl = 65_000, fetcher = fetch, now = Date.now }) {
  let cache = null, error = null, lastAttempt = null, pending = null;
  const snapshot = () => ({
    items: cache?.items || [], fetchedAt: cache?.fetchedAt || null,
    stale: Boolean(error), error,
    status: error ? (cache ? 'stale' : 'unavailable') : cache ? 'ok' : 'not_checked',
    nextCheckAt: lastAttempt === null ? null : new Date(lastAttempt + ttl).toISOString()
  });
  return {
    snapshot,
    async read() {
      if (!pending && (lastAttempt === null || now() - lastAttempt >= ttl)) {
        lastAttempt = now();
        pending = (async () => {
          try {
            const response = await fetcher(url, { headers: { Accept: 'application/json', 'User-Agent': 'TryggPuls/2.1' }, signal: AbortSignal.timeout(12_000) });
            if (!response.ok) throw new Error(`Källan svarade med HTTP ${response.status}`);
            const raw = await response.json();
            if (!Array.isArray(raw)) throw new Error('Oväntat svarsformat från källan');
            const items = normalize(raw);
            cache = { items, fetchedAt: new Date(now()).toISOString() };
            error = null;
          } catch (err) { error = err.message || 'Källan kunde inte hämtas'; }
        })().finally(() => { pending = null; });
      }
      await pending;
      return snapshot();
    }
  };
}

export function sourceLink(value, fallback) {
  try {
    const url = new URL(value, fallback);
    if (url.protocol === 'https:' && url.hostname === new URL(fallback).hostname) return url.href;
  } catch { /* use the provider's home page */ }
  return fallback;
}

export function normalizeCrisis(items, type) {
  return items.filter(item => item && item.Headline).map(item => ({
    id: String(item.Id ?? item.ContentId), type,
    title: String(item.Headline), summary: String(item.Preamble || item.BodyText || ''),
    publishedAt: item.ChangedDate || item.Published || null,
    area: Array.isArray(item.Area) ? item.Area.map(a => a.Description || a.Name || a.sv || '').filter(Boolean).join(', ') : '',
    areas: Array.isArray(item.Area) ? item.Area.map(a => ({ name: a.Description || a.Name || a.sv || '', code: a.Code || a.code || null, geometry: a.area?.geometry || a.Geometry || a.geometry || null })).filter(a => a.name || a.geometry) : [],
    source: sourceLink(item.Web, 'https://www.krisinformation.se/')
  }));
}

export function normalizeWarnings(items) {
  return items.flatMap(item => (item.warningAreas || []).map(area => ({
    id: `${item.id}-${area.id}`, title: area.eventDescription?.sv || item.event?.sv || 'Vädervarning',
    area: area.areaName?.sv || '', level: area.warningLevel?.code || 'UNKNOWN',
    levelLabel: area.warningLevel?.sv || 'Varning', publishedAt: area.published || null,
    validFrom: area.approximateStart || null, validTo: area.approximateEnd || null,
    areaCode: Array.isArray(area.affectedAreas) ? area.affectedAreas.map(a => a.id).filter(Number.isFinite) : [],
    geometry: area.area?.geometry || null,
    descriptions: [...(item.descriptions || []), ...(area.descriptions || [])].map(d => ({ title: d.title?.sv || '', text: d.text?.sv || '' })),
    source: 'https://www.smhi.se/vader/prognoser-och-varningar/varningar-och-meddelanden'
  }))).sort((a, b) => ({ RED: 0, ORANGE: 1, YELLOW: 2, MESSAGE: 3 }[a.level] ?? 4) - ({ RED: 0, ORANGE: 1, YELLOW: 2, MESSAGE: 3 }[b.level] ?? 4));
}

const crisis = 'https://api.krisinformation.se/v3';
export const feeds = {
  vmas: createFeed({ url: `${crisis}/vmas?allCounties=true&language=sv`, normalize: rows => normalizeCrisis(rows, 'vma') }),
  notices: createFeed({ url: `${crisis}/notices?allCounties=true&language=sv`, normalize: rows => normalizeCrisis(rows, 'notice') }),
  news: createFeed({ url: `${crisis}/news?allCounties=true&language=sv&days=7`, normalize: rows => normalizeCrisis(rows, 'news'), ttl: 300_000 }),
  preparedness: createFeed({ url: `${crisis}/features?language=sv`, normalize: rows => normalizeCrisis(rows, 'guide'), ttl: 3_600_000 }),
  weather: createFeed({ url: 'https://opendata-download-warnings.smhi.se/ibww/api/version/1/warning.json', normalize: normalizeWarnings })
};

export async function readCrisis(sources = feeds) {
  const [vmas, notices] = await Promise.all([sources.vmas.read(), sources.notices.read()]);
  const errors = [vmas.error && `VMA: ${vmas.error}`, notices.error && `Notiser: ${notices.error}`].filter(Boolean);
  return { vmas: vmas.items, notices: notices.items,
    fetchedAt: [vmas.fetchedAt, notices.fetchedAt].filter(Boolean).sort()[0] || null,
    stale: errors.length > 0, partialError: errors.join('; ') || null, error: errors.join('; ') || null,
    sources: { vmas, notices } };
}

// Bounded, serial, cached requests for community geocoding/routing services.
export function createRequestQueue(fetcher, { spacing = 1100, ttl = 86_400_000, limit = 250 } = {}) {
  const cache = new Map(), pending = new Map();
  let tail = Promise.resolve(), nextStart = 0;
  return function request(url) {
    const hit = cache.get(url);
    if (hit && hit.expires > Date.now()) return Promise.resolve(hit.data);
    if (pending.has(url)) return pending.get(url);
    if (pending.size >= 12) return Promise.reject(new Error('Tjänsten är upptagen. Försök igen om en stund.'));
    const job = tail.then(async () => {
      const wait = nextStart - Date.now();
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      nextStart = Date.now() + spacing;
      const data = await fetcher(url);
      cache.delete(url);
      cache.set(url, { data, expires: Date.now() + ttl });
      while (cache.size > limit) cache.delete(cache.keys().next().value);
      return data;
    }).finally(() => pending.delete(url));
    pending.set(url, job);
    tail = job.catch(() => {});
    return job;
  };
}
