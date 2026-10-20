import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { newDb } from 'pg-mem';
import sharp from 'sharp';
import { createFamilyService } from '../family.mjs';
import { migrate } from '../migrations.mjs';
import { approximatePoint, cleanCommunityText, createCommunityService, COMMUNITY_LABEL, RULES_VERSION } from '../community.mjs';
import { createAccountApi } from '../account.mjs';
import { createNativeNotifications } from '../native-notifications.mjs';
async function setup(t) {
  const Pool=newDb().adapters.createPg().Pool,pool=new Pool();pool.__memory=true;t.after(()=>pool.end());
  const accounts=createFamilyService({pool});await accounts.init();await migrate(pool);
  let time=Date.now();const now=()=>time;
  const objects=new Map();const storage={configured:true,put:async(key,bytes)=>objects.set(key,bytes),get:async key=>objects.get(key),remove:async key=>objects.delete(key)};
  const community=createCommunityService({pool,accounts,storage,enabled:()=>true,now});accounts.addAccountCleanup(community.cleanupAccount);
  async function user(email){const value=(await accounts.register({email,name:'Private Real Name',password:'a-long-password-123'})).user;await pool.query('UPDATE family_users SET email_verified_at=now() WHERE id=$1',[value.id]);await community.acceptRules(value,{atLeast16:true,rulesVersion:RULES_VERSION});return value;}
  const author=await user('author@example.test'),viewer=await user('viewer@example.test');
  const draft=()=>({requestId:randomUUID(),category:'traffic',title:'Hinder på vägen',body:'Ett träd ligger över gångvägen.',lat:59.329312,lon:18.068643,observedAt:new Date(time).toISOString()});
  return {pool,accounts,community,storage,objects,author,viewer,user,draft,now,advance:milliseconds=>{time+=milliseconds;}};
}
test('public reports publish immediately, retain unverified status, and store only snapped locations',async t=>{
  const s=await setup(t),input=s.draft(),report=await s.community.createReport(s.author,input);
  assert.equal(report.label,COMMUNITY_LABEL);assert.equal(report.verification,'unverified');assert.equal(report.isOwner,true);
  assert.notEqual(report.location.lat,input.lat);assert.notEqual(report.location.lon,input.lon);
  assert.deepEqual(approximatePoint(report.location.lat,report.location.lon),report.location,'grid snapping is stable on resubmission');
  const page=await s.community.list(s.viewer,new URLSearchParams());assert.equal(page.items.length,1);
  const payload=JSON.stringify(page);for(const secret of [s.author.id,s.author.email,'Private Real Name',String(input.lat),String(input.lon)])assert.ok(!payload.includes(secret));
  const row=(await s.pool.query('SELECT lat,lon FROM community_reports')).rows[0];assert.equal(row.lat,report.location.lat);
});
test('eligibility requires confirmed identity, 16+ attestation and current rules; suspension and rollout flag fail closed',async t=>{
  const s=await setup(t),raw=(await s.accounts.register({email:'unconfirmed@example.test',name:'Example',password:'a-long-password-123'})).user;
  await assert.rejects(s.community.createReport(raw,s.draft()),{status:403,code:'IDENTITY_REQUIRED'});
  await s.pool.query('UPDATE family_users SET email_verified_at=now() WHERE id=$1',[raw.id]);
  await assert.rejects(s.community.acceptRules(raw,{atLeast16:false,rulesVersion:RULES_VERSION}),{status:400});
  await assert.rejects(s.community.createReport(raw,s.draft()),{status:403,code:'ELIGIBILITY_REQUIRED'});
  await s.community.acceptRules(raw,{atLeast16:true,rulesVersion:RULES_VERSION});
  await s.community.moderate({id:'reviewer',role:'reviewer'},{action:'suspend-author',targetId:(await s.community.me(raw)).authorKey,reason:'Upprepad överträdelse av användarreglerna'});
  await assert.rejects(s.community.createReport(raw,s.draft()),{status:403,code:'CONTRIBUTOR_SUSPENDED'});
  const disabled=createCommunityService({pool:s.pool,accounts:s.accounts,enabled:()=>false});await assert.rejects(disabled.createReport(s.author,s.draft()),{status:503});
});
test('idempotency survives retries and durable hourly limits survive a service restart',async t=>{
  const s=await setup(t),input=s.draft(),first=await s.community.createReport(s.author,input);
  assert.equal((await s.community.createReport(s.author,input)).id,first.id);
  await assert.rejects(s.community.createReport(s.author,{...input,body:'En annan observation.'}),{status:409});
  await s.community.createReport(s.author,s.draft());await s.community.createReport(s.author,s.draft());
  const restarted=createCommunityService({pool:s.pool,accounts:s.accounts,enabled:()=>true,now:s.now});
  await assert.rejects(restarted.createReport(s.author,s.draft()),{status:429});
  assert.equal((await s.pool.query('SELECT id FROM community_reports')).rows.length,3);
});
test('expiry comes from observation time, closes comments, and keeps only private author history',async t=>{
  const s=await setup(t),input={...s.draft(),observedAt:new Date(s.now()-23*3_600_000).toISOString()},report=await s.community.createReport(s.author,input);
  s.advance(3_600_001);assert.equal((await s.community.list(null,new URLSearchParams())).items.length,0);
  await assert.rejects(s.community.accessibleReport(report.id,s.viewer),{status:404});
  assert.equal((await s.community.list(s.author,new URLSearchParams('mine=1'))).items[0].status,'expired');
  await assert.rejects(s.community.addComment(s.author,report.id,{requestId:randomUUID(),body:'Ett nytt svar'}),{status:409});
  assert.deepEqual((await s.community.comments(s.author,report.id)).items,[]);
  s.advance(30*86_400_000);await s.community.sweep();assert.equal((await s.pool.query('SELECT id FROM community_reports')).rows.length,0);
});

