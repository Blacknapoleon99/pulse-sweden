import test from 'node:test';
import assert from 'node:assert/strict';
import { passageId, polygonParts, mapFocus, validAt, positionFresh, feedAvailable, destinationOnly, matchMunicipality, latestRequest } from '../mobile/src/mobileState.ts';
import { createFamilyStore } from '../mobile/src/familyStore.ts';
import {updateFamilyTrails,familyTrailSegments} from '../mobile/src/familyTrails.ts';

test('route lines do not invent movement through gaps in shared positions',()=>{
  const points=[0,10_000,600_000,610_000].map(at=>({at,latitude:59,longitude:18}));
  assert.deepEqual(familyTrailSegments(points).map(segment=>segment.map(point=>point.at)),[[0,10_000],[600_000,610_000]]);
});

test('family trails follow shared positions, expire, and disappear when sharing stops',()=>{
  let clock=Date.parse('2026-10-06T10:00:00Z');
  const member={id:'m',display_name:'Test',sharing:true,lat:59,lon:18,updated_at:new Date(clock).toISOString()};
  const first=updateFamilyTrails({},[member],clock);
  assert.equal(first.m.length,1);
  assert.equal(updateFamilyTrails(first,[member],clock).m.length,1);
  clock+=10_000;
  const moved={...member,lat:59.001,updated_at:new Date(clock).toISOString()};
  const next=updateFamilyTrails(first,[moved],clock);
  assert.equal(next.m.length,2);assert.equal(first.m.length,1);
  assert.equal(next.m[1].latitude,59.001);
  assert.deepEqual(updateFamilyTrails(next,[{...moved,sharing:false}],clock),{});
  assert.deepEqual(updateFamilyTrails(next,[],clock),{});
  assert.equal(updateFamilyTrails(next,[moved],clock+15*60_000).m.length,2);
  assert.deepEqual(updateFamilyTrails(next,[moved],clock+6*60*60_000),{});
  const later=clock+6*60*60_000;
  assert.equal(updateFamilyTrails(next,[{...moved,updated_at:new Date(later).toISOString()}],later).m.length,1);
});

test('server history restores six hours after a restart without marking old points as current',()=>{
  const now=Date.now(),member={id:'m',display_name:'Member',sharing:true};
  const history={m:[{latitude:59,longitude:18,at:now-7*3600_000},{latitude:59.1,longitude:18,at:now-5*3600_000},{latitude:59.2,longitude:18,at:now-3600_000}]};
  const trails=updateFamilyTrails({},[member],now,history);
  assert.deepEqual(trails.m.map(point=>point.latitude),[59.1,59.2]);
  assert.deepEqual(updateFamilyTrails(trails,[member],now,{}),{});
  assert.deepEqual(updateFamilyTrails({},[{...member,sharing:false}],now,history),{});
});

