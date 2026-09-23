import test from 'node:test';
import assert from 'node:assert/strict';
import { parseZoneNewsFeed } from '../police-zone-news.mjs';

test('RSS om säkerhetszoner visas som källänk men inte som aktiv polygon', () => {
  const now = Date.parse('2026-09-23T12:00:00Z');
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>Beslut om säkerhetszon i Testort</title><description>Polisens beslut och karta.</description><pubDate>Tue, 22 Sep 2026 12:00:00 GMT</pubDate><link>https://polisen.se/aktuellt/nyheter/test/</link></item>
    <item><title>En äldre visitationszon</title><pubDate>Tue, 01 Jan 2025 12:00:00 GMT</pubDate><link>https://polisen.se/old/</link></item>
    <item><title>Ny säkerhetszon</title><pubDate>Tue, 22 Sep 2026 12:00:00 GMT</pubDate><link>https://example.org/unsafe/</link></item>
  </channel></rss>`;
  const items = parseZoneNewsFeed(xml, now);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://polisen.se/aktuellt/nyheter/test/');
  assert.equal('geometry' in items[0], false);
});
