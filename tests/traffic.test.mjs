import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTrafficResponse } from '../traffic.mjs';

test('Trafikverket JSON-normalisering hanterar WKT-geometri och objektresultat', () => {
  const items = normalizeTrafficResponse({ RESPONSE: { RESULT: { Situation: [
    { Id: 's-1', ModifiedTime: '2026-09-24T09:00:00Z', Deviation: [
      { Header: 'Vägen avstängd', Message: 'Arbete pågår', RoadNumber: 'E4', Geometry: { WGS84: 'LINESTRING (18.0 59.0, 18.1 59.1)' } },
      { Header: 'Hinder', Geometry: { WGS84: 'POINT (18.2 59.2)' } }
    ] }
  ] } } });
  assert.equal(items.length, 2);
  assert.equal(items[0].geometry.type, 'LineString');
  assert.deepEqual(items[0].geometry.coordinates[0], [18, 59]);
  assert.equal(items[1].geometry.type, 'Point');
});

test('Trafikverket JSON-normalisering hanterar arrayresultat och API-fel', () => {
  const items = normalizeTrafficResponse({ RESPONSE: { RESULT: [{ Situation: { Id: 's-2', Deviation: { Header: 'Stopp' } } }] } });
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Stopp');
  assert.throws(() => normalizeTrafficResponse({ RESPONSE: { RESULT: { ERROR: { MESSAGE: 'Nyckel saknas' } } } }), /Nyckel saknas/);
});
