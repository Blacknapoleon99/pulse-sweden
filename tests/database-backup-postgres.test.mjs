import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFamilyService} from '../family.mjs';
const run=(script,args,env)=>new Promise((ok,bad)=>{
  const child=spawn(process.execPath,[script,...args],{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});let output='';
  child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
  child.on('error',bad);child.on('close',code=>code===0?ok(output):bad(new Error(output)));
});
test('encrypted PostgreSQL backup restores accounts, isolation, chats and history without platform tables',{skip:!process.env.TRYGGPULS_TEST_DATABASE_URL},async()=>{
  const admin=new pg.Pool({connectionString:process.env.TRYGGPULS_TEST_DATABASE_URL});
  const suffix=randomUUID().replaceAll('-',''),sourceName='backup_source_'+suffix,targetName='backup_target_'+suffix;
  const sourceUrl=new URL(process.env.TRYGGPULS_TEST_DATABASE_URL),targetUrl=new URL(sourceUrl);sourceUrl.pathname='/'+sourceName;targetUrl.pathname='/'+targetName;
  let source,target;const folder=await mkdtemp(join(tmpdir(),'tryggpulse-backup-'));
  try{
    await admin.query(`CREATE DATABASE ${sourceName}`);await admin.query(`CREATE DATABASE ${targetName}`);
    source=new pg.Pool({connectionString:sourceUrl.toString()});target=new pg.Pool({connectionString:targetUrl.toString()});
    const service=createFamilyService({pool:source});await service.init();
    const register=async name=>(await service.register({name,email:name+'@example.test',password:'test-only-long-password'})).user;
    const owner=await register('owner'),member=await register('member'),outside=await register('outside');
    await service.createGroup(owner,'Synthetic family');owner.family_id=(await source.query('SELECT family_id FROM family_users WHERE id=$1',[owner.id])).rows[0].family_id;
    await service.join(member,await service.invite(owner));member.family_id=owner.family_id;
    await service.createGroup(outside,'Other family');outside.family_id=(await source.query('SELECT family_id FROM family_users WHERE id=$1',[outside.id])).rows[0].family_id;
    await service.sendMessage(owner,'Group message');await service.sendMessage(owner,'Private message',member.id);
    const lease=await service.startSharing(member);await service.reportLocation(member,{lat:59.33,lon:18.06,accuracy:20,observedAt:Date.now(),...lease});
    await source.query('CREATE TABLE platform_sentinel(value text)');await source.query("INSERT INTO platform_sentinel VALUES('must not be exported')");
    await target.query('CREATE TABLE platform_sentinel(value text)');await target.query("INSERT INTO platform_sentinel VALUES('must survive import')");
    const env={DATABASE_URL:sourceUrl.toString(),RESTORE_DATABASE_URL:targetUrl.toString(),BACKUP_DIRECTORY:folder,BACKUP_ENCRYPTION_KEY:randomBytes(32).toString('base64')};
    await run('scripts/database-backup.mjs',['backup'],env);
    const {archive}=JSON.parse(await readFile(join(folder,'last-success.json'),'utf8'));
    await run('scripts/database-backup.mjs',['verify',archive],env);
    const corrupted=await readFile(archive);corrupted[25]^=1;const corruptPath=join(folder,'corrupted.enc');await writeFile(corruptPath,corrupted);
    await assert.rejects(run('scripts/database-backup.mjs',['restore',corruptPath],env));
    assert.equal((await target.query("SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='family_users'")).rows[0].count,'0');
    await run('scripts/database-backup.mjs',['restore',archive],env);
    await run('scripts/database-compare.mjs',[],{SOURCE_DATABASE_URL:sourceUrl.toString(),TARGET_DATABASE_URL:targetUrl.toString()});
    assert.equal((await target.query('SELECT value FROM platform_sentinel')).rows[0].value,'must survive import');
    const restored=createFamilyService({pool:target});await restored.init();
    assert.equal((await restored.login({email:owner.email,password:'test-only-long-password'})).user.id,owner.id);
    assert.equal((await restored.listMessages(member)).length,1);assert.equal((await restored.listMessages(member,owner.id)).length,1);
    assert.equal((await restored.overview(owner)).positionHistory[member.id].length,1);
    assert.equal((await restored.overview(outside)).positionHistory[member.id],undefined);
    await assert.rejects(run('scripts/database-backup.mjs',['restore',archive],env),'non-empty target must be protected');
  }finally{
    await source?.end();await target?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${sourceName} WITH (FORCE)`);await admin.query(`DROP DATABASE IF EXISTS ${targetName} WITH (FORCE)`);await admin.end();await rm(folder,{recursive:true,force:true});
  }
});
