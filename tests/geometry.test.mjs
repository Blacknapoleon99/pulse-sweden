import assert from 'node:assert';
import { test } from 'node:test';

import { pointToSegmentDistanceMeters, minDistanceToRouteMeters } from '../server.mjs';

test('punkt 0.001° N om segment -> ~124 m', () => {
  const route = [[18.0680, 59.3350], [18.0710, 59.3420]];
  const dist = minDistanceToRouteMeters(59.3430, 18.0700, route);
  assert.ok(Math.abs(dist - 124.3) < 1, `förväntat ~124.3 m, fick ${dist.toFixed(1)} m`);
});

test('punkt på segment -> 0.000 m', () => {
  const route = [[18.0680, 59.3350], [18.0710, 59.3420]];
  const dist = minDistanceToRouteMeters(59.3385, 18.0695, route);
  assert.ok(dist < 0.001, `förväntat 0, fick ${dist}`);
});

test('L-formad rutt -> korrekt avstånd', () => {
  const route = [[18.0600, 59.3300], [18.0700, 59.3300], [18.0700, 59.3400]];
  const dist = minDistanceToRouteMeters(59.3350, 18.0650, route);
  assert.ok(Math.abs(dist - 283.9) < 1, `förväntat ~283.9 m, fick ${dist.toFixed(1)} m`);
});

test('punkt bortom änden av rutt', () => {
  const route = [[18.0680, 59.3350], [18.0710, 59.3420]];
  const dist = minDistanceToRouteMeters(59.3500, 18.0750, route);
  assert.ok(dist > 900 && dist < 920, `förväntat ~913 m, fick ${dist.toFixed(1)} m`);
});

test('punkt ~100 m söder om rutt', () => {
  const route = [[18.0680, 59.3350], [18.0710, 59.3420]];
  const dist = minDistanceToRouteMeters(59.3345, 18.0695, route);
  assert.ok(dist > 95 && dist < 108, `förväntat ~101.5 m, fick ${dist.toFixed(1)} m`);
});

test('tom rutt returnerar Infinity', () => {
  assert.strictEqual(minDistanceToRouteMeters(59.33, 18.06, []), Infinity);
});

test('rutt med en punkt returnerar Infinity', () => {
  assert.strictEqual(minDistanceToRouteMeters(59.33, 18.06, [[18.06, 59.33]]), Infinity);
});
