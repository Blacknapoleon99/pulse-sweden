import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { newDb } from 'pg-mem';
import { createFamilyService } from '../family.mjs';

test('six-hour location history survives new reads, is family scoped and respects stopped sharing',async()=>{
  const pool=new (newDb().adapters.createPg().Pool)(),service=createFamilyService({pool});await service.init();
  try{
    const owner=(await service.register({email:'history-owner@example.test',name:'Owner',password:'long-password-123'})).user;
    const member=(await service.register({email:'history-member@example.test',name:'Member',password:'long-password-123'})).user;
    const outsider=(await service.register({email:'history-outsider@example.test',name:'Outsider',password:'long-password-123'})).user;
    await service.createGroup(owner,'History family');owner.family_id=(await pool.query('SELECT family_id FROM family_users WHERE id=$1',[owner.id])).rows[0].family_id;
    await service.join(member,await service.invite(owner));member.family_id=owner.family_id;
    await service.createGroup(outsider,'Other family');outsider.family_id=(await pool.query('SELECT family_id FROM family_users WHERE id=$1',[outsider.id])).rows[0].family_id;
    await service.reportLocation(member,{lat:59.33,lon:18.06,accuracy:15});
    await service.reportLocation(member,{lat:59.34,lon:18.06,accuracy:15});
    assert.equal((await pool.query('SELECT * FROM family_position_history')).rows.length,1,'samples are bounded to one per ten seconds');
    await pool.query("UPDATE family_position_history SET recorded_at=now()-interval '5 hours'");
    await pool.query("UPDATE family_positions SET updated_at=now()-interval '20 minutes'");
    let data=await service.overview(owner);
    assert.equal(data.positionHistory[member.id].length,1);
    assert.equal(data.members.find(row=>row.id===member.id).lat,null,'older history is not presented as a current location');
    assert.equal((await service.overview(outsider)).positionHistory[member.id],undefined);
    await pool.query("INSERT INTO family_position_history(id,family_id,user_id,lat,lon,accuracy,recorded_at) VALUES($1,$2,$3,59.32,18.06,15,now()-interval '7 hours')",[randomUUID(),owner.family_id,member.id]);
    data=await service.overview(owner);assert.equal(data.positionHistory[member.id].length,1);
    await service.sweep([]);assert.equal((await pool.query('SELECT * FROM family_position_history')).rows.length,1);
    await service.stop(member);assert.equal((await service.overview(owner)).positionHistory[member.id],undefined);
    assert.equal((await pool.query('SELECT * FROM family_position_history')).rows.length,0);
  }finally{await pool.end();}
});

test('private messages are visible only to their two participants, never to the family group',async()=>{
  const pool=new (newDb().adapters.createPg().Pool)(),service=createFamilyService({pool});await service.init();
  try{
    const register=async name=>(await service.register({email:`private-${name}@example.test`,name,password:'long-password-123'})).user;
    const owner=await register('owner'),one=await register('one'),two=await register('two'),outsider=await register('outside');
    await service.createGroup(owner,'Chat family');owner.family_id=(await pool.query('SELECT family_id FROM family_users WHERE id=$1',[owner.id])).rows[0].family_id;
    for(const member of [one,two]){await service.join(member,await service.invite(owner));member.family_id=owner.family_id;}
    await service.createGroup(outsider,'Other chat family');outsider.family_id=(await pool.query('SELECT family_id FROM family_users WHERE id=$1',[outsider.id])).rows[0].family_id;
    await service.sendMessage(one,'Shared group message');
    await service.sendMessage(one,'Private one to two',two.id);
    await service.sendMessage(two,'Private reply',one.id);
    for(const member of [owner,one,two])assert.deepEqual((await service.listMessages(member)).map(message=>message.body),['Shared group message']);
    assert.equal((await service.listMessages(one,two.id)).length,2);
    assert.equal((await service.listMessages(two,one.id)).length,2);
    assert.equal((await service.listMessages(owner,one.id)).length,0,'family owner cannot read other members private conversations');
    await assert.rejects(service.listMessages(outsider,one.id),{status:403});
    await assert.rejects(service.sendMessage(one,'Cross family',outsider.id),{status:403});
    await assert.rejects(service.sendMessage(one,'Self',one.id),{status:400});
    await assert.rejects(service.sendMessage(one,'Invalid recipient',{}),{status:400});
    await service.leave(two);assert.equal((await pool.query('SELECT * FROM family_messages WHERE recipient_id IS NOT NULL')).rows.length,0);
    assert.equal((await service.listMessages(owner)).length,1);
  }finally{await pool.end();}
});

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
  const repeated = await service.reportLocation(child, { lat: 59.34, lon: 18.06, accuracy: 15 });
  assert.equal(repeated.alerts, 0);
  assert.equal((await service.overview(owner)).alerts.length, 1, 'repeated location reports must not send a duplicate zone alert');
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

