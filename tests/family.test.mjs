import test from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import { createFamilyService } from '../family.mjs';

test('family accounts, consent, zones and one-use invitations', async () => {
  const adapter = newDb().adapters.createPg();
  const pool = new adapter.Pool();
  const service = createFamilyService({ pool });
  await service.init();
  const owner = (await service.register({ email: 'owner@example.test', name: 'Alex', password: 'a-long-password-123' })).user;
  const child = (await service.register({ email: 'child@example.test', name: 'Kim', password: 'another-long-password-123' })).user;
  await assert.rejects(service.login({ email: owner.email, password: 'wrong-password' }), { status: 401 });
  assert.equal((await service.login({ email: owner.email, password: 'a-long-password-123' })).user.id, owner.id);
  await service.createGroup(owner, 'Familjen Test');
  const activeOwner = (await service.session({ headers: { cookie: service.cookie((await service.login({ email: owner.email, password: 'a-long-password-123' })).token, false) } })).id;
  assert.equal(activeOwner, owner.id);
  owner.family_id = (await service.overview({ ...owner, family_id: (await pool.query('SELECT family_id FROM family_users WHERE id=$1', [owner.id])).rows[0].family_id })).family.id;
  const invite = await service.invite(owner);
  await service.join(child, invite);
  await assert.rejects(service.join(child, invite), { status: 400 });
  child.family_id = owner.family_id;
  const zoneId = await service.addZone(owner, { name: 'Skolan', kind: 'safe', lat: 59.33, lon: 18.06, radius: 300 });
  await service.reportLocation(child, { lat: 59.33, lon: 18.06, accuracy: 15 });
  const moved = await service.reportLocation(child, { lat: 59.34, lon: 18.06, accuracy: 15 });
  assert.equal(moved.alerts, 1);
  assert.equal((await service.overview(owner)).alerts.length, 1);
  await service.stop(child);
  const stopped = await service.overview(owner);
  assert.equal(stopped.members.find(member => member.id === child.id).sharing, false);
  assert.equal(stopped.members.find(member => member.id === child.id).updated_at, null);
  await service.removeZone(owner, zoneId);
  assert.equal((await service.overview(owner)).zones.length, 0);
  await assert.rejects(service.deleteAccount(owner), { status: 409 });
  await service.deleteAccount(child);
  await service.deleteAccount(owner);
  assert.equal((await pool.query('SELECT id FROM family_users')).rows.length, 0);
  assert.equal((await pool.query('SELECT id FROM family_groups')).rows.length, 0);
  await pool.end();
});

test('push subscriptions reject arbitrary network destinations', async () => {
  const adapter = newDb().adapters.createPg();
  const pool = new adapter.Pool();
  const service = createFamilyService({ pool, vapidPublic: 'public', vapidPrivate: 'private', push: { setVapidDetails() {} } });
  await service.init();
  const user = (await service.register({ email: 'push@example.test', name: 'Push', password: 'push-password-123' })).user;
  await assert.rejects(service.subscribe(user, { endpoint: 'https://127.0.0.1/internal', keys: { p256dh: 'x', auth: 'y' } }), { status: 400 });
  await service.subscribe(user, { endpoint: 'https://fcm.googleapis.com/fcm/send/example', keys: { p256dh: 'x', auth: 'y' } });
  await pool.end();
});

test('frivilliga polisområdesvarningar kräver inträde efter första GPS-positionen', async () => {
  const pool = new (newDb().adapters.createPg().Pool)();
  const areasReader = async () => ({ year: 2025, stale: false, sourceUrl: 'https://polisen.se/om-polisen/polisens-arbete/utsatta-omraden/', features: [
    { id: 'test-area', properties: { name: 'Testområde', locality: 'Stockholm', category: 'Utsatt område' }, geometry: { type: 'Polygon', coordinates: [[[17.9,59.2],[18.2,59.2],[18.2,59.5],[17.9,59.5],[17.9,59.2]]] } }
  ] });
  const service = createFamilyService({ pool, areasReader });
  await service.init();
  const user = (await service.register({ email: 'area@example.test', name: 'Kim', password: 'another-long-password-123' })).user;
  await service.createGroup(user, 'Testfamilj');
  const activeUser = { ...user, family_id: (await pool.query('SELECT family_id FROM family_users WHERE id=$1',[user.id])).rows[0].family_id, police_area_alerts: true };
  await service.setPoliceAreaAlerts(activeUser, true);
  assert.equal((await service.reportLocation(activeUser,{lat:59.3,lon:18,accuracy:15})).alerts, 0);
  assert.equal((await service.reportLocation(activeUser,{lat:59.6,lon:18,accuracy:15})).alerts, 0);
  assert.equal((await service.reportLocation(activeUser,{lat:59.3,lon:18,accuracy:15})).alerts, 1);
  assert.equal((await service.overview(activeUser)).alerts[0].kind, 'police-area');
  await service.setPoliceAreaAlerts(activeUser, false);
  assert.equal((await service.reportLocation({ ...activeUser, police_area_alerts: false },{lat:59.6,lon:18,accuracy:15})).alerts, 0);
  await pool.end();
});
