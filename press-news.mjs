import { XMLParser, XMLValidator } from 'fast-xml-parser';

export const pressSources = [
  { id: 'aftonbladet', name: 'Aftonbladet', url: 'https://www.aftonbladet.se/nyheter/rss.xml', host: 'aftonbladet.se', images: ['aftonbladet.se', 'vgc.no'] },
  { id: 'expressen', name: 'Expressen', url: 'https://feeds.expressen.se/nyheter', host: 'expressen.se', images: ['expressen.se', 'bonniernews.se'] },
];
const parser = new XMLParser({ ignoreAttributes: false, processEntities: true, parseTagValue: false });
const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
const text = value => String(value?.['#text'] ?? value ?? '');
const plain = value => text(value).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
function safeUrl(value, hosts) {
  try {
    const url = new URL(text(value));
    if (url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) return url.href;
  } catch { /* Missing or unsupported feed URL. */ }
  return undefined;
}

export function parsePressFeed(xml, source, now = Date.now()) {
  if (Buffer.byteLength(xml) > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Ogiltigt RSS-flöde');
  const parsed = parser.parse(xml);
  if (!parsed?.rss || !Object.hasOwn(parsed.rss, 'channel')) throw new Error('Oväntat RSS-format');
  return list(parsed.rss.channel.item).slice(0, 100).flatMap(item => {
    const title = plain(item.title).slice(0, 300);
    const url = safeUrl(item.link, [source.host]);
    const published = Date.parse(text(item.pubDate));
    if (!title || !url || !Number.isFinite(published) || published > now + 60_000 || published < now - 7 * 86_400_000) return [];
    const description = text(item.description);
    const embeddedImage = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(description)?.[1];
    const candidates = [
      ...list(item.enclosure).filter(media => /^image\//i.test(media['@_type'] || '')).map(media => media['@_url']),
      ...list(item['media:content']).filter(media => !media['@_type'] || /^image\//i.test(media['@_type'])).map(media => media['@_url']),
      ...list(item['media:thumbnail']).map(media => media['@_url']), embeddedImage,
    ];
    const imageUrl = candidates.map(candidate => safeUrl(candidate, source.images)).find(Boolean);
    return [{ id: `${source.id}:${url}`, title, summary: plain(description).slice(0, 360), publishedAt: new Date(published).toISOString(), url, source: url, sourceName: source.name, imageUrl }];
  });
}

export function createPressNews({ fetcher = fetch, now = Date.now, ttl = 300_000 } = {}) {
  const states = pressSources.map(source => ({ source, items: [], fetchedAt: null, error: null, attempted: null, pending: null }));
  const snapshot = () => {
    const sources = states.map(({ source, fetchedAt, error }) => ({ name: source.name, url: source.url, fetchedAt, error, status: error ? fetchedAt ? 'stale' : 'unavailable' : fetchedAt ? 'ok' : 'not_checked' }));
    const fetchedAt = sources.map(source => source.fetchedAt).filter(Boolean).sort()[0] || null;
    const error = sources.filter(source => source.error).map(source => `${source.name}: ${source.error}`).join('; ') || null;
    return { items: [...new Map(states.flatMap(state => state.items).map(item => [item.id, item])).values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 60), fetchedAt, stale: Boolean(error), error, status: error ? fetchedAt ? 'stale' : 'unavailable' : fetchedAt ? 'ok' : 'not_checked', sources };
  };
  return { snapshot, async read() {
    await Promise.all(states.map(async state => {
      if (!state.pending && (state.attempted === null || now() - state.attempted >= ttl)) {
        state.attempted = now();
        state.pending = (async () => {
          try {
            const response = await fetcher(state.source.url, { signal: AbortSignal.timeout(12_000), headers: { Accept: 'application/rss+xml, application/xml, text/xml', 'User-Agent': 'TryggPuls/2.1' } });
            if (!response.ok) throw new Error(`RSS svarade HTTP ${response.status}`);
            // Bound the response while reading, including chunked responses.
            const reader = response.body.getReader(), chunks = [];
            let bytes = 0;
            try {
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                bytes += value.byteLength;
                if (bytes > 2_000_000) { await reader.cancel(); throw new Error('Oväntat stort RSS-flöde'); }
                chunks.push(value);
              }
            } finally { reader.releaseLock(); }
            state.items = parsePressFeed(Buffer.concat(chunks).toString('utf8'), state.source, now());
            state.fetchedAt = new Date(now()).toISOString();
            state.error = null;
          } catch (error) { state.error = error.message || 'Nyheterna kunde inte hämtas'; }
        })().finally(() => { state.pending = null; });
      }
      await state.pending;
    }));
    return snapshot();
  } };
}
export const pressNews = createPressNews();