test('AirTag references are family scoped and contain no location', async () => {
  const pool = new (newDb().adapters.createPg().Pool)();
  const service = createFamilyService({ pool });
  await service.init();
  const owner = (await service.register({ email: 'item-owner@example.test', name: 'Owner', password: 'owner-long-password-123' })).user;
  const member = (await service.register({ email: 'item-member@example.test', name: 'Member', password: 'member-long-password-123' })).user;
  const outsider = (await service.register({ email: 'item-other@example.test', name: 'Other', password: 'other-long-password-123' })).user;
  await service.createGroup(owner, 'Första familjen');
  await service.createGroup(outsider, 'Andra familjen');
  owner.family_id = (await pool.query('SELECT family_id FROM family_users WHERE id=$1',[owner.id])).rows[0].family_id;
  outsider.family_id = (await pool.query('SELECT family_id FROM family_users WHERE id=$1',[outsider.id])).rows[0].family_id;
  await service.join(member, await service.invite(owner));
  member.family_id = owner.family_id;
  await assert.rejects(service.addChildItem(member, { childName: 'Ella', itemName: 'Ryggsäck' }), { status: 403 });
  await assert.rejects(service.addChildItem(owner, { childName: 'Ella', itemName: '' }), { status: 400 });
  const id = await service.addChildItem(owner, { childName: 'Ella', itemName: 'Ellas ryggsäck' });
  const item = (await service.overview(member)).childItems[0];
  assert.deepEqual(item, { id, child_name: 'Ella', item_name: 'Ellas ryggsäck' });
  assert.equal((await service.overview(outsider)).childItems.length, 0);
  await service.removeChildItem(outsider, id);
  assert.equal((await service.overview(owner)).childItems.length, 1);
  await service.removeChildItem(owner, id);
  assert.equal((await service.overview(member)).childItems.length, 0);
  await pool.end();
});

