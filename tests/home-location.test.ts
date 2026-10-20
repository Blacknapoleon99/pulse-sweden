import test from 'node:test';
import assert from 'node:assert/strict';
import { readForegroundPosition, ForegroundLocationError, type LocationDriver } from '../mobile/src/foregroundLocation.ts';
import { closestEvents, eventsInViewport, latestNearbyEvents, neighborhoodRegion, recentHomeEvents } from '../mobile/src/homeMapState.ts';
import type { Event } from '../mobile/src/api';

const sample={coords:{latitude:57.7089,longitude:11.9746},timestamp:Date.now()};
function driver(status='granted'){
  const calls:string[]=[];
  const api:LocationDriver={permission:async()=>{calls.push('permission');return {status};},requestPermission:async()=>{calls.push('prompt');return {status:'granted'};},servicesEnabled:async()=>{calls.push('services');return true;},currentPosition:async()=>{calls.push('gps');return sample;}};
  return {calls,api};
}
test('launch/resume reads a previously allowed location without another permission prompt',async()=>{
  const {api,calls}=driver();
  assert.deepEqual(await readForegroundPosition(api),{point:{lat:57.7089,lon:11.9746},timestamp:sample.timestamp});
  assert.deepEqual(calls,['permission','services','gps']);
});
test('first launch waits for an explicit action before requesting permission',async()=>{
  const {api,calls}=driver('undetermined');
  assert.equal(await readForegroundPosition(api),null);
  assert.deepEqual(calls,['permission']);
  assert.ok(await readForegroundPosition(api,true));
  assert.deepEqual(calls,['permission','permission','prompt','services','gps']);
});
test('denial and disabled services do not read a position',async()=>{
  const denied=driver('denied');
  await assert.rejects(readForegroundPosition(denied.api),error=>error instanceof ForegroundLocationError&&error.status==='denied');
  assert.deepEqual(denied.calls,['permission']);
  const disabled=driver();disabled.api.servicesEnabled=async()=>false;
  await assert.rejects(readForegroundPosition(disabled.api),/platstjänster/);
  assert.equal(disabled.calls.includes('gps'),false);
});
test('a stalled or invalid GPS result fails instead of leaving Home loading forever',async()=>{
  const stalled=driver();stalled.api.currentPosition=()=>new Promise(()=>{});
  await assert.rejects(readForegroundPosition(stalled.api,false,5),/lång tid/);
  const invalid=driver();invalid.api.currentPosition=async()=>({...sample,coords:{latitude:NaN,longitude:18}});
  await assert.rejects(readForegroundPosition(invalid.api),/position/);
});
function event(id:string,lat:number,lon:number,ts=1):Event{return {id,type:'Rån',ts,location:{name:'Område',gps:[lat,lon]}} as Event;}
test('Home uses the GPS neighborhood, and chooses closest notices before newest distant ones',()=>{
  const point={lat:57.7089,lon:11.9746},region=neighborhoodRegion(point);
  assert.equal(region.latitude,point.lat);assert.equal(region.longitude,point.lon);
  assert.ok(region.latitudeDelta<.03);
  const nearest=event('near',57.709,11.975),far=event('far',57.8,12,99),middle=event('middle',57.715,11.98,4);
  assert.deepEqual(closestEvents([far,middle,nearest],point,2).map(e=>e.id),['near','middle']);
});
test('visible pins follow the actual viewport after panning and zooming',()=>{
  const region=neighborhoodRegion({lat:57.7089,lon:11.9746});
  const local=event('local',57.709,11.975),outside=event('outside',57.74,11.98),otherCity=event('other-city',59.33,18.06);
  assert.deepEqual(eventsInViewport([outside,local,otherCity],region).map(e=>e.id),['local']);
  assert.deepEqual(eventsInViewport([outside,local,otherCity],{...region,latitude:59.33,longitude:18.06}).map(e=>e.id),['other-city']);
});
test('Home excludes old, future and invalid notices before choosing nearby pins',()=>{
  const now=Date.now();
  const notices=[event('current',59,18,now-3600_000),event('old',59,18,now-8*86_400_000),event('future',59,18,now+3600_000),event('invalid',59,18,NaN)];
  assert.deepEqual(recentHomeEvents(notices,now).map(e=>e.id),['current']);
});
test('nearby list shows the newest reports in range instead of the closest, oldest report',()=>{
  const origin={lat:59.33,lon:18.06};
  const veryCloseOld=event('very-close-old',59.3301,18.0601,Date.now()-22*3600_000);
  const newer=event('newer',59.35,18.06,Date.now()-2*3600_000);
  const outsideRange=event('outside',59.8,18.06,Date.now());
  assert.deepEqual(latestNearbyEvents([veryCloseOld,newer,outsideRange],origin,35,2).map(e=>e.id),['newer','very-close-old']);
});
