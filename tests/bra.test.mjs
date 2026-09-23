import assert from 'node:assert';
import { test } from 'node:test';

import { parseBraCsv } from '../server.mjs';

test('parseBraCsv: BOM + rubrik + data', () => {
  const csv = '\uFEFFKommun;Antal;Per 100 000 inv.\nStockholm;12345;15000\nGöteborg;9876;12000';
  const rows = parseBraCsv(csv);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].region, 'Stockholm');
  assert.strictEqual(rows[0].total, 12345);
  assert.strictEqual(rows[0].totalPer100k, 15000);
  assert.strictEqual(rows[0].population, Math.round((12345 * 100000) / 15000));
});

test('parseBraCsv: Sverige-total rad ignoreras', () => {
  const csv = 'Kommun;Antal;Per 100 000 inv.\nSverige totalt;1234567;12000\nStockholm;12345;15000';
  const rows = parseBraCsv(csv);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].region, 'Stockholm');
});

test('parseBraCsv: tomma rader och oformaterade rader ignoreras', () => {
  const csv = '\n\nKommun;Antal;Per 100 000 inv.\n\nStockholm;12345;15000\n\n';
  const rows = parseBraCsv(csv);
  assert.strictEqual(rows.length, 1);
});

test('parseBraCsv: rad med för få kolumner ignoreras', () => {
  const csv = 'Kommun;Antal;Per 100 000 inv.\nStockholm;12345\nMalmö;1000;11000';
  const rows = parseBraCsv(csv);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].region, 'Malmö');
});

test('parseBraCsv: negativa värden ignoreras', () => {
  const csv = 'Kommun;Antal;Per 100 000 inv.\nStockholm;-5;15000\nMalmö;1000;-10';
  const rows = parseBraCsv(csv);
  assert.strictEqual(rows.length, 0);
});

test('parseBraCsv: tom sträng returnerar tomt array', () => {
  assert.deepStrictEqual(parseBraCsv(''), []);
});
