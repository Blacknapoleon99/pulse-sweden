import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFeed, createRequestQueue, normalizeWarnings, normalizeCrisis, readCrisis } from '../feeds.mjs';

test('crisis failures retain source-specific cached VMA and never claim a successful empty feed', async () => {
  const unavailable = { items: [], fetchedAt: null, stale: true, error: 'offline' };
  const firstFailure = await readCrisis({ vmas: { read: async () => unavailable }, notices: { read: async () => unavailable } });
  assert.equal(firstFailure.fetchedAt, null); assert.equal(firstFailure.stale, true);
  const cached = { items: [{ id: 'vma', title: 'Brand' }], fetchedAt: '2026-09-22T12:00:00Z', stale: true, error: 'offline' };
  const partial = await readCrisis({ vmas: { read: async () => cached }, notices: { read: async () => ({ items: [], fetchedAt: '2026-09-23T12:00:00Z', stale: false }) } });
  assert.equal(partial.vmas.length, 1); assert.equal(partial.fetchedAt, cached.fetchedAt); assert.equal(partial.stale, true);
});

test('feed coalesces requests, keeps last good data after failure, then recovers', async () => {
  let time = 1000, calls = 0, fail = false;
  const feed = createFeed({ url: 'https://example.test', now: () => time, ttl: 100, normalize: rows => rows,
    fetcher: async () => { calls++; if (fail) throw new Error('offline'); return { ok: true, json: async () => [{ id: calls }] }; } });
  const [first, concurrent] = await Promise.all([feed.read(), feed.read()]);
  assert.deepEqual(first, concurrent); assert.equal(calls, 1);
  await feed.read(); assert.equal(calls, 1);
  time += 101; fail = true;
  const stale = await feed.read();
  assert.equal(stale.status, 'stale'); assert.deepEqual(stale.items, first.items); assert.equal(stale.fetchedAt, first.fetchedAt);
  await feed.read(); assert.equal(calls, 2);
  time += 101; fail = false;
  assert.equal((await feed.read()).status, 'ok'); assert.equal(calls, 3);
});

test('first failure is unavailable; successful empty response is valid', async () => {
  const bad = createFeed({ url: 'x', normalize: rows => rows, fetcher: async () => ({ ok: false, status: 503 }) });
  assert.equal((await bad.read()).fetchedAt, null);
  assert.equal(bad.snapshot().status, 'unavailable');
  const empty = createFeed({ url: 'x', normalize: rows => rows, fetcher: async () => ({ ok: true, json: async () => [] }) });
  assert.equal((await empty.read()).status, 'ok');
  const malformed = createFeed({ url: 'x', normalize: rows => rows, fetcher: async () => ({ ok: true, json: async () => ({}) }) });
  assert.equal((await malformed.read()).status, 'unavailable');
});

test('SMHI areas keep severity, validity and complete advice', () => {
  const raw = [{ id: 1, event: { sv: 'Regn' }, warningAreas: [
    { id: 2, areaName: { sv: 'Skåne' }, warningLevel: { code: 'YELLOW', sv: 'Gul' }, descriptions: [{ title: { sv: 'Råd' }, text: { sv: 'Undvik översvämmade vägar.' } }] },
    { id: 3, warningLevel: { code: 'RED', sv: 'Röd' }, approximateEnd: '2026-09-24T12:00:00Z' }
  ] }];
  const rows = normalizeWarnings(raw);
  assert.equal(rows.length, 2); assert.equal(rows[0].level, 'RED');
  assert.equal(rows[1].descriptions[0].text, 'Undvik översvämmade vägar.');
  assert.equal(rows[0].validTo, '2026-09-24T12:00:00Z');
});

test('Krisinformation uses article links and rejects unsafe links', () => {
  const rows = normalizeCrisis([{ Id: 1, Headline: 'Test', Web: 'https://www.krisinformation.se/nyhet', Area: [{ Description: 'Skåne' }] }, { Id: 2, Headline: 'Test', Web: 'javascript:alert(1)' }], 'news');
  assert.equal(rows[0].source, 'https://www.krisinformation.se/nyhet');
  assert.equal(rows[0].area, 'Skåne');
  assert.equal(rows[1].source, 'https://www.krisinformation.se/');
});

test('request queue deduplicates and caches requests and continues after failure', async () => {
  let calls = 0;
  const request = createRequestQueue(async url => { calls++; if (url === 'bad') throw new Error('offline'); return url; }, { spacing: 0 });
  assert.deepEqual(await Promise.all([request('a'), request('a')]), ['a', 'a']);
  assert.equal(calls, 1); await request('a'); assert.equal(calls, 1);
  await assert.rejects(request('bad')); assert.equal(await request('b'), 'b');
});
