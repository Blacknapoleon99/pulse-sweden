import { XMLParser } from 'fast-xml-parser';

const feeds = [
  'https://polisen.se/aktuellt/rss/hela-landet/nyheter-hela-landet/',
  'https://polisen.se/aktuellt/rss/hela-landet/pressmeddelanden-hela-landet/'
];
const parser = new XMLParser({ ignoreAttributes: true, processEntities: true });
let snapshot;
let checkedAt = 0;
let pending;

export function parseZoneNewsFeed(xml, now = Date.now()) {
  const parsed = parser.parse(xml);
  const rawItems = parsed?.rss?.channel?.item;
  if (!rawItems) return [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];
  return items.flatMap(item => {
    const title = String(item.title || '').trim();
    const description = String(item.description || '').replace(/<[^>]*>/g, '').trim();
    if (!/säkerhetszon|visitationszon/i.test(`${title} ${description}`)) return [];
    const publishedTime = Date.parse(item.pubDate);
    if (!Number.isFinite(publishedTime) || now - publishedTime > 60 * 86400_000 || publishedTime > now + 86400_000) return [];
    const publishedAt = new Date(publishedTime).toISOString();
    let url;
    try { url = new URL(String(item.link)); } catch { return []; }
    if (url.protocol !== 'https:' || url.hostname !== 'polisen.se') return [];
    return [{ title, summary: description.slice(0, 240), publishedAt, url: url.href }];
  });
}

export function zoneNewsStatus() {
  return { status: !snapshot ? 'not_checked' : snapshot.stale ? 'stale' : 'ok', fetchedAt: snapshot?.fetchedAt || null };
}

export async function readZoneNews() {
  if (snapshot && Date.now() - checkedAt < 30 * 60_000) return snapshot;
  if (!pending) {
    checkedAt = Date.now();
    pending = (async () => {
      try {
        const entries = await Promise.all(feeds.map(async url => {
          const response = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'TryggPuls/2.1' } });
          if (!response.ok) throw new Error(`Polisens RSS svarade ${response.status}`);
          const xml = await response.text();
          if (xml.length > 1_000_000) throw new Error('Oväntat stort RSS-flöde');
          return parseZoneNewsFeed(xml);
        }));
        const unique = new Map(entries.flat().map(item => [item.url, item]));
        snapshot = { items: [...unique.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 10), fetchedAt: new Date().toISOString(), stale: false, sourceUrl: 'https://polisen.se/aktuellt/rss/' };
      } catch (error) {
        console.warn('[police-zone-news] RSS-kontroll misslyckades:', error.message);
        snapshot = snapshot ? { ...snapshot, stale: true } : { items: [], fetchedAt: null, stale: true, sourceUrl: 'https://polisen.se/aktuellt/rss/' };
        checkedAt = Date.now() - 25 * 60_000; // återförsök efter fem minuter
      } finally { pending = null; }
      return snapshot;
    })();
  }
  return pending;
}
