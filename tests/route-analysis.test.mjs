import assert from 'node:assert/strict';
import test from 'node:test';
import { findRouteZonePassages, routeDistanceMeters, routeSlice } from '../route-analysis.mjs';

test('route zone analysis finds separate passages through a polygon with a hole', () => {
  const route = [[18, 59], [18.01, 59]];
  const feature = {
    type: 'Feature', id: 'zone-a',
    geometry: { type: 'Polygon', coordinates: [
      [[18.001, 58.999], [18.008, 58.999], [18.008, 59.001], [18.001, 59.001], [18.001, 58.999]],
      [[18.003, 58.9995], [18.005, 58.9995], [18.005, 59.0005], [18.003, 59.0005], [18.003, 58.9995]]
    ] }
  };
  const passages = findRouteZonePassages(route, [feature]);
  assert.equal(passages.length, 2);
  assert.ok(passages[0].startMeters < passages[0].endMeters);
  assert.ok(passages[1].startMeters < passages[1].endMeters);
  assert.ok(passages[1].startMeters > passages[0].endMeters);
  assert.ok(Math.abs(passages[0].startMeters - routeDistanceMeters(route[0], [18.001, 59])) < 3);
  assert.ok(Math.abs(passages[1].endMeters - routeDistanceMeters(route[0], [18.008, 59])) < 3);
});

test('route zone analysis handles multipolygons and route slices keep exact endpoints', () => {
  const route = [[18, 59], [18.01, 59]];
  const feature = {
    type: 'Feature', id: 'zone-multi',
    geometry: { type: 'MultiPolygon', coordinates: [
      [[[18.001, 58.999], [18.002, 58.999], [18.002, 59.001], [18.001, 59.001], [18.001, 58.999]]],
      [[[18.006, 58.999], [18.007, 58.999], [18.007, 59.001], [18.006, 59.001], [18.006, 58.999]]]
    ] }
  };
  const passages = findRouteZonePassages(route, [feature]);
  assert.equal(passages.length, 2);
  const slice = routeSlice(route, passages[0].startMeters, passages[0].endMeters);
  assert.ok(slice.length >= 2);
  assert.ok(Math.abs(slice[0][0] - 18.001) < 0.0001);
  assert.ok(Math.abs(slice.at(-1)[0] - 18.002) < 0.0001);
  assert.deepEqual(routeSlice(route, 10, 10), []);
});
