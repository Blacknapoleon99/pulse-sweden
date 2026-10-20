import test from 'node:test';
import assert from 'node:assert/strict';
import {newDb} from 'pg-mem';
import {createFamilyService} from '../family.mjs';
import {migrate} from '../migrations.mjs';
import {createNativeNotifications} from '../native-notifications.mjs';
import {randomUUID} from 'node:crypto';
test('durable native delivery, partial errors, retry, invalid device cleanup and acknowledgements remain independent',async t=>{
  const pool=new (newDb().adapters.createPg().Pool)();pool.__memory=true;t.after(()=>pool.end());const accounts=createFamilyService({pool});await accounts.init();await migrate(pool);
  const register=async name=>(await accounts.register({name,email:`${name}@example.test`,password:'synthetic-password-123'})).user,owner=await register('owner'),viewer=await register('viewer');await accounts.createGroup(owner,'Testfamilj');owner.family_id=(await pool.query('SELECT family_id FROM family_users WHERE id=$1',[owner.id])).rows[0].family_id;await accounts.join(viewer,await accounts.invite(owner));viewer.family_id=owner.family_id;
  let clock=Date.now(),unavailable=false,sends=0;const fetcher=async(url)=>{if(unavailable)throw new Error('offline');if(url.endsWith('/send')){sends++;return {ok:true,json:async()=>({data:[{status:'ok',id:'ticket-one'},{status:'error',details:{error:'DeviceNotRegistered'}}]})};}return {ok:true,json:async()=>({data:{'ticket-one':{status:'ok'}}})};};
  const notifications=createNativeNotifications({pool,enabled:true,accessToken:'synthetic-token',fetcher,now:()=>clock});accounts.addAlarmHook(notifications.alarmHook);
  const first='ExponentPushToken[test-device-first]',second='ExponentPushToken[test-device-second]';await notifications.register(viewer,{token:first,alarms:true,replies:false});await notifications.register(viewer,{token:second,alarms:true,replies:false});
  const alarm=await accounts.createAlarm(owner,randomUUID());await notifications.dispatch();assert.equal(sends,1);assert.equal((await pool.query('SELECT token FROM native_push_devices')).rows.length,1);assert.equal((await notifications.deliveries(owner,alarm.id))[0].status,'accepted');
  clock+=60_001;await notifications.dispatch();assert.equal((await notifications.deliveries(owner,alarm.id))[0].status,'failed','partial device failure is retained');assert.equal((await accounts.listAlarms(owner))[0].recipients[0].acknowledgedAt,null);
  await accounts.acknowledgeAlarm(viewer,alarm.id);assert.ok((await accounts.listAlarms(owner))[0].recipients[0].acknowledgedAt);await assert.rejects(notifications.deliveries(viewer,alarm.id),{status:404});
  await pool.query("UPDATE notification_outbox SET status='queued',attempts=0,next_attempt_at=$1",[new Date(clock).toISOString()]);unavailable=true;await notifications.dispatch();assert.equal((await notifications.deliveries(owner,alarm.id))[0].status,'retry');unavailable=false;clock+=10_001;await notifications.dispatch();assert.equal(sends,2);
  await accounts.cancelAlarm(owner,alarm.id);clock+=60_001;await notifications.dispatch();assert.equal((await notifications.deliveries(owner,alarm.id))[0].status,'expired');
});
