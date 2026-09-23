import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFireRiskUrl, createFireRiskService, sampleRouteForFireRisk, selectFireRiskPeriod } from '../fire-risk.mjs';

const sampleResponse = {
  approvedTime: '2026-09-23T22:00:00Z',
  referenceTime: '2026-09-23T21:00:00Z',
  timeSeries: [
    { validTime: '2026-09-23T21:00:00Z', parameters: [{ name: 'fwiindex', values: [1] }] },
    { validTime: '2026-09-23T23:00:00Z', parameters: [
      { name: 'fwiindex', values: [5] }, { name: 'fwi', values: [17.2] },
      { name: 'grassfire', values: [-1] }, { name: 't', values: [18.5] },
      { name: 'ws', values: [3.1] }, { name: 'r', values: [42] }
    ] },
    { validTime: '2026-09-24T00:00:00Z', parameters: [{ name: 'fwiindex', values: [4] }] }
  ]
};

test('SMHI brandrisk endpoint URL validates coordinates and selects hourly or daily data', () => {
  assert.match(buildFireRiskUrl(59.33, 18.06, 'hourly'), /\/hourly\/geotype\/point\/lon\/18\.06\/lat\/59\.33\/data\.json$/);
  assert.match(buildFireRiskUrl(59.33, 18.06, 'daily'), /\/daily\//);
  assert.throws(() => buildFireRiskUrl(91, 18), /Ogiltiga koordinater/);
  assert.throws(() => buildFireRiskUrl(59, 18, 'weekly'), /Ogiltig prognosperiod/);
});

test('route fire-risk sampling is ordered, includes endpoints, and caps API requests', () => {
  const shortRoute = sampleRouteForFireRisk([[18, 59], [18.04, 59]]);
  assert.equal(shortRoute.length, 2);
  assert.equal(shortRoute[0].distanceMeters, 0);
  assert.ok(shortRoute[1].distanceMeters > 2_000);
  const longRoute = sampleRouteForFireRisk([[10, 55], [24, 69]]);
  assert.equal(longRoute.length, 12);
  assert.equal(longRoute[0].lon, 10);
  assert.equal(longRoute.at(-1).lat, 69);
  assert.ok(longRoute.every((sample, index) => index === 0 || sample.distanceMeters > longRoute[index - 1].distanceMeters));
});

test('nearest fire-risk hour is matched to route arrival time', () => {
  const selected = selectFireRiskPeriod([
    { validTime: '2026-09-23T22:00:00Z', riskClass: 1 },
    { validTime: '2026-09-23T23:00:00Z', riskClass: 5 },
    { validTime: '2026-09-24T00:00:00Z', riskClass: 4 }
  ], '2026-09-23T23:20:00Z');
  assert.equal(selected.riskClass, 5);
  assert.equal(selectFireRiskPeriod([{ validTime: '2026-09-23T10:00:00Z' }], '2026-09-23T23:20:00Z'), null);
});

test('fire-risk service normalizes SMHI values and coalesces/caches matching requests', async () => {
  let calls = 0;
  const service = createFireRiskService({
    now: () => Date.parse('2026-09-23T22:45:00Z'),
    fetcher: async () => {
      calls++;
      return { ok: true, json: async () => sampleResponse };
    }
  });
  const [first, parallel] = await Promise.all([service.read(59.33, 18.06), service.read(59.33, 18.06)]);
  assert.equal(calls, 1);
  assert.equal(first.status, 'ok');
  assert.equal(first.periods[0].validTime, '2026-09-23T23:00:00Z');
  assert.equal(first.periods[0].riskLabel, 'Mycket stor');
  assert.equal(first.periods[0].fwi, 17.2);
  assert.equal(first.periods[0].temperatureC, 18.5);
  assert.equal(first.periods[0].grassFireClass, null);
  assert.equal(parallel.periods.length, 2);
  assert.equal((await service.read(59.33, 18.06)).cached, true);
  assert.equal(calls, 1);
});

test('fire-risk service reports unavailable when SMHI is not reachable', async () => {
  const service = createFireRiskService({ fetcher: async () => ({ ok: false, status: 503 }) });
  const result = await service.read(59.33, 18.06);
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.periods, []);
  assert.equal(service.snapshot().status, 'unavailable');
});