test('route police IDs match server identifiers; zone IDs stay unchanged', () => {
  assert.equal(passageId({id:'123',properties:{name:'Test'}}),'police-123');
  assert.equal(passageId({id:'police-123',properties:{}}),'police-123');
  assert.equal(passageId({id:'zone-1',properties:{kind:'security-zone'}}),'zone-1');
  assert.equal(passageId({id:'network-1',properties:{kind:'organized-crime-area'}}),'network-1');
});
test('polygon and multipolygon preserve interior holes', () => {
  const rings = [[[0,0],[4,0],[4,4],[0,0]],[[1,1],[2,1],[2,2],[1,1]]];
  for (const type of ['Polygon','MultiPolygon']) {
    const parts=polygonParts({geometry:{type,coordinates:type==='Polygon'?rings:[rings,rings]}});
    assert.equal(parts.length,type==='Polygon'?1:2);
    assert.deepEqual(parts[0].holes[0][1],{latitude:1,longitude:2});
  }
});
test('map focus follows updated location, destination takes precedence', () => {
  const a={latitude:59,longitude:18,latitudeDelta:0.1,longitudeDelta:0.1};
  assert.equal(mapFocus(a),a);
  assert.equal(mapFocus({...a,latitude:60}).latitude,60);
  assert.equal(mapFocus(a,{latitude:61,longitude:19}).latitude,61);
});
test('notices and cached positions expire locally, invalid times fail closed', () => {
  const now=Date.parse('2026-09-29T12:00:00Z');
  assert.equal(validAt({validTo:'2026-09-29T12:00:00Z'},now),false);
  assert.equal(validAt({validFrom:'2026-10-01',validTo:'2026-10-02'},now),false);
  assert.equal(validAt({validTo:'not-a-date'},now),false);
  const member={sharing:true,lat:59,lon:18,updated_at:'2026-09-29T11:50:00Z'};
  assert.equal(positionFresh(member,now),true);
  assert.equal(positionFresh(member,now+5*60_000),false);
  assert.equal(positionFresh({...member,sharing:false},now),false);
});
test('unavailable feeds differ from fetched empty feeds; route marker deduplication', () => {
  assert.equal(feedAvailable(null),false);
  assert.equal(feedAvailable({events:[],error:'offline',fetchedAt:null}),false);
  assert.equal(feedAvailable({events:[],fetchedAt:'2026-09-29'}),true);
  assert.deepEqual(destinationOnly([{id:'a'},{id:'b'}],[{id:'a'}]),[{id:'b'}]);
});
test('municipality matching requires one exact normalized match', () => {
  const regions=[{region:'Stockholm'},{region:'Göteborg'}];
  assert.equal(matchMunicipality('Göteborg kommun',regions),'Göteborg');
  assert.equal(matchMunicipality('Göte',regions),'');
  assert.equal(matchMunicipality(undefined,regions),'');
});
test('a newer search and unmount invalidate older responses', () => {
  const request=latestRequest(),a=request.next(),b=request.next();
  assert.equal(request.current(a),false);assert.equal(request.current(b),true);
  request.invalidate();assert.equal(request.current(b),false);
});
const overview=(family='f')=>({user:{id:'user'},family:{id:family},members:[],zones:[],alerts:[],childItems:[]});
const alarm=(ack=null)=>({id:'alarm',active:true,senderId:'sender',recipients:[{id:'user',acknowledgedAt:ack}]});
const deferred=()=>{let resolve; const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('alarm or chat errors do not make fresh family positions stale, and recover separately',async()=>{
  let fail=true;
  const store=createFamilyStore(async path=>{
    if(path==='me')return overview();
    if(fail)throw Object.assign(new Error('Endpoint is unavailable'),{status:404});
    return path==='alarms'?{alarms:[]}:{messages:[]};
  },async()=>'token');
  assert.equal(await store.refresh(true),true);
  assert.ok(store.getSnapshot().overview);assert.equal(store.getSnapshot().error,'');
  assert.match(store.getSnapshot().chatError,/404/);assert.match(store.getSnapshot().alarmError,/404/);
  fail=false;await store.refresh(true);assert.equal(store.getSnapshot().chatError,'');assert.equal(store.getSnapshot().alarmError,'');
});

test('an expired session on a dependent request clears all private family data',async()=>{
  const store=createFamilyStore(async path=>{
    if(path==='me')return overview();
    throw Object.assign(new Error('Session expired'),{status:401});
  },async()=>'token');
  assert.equal(await store.refresh(true),false);assert.equal(store.getSnapshot().overview,null);
  assert.deepEqual(store.getSnapshot().trails,{});assert.match(store.getSnapshot().error,/inloggning/);
});
test('family polling retains motion trails and clears them on family changes and logout',async()=>{
  let family='one',clock=Date.now(),lat=59;
  const store=createFamilyStore(async path=>path==='me'?{...overview(family),members:[{id:'m',sharing:true,lat,lon:18,updated_at:new Date(clock).toISOString()}]}:{alarms:[]},async()=>'token');
  await store.refresh();assert.equal(store.getSnapshot().trails.m.length,1);
  lat=59.001;clock++;await store.refresh();assert.equal(store.getSnapshot().trails.m.length,2);
  family='two';clock++;await store.refresh();assert.equal(store.getSnapshot().trails.m.length,1);
  store.reset();assert.deepEqual(store.getSnapshot().trails,{});
});
test('signed-out polls do not repeatedly reset a login form', async()=>{
  const store=createFamilyStore(async()=>{throw new Error('Must not request while signed out');},async()=>null);
  await store.refresh();const revision=store.getSnapshot().revision;
  await store.refresh();await store.refresh();assert.equal(store.getSnapshot().revision,revision);
});
test('family poll refreshes messages and acknowledgement counts', async()=>{
  let acknowledged=false,body='first';
  const store=createFamilyStore(async path=>path==='me'?overview():path==='alarms'?{alarms:[alarm(acknowledged?'seen':null)]}:{messages:[{id:'m',body}]},async()=>'token');
  await store.refresh(true); assert.equal(store.getSnapshot().messages[0].body,'first');
  acknowledged=true;body='second';await store.refresh(true);
  assert.equal(store.getSnapshot().alarms[0].recipients[0].acknowledgedAt,'seen');
  assert.equal(store.getSnapshot().messages[0].body,'second');
});
test('successful acknowledgement survives an overlapping older poll',async()=>{
  let held=null;
  const store=createFamilyStore(async path=>path==='me'?overview():path==='alarms'?(held?held.promise:{alarms:[alarm()]}):{},async()=>'token');
  await store.refresh(); held=deferred();const poll=store.refresh();await new Promise(setImmediate);
  await store.acknowledge('alarm');held.resolve({alarms:[alarm()]});await poll;
  assert.ok(store.getSnapshot().alarms[0].recipients[0].acknowledgedAt);
});
test('logout during an in-flight request cannot repopulate private state',async()=>{
  const held=deferred();let token='token';
  const store=createFamilyStore(async()=>held.promise,async()=>token);
  const poll=store.refresh();await new Promise(setImmediate);
  token=null;store.reset();held.resolve(overview());await poll;
  assert.equal(store.getSnapshot().overview,null);
  assert.deepEqual(store.getSnapshot().alarms,[]);assert.deepEqual(store.getSnapshot().messages,[]);
});
test('family change clears chat before new requests finish; failed poll retains current family data',async()=>{
  let family='f',fail=false;
  const store=createFamilyStore(async path=>{
    if(path==='me')return overview(family);
    if(fail)throw new Error('offline');
    return path==='alarms'?{alarms:[alarm()]}:{messages:[{id:'private'}]};
  },async()=>'token');
  await store.refresh(true);fail=true;await store.refresh(true);
  assert.equal(store.getSnapshot().messages.length,1);assert.equal(store.getSnapshot().error,'');assert.ok(store.getSnapshot().chatError);assert.ok(store.getSnapshot().alarmError);
  family='new';await store.refresh(true);
  assert.deepEqual(store.getSnapshot().messages,[]);assert.deepEqual(store.getSnapshot().alarms,[]);
});
