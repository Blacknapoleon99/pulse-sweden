import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeShelterCollection } from '../shelters.mjs';

test('skyddsrumsregistret sorteras efter vald plats och filtreras efter radie', () => {
  const result = normalizeShelterCollection({ type: 'FeatureCollection', features: [
    { type: 'Feature', id: 's-far', geometry: { type: 'Point', coordinates: [18.1, 59.3] }, properties: { name: 'Far', numberofoccupants: 40 } },
    { type: 'Feature', id: 's-near', geometry: { type: 'MultiPoint', coordinates: [[18.001, 59.3]] }, properties: { name: 'Near', numberofoccupants: 25 } },
    { type: 'Feature', id: 's-invalid', geometry: { type: 'Point', coordinates: [30, 80] }, properties: { name: 'Invalid' } }
  ] }, { lat: 59.3, lon: 18, radiusMeters: 2_000 });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 's-near');
  assert.equal(result[0].code, 'Near');
  assert.ok(result[0].distanceMeters > 0 && result[0].distanceMeters < 100);
  assert.equal(result[0].capacity, 25);
});

test('skyddsrumsnormalisering avvisar felaktigt GeoJSON', () => {
  assert.throws(() => normalizeShelterCollection({ type: 'Feature', features: [] }, { lat: 59, lon: 18 }), /GeoJSON-svar/);
});
