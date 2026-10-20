import test from 'node:test';
import assert from 'node:assert/strict';
import {CommonActions,StackRouter,TabRouter} from '../mobile/node_modules/@react-navigation/routers/lib/module/index.js';
import {prototypeTabAction,prototypeSelectTabAction,prototypeTabs,type PrototypeTabName} from '../mobile/src/prototypeNavigation.ts';

test('opening a main tab from a detail reuses its retained state and clears the detail back history',()=>{
  const tabs=TabRouter({initialRouteName:'home'});
  const tabOptions={routeNames:prototypeTabs.map(([name])=>name),routeParamList:{},routeGetIdList:{}};
  const retainedTabs=tabs.getInitialState(tabOptions);
  const stack=StackRouter({initialRouteName:'main'});
  const options={routeNames:['main','report','account'],routeParamList:{},routeGetIdList:{main:()=> 'prototype-main'}};
  const initial=stack.getInitialState(options);
  initial.routes[0]={...initial.routes[0],state:retainedTabs};
  const withReport=stack.getStateForAction(initial,CommonActions.navigate('report',{id:'synthetic-report'}),options)!;
  const withAccount=stack.getStateForAction(withReport,CommonActions.navigate('account'),options)!;
  const returned=stack.getStateForAction(withAccount,prototypeTabAction('map'),options)!;
  assert.equal(returned.routes.length,1);
  assert.equal(returned.index,0);
  assert.equal(returned.routes[0].key,initial.routes[0].key);
  assert.equal(returned.routes[0].state,retainedTabs);
  assert.deepEqual(returned.routes[0].params,{screen:'map',merge:true});
  assert.equal(stack.getStateForAction(returned,CommonActions.goBack(),options),null);
});

test('switching the five reference tabs retains route keys and municipality selection for a return',()=>{
  const router=TabRouter({initialRouteName:'home'});
  const options={routeNames:prototypeTabs.map(([name])=>name),routeParamList:{},routeGetIdList:{}};
  const initial=router.getInitialState(options),keys=initial.routes.map(route=>route.key);
  let state=router.getStateForAction(initial,CommonActions.navigate('stats',{municipality:'Stockholm'}),options)!;
  for(const name of ['map','places','info','home','stats'] as PrototypeTabName[])state=router.getStateForAction(state,prototypeSelectTabAction(name),options)!;
  assert.deepEqual(state.routes.map(route=>route.key),keys);
  assert.deepEqual(state.routes.find(route=>route.name==='stats')?.params,{municipality:'Stockholm'});
  assert.equal(state.routes[state.index].name,'stats');
  assert.deepEqual(prototypeTabAction('stats',{municipality:'Malmö'}).payload.params,{screen:'stats',merge:true,params:{municipality:'Malmö'}});
});

test('events and route details remain reachable from the map tab and back returns to its retained state',()=>{
  const tabs=TabRouter({initialRouteName:'map'});
  const tabOptions={routeNames:prototypeTabs.map(([name])=>name),routeParamList:{},routeGetIdList:{}};
  const tabState=tabs.getInitialState(tabOptions),stack=StackRouter({initialRouteName:'main'});
  const options={routeNames:['main','events','route'],routeParamList:{},routeGetIdList:{main:()=> 'prototype-main'}};
  const initial=stack.getInitialState(options);initial.routes[0]={...initial.routes[0],state:tabState};
  const detail=stack.getStateForAction(initial,CommonActions.navigate('events',{category:'robbery'}),options)!;
  assert.deepEqual(detail.routes.at(-1)?.params,{category:'robbery'});
  const back=stack.getStateForAction(detail,CommonActions.goBack(),options)!;
  assert.equal(back.routes[0].state,tabState);
  assert.equal(back.routes[0].state?.routes[tabState.index].name,'map');
});
