import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createFamilyService} from '../family.mjs';
test('PostgreSQL row locks prevent concurrent late GPS uploads from undoing stop, logout or leave',{skip:!process.env.TRYGGPULS_TEST_DATABASE_URL},async()=>{
  const connectionString=process.env.TRYGGPULS_TEST_DATABASE_URL,schema='sharing_test_'+randomUUID().replaceAll('-','');
  const admin=new pg.Pool({connectionString});let pool;
  try{
    await admin.query(`CREATE SCHEMA ${schema}`);pool=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:8});
    const service=createFamilyService({pool});await service.init();
    const account=await service.register({email:'locks@example.test',name:'Test',password:'test-only-long-password'}),user=account.user;
    await service.createGroup(user,'Synthetic family');user.family_id=(await pool.query('SELECT family_id FROM family_users WHERE id=$1',[user.id])).rows[0].family_id;
    const point=lease=>({lat:59.33,lon:18.06,accuracy:20,observedAt:Date.now(),...lease});
    for(let i=0;i<12;i++){
      const lease=await service.startSharing(user);
      const results=await Promise.allSettled([service.reportLocation(user,point(lease)),service.stop(user)]);
      assert.equal(results[1].status,'fulfilled');
      assert.equal((await pool.query('SELECT * FROM family_positions')).rows.length,0);
      const row=(await pool.query('SELECT sharing,sharing_session_hash FROM family_users WHERE id=$1',[user.id])).rows[0];assert.equal(row.sharing,false);assert.equal(row.sharing_session_hash,null);
      await assert.rejects(service.reportLocation(user,point(lease)),{status:409});
    }
    let lease=await service.startSharing(user);await service.logout({headers:{authorization:'Bearer '+account.token}});
    await assert.rejects(service.reportLocation(user,point(lease)),{status:409});
    const remaining=(await service.register({email:'remaining@example.test',name:'Remaining',password:'test-only-long-password'})).user;
    await service.join(remaining,await service.invite(user));
    await pool.query('UPDATE family_groups SET owner_id=$1 WHERE id=$2',[remaining.id,user.family_id]);
    lease=await service.startSharing(user);await service.leave(user);
    await assert.rejects(service.reportLocation(user,point(lease)),{status:403});
  }finally{await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
});
