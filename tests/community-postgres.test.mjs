import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createFamilyService} from '../family.mjs';
import {migrate} from '../migrations.mjs';
import {createCommunityService,RULES_VERSION} from '../community.mjs';
test('real PostgreSQL: concurrent idempotency, durable limits, resolve versus comment and moderation', {skip:!process.env.TRYGGPULS_TEST_DATABASE_URL},async()=>{
  const schema='tryggpuls_community_test_'+randomUUID().replaceAll('-',''),admin=new pg.Pool({connectionString:process.env.TRYGGPULS_TEST_DATABASE_URL});let pool;
  try{
    await admin.query(`CREATE SCHEMA "${schema}"`);pool=new pg.Pool({connectionString:process.env.TRYGGPULS_TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:10});
    const accounts=createFamilyService({pool});await accounts.init();await migrate(pool);await migrate(pool);
    const community=createCommunityService({pool,accounts,enabled:()=>true});
    const user=(await accounts.register({name:'Test',email:'test@example.test',password:'test-only-password-123'})).user;
    await pool.query('UPDATE family_users SET email_verified_at=now() WHERE id=$1',[user.id]);await community.acceptRules(user,{atLeast16:true,rulesVersion:RULES_VERSION});
    const draft=()=>({requestId:randomUUID(),category:'hazard',title:'Ett hinder',body:'En saklig testobservation.',lat:59.3293,lon:18.0686,observedAt:new Date().toISOString()});
    const input=draft(),copies=await Promise.all(Array.from({length:6},()=>community.createReport(user,input)));assert.equal(new Set(copies.map(row=>row.id)).size,1);
    const competing=await Promise.allSettled(Array.from({length:6},()=>community.createReport(user,draft())));assert.equal(competing.filter(item=>item.status==='fulfilled').length,2);assert.ok(competing.filter(item=>item.status==='rejected').every(item=>item.reason.status===429));
    const report=copies[0],comment={requestId:randomUUID(),body:'En testkommentar'};
    await Promise.allSettled([community.addComment(user,report.id,comment),community.endReport(user,report.id,'resolved')]);
    await assert.rejects(community.addComment(user,report.id,{...comment,requestId:randomUUID()}),{status:409});
    await community.moderate({id:'staff',role:'reviewer'},{action:'remove-report',targetId:report.id,reason:'Syntetisk granskning'});assert.equal((await community.list(null,new URLSearchParams())).items.some(row=>row.id===report.id),false);
  }finally{if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}
});
