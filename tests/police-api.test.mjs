import assert from 'node:assert/strict';
import test from 'node:test';
import { createPoliceApiFetch } from '../police-api.mjs';

test('Polisens API-klient lägger rätt User-Agent och väntar mellan anrop', async () => {
  let clock = 1_000;
  const requests = [];
  const request = createPoliceApiFetch({
    now: () => clock,
    sleep: async ms => { clock += ms; },
    spacingMs: 10,
    maxRequestsPerHour: 3,
    userAgent: 'TryggPuls-test/1',
    fetcher: async (url, options) => { requests.push({ url, options, startedAt: clock }); return new Response('ok'); }
  });
  await request('https://polisen.se/api/events');
  await request('https://polisen.se/api/policestations');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].startedAt - requests[0].startedAt, 10);
  assert.equal(requests[0].options.headers.get('User-Agent'), 'TryggPuls-test/1');
});

test('Polisens API-klient stoppar anrop över timkvoten', async () => {
  const request = createPoliceApiFetch({ spacingMs: 0, maxRequestsPerHour: 1, fetcher: async () => new Response('ok') });
  await request('https://polisen.se/api/events');
  await assert.rejects(request('https://polisen.se/api/policestations'), error => error.status === 429 && error.code === 'POLICE_RATE_LIMITED');
});
