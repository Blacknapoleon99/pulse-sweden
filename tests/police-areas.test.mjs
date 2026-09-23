import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsePoliceAreasZip, areaContains } from '../police-areas.mjs';

test('Polisens GeoJSON transformeras från SWEREF 99 TM till kartkoordinater', async () => {
  const bytes = await readFile(new URL('../data/uso_2025_geojson.zip', import.meta.url));
  const result = parsePoliceAreasZip(bytes, 'https://polisen.se/uso_2025_geojson.zip');
  assert.equal(result.features.length, 65);
  assert.equal(new Set(result.features.map(feature => feature.id)).size, 65);
  assert.equal(result.year, 2025);
  assert.equal(result.features.filter(feature => feature.properties.category === 'Särskilt utsatt område').length, 19);
  const [lon, lat] = result.features[0].geometry.coordinates[0][0];
  assert.ok(lon > 12 && lon < 14 && lat > 55 && lat < 56);
});

test('områdeskontroll hanterar hål och multipolygoner', () => {
  const feature = { geometry: { type: 'MultiPolygon', coordinates: [
    [[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[3,1],[3,3],[1,3],[1,1]]],
    [[[10,10],[12,10],[12,12],[10,12],[10,10]]]
  ] } };
  assert.equal(areaContains(feature, 0.5, 0.5), true);
  assert.equal(areaContains(feature, 2, 2), false);
  assert.equal(areaContains(feature, 11, 11), true);
  assert.equal(areaContains(feature, 6, 6), false);
});
