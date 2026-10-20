import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useIsFocused } from '@react-navigation/native';
import type { Region } from 'react-native-maps';
import { subscribeFamilySession, type Point, type RouteResponse } from './api';
import { appRequest } from './communityApi';
import { createFeedStore } from './feedStore';
import { ForegroundLocationError, readForegroundPosition } from './foregroundLocation';
import { neighborhoodRegion } from './homeMapState';
import { PRESS_NEWS_PATH, readPressNews } from './pressNewsClient';
const START:Region={latitude:59.3293,longitude:18.0686,latitudeDelta:.14,longitudeDelta:.14};
function useDataValue(){
  const [store]=useState(()=>createFeedStore((path,signal)=>path===PRESS_NEWS_PATH?readPressNews(signal):appRequest(path,'GET',undefined,signal)));
  const feeds=useSyncExternalStore(store.subscribe,store.getSnapshot);
  const [region,setRegion]=useState(START),[position,setPosition]=useState<Point|null>(null),[route,setRoute]=useState<RouteResponse|null>(null),[destination,setDestination]=useState('');
  const [routeFitId,setRouteFitId]=useState<string|null>(null),[positionCheckedAt,setPositionCheckedAt]=useState<number|null>(null);
  const [routeFrom,setRouteFrom]=useState('Stockholm central'),[routeTo,setRouteTo]=useState('Gamla stan, Stockholm');
  const [routeGps,setRouteGps]=useState(false),[routeMode,setRouteMode]=useState<'walking'|'driving'>('walking');
  const [locationStatus,setLocationStatus]=useState<'unknown'|'loading'|'granted'|'denied'|'error'>('unknown');
  const [locationError,setLocationError]=useState('');
  const locationRequest=useRef<Promise<Point|null>|null>(null),locationPrompt=useRef(false),locationGeneration=useRef(0),locatedOnce=useRef(false);
  const [showAreas,setShowAreas]=useState(true),[showEvents,setShowEvents]=useState(true),[showCommunity,setShowCommunity]=useState(true);
  const interests=useRef(new Map<string,string[]>()),foreground=useRef(AppState.currentState==='active'),writes=useRef(new Map<string,unknown>());
  const refresh=(force=false)=>store.refreshMany([...new Set(['config',...Array.from(interests.current.values()).flat()])],force);
  const locate=useCallback((prompt=true,recenter=true):Promise<Point|null>=>{
    if(locationRequest.current){
      const needsPrompt=prompt&&!locationPrompt.current;
      return locationRequest.current.then(point=>{
        if(!point&&needsPrompt)return locate(true,recenter);
        if(point&&recenter)setRegion(neighborhoodRegion(point));
        return point;
      });
    }
    const generation=locationGeneration.current;
    locationPrompt.current=prompt;setLocationStatus('loading');setLocationError('');
    const request=(async()=>{
      try{
        const sample=await readForegroundPosition({permission:Location.getForegroundPermissionsAsync,requestPermission:Location.requestForegroundPermissionsAsync,servicesEnabled:Location.hasServicesEnabledAsync,currentPosition:()=>Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced})},prompt);
        if(generation!==locationGeneration.current)return null;
        if(!sample){setLocationStatus('unknown');return null;}
        setPosition(sample.point);setPositionCheckedAt(sample.timestamp);setLocationStatus('granted');
        if(recenter||!locatedOnce.current)setRegion(neighborhoodRegion(sample.point));
        locatedOnce.current=true;
        return sample.point;
      }catch(error){
        if(generation===locationGeneration.current){
          const status=error instanceof ForegroundLocationError?error.status:'error';
          setLocationStatus(status);setLocationError(error instanceof Error?error.message:'Positionen kunde inte läsas.');
          // Never keep showing a previous position as the current location.
          setPosition(null);setPositionCheckedAt(null);
        }
        return null;
      }
    })().finally(()=>{if(locationRequest.current===request)locationRequest.current=null;});
    locationRequest.current=request;
    return request;
  },[]);
  useEffect(()=>{
    if(foreground.current)void locate(false,false);
    const timer=setInterval(()=>{if(foreground.current)void locate(false,false);},60_000);
    return()=>{locationGeneration.current++;locationRequest.current=null;clearInterval(timer);};
  },[locate]);
  useEffect(()=>{
    const publicKeys=['events','areas','zones','mapItems','weather','crisis','news','zoneNews','pressNews'];
    void AsyncStorage.multiGet(publicKeys.map(key=>`feed-${key}`)).then(values=>{for(const [key,value]of values)if(value){try{store.hydrate(key.replace('feed-',''),JSON.parse(value));}catch{}}});
    const unsubscribe=store.subscribe(()=>{for(const key of publicKeys){const entry=store.getSnapshot()[key];if(entry.data&&entry.updatedAt&&writes.current.get(key)!==entry.data){writes.current.set(key,entry.data);void AsyncStorage.setItem(`feed-${key}`,JSON.stringify(entry.data)).catch(()=>{});}}});
    const timer=setInterval(()=>{if(foreground.current){store.expireCommunity();void refresh();}},1000);
    const app=AppState.addEventListener('change',state=>{foreground.current=state==='active';if(foreground.current){void refresh(true);void locate(false,false);}else store.pause();});
    const session=subscribeFamilySession(()=>{store.reset('community');if(foreground.current)void refresh(true);});
    return()=>{clearInterval(timer);app.remove();session();unsubscribe();store.pause();};
  },[store,locate]);
  return {store,feeds,region,setRegion,position,setPosition,route,setRoute,destination,setDestination,routeFrom,setRouteFrom,routeTo,setRouteTo,routeGps,setRouteGps,routeMode,setRouteMode,routeFitId,setRouteFitId,positionCheckedAt,setPositionCheckedAt,locationStatus,setLocationStatus,locationError,locate,showAreas,setShowAreas,showEvents,setShowEvents,showCommunity,setShowCommunity,
    watch:(id:string,keys:string[],refreshOnFocus:string[]=[])=>{interests.current.set(id,keys);if(foreground.current){void store.refreshMany(refreshOnFocus,true);void refresh();}return()=>{interests.current.delete(id);};},refresh:()=>refresh(true)};
}
const Context=createContext<ReturnType<typeof useDataValue>|null>(null);
export function AppDataProvider({children}:PropsWithChildren){const value=useDataValue();return <Context.Provider value={value}>{children}</Context.Provider>;}
export function useAppData(){const data=useContext(Context);if(!data)throw new Error('AppDataProvider saknas');return data;}
export function useFeedInterest(keys:string[],refreshOnFocus:string[]=[]){const data=useAppData(),focused=useIsFocused(),id=useRef(Math.random().toString(36)).current;const signature=keys.join(','),focusSignature=refreshOnFocus.join(',');useEffect(()=>{if(focused)return data.watch(id,keys,refreshOnFocus);},[focused,signature,focusSignature]);}
