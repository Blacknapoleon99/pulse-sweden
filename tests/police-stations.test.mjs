import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePoliceStations, normalizePoliceStationDetails } from '../police-stations.mjs';

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