test('committed photos leave the orphan queue and are queued again when their author deletes the report',async t=>{
  const s=await setup(t),report=await s.community.createReport(s.author,s.draft());
  const bytes=await sharp({create:{width:4,height:4,channels:3,background:'#336699'}}).jpeg().toBuffer();
  await s.community.uploadPhoto(s.author,report.id,bytes);
  const key=(await s.pool.query('SELECT photo_key FROM community_reports WHERE id=$1',[report.id])).rows[0].photo_key;
  s.objects.set('community/synthetic-orphan.jpg',Buffer.from('orphan'));
  await s.pool.query('INSERT INTO media_cleanup(object_key) VALUES($1)',['community/synthetic-orphan.jpg']);
  await s.pool.query('UPDATE media_cleanup SET created_at=$1',[new Date(s.now()).toISOString()]);
  s.advance(3_600_001);await s.community.sweep();
  assert.ok(s.objects.has(key));assert.equal(s.objects.has('community/synthetic-orphan.jpg'),false);
  assert.equal((await s.pool.query('SELECT object_key FROM media_cleanup')).rows.length,0);
  await s.community.endReport(s.author,report.id,'removed');
  assert.equal((await s.pool.query('SELECT object_key FROM media_cleanup')).rows[0].object_key,key);
  await s.pool.query('UPDATE media_cleanup SET created_at=$1',[new Date(s.now()).toISOString()]);
  await s.community.sweep();assert.ok(s.objects.has(key),'deletion cleanup respects its grace period');
  s.advance(3_600_001);await s.community.sweep();assert.equal(s.objects.has(key),false);
});
test('comments have one reply level, owner checks, tombstones and bidirectional persistent blocking',async t=>{
  const s=await setup(t),report=await s.community.createReport(s.author,s.draft());
  const requestId=randomUUID(),root=await s.community.addComment(s.viewer,report.id,{requestId,body:'Jag såg också hindret.'});
  assert.equal((await s.community.addComment(s.viewer,report.id,{requestId,body:'Jag såg också hindret.'})).id,root.id);
  const reply=await s.community.addComment(s.author,report.id,{requestId:randomUUID(),body:'Tack för uppgiften.',parentId:root.id});
  await assert.rejects(s.community.addComment(s.viewer,report.id,{requestId:randomUUID(),body:'Ytterligare ett svar',parentId:reply.id}),{status:409});
  await assert.rejects(s.community.removeComment(s.author,root.id),{status:404});
  await s.community.removeComment(s.viewer,root.id);assert.equal((await s.community.comments(s.author,report.id)).items.find(item=>item.id===root.id).body,'');
  await s.community.block(s.viewer,report.author.key);
  assert.equal((await s.community.list(s.viewer,new URLSearchParams())).items.length,0);
  await assert.rejects(s.community.accessibleReport(report.id,s.viewer),{status:404});
  const second=await s.community.createReport(s.viewer,s.draft());await assert.rejects(s.community.addComment(s.author,second.id,{requestId:randomUUID(),body:'Ett svar från blockerad användare'}),{status:404});
  await s.community.block(s.viewer,report.author.key,true);assert.equal((await s.community.list(s.viewer,new URLSearchParams())).items.length,2);
});
test('photos are decoded, resized, stripped of metadata and inaccessible until staff approval',async t=>{
  const s=await setup(t),report=await s.community.createReport(s.author,s.draft());
  const original=await sharp({create:{width:2000,height:1000,channels:3,background:'#eeeeee'}}).withMetadata().jpeg().toBuffer();assert.ok((await sharp(original).metadata()).exif);
  await s.community.uploadPhoto(s.author,report.id,original);
  await assert.rejects(s.community.photo(report.id,s.viewer),{status:404});await assert.rejects(s.community.photo(report.id,s.author),{status:404});
  const privateImage=await s.community.photo(report.id,null,true),metadata=await sharp(privateImage).metadata();assert.ok(metadata.width<=1600);assert.equal(metadata.exif,undefined);assert.equal(metadata.icc,undefined);
  await assert.rejects(s.community.moderate({id:'editor',role:'editor'},{action:'approve-photo',targetId:report.id,reason:'Bilden är granskad'}),{status:403});
  await s.community.moderate({id:'reviewer',role:'reviewer'},{action:'approve-photo',targetId:report.id,reason:'Ingen identifierbar person eller personuppgift'});
  assert.ok((await s.community.photo(report.id,s.viewer)).length);assert.equal((await s.community.list(s.viewer,new URLSearchParams())).items[0].verification,'unverified');
  await s.community.moderate({id:'reviewer',role:'reviewer'},{action:'reject-photo',targetId:report.id,reason:'Bilden ska inte längre visas'});await assert.rejects(s.community.photo(report.id,s.viewer),{status:404});
  const another=await s.community.createReport(s.author,s.draft());await assert.rejects(s.community.uploadPhoto(s.author,another.id,Buffer.from('<svg>bad</svg>')),{status:415});
});
test('flags retain evidence for staff, editors cannot moderate, and removed reports disappear',async t=>{
  const s=await setup(t),report=await s.community.createReport(s.author,s.draft());
  await s.community.flag(s.viewer,{targetType:'report',targetId:report.id,reason:'Uppgiften behöver kontrolleras'});
  const queue=await s.community.moderationQueue();assert.equal(queue.flags.length,1);assert.equal(queue.flags[0].content.title,report.title);
  await s.community.moderate({id:'staff-a',role:'reviewer'},{action:'remove-report',targetId:report.id,reason:'Rapporten bryter mot reglerna'});
  assert.equal((await s.community.list(null,new URLSearchParams())).items.length,0);assert.equal((await s.community.moderationQueue()).audit[0].actor,'staff-a');
});
test('account deletion removes community data, queues media cleanup and transfers family ownership',async t=>{
  const s=await setup(t);await s.accounts.createGroup(s.author,'Testfamilj');s.author.family_id=(await s.pool.query('SELECT family_id FROM family_users WHERE id=$1',[s.author.id])).rows[0].family_id;
  await s.accounts.join(s.viewer,await s.accounts.invite(s.author));s.viewer.family_id=s.author.family_id;
  const report=await s.community.createReport(s.author,s.draft());await s.community.uploadPhoto(s.author,report.id,await sharp({create:{width:8,height:8,channels:3,background:'#fff'}}).png().toBuffer());
  await s.accounts.deleteAccount(s.author);
  assert.equal((await s.pool.query('SELECT owner_id FROM family_groups')).rows[0].owner_id,s.viewer.id);assert.equal((await s.pool.query('SELECT id FROM community_reports')).rows.length,0);
  s.advance(2*3_600_000);await s.community.sweep();assert.equal(s.objects.size,0);
});
test('verification/recovery tokens are hashed, expire, are single-use and revoke sessions after reset',async t=>{
  const s=await setup(t),links=[];const mailer={configured:true,accountLink:async(email,kind,token)=>links.push({email,kind,token})};
  const notifications=createNativeNotifications({pool:s.pool,enabled:false});const api=createAccountApi({pool:s.pool,accounts:s.accounts,community:s.community,notifications,mailer,now:s.now});
  await api.requestLink('verify',s.viewer);assert.equal(links.length,1);const token=links[0].token;
  assert.ok(!(await s.pool.query('SELECT token_hash FROM account_actions')).rows.some(row=>row.token_hash===token));
  await api.consume('verify',{token});await assert.rejects(api.consume('verify',{token}),{status:400});
  const signed=await s.accounts.login({email:s.viewer.email,password:'a-long-password-123'});
  await api.requestLink('reset',null,s.viewer.email);const reset=links.find(link=>link.kind==='reset').token;
  await api.consume('reset',{token:reset,password:'new-password-12345'});assert.equal(await s.accounts.session({headers:{authorization:`Bearer ${signed.token}`}}),null);
  assert.equal((await s.accounts.login({email:s.viewer.email,password:'new-password-12345'})).user.id,s.viewer.id);
  const count=links.length;assert.deepEqual(await api.requestLink('reset',null,'unknown@example.test'),{ok:true});assert.equal(links.length,count);
  s.advance(60_000);await api.requestLink('verify',s.viewer);const old=links.at(-1).token;s.advance(31*60_000);await assert.rejects(api.consume('verify',{token:old}),{status:400});
});
test('filters reject private details and malformed pagination and coordinates',async t=>{
  for(const input of ['<script>alert(1)</script>','Contact x@example.test','Personnummer 19900101-1234','www.example.test'])assert.throws(()=>cleanCommunityText(input,600),{status:422});
  assert.throws(()=>approximatePoint(NaN,18),{status:400});
  const s=await setup(t);await assert.rejects(s.community.list(null,new URLSearchParams('cursor=garbage')),{status:400});await assert.rejects(s.community.list(null,new URLSearchParams('bbox=1,2,0,4')),{status:400});
});