test('native bearer sessions and family chat stay inside the family', async () => {
  const pool = new (newDb().adapters.createPg().Pool)();
  const service = createFamilyService({ pool });
  await service.init();
  const first = await service.register({ email: 'first@example.test', name: 'Första', password: 'first-long-password-123' });
  const other = await service.register({ email: 'other@example.test', name: 'Andra', password: 'other-long-password-123' });
  await service.createGroup(first.user, 'Första familjen');
  await service.createGroup(other.user, 'Andra familjen');
  const firstUser = await service.session({ headers: { authorization: `Bearer ${first.token}` } });
  const otherUser = await service.session({ headers: { authorization: `Bearer ${other.token}` } });
  assert.equal(firstUser.id, first.user.id);
  await service.sendMessage(firstUser, 'Hej familjen');
  assert.equal((await service.listMessages(firstUser))[0].body, 'Hej familjen');
  assert.equal((await service.listMessages(otherUser)).length, 0);
  await assert.rejects(service.sendMessage(firstUser, 'x'.repeat(501)), { status: 400 });
  await service.logout({ headers: { authorization: `Bearer ${first.token}` } });
  assert.equal(await service.session({ headers: { authorization: `Bearer ${first.token}` } }), null);
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

test('family alarms reach only current family members and track acknowledgement', async () => {
  const pool = new (newDb().adapters.createPg().Pool)();
  const service = createFamilyService({ pool });
  await service.init();
  const owner = (await service.register({ email: 'alarm-owner@example.test', name: 'Alex', password: 'a-long-password-123' })).user;
  const member = (await service.register({ email: 'alarm-member@example.test', name: 'Kim', password: 'a-long-password-123' })).user;
  const outsider = (await service.register({ email: 'alarm-outsider@example.test', name: 'Sam', password: 'a-long-password-123' })).user;
  await service.createGroup(owner, 'Första familjen');
  await service.createGroup(outsider, 'Andra familjen');
  owner.family_id = (await pool.query('SELECT family_id FROM family_users WHERE id=$1',[owner.id])).rows[0].family_id;
  outsider.family_id = (await pool.query('SELECT family_id FROM family_users WHERE id=$1',[outsider.id])).rows[0].family_id;
  await service.join(member, await service.invite(owner));
  member.family_id = owner.family_id;
  const requestId = randomUUID();
  const first = await service.createAlarm(owner,requestId);
  assert.equal(first.recipients.length,1);
  assert.equal(first.recipients[0].id,member.id);
  assert.equal(first.active,true);
  assert.equal((await service.createAlarm(owner,requestId)).id,first.id,'a retry must return the same alarm');
  await assert.rejects(service.createAlarm(owner,randomUUID()),{status:429});
  assert.equal((await service.listAlarms(outsider)).length,0);
  await assert.rejects(service.acknowledgeAlarm(outsider,first.id),{status:404});
  await assert.rejects(service.cancelAlarm(member,first.id),{status:403});
  await service.acknowledgeAlarm(member,first.id);
  assert.ok((await service.listAlarms(owner))[0].recipients[0].acknowledgedAt);
  await service.cancelAlarm(owner,first.id);
  assert.equal((await service.listAlarms(member))[0].active,false);
  await service.leave(member);
  assert.equal((await service.listAlarms(member)).length,0);
  await pool.end();
});

test('family alarm expiry, recipient snapshot and validation', async () => {
  const pool = new (newDb().adapters.createPg().Pool)();
  const service = createFamilyService({ pool });
  await service.init();
  const sender = (await service.register({ email:'alarm-sender@example.test',name:'Sender',password:'long-password-123' })).user;
  const recipient = (await service.register({ email:'alarm-recipient@example.test',name:'Recipient',password:'long-password-123' })).user;
  const late = (await service.register({ email:'alarm-late@example.test',name:'Late',password:'long-password-123' })).user;
  await assert.rejects(service.createAlarm(sender,randomUUID()),{status:409});
  await service.createGroup(sender,'Alarmfamilj');
  sender.family_id = (await pool.query('SELECT family_id FROM family_users WHERE id=$1',[sender.id])).rows[0].family_id;
  await assert.rejects(service.createAlarm(sender,'short'),{status:400});
  await assert.rejects(service.createAlarm(sender,randomUUID()),{status:409});
  await service.join(recipient,await service.invite(sender));
  recipient.family_id = sender.family_id;
  const alarm = await service.createAlarm(sender,randomUUID());
  await service.join(late,await service.invite(sender));
  late.family_id = sender.family_id;
  assert.equal((await service.listAlarms(late)).length,0,'later members cannot read earlier alarms');
  await assert.rejects(service.acknowledgeAlarm(late,alarm.id),{status:403});
  await pool.query("UPDATE family_alarms SET expires_at=now()-interval '1 minute' WHERE id=$1",[alarm.id]);
  assert.equal((await service.listAlarms(recipient))[0].active,false);
  await service.sweep();
  assert.equal((await service.listAlarms(sender)).length,1,'history remains until retention expiry');
  await pool.end();
});
