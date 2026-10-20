import test from 'node:test';
import assert from 'node:assert/strict';
import {createFeedStore,feedDefinitions} from '../mobile/src/feedStore.ts';
import {latestEvents} from '../mobile/src/mobileState.ts';
import type {Event,EventsResponse} from '../mobile/src/api.ts';

test('latest home events include all locations and support numeric police IDs at equal times',()=>{
  const events=[{id:2,ts:1,location:{gps:[60,20]}},{id:3,ts:3},{id:1,ts:3,location:{gps:[59,18]}},{id:4,ts:2}];
  assert.deepEqual(latestEvents(events as unknown as Event[]).map(event=>event.id),[1,3,4]);
  assert.deepEqual(latestEvents([]),[]);
});

test('home replaces its three latest events on polling and an immediate return refresh',async()=>{
  let clock=1000,calls=0;
  const event=(id:string,ts:number)=>({id,ts} as Event);
  const initial=[event('older',1),event('third',2),event('newest',4),event('second',3)];
  let incoming=initial;
  const store=createFeedStore(async()=>{calls++;return {events:incoming};},()=>clock);
  const homeIds=()=>latestEvents((store.getSnapshot().events.data as EventsResponse).events).map(item=>item.id);
  await store.refresh('events');
  assert.deepEqual(homeIds(),['newest','second','third']);
  assert.deepEqual(initial.map(item=>item.id),['older','third','newest','second']);
  incoming=[...initial,event('arrived',5)];
  clock+=29_999;await store.refresh('events');assert.equal(calls,1);
  clock++;await store.refresh('events');
  assert.equal(calls,2);assert.deepEqual(homeIds(),['arrived','newest','second']);
  incoming=[...incoming,event('on-return',6)];
  await store.refresh('events',true);
  assert.deepEqual(homeIds(),['on-return','arrived','newest']);
  incoming=[event('only',7)];clock+=30_000;await store.refresh('events');
  assert.deepEqual(homeIds(),['only']);
});
test('independent source failures retain previous successful data and respect retry backoff',async()=>{
  let clock=1000,fail=false,calls=0;const original={items:[{id:'one'}],fetchedAt:new Date(clock).toISOString()};
  const store=createFeedStore(async(path)=>{calls++;if(path.includes('events')||fail)throw new Error('offline');return original;},()=>clock);
  await store.refreshMany(['news','events']);assert.equal(store.getSnapshot().news.data,original);assert.equal(store.getSnapshot().events.error,'offline');
  fail=true;clock+=feedDefinitions.news.interval;await store.refresh('news');assert.equal(store.getSnapshot().news.data,original);assert.equal(store.getSnapshot().news.loading,false);
  const before=calls;clock+=4999;await store.refresh('news');assert.equal(calls,before);clock++;await store.refresh('news');assert.equal(calls,before+1);
  fail=false;await store.refresh('news',true);assert.equal(store.getSnapshot().news.error,null);
});
test('polls deduplicate; logout and backgrounding invalidate late replies without clearing unrelated data',async()=>{
  let release:(value:unknown)=>void=()=>{},calls=0;const store=createFeedStore(async()=>{calls++;return new Promise(resolve=>release=resolve);});
  const one=store.refresh('community'),two=store.refresh('community');await Promise.resolve();assert.equal(calls,1);assert.equal(one,two);
  store.hydrate('news',{items:[{id:'public'}]});store.reset('community');release({items:[{id:'private-account-item'}]});await one;assert.equal(store.getSnapshot().community.data,null);assert.ok(store.getSnapshot().news.data);
  const pending=store.refresh('events');await Promise.resolve();store.pause();release({events:[{id:'late'}]});await pending;assert.equal(store.getSnapshot().events.data,null);assert.equal(store.getSnapshot().events.loading,false);
});
test('unavailable and empty are distinct; stale success preserves its timestamp',async()=>{
  const store=createFeedStore(async path=>path.includes('community')?{items:[],fetchedAt:'2026-09-29T10:00:00Z'}:{status:'unavailable',items:[]});
  await store.refreshMany(['community','weather']);assert.equal(store.getSnapshot().community.error,null);assert.ok(store.getSnapshot().weather.error);assert.equal(store.getSnapshot().weather.data,null);
});
test('cached community reports expire locally even while a network request fails',async()=>{
  let clock=1000;const store=createFeedStore(async()=>{throw new Error('offline');},()=>clock);store.hydrate('community',{items:[{id:'expired',status:'active',expiresAt:new Date(1500).toISOString()}]});clock=2000;const pending=store.refresh('community');store.expireCommunity();await pending;assert.deepEqual((store.getSnapshot().community.data as {items:unknown[]}).items,[]);assert.equal(store.getSnapshot().community.error,'offline');
});
