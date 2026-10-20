// Only two new randomly named databases are created and removed. Use a TEST server.
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {createFamilyService} from '../family.mjs';
import {migrate} from '../migrations.mjs';
import {createCommunityService,RULES_VERSION} from '../community.mjs';
const connectionString=process.env.TRYGGPULS_TEST_DATABASE_URL;
if(!connectionString)throw new Error('Set TRYGGPULS_TEST_DATABASE_URL to a disposable PostgreSQL server with CREATEDB permission.');
const identifier=randomUUID().replaceAll('-',''),names=[`tryggpuls_rehearsal_source_${identifier}`,`tryggpuls_rehearsal_target_${identifier}`];
const admin=new pg.Pool({connectionString}),folder=await mkdtemp(join(tmpdir(),'tryggpuls-restore-')),archive=join(folder,'synthetic.dump');let source,target;
const databaseUrl=name=>{const value=new URL(connectionString);value.pathname='/'+name;return value.toString();};
function command(binary,args,url){const value=new URL(url),env={...process.env,PGHOST:value.hostname,PGPORT:value.port||'5432',PGUSER:decodeURIComponent(value.username),PGPASSWORD:decodeURIComponent(value.password),PGDATABASE:value.pathname.slice(1),PGSSLMODE:value.searchParams.get('sslmode')||'prefer'};const result=spawnSync(binary,args,{env,encoding:'utf8'});if(result.error||result.status!==0)throw new Error(`${binary} failed. Check PostgreSQL client version, connection and permissions.`);}
try{
  for(const name of names){assert.match(name,/^tryggpuls_rehearsal_(source|target)_[a-f0-9]{32}$/);await admin.query(`CREATE DATABASE "${name}"`);}
  source=new pg.Pool({connectionString:databaseUrl(names[0])});const accounts=createFamilyService({pool:source});await accounts.init();await migrate(source);
  const user=(await accounts.register({name:'Restore test',email:'restore@example.test',password:'synthetic-only-password-123'})).user;await source.query('UPDATE family_users SET email_verified_at=now() WHERE id=$1',[user.id]);
  const community=createCommunityService({pool:source,accounts,enabled:()=>true});await community.acceptRules(user,{atLeast16:true,rulesVersion:RULES_VERSION});
  const report=await community.createReport(user,{requestId:randomUUID(),category:'other',title:'Återställningstest',body:'Syntetiskt innehåll för återställning.',lat:59.3293,lon:18.0686,observedAt:new Date().toISOString()});
  await community.addComment(user,report.id,{requestId:randomUUID(),body:'Syntetisk kommentar.'});
  command('pg_dump',['--format=custom','--no-owner','--no-acl','--file',archive],databaseUrl(names[0]));
  command('pg_restore',['--exit-on-error','--no-owner','--no-acl','--dbname',names[1],archive],databaseUrl(names[1]));
  target=new pg.Pool({connectionString:databaseUrl(names[1])});await migrate(target);
  for(const table of ['family_users','community_profiles','community_reports','community_comments','schema_migrations'])assert.deepEqual((await source.query(`SELECT * FROM ${table} ORDER BY 1`)).rows,(await target.query(`SELECT * FROM ${table} ORDER BY 1`)).rows);
  const restored=createCommunityService({pool:target,accounts:createFamilyService({pool:target}),enabled:()=>true});assert.equal((await restored.list(null,new URLSearchParams())).items[0].verification,'unverified');
  assert.equal((await createFamilyService({pool:target}).login({email:user.email,password:'synthetic-only-password-123'})).user.id,user.id);
  console.log('Synthetic restore, migration replay and family rollback compatibility passed.');
}finally{
  if(source)await source.end();if(target)await target.end();
  for(const name of names){assert.match(name,/^tryggpuls_rehearsal_(source|target)_[a-f0-9]{32}$/);await admin.query(`DROP DATABASE IF EXISTS "${name}"`);}
  await admin.end();await rm(folder,{recursive:true,force:true});
}
