import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createFamilyService } from '../family.mjs';

// Explicit test URL only. A unique schema isolates synthetic accounts from other data.
test('real PostgreSQL: concurrent alarm deduplication, cooldown, cancellation and expiry', {skip: !process.env.TRYGGPULS_TEST_DATABASE_URL}, async () => {
  const connectionString=process.env.TRYGGPULS_TEST_DATABASE_URL;
  const schema='tryggpuls_test_'+randomUUID().replaceAll('-','');
  const admin=new pg.Pool({connectionString});
  let pool;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:8});
    const service=createFamilyService({pool});await service.init();
    const register=async name=>(await service.register({name,email:`${name}@example.test`,password:'test-only-long-password-123'})).user;
    const owner=await register('owner'),member=await register('member');
    await service.createGroup(owner,'Synthetic test family');
    owner.family_id=(await pool.query('SELECT family_id FROM family_users WHERE id=$1',[owner.id])).rows[0].family_id;
    await service.join(member,await service.invite(owner));member.family_id=owner.family_id;
    const id=randomUUID();
    const duplicate=await Promise.all(Array.from({length:6},()=>service.createAlarm(owner,id)));
    assert.equal(new Set(duplicate.map(a=>a.id)).size,1);
    assert.equal((await pool.query('SELECT count(*) FROM family_alarms')).rows[0].count,'1');
    assert.equal((await service.createAlarm(owner,id)).id,duplicate[0].id,'retry after a lost response is idempotent');
    const cooldown=await Promise.allSettled([service.createAlarm(owner,randomUUID()),service.createAlarm(owner,randomUUID())]);
    assert.ok(cooldown.every(r=>r.status==='rejected'&&r.reason.status===429));
    await pool.query("UPDATE family_alarms SET created_at=now()-interval '2 minutes'");
    const competing=await Promise.allSettled([service.createAlarm(owner,randomUUID()),service.createAlarm(owner,randomUUID())]);
    assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(competing.filter(r=>r.status==='rejected'&&r.reason.status===429).length,1);
    const memberAlarm=await service.createAlarm(member,randomUUID());
    assert.equal(memberAlarm.senderId,member.id,'different senders can alarm simultaneously');
    await Promise.all([service.acknowledgeAlarm(member,duplicate[0].id),service.acknowledgeAlarm(member,duplicate[0].id)]);
    assert.ok((await service.listAlarms(owner)).find(a=>a.id===duplicate[0].id).recipients[0].acknowledgedAt);
    await service.cancelAlarm(owner,duplicate[0].id);
    assert.equal((await service.listAlarms(member)).find(a=>a.id===duplicate[0].id).active,false);
    await pool.query("UPDATE family_alarms SET expires_at=now()-interval '1 minute'");
    assert.ok((await service.listAlarms(owner)).every(a=>!a.active));
  } finally {
    if(pool)await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
