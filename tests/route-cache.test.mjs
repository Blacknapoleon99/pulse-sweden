import assert from 'node:assert/strict';
import test from 'node:test';
import { createRouteCache } from '../route-cache.mjs';

test('route cache refreshes expiry for active routes and expires idle routes', () => {
  let now = 0;
  const cache = createRouteCache({ ttlMs: 100, now: () => now, idFactory: () => 'route-id' });
  const route = { geometry: { type: 'LineString', coordinates: [[18, 59], [18.1, 59]] } };
  const id = cache.put(route);

  now = 90;
  assert.equal(cache.get(id), route);
  now = 180;
  assert.equal(cache.get(id), route);
  now = 281;
  assert.equal(cache.get(id), null);
});

test('route cache evicts its oldest entry at the configured bound', () => {
  let nextId = 0;
  const cache = createRouteCache({ maxEntries: 2, idFactory: () => `route-${++nextId}` });
  const first = cache.put({ distance: 1 });
  const second = cache.put({ distance: 2 });
  cache.put({ distance: 3 });

  assert.equal(cache.get(first), null);
  assert.equal(cache.get(second).distance, 2);
});
