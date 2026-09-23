import assert from 'node:assert';
import { test } from 'node:test';

import { categorizeEvent } from '../server.mjs';

test('traffic and property reports must not be mistaken for robbery', () => {
  assert.equal(categorizeEvent('Trafikolycka, smitning från'), 'traffic');
  assert.equal(categorizeEvent('Rattfylleri'), 'traffic');
  assert.equal(categorizeEvent('Grov stöld'), 'theft');
  assert.equal(categorizeEvent('Rån, försök'), 'violence');
});

test('categorizeEvent: mord -> violence', () => {
  assert.strictEqual(categorizeEvent('Mord'), 'violence');
});

test('categorizeEvent: rån -> violence', () => {
  assert.strictEqual(categorizeEvent('Rån'), 'violence');
});

test('categorizeEvent: skjutning -> violence', () => {
  assert.strictEqual(categorizeEvent('Skjutning i centrala Stockholm'), 'violence');
});

test('categorizeEvent: inbrott -> theft', () => {
  assert.strictEqual(categorizeEvent('Inbrott'), 'theft');
});

test('categorizeEvent: stöld -> theft', () => {
  assert.strictEqual(categorizeEvent('Stöld'), 'theft');
});

test('categorizeEvent: trafikolycka -> traffic', () => {
  assert.strictEqual(categorizeEvent('Trafikolycka'), 'traffic');
});

test('categorizeEvent: trafikbrott -> traffic', () => {
  assert.strictEqual(categorizeEvent('Trafikbrott'), 'traffic');
});

test('categorizeEvent: brand -> fire', () => {
  assert.strictEqual(categorizeEvent('Brand'), 'fire');
});

test('categorizeEvent: explosion -> fire', () => {
  assert.strictEqual(categorizeEvent('Explosion'), 'fire');
});

test('categorizeEvent: okänd typ -> other', () => {
  assert.strictEqual(categorizeEvent('Okänd händelse'), 'other');
});

test('categorizeEvent: null -> other', () => {
  assert.strictEqual(categorizeEvent(null), 'other');
});

test('categorizeEvent: tom -> other', () => {
  assert.strictEqual(categorizeEvent(''), 'other');
});
