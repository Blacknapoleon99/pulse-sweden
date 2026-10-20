// Development-only visual fixtures. Never imported by the mobile app.
import type {RouteResponse} from '../../mobile/src/api';
export const sampleRoute:RouteResponse={ok:true,routeId:'preview-route',distanceKm:'2.1',durationMinutes:24,geometry:{coordinates:[[18.057,59.334],[18.061,59.3335],[18.064,59.3328],[18.067,59.3312],[18.069,59.3301],[18.072,59.3292],[18.074,59.3275],[18.077,59.325],[18.079,59.32]]},incidentsNearRoute:[],incidentsCount:0,policeAreaPassages:[],securityZonePassages:[],networkAreaPassages:[]};
const now=Date.now(),day=86400000;
export const region={latitude:59.3304,longitude:18.068,latitudeDelta:.032,longitudeDelta:.048};
const names=['Rån','Misshandel','Trafikolycka','Stöld','Övrigt'];
export const events=names.flatMap((type,category)=>Array.from({length:[124,89,67,42,31][category]},(_,i)=>({id:`${category}-${i}`,type,name:['Storgatan','Tunnelbanan','E4'][i%3],summary:'Visual preview fixture',ts:now-(i*7+category)*day/18,url:'https://polisen.se',location:{name:['Storgatan','Tunnelbanan','E4'][i%3],gps:[59.33+Math.sin(i*2.4+category)*.012,18.068+Math.cos(i*1.3+category)*.018]}})));
export const overview={user:{id:'1',display_name:'Pappa',police_area_alerts:false},family:{id:'preview',name:'Familj',owner_id:'1'},members:['Pappa','Mamma','Lisa','Olle'].map((display_name,i)=>({id:String(i+1),display_name,sharing:true,lat:59.332-i*.002,lon:18.066+i*.002,updated_at:new Date(now).toISOString(),position_updated_at:new Date(now).toISOString()})),zones:[{id:'home',name:'Hem',kind:'safe',lat:59.334,lon:18.057,radius:300},{id:'school',name:'Skola',kind:'safe',lat:59.337,lon:18.084,radius:200},{id:'work',name:'Jobb',kind:'safe',lat:59.32,lon:18.079,radius:250}],alerts:[]};
const noop=()=>{};
export const family={overview,clock:now,messages:[],trails:{},setChatActive:noop,refresh:async()=>{},liveSharing:false,liveBusy:false,startLiveSharing:async()=>{},stopLiveSharing:async()=>{},toggleBackgroundSharing:async()=>{},backgroundSharing:false,backgroundBuildSupported:false,revision:0};
export const news={items:[{id:'1',title:'Ökad polisnärvaro i innerstaden efter flera rån',publishedAt:new Date(now-day/24).toISOString(),url:'https://polisen.se'}]};
export const saved={home:'Hem, Stockholm',school:'Skola, Stockholm',work:'Jobb, Stockholm'};
export const station={name:'Centralstationen',city:'Stockholm',lat:59.3304,lon:18.0587};
export const apiData={regions:[{region:'Stockholm',total:12345,totalPer100k:12500},{region:'Göteborg',total:11000,totalPer100k:11200}],nationalAverage:{totalPer100k:10100},referenceYear:2025,sourceUrl:'https://bra.se'};
