import {useEffect,useState} from 'react';
import {AppState} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import type {Region} from 'react-native-maps';
import {subscribeFamilySession} from './api';
import {appRequest,type CommunityPage,type CommunityReport} from './communityApi';
export function useMapCommunity(region:Region,enabled:boolean){
  const focused=useIsFocused(),[items,setItems]=useState<CommunityReport[]>([]),[error,setError]=useState(''),[limited,setLimited]=useState(false);
  const bbox=[Math.max(-180,region.longitude-region.longitudeDelta/2),Math.max(-90,region.latitude-region.latitudeDelta/2),Math.min(180,region.longitude+region.longitudeDelta/2),Math.min(90,region.latitude+region.latitudeDelta/2)].map(value=>value.toFixed(4)).join(',');
  useEffect(()=>{let alive=true,active=AppState.currentState==='active',inFlight=false,revision=0,failures=0,timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined;
    const load=async()=>{if(!alive||!focused||!enabled||!active||inFlight)return;inFlight=true;const current=revision;controller=new AbortController();try{let cursor:string|null=null,rows:CommunityReport[]=[];for(let page=0;page<20;page++){const result:CommunityPage=await appRequest(`/api/community-reports?limit=100&bbox=${encodeURIComponent(bbox)}${cursor?'&cursor='+encodeURIComponent(cursor):''}`,'GET',undefined,controller.signal);rows.push(...result.items);cursor=result.nextCursor;if(!cursor)break;}if(alive&&current===revision){setItems(rows);setLimited(!!cursor);setError('');failures=0;}}catch(err){if(alive&&current===revision&&!controller.signal.aborted){failures++;setError(err instanceof Error?err.message:'Rapportflödet är inte tillgängligt');}}finally{inFlight=false;if(alive&&active)timer=setTimeout(load,Math.min(300_000,10_000*2**failures));}};
    timer=setTimeout(load,250);const state=AppState.addEventListener('change',next=>{active=next==='active';if(timer)clearTimeout(timer);if(active)void load();else{revision++;controller?.abort();}}),session=subscribeFamilySession(()=>{revision++;controller?.abort();setItems([]);failures=0;if(timer)clearTimeout(timer);timer=setTimeout(load,250);});return()=>{alive=false;revision++;controller?.abort();if(timer)clearTimeout(timer);state.remove();session();};
  },[bbox,focused,enabled]);
  return {items,error,limited};
}
