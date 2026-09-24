import assert from 'node:assert/strict';
import test from 'node:test';
import { findGeographicItemsAlongRoute, findRouteZonePassages, routeDistanceMeters, selectApproximateRouteEvents, routeSlice } from '../route-analysis.mjs';

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

test('route zone analysis does not skip a polygon narrower than its former sample spacing', () => {
  const route = [[18, 59], [18.01, 59]];
  const feature = { type: 'Feature', id: 'narrow', geometry: { type: 'Polygon', coordinates: [[
    [18.00499, 58.999995], [18.00501, 58.999995], [18.00501, 59.000005], [18.00499, 59.000005], [18.00499, 58.999995]
  ]] } };
  const [passage] = findRouteZonePassages(route, [feature]);
  assert.ok(passage);
  assert.ok(passage.endMeters - passage.startMeters > 0.5);
  assert.ok(Math.abs(passage.startMeters - routeDistanceMeters(route[0], [18.00499, 59])) < 0.5);
});

test('geographic source items retain source details and passages are ordered along the route', () => {
  const route = [[18, 59], [18.01, 59]];
  const polygon = (west, east) => ({ type: 'Polygon', coordinates: [[[west, 58.999], [east, 58.999], [east, 59.001], [west, 59.001], [west, 58.999]]] });
  const results = findGeographicItemsAlongRoute(route, [
    { id: 'late', type: 'vma', title: 'Senare', publishedAt: '2026-09-24T12:00:00Z', source: 'https://krisinformation.se/', areas: [{ name: 'Östra', code: '01', geometry: polygon(18.007, 18.008) }] },
    { id: 'early', type: 'notice', title: 'Tidigare', source: 'https://krisinformation.se/', areas: [{ name: 'Västra', geometry: { type: 'Feature', geometry: polygon(18.002, 18.003) } }] },
    { id: 'outside', title: 'Utanför', areas: [{ name: 'Annat län', geometry: polygon(18.02, 18.021) }] }
  ]);
  assert.deepEqual(results.map(item => item.title), ['Tidigare', 'Senare']);
  assert.equal(results[1].areaCode, '01');
  assert.equal(results[1].publishedAt, '2026-09-24T12:00:00Z');
  assert.ok(results[0].passages[0].line.length >= 2);
});

test('approximate police-area markers are screened without exposing a crime distance', () => {
  const now = Date.parse('2026-09-24T12:00:00Z');
  const coordinates = [[18, 59], [18.1, 59]];
  const events = [
    { id: 'centroid-near', ts: now - 1000, location: { gps: [59.063, 18.05], name: 'Kommuncentrum' } },
    { id: 'too-far', ts: now - 1000, location: { gps: [59.09, 18.05], name: 'Länscentrum' } },
    { id: 'old', ts: now - 25 * 60 * 60_000, location: { gps: [59.063, 18.05], name: 'Kommuncentrum' } }
  ];
  const [item] = selectApproximateRouteEvents(events, coordinates, { now: () => now });
  assert.equal(item.id, 'centroid-near');
  assert.equal(item.approximateRelevance, true);
  assert.match(item.locationPrecision, /ungefärliga/);
  assert.equal('distanceMeters' in item, false);
  assert.equal('_sortDistance' in item, false);
});
