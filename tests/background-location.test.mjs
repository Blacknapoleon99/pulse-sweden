import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../mobile/package.json',import.meta.url)),ts=require('typescript');
const code=ts.transpileModule(readFileSync(new URL('../mobile/src/backgroundLocation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function runtime({expoGo=false,permission='granted'}={}){
  const store=new Map(),calls=[],tasks=new Map();let running=false,cleanup;
  const location={Accuracy:{Balanced:3},ActivityType:{OtherNavigation:1},getForegroundPermissionsAsync:async()=>({status:'granted'}),getBackgroundPermissionsAsync:async()=>({status:permission}),requestBackgroundPermissionsAsync:async()=>({status:permission}),hasStartedLocationUpdatesAsync:async()=>running,startLocationUpdatesAsync:async(_name,options)=>{running=true;calls.push({options});},stopLocationUpdatesAsync:async()=>{running=false;}};
  const api={registerFamilyCleanup:fn=>{cleanup=fn;},familyToken:async()=> 'login-token',familyRequest:async(path,method,body)=>{calls.push({path,method,body});return {sharingSessionId:'active-session'};}};
  const sample={timestamp:Date.now(),coords:{latitude:59.33,longitude:18.06,accuracy:15}};
  const modules={'expo-location':location,'expo-task-manager':{isTaskDefined:name=>tasks.has(name),defineTask:(name,fn)=>tasks.set(name,fn)},'expo-secure-store':{getItemAsync:async key=>store.get(key)||null,setItemAsync:async(key,value)=>store.set(key,value),deleteItemAsync:async key=>store.delete(key)},'expo-constants':{default:{executionEnvironment:expoGo?'store':'standalone'},ExecutionEnvironment:{StoreClient:'store'}},'./api':api,'./locationSample':{locationPayload:(point,id)=>point.timestamp<Date.now()-120_000?null:{lat:point.coords.latitude,lon:point.coords.longitude,accuracy:point.coords.accuracy,observedAt:point.timestamp,sharingSessionId:id}}};
  modules['expo-constants'].__esModule=true;
  const exports={};new Function('require','exports',code)(name=>modules[name],exports);
  return {exports,calls,tasks,sample,cleanup:()=>cleanup(),running:()=>running};
}
test('headless background sharing uses consent and stops after cleanup',async()=>{
  const r=runtime();await r.exports.beginSharing('user','family');await r.exports.setBackgroundSharing(true);
  assert.equal(r.running(),true);const task=r.tasks.get(r.exports.LOCATION_TASK);
  await task({data:{locations:[r.sample]},error:null});assert.equal(r.calls.filter(c=>c.path==='location').length,1);
  assert.equal(r.calls.find(c=>c.path==='location').body.observedAt,r.sample.timestamp);
  await r.cleanup();await task({data:{locations:[r.sample]},error:null});
  assert.equal(r.calls.filter(c=>c.path==='location').length,1);assert.equal(r.running(),false);
});
test('denied background permission preserves foreground sharing and Expo Go defines no background task',async()=>{
  const r=runtime({permission:'denied'});await r.exports.beginSharing('user','family');
  await assert.rejects(r.exports.setBackgroundSharing(true),/nekades/);assert.equal((await r.exports.readSharing()).background,false);
  await r.exports.sendLocation(r.sample,await r.exports.readSharing());assert.equal(r.calls.filter(c=>c.path==='location').length,1);
  const go=runtime({expoGo:true});assert.equal(go.tasks.size,0);await assert.rejects(go.exports.setBackgroundSharing(true),/Expo Go/);
});
test('background task drops stale locations rather than assigning a fresh time',async()=>{
  const r=runtime();await r.exports.beginSharing('user','family');await r.exports.setBackgroundSharing(true);
  await r.tasks.get(r.exports.LOCATION_TASK)({data:{locations:[{...r.sample,timestamp:Date.now()-180_000}]},error:null});
  assert.equal(r.calls.filter(c=>c.path==='location').length,0);
});
