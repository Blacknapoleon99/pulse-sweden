import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePoliceStations, normalizePoliceStationDetails, readPoliceStationDetails } from '../police-stations.mjs';

test('Polisens stationsregister hanterar officiella gps- och tjänstefält', () => {
  const [station] = normalizePoliceStations([{ id: 1233, name: 'Polisen Alingsås', location: { name: 'N Strömgatan 8, Alingsås', gps: '57.930105,12.529608' }, services: [{ name: 'Ansöka om pass' }], Url: 'https://polisen.se/om-polisen/kontakt/polisstationer/alingsas/' }]);
  assert.equal(station.id, '1233');
  assert.deepEqual([station.lat, station.lon], [57.930105, 12.529608]);
  assert.equal(station.address, 'N Strömgatan 8, Alingsås');
  assert.deepEqual(station.services, ['Ansöka om pass']);
});

test('Polisens öppettider behåller stängda dagar och giltiga intervall', () => {
  const detail = normalizePoliceStationDetails({ id: 1233, name: 'Polisen Alingsås', services: [{ name: 'Pass', openingHours: [{ name: 'Måndag', date: '2026-09-28', isClosed: false, from: '2026-09-28 12:00', to: '2026-09-28 16:00' }, { name: 'Söndag', date: '2026-09-27', isClosed: true }] }] });
  assert.equal(detail.services[0].openingHours[0].to, '2026-09-28 16:00');
  assert.equal(detail.services[0].openingHours[1].isClosed, true);
});

test('stationsdetaljer anger källa och hämtningstid och behåller reservdata vid källfel', async () => {
  let now = Date.parse('2026-09-24T12:00:00Z'), fail = false, calls = 0;
  const fetcher = async () => {
    calls++;
    if (fail) throw new Error('offline');
    return { ok: true, json: async () => [{ id: 8123, name: 'Polisen Teststad', Url: 'https://polisen.se/test', services: [] }] };
  };
  const first = await readPoliceStationDetails('8123', { fetcher, now: () => now });
  assert.equal(first.status, 'ok');
  assert.equal(first.fetchedAt, new Date(now).toISOString());
  assert.equal(first.source, 'https://polisen.se/test');
  now += 7 * 60 * 60_000;
  fail = true;
  const stale = await readPoliceStationDetails('8123', { fetcher, now: () => now });
  assert.equal(stale.status, 'stale');
  assert.equal(stale.stale, true);
  assert.equal(stale.fetchedAt, first.fetchedAt);
  assert.match(stale.error, /kunde inte hämtas/);
  const retryWindow = await readPoliceStationDetails('8123', { fetcher, now: () => now + 1000 });
  assert.equal(retryWindow.status, 'stale');
  assert.equal(calls, 2);
});
