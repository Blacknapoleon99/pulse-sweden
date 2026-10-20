import test from 'node:test';
import assert from 'node:assert/strict';
import { createPressNews, parsePressFeed, pressSources } from '../press-news.mjs';

const now = Date.parse('2026-10-20T10:00:00Z');
const rss = items => `<rss version="2.0"><channel>${items}</channel></rss>`;
const article = (host, extra = '', overrides = {}) => `<item><title>${overrides.title || 'Polisen varnar &amp; informerar'}</title><link>${overrides.url || `https://www.${host}/nyheter/test`}</link><pubDate>${overrides.date || new Date(now - 1000).toUTCString()}</pubDate>${extra}</item>`;

test('publisher feeds preserve real image enclosures, HTML thumbnails, source names and article links', () => {
  const afton = parsePressFeed(rss(article('aftonbladet.se', '<enclosure url="https://akamai.vgc.no/v2/images/photo?w=700&amp;format=auto" type="image/jpeg"/>')), pressSources[0], now)[0];
  assert.equal(afton.sourceName, 'Aftonbladet');
  assert.equal(afton.title, 'Polisen varnar & informerar');
  assert.equal(afton.imageUrl, 'https://akamai.vgc.no/v2/images/photo?w=700&format=auto');
  const express = parsePressFeed(rss(article('expressen.se', `<description><![CDATA[<img src='https://static.bonniernews.se/images/photo.jpg'/><p>En <b>nyhet</b>.</p>]]></description>`)), pressSources[1], now)[0];
  assert.equal(express.sourceName, 'Expressen');
  assert.equal(express.imageUrl, 'https://static.bonniernews.se/images/photo.jpg');
  assert.equal(express.summary, 'En nyhet .');
  assert.equal(express.url, 'https://www.expressen.se/nyheter/test');
});

test('feed rejects malformed XML, DTDs, unsafe links, foreign image hosts and invalid dates', () => {
  assert.throws(() => parsePressFeed('<html>unavailable</html>', pressSources[0], now));
  assert.throws(() => parsePressFeed('<rss><channel></rss>', pressSources[0], now));
  assert.throws(() => parsePressFeed('<!DOCTYPE rss><rss><channel/></rss>', pressSources[0], now));
  assert.throws(() => parsePressFeed('x'.repeat(2_000_001), pressSources[0], now));
  const invalid = [{ url: 'javascript:alert(1)' }, { url: 'https://aftonbladet.se.evil.test/news' }, { url: 'https://user:password@aftonbladet.se/news' }, { date: 'bad' }, { date: new Date(now + 3600_000).toUTCString() }, { date: new Date(now - 8 * 86_400_000).toUTCString() }];
  assert.deepEqual(parsePressFeed(rss(invalid.map(item => article('aftonbladet.se', '', item)).join('')), pressSources[0], now), []);
  const [withoutImage] = parsePressFeed(rss(article('aftonbladet.se', '<enclosure url="https://untrusted.test/tracker.jpg" type="image/jpeg"/>')), pressSources[0], now);
  assert.equal(withoutImage.imageUrl, undefined);
});

test('sources cache independently, deduplicate concurrent reads, keep last good articles and recover', async () => {
  let clock = now, calls = 0, failAfton = false;
  const feed = createPressNews({ now: () => clock, ttl: 100, fetcher: async url => {
    calls++;
    const afton = url.includes('aftonbladet');
    return new Response(afton && failAfton ? '<html>error</html>' : rss(article(afton ? 'aftonbladet.se' : 'expressen.se')));
  } });
  const [first, concurrent] = await Promise.all([feed.read(), feed.read()]);
  assert.deepEqual(first, concurrent); assert.equal(calls, 2); assert.equal(first.items.length, 2);
  await feed.read(); assert.equal(calls, 2);
  clock += 101; failAfton = true;
  const partial = await feed.read();
  assert.equal(partial.stale, true); assert.equal(partial.items.length, 2);
  assert.equal(partial.sources[0].fetchedAt, first.sources[0].fetchedAt);
  assert.equal(partial.sources[1].status, 'ok');
  clock += 101; failAfton = false;
  assert.equal((await feed.read()).status, 'ok');
});

test('a first-source failure is partial; two failures are unavailable; valid empty RSS is successful', async () => {
  const partial = await createPressNews({ now: () => now, fetcher: async url => { if (url.includes('aftonbladet')) throw Error('offline'); return new Response(rss(article('expressen.se'))); } }).read();
  assert.equal(partial.status, 'stale'); assert.equal(partial.items.length, 1); assert.ok(partial.error.includes('Aftonbladet'));
  const unavailable = await createPressNews({ fetcher: async () => { throw Error('offline'); } }).read();
  assert.equal(unavailable.status, 'unavailable'); assert.equal(unavailable.fetchedAt, null);
  const empty = await createPressNews({ fetcher: async () => new Response(rss('')) }).read();
  assert.equal(empty.status, 'ok'); assert.deepEqual(empty.items, []);
});
