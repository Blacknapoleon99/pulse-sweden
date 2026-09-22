import assert from 'node:assert';
import { test } from 'node:test';

// Exakt kopia av categorizeEvent() från server.mjs:140–155
function categorizeEvent(type) {
  const t = String(type || '').toLowerCase();
  if (/mord|dråp|skjutning|vapen|kniv|rån|misshandel|grov|hot|våldtäkt|sexual|ofredande/i.test(t)) {
    return 'violence';
  }
  if (/inbrott|stöld|bedrägeri|rattfylleri|häleri/i.test(t)) {
    return 'theft';
  }
  if (/trafik|olycka|kollision|viltolycka|fordon/i.test(t)) {
    return 'traffic';
  }
  if (/brand|rök|explosion/i.test(t)) {
    return 'fire';
  }
  return 'other';
}

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
