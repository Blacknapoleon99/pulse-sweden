import { useEffect, useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import { geocode, type GeocodeResult, type Point } from './api';

export type PlaceKey = 'home' | 'school' | 'work' | 'leisure';
export const savedPlaceLabels: Record<PlaceKey,string> = { home:'Hem', school:'Skola', work:'Jobb', leisure:'Nöje' };
type Addresses = Partial<Record<PlaceKey,string>>;
type Coordinates = Partial<Record<PlaceKey,Point & {address:string}>>;
const addressKey='tryggpuls-saved-places',coordinateKey='tryggpuls-saved-place-coordinates';
let snapshot:{addresses:Addresses;coordinates:Coordinates;error:string}={addresses:{},coordinates:{},error:''};
let pending:Promise<void>|null=null,loaded=false,revision=0;
const listeners=new Set<()=>void>();
const emit=()=>listeners.forEach(listener=>listener());
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
const getSnapshot=()=>snapshot;
function object(raw:string|null){try{const value=JSON.parse(raw||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}}
async function load(){
  if(loaded)return;
  if(pending)return pending;
  const current=revision;
  pending=(async()=>{
    try{
      const [rawAddresses,rawPoints]=await Promise.all([SecureStore.getItemAsync(addressKey),SecureStore.getItemAsync(coordinateKey)]);
      if(current!==revision)return;
      const addresses:Addresses={},coordinates:Coordinates={},input=object(rawAddresses),points=object(rawPoints);
      for(const key of Object.keys(savedPlaceLabels) as PlaceKey[]){
        if(typeof input[key]!=='string'||!input[key].trim())continue;
        addresses[key]=input[key];
        const point=points[key];
        if(point?.address===input[key]&&Number.isFinite(point.lat)&&Number.isFinite(point.lon)&&Math.abs(point.lat)<=90&&Math.abs(point.lon)<=180)coordinates[key]=point;
      }
      snapshot={addresses,coordinates,error:''};loaded=true;emit();
      // Older app versions stored addresses only. Resolve those once, locally.
      const missing=(Object.keys(addresses) as PlaceKey[]).filter(key=>!coordinates[key]);
      await Promise.allSettled(missing.map(async key=>{
        const result=await geocode(addresses[key]!);
        if(current!==revision||!result.results[0])return;
        const {lat,lon}=result.results[0];
        snapshot={...snapshot,coordinates:{...snapshot.coordinates,[key]:{lat,lon,address:addresses[key]!}}};emit();
      }));
      if(current===revision&&missing.length)await SecureStore.setItemAsync(coordinateKey,JSON.stringify(snapshot.coordinates));
    }catch{snapshot={...snapshot,error:'Sparade platser kunde inte läsas.'};emit();}
    finally{pending=null;}
  })();
  return pending;
}
async function save(key:PlaceKey,result:GeocodeResult){
  revision++;
  const addresses={...snapshot.addresses,[key]:result.displayName};
  const coordinates={...snapshot.coordinates,[key]:{lat:result.lat,lon:result.lon,address:result.displayName}};
  await SecureStore.setItemAsync(coordinateKey,JSON.stringify(coordinates));
  await SecureStore.setItemAsync(addressKey,JSON.stringify(addresses));
  snapshot={addresses,coordinates,error:''};loaded=true;emit();
}
export function useSavedPlaces(){
  const value=useSyncExternalStore(subscribe,getSnapshot);
  useEffect(()=>{void load();},[]);
  return {...value,save};
}
