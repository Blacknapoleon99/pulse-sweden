import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { newDb } from 'pg-mem';
import { createPublicZoneService, validatePublicZone } from '../public-zones.mjs';

const polygon = { type: 'Polygon', coordinates: [[[18, 59], [18.01, 59], [18.01, 59.01], [18, 59.01], [18, 59]]] };
const fixedNow = Date.parse('2025-01-02T00:00:00Z');
const validZone = { name: 'Testzon', kind: 'security-zone', sourceTitle: 'Officiellt beslut', sourceExcerpt: 'Källa beskriver zonens gräns och giltighet.', sourceUrl: 'https://polisen.se/lagar-och-regler/sakerhetszoner/', sourceDate: '2025-01-01T00:00:00Z', validFrom: '2025-01-01T00:00:00Z', validTo: '2025-01-15T00:00:00Z', geometry: polygon };

test('publicerade zoner kräver myndighetskälla, datum och polygon i Sverige', () => {
  assert.equal(validatePublicZone(validZone).kind, 'security-zone');
  assert.throws(() => validatePublicZone({ ...validZone, sourceUrl: 'https://polisen.se.example.com/fake' }), /officiell svensk myndighet/);
  assert.throws(() => validatePublicZone({ ...validZone, geometry: { type: 'Polygon', coordinates: [[[30, 80], [30.1, 80], [30.1, 80.1], [30, 80.1], [30, 80]]] } }), /Sverige/);
  assert.throws(() => validatePublicZone({ ...validZone, validTo: '2020-01-01T00:00:00Z' }), /efter giltig från/);
  assert.throws(() => validatePublicZone({ ...validZone, validTo: null }), /sista giltighetsdag eller nästa granskningsdag/);
  assert.throws(() => validatePublicZone({ ...validZone, validTo: '2025-01-16T00:00:00Z' }), /högst 14 dagar/);
});

test('zoner blir publika först efter gransknings- och publiceringssteg', async () => {
  const Pool = newDb().adapters.createPg().Pool;
  let now = fixedNow;
  const pool = new Pool();
  const service = createPublicZoneService({ pool, now: () => now });
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
  const sendWithoutToken = async () => {
    const req = Readable.from([]);
    req.headers = { host: 'tryggpuls.test' };
    req.method = 'GET';
    let status, text = '';
    const res = { writeHead(code) { status = code; }, end(value) { text = value || ''; } };
    await service.handle(req, res, new URL('/api/admin/zones', 'https://tryggpuls.test'));
    return { status, data: text ? JSON.parse(text) : null };
  };
  try {
    assert.equal((await sendWithoutToken()).status, 401);
    const draft = await send('/api/admin/zones', 'POST', validZone);
    assert.equal(draft.status, 201);
    assert.equal((await send('/api/public-zones', 'GET')).data.features.length, 0);
    assert.equal((await send(`/api/admin/zones/${draft.data.id}/publish`, 'POST', {})).status, 409);
    assert.equal((await send(`/api/admin/zones/${draft.data.id}/review`, 'POST', {})).status, 200);
    assert.equal((await send(`/api/admin/zones/${draft.data.id}/publish`, 'POST', {})).status, 200);
    const result = await send('/api/public-zones', 'GET');
    assert.equal(result.data.features.length, 1);
    assert.equal(result.data.features[0].properties.name, 'Testzon');
    assert.equal(result.data.features[0].properties.sourceExcerpt, validZone.sourceExcerpt);

    now = Date.parse(validZone.validTo) + 1;
    assert.equal((await send('/api/public-zones', 'GET')).data.features.length, 0);
    assert.equal((await service.listAdmin()).find(zone => zone.id === draft.data.id).status, 'ended');
    await service.listPublic();
    const audit = await pool.query("SELECT action,actor FROM public_zone_audit WHERE zone_id=$1 AND action='auto-ended-expired'", [draft.data.id]);
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].actor, 'system');
  } finally {
    if (originalToken === undefined) delete process.env.ZONE_ADMIN_TOKEN;
    else process.env.ZONE_ADMIN_TOKEN = originalToken;
  }
  await pool.end();
});
