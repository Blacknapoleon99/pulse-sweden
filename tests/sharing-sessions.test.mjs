import test from 'node:test';
import assert from 'node:assert/strict';
import {newDb} from 'pg-mem';
import {createFamilyService} from '../family.mjs';
test('sharing sessions reject delayed, foreign and revoked points and preserve capture time',async()=>{
  const pool=new (newDb().adapters.createPg().Pool)(),service=createFamilyService({pool});await service.init();
  try{
    const result=await service.register({email:'session@example.test',name:'Test',password:'long-password-123'}),user=result.user;
    await service.createGroup(user,'Session family');user.family_id=(await pool.query('SELECT family_id FROM family_users WHERE id=$1',[user.id])).rows[0].family_id;
    const first=await service.startSharing(user),observedAt=Date.now()-45_000;
    const point={lat:59.33,lon:18.06,accuracy:20,observedAt,...first};
    await service.reportLocation(user,point);
    assert.equal(new Date((await pool.query('SELECT recorded_at FROM family_position_history')).rows[0].recorded_at).getTime(),observedAt);
    assert.equal((await service.reportLocation(user,{...point,lat:59.35,observedAt:observedAt-1000})).ignored,true);
    await assert.rejects(service.reportLocation(user,{...point,observedAt:Date.now()-180_000}),{status:400});
    await assert.rejects(service.reportLocation(user,{...point,sharingSessionId:'foreign'}),{status:409});
    await service.stop(user);
    await assert.rejects(service.reportLocation(user,{...point,observedAt:Date.now()}),{status:409});
    await assert.rejects(service.reportLocation(user,{lat:59.33,lon:18.06,accuracy:20}),{status:409});
    assert.equal((await pool.query('SELECT * FROM family_positions')).rows.length,0);
    const next=await service.startSharing(user);await service.reportLocation(user,{...point,...next,observedAt:Date.now()});
    await assert.rejects(service.reportLocation(user,{...point,observedAt:Date.now()}),{status:409});
    await service.logout({headers:{authorization:`Bearer ${result.token}`}});
    await assert.rejects(service.reportLocation(user,{...point,...next,observedAt:Date.now()}),{status:409});
    assert.equal((await pool.query('SELECT * FROM family_position_history')).rows.length,0);
  }finally{await pool.end();}
});
