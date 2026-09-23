import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { newDb } from 'pg-mem';
import { createPublicZoneService, validatePublicZone } from '../public-zones.mjs';

const polygon = { type: 'Polygon', coordinates: [[[18, 59], [18.01, 59], [18.01, 59.01], [18, 59.01], [18, 59]]] };
const validZone = { name: 'Testzon', kind: 'security-zone', sourceTitle: 'Officiellt beslut', sourceExcerpt: 'Källa beskriver zonens gräns och giltighet.', sourceUrl: 'https://polisen.se/lagar-och-regler/sakerhetszoner/', sourceDate: '2025-01-01T00:00:00Z', validFrom: '2025-01-01T00:00:00Z', validTo: '2030-01-01T00:00:00Z', geometry: polygon };

test('publicerade zoner kräver myndighetskälla, datum och polygon i Sverige', () => {
  assert.equal(validatePublicZone(validZone).kind, 'security-zone');
  assert.throws(() => validatePublicZone({ ...validZone, sourceUrl: 'https://polisen.se.example.com/fake' }), /officiell svensk myndighet/);
  assert.throws(() => validatePublicZone({ ...validZone, geometry: { type: 'Polygon', coordinates: [[[30, 80], [30.1, 80], [30.1, 80.1], [30, 80.1], [30, 80]]] } }), /Sverige/);
  assert.throws(() => validatePublicZone({ ...validZone, validTo: '2020-01-01T00:00:00Z' }), /efter giltig från/);
});

test('zoner blir publika först efter gransknings- och publiceringssteg', async () => {
  const Pool = newDb().adapters.createPg().Pool;
  const service = createPublicZoneService({ pool: new Pool() });
  await service.init();
  const originalToken = process.env.ZONE_ADMIN_TOKEN;
  process.env.ZONE_ADMIN_TOKEN = 'test-only-token';
  const send = async (path, method, body) => {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    req.headers = { host: 'tryggpuls.test', authorization: 'Bearer test-only-token', ...(body === undefined ? {} : { 'content-type': 'application/json', 'x-tryggpuls-action': '1' }) };
    req.method = method;
    let status, text = '';
    const res = { writeHead(code) { status = code; }, end(value) { text = value || ''; } };
    await service.handle(req, res, new URL(path, 'https://tryggpuls.test'));
    return { status, data: text ? JSON.parse(text) : null };
  };
  try {
    const draft = await send('/api/admin/zones', 'POST', validZone);
    assert.equal(draft.status, 201);
    assert.equal((await send('/api/public-zones', 'GET')).data.features.length, 0);
    assert.equal((await send(`/api/admin/zones/${draft.data.id}/publish`, 'POST', {})).status, 409);
    assert.equal((await send(`/api/admin/zones/${draft.data.id}/review`, 'POST', {})).status, 200);
    assert.equal((await send(`/api/admin/zones/${draft.data.id}/publish`, 'POST', {})).status, 200);
    const result = await send('/api/public-zones', 'GET');
    assert.equal(result.data.features.length, 1);
    assert.equal(result.data.features[0].properties.name, 'Testzon');
  } finally {
    if (originalToken === undefined) delete process.env.ZONE_ADMIN_TOKEN;
    else process.env.ZONE_ADMIN_TOKEN = originalToken;
  }
});
