import assert from 'node:assert';
import { test } from 'node:test';

// Exakt kopia av readNumberParam + buffer-klämning från server.mjs:120–125, 641
function readNumberParam(url, name) {
  const raw = url.searchParams.get(name);
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function clampBuffer(raw) {
  return Math.min(1000, Math.max(300, readNumberParam(raw, 'buffer') || 600));
}

function makeUrl(qs) {
  return new URL('http://localhost/api/route?' + qs);
}

test('buffer 50 kläms till 300 (under minimi)', () => {
  assert.strictEqual(clampBuffer(makeUrl('buffer=50')), 300);
});

test('buffer 150 kläms till 300', () => {
  assert.strictEqual(clampBuffer(makeUrl('buffer=150')), 300);
});

test('buffer 300 är giltig', () => {
  assert.strictEqual(clampBuffer(makeUrl('buffer=300')), 300);
});

test('buffer 123.45 kläms till 300 (ej heltal, under minimi)', () => {
  assert.strictEqual(clampBuffer(makeUrl('buffer=123.45')), 300);
});

test('buffer 0 -> standard 600', () => {
  assert.strictEqual(clampBuffer(makeUrl('buffer=0')), 600);
});

test('buffer -5 kläms till 300', () => {
  assert.strictEqual(clampBuffer(makeUrl('buffer=-5')), 300);
});

test('buffer 600 är giltig', () => {
  assert.strictEqual(clampBuffer(makeUrl('buffer=600')), 600);
});

test('buffer tom -> standard 600', () => {
  assert.strictEqual(clampBuffer(makeUrl('')), 600);
});

test('buffer null -> standard 600', () => {
  assert.strictEqual(clampBuffer(makeUrl('foo=bar')), 600);
});

test('buffer abc -> standard 600', () => {
  assert.strictEqual(clampBuffer(makeUrl('buffer=abc')), 600);
});

test('buffer 1000 är giltig', () => {
  assert.strictEqual(clampBuffer(makeUrl('buffer=1000')), 1000);
});

test('buffer 5000 kläms till 1000 (över max)', () => {
  assert.strictEqual(clampBuffer(makeUrl('buffer=5000')), 1000);
});

test('readNumberParam returnerar null för saknad', () => {
  assert.strictEqual(readNumberParam(makeUrl(''), 'fromLat'), null);
});

test('readNumberParam returnerar null för tom sträng', () => {
  assert.strictEqual(readNumberParam(makeUrl('fromLat='), 'fromLat'), null);
});

test('readNumberParam returnerar null för ogiltig text', () => {
  assert.strictEqual(readNumberParam(makeUrl('fromLat=abc'), 'fromLat'), null);
});

test('readNumberParam returnerar tal för giltig text', () => {
  assert.strictEqual(readNumberParam(makeUrl('fromLat=59.33'), 'fromLat'), 59.33);
});
