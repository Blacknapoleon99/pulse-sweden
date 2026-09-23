import assert from 'node:assert';
import { test } from 'node:test';

import { parseSwedishTime } from '../server.mjs';

test('parseSwedishTime: "2026-09-22 17:10:38 +02:00" (mellanlag + kolon)', () => {
  const ts = parseSwedishTime('2026-09-22 17:10:38 +02:00');
  assert.ok(Number.isFinite(ts), 'ts ska vara ett tal, inte NaN');
  // 17:10:38 CEST = 15:10:38 UTC
  assert.strictEqual(ts, Date.parse('2026-09-22T15:10:38.000Z'));
});

test('parseSwedishTime: "2026-09-22 17:10:38+0200" (utan mellanslag)', () => {
  const ts = parseSwedishTime('2026-09-22 17:10:38+0200');
  assert.ok(Number.isFinite(ts));
  assert.strictEqual(ts, Date.parse('2026-09-22T15:10:38.000Z'));
});

test('parseSwedishTime: "2026-09-22 17:10:38 +0000" (UTC, ingen mellanslag)', () => {
  const ts = parseSwedishTime('2026-09-22 17:10:38 +0000');
  assert.ok(Number.isFinite(ts));
  assert.strictEqual(ts, Date.parse('2026-09-22T17:10:38.000Z'));
});

test('parseSwedishTime: "2026-09-22T17:10:38+02:00" (ISO redan)', () => {
  const ts = parseSwedishTime('2026-09-22T17:10:38+02:00');
  assert.ok(Number.isFinite(ts));
  assert.strictEqual(ts, Date.parse('2026-09-22T15:10:38.000Z'));
});

test('parseSwedishTime: "2026-09-22 17:10:38" (utan tidszon)', () => {
  const ts = parseSwedishTime('2026-09-22 17:10:38');
  assert.ok(Number.isFinite(ts));
  assert.strictEqual(ts, Date.parse('2026-09-22T17:10:38'));
});

test('parseSwedishTime: tom streng returnerar NaN', () => {
  assert.strictEqual(parseSwedishTime(''), NaN);
});

test('parseSwedishTime: null returnerar NaN', () => {
  assert.strictEqual(parseSwedishTime(null), NaN);
});

test('parseSwedishTime: "22 september 17.06" -> NaN (stöds inte)', () => {
  assert.strictEqual(parseSwedishTime('22 september 17.06'), NaN);
});

test('parseSwedishTime: flera mellanslag tas bort', () => {
  const ts = parseSwedishTime('2026-09-22  17:10:38   +02:00');
  assert.ok(Number.isFinite(ts), 'flera mellanslag ska tas bort');
  assert.strictEqual(ts, Date.parse('2026-09-22T15:10:38.000Z'));
});

test('parseSwedishTime: "2026-09-22 17:10:38 +0200" (mellanlag, ingen kolon)', () => {
  const ts = parseSwedishTime('2026-09-22 17:10:38 +0200');
  assert.ok(Number.isFinite(ts));
  assert.strictEqual(ts, Date.parse('2026-09-22T15:10:38.000Z'));
});
