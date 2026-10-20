import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { familyRequest, familyToken, subscribeFamilySession } from './api';
import { createFamilyStore } from './familyStore';
import { positionFresh } from './mobileState';
import * as Location from 'expo-location';
import {updateFamilyTrails} from './familyTrails';
import {backgroundBuildSupported,beginSharing,clearLocalSharing,readSharing,sendLocation,setBackgroundSharing} from './backgroundLocation';

const FamilyContext = createContext<ReturnType<typeof useSharedFamily> | null>(null);
function useSharedFamily() {
  const [store] = useState(() => createFamilyStore(familyRequest, familyToken));
  const data = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [clock, setClock] = useState(Date.now());
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [chatActive, setChatActive] = useState(false);
  const [liveSharing,setLiveSharing]=useState(false),[liveBusy,setLiveBusy]=useState(false),[liveError,setLiveError]=useState('');
  const [backgroundSharing,setBackground]=useState(false);
  const liveGeneration=useRef(0);
  const liveRequest=useRef<Promise<unknown>|null>(null);
  const chat = useRef(chatActive); chat.current = chatActive;
  useEffect(() => {
    let disposed = false, active = AppState.currentState === 'active', failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let generation = 0;
    const poll = async () => {
      const run = ++generation;
      if (timer) clearTimeout(timer);
      if (!active || disposed) return;
      const ok = await store.refresh(chat.current);
      if (run !== generation || disposed || !active) return;
      failures = ok ? 0 : Math.min(failures + 1, 3);
      timer = setTimeout(poll, Math.min(30_000, 5_000 * 2 ** failures));
    };
    const session = subscribeFamilySession(() => { liveGeneration.current++;setLiveSharing(false);setBackground(false);setLiveBusy(false);setLiveError('');store.reset(); failures = 0; void poll(); });
    const app = AppState.addEventListener('change', state => {
      active = state === 'active'; setForeground(active); setClock(Date.now());
      generation++; if (timer) clearTimeout(timer);
      if (active) { failures = 0; void poll(); }
    });
    const expiry = setInterval(() => { if(active)setClock(Date.now()); }, 10_000);
    void poll();
    return () => { disposed = true; generation++; session(); app.remove(); clearInterval(expiry); if (timer) clearTimeout(timer); store.reset(); };
  }, [store]);
  useEffect(() => { if (chatActive && foreground) void store.refresh(true).then(() => store.refresh(true)); }, [chatActive, foreground, store]);
  const familyId=data.overview?.family?.id,userId=data.overview?.user.id;
  const ownSharing=data.overview?.members.find(member=>member.id===userId)?.sharing;
  useEffect(()=>{
    let active=true;liveGeneration.current++;setLiveSharing(false);setBackground(false);setLiveBusy(false);
    void readSharing().then(async record=>{
      if(!active||!record)return;
      if(record.userId!==userId||record.familyId!==familyId){if(userId)await clearLocalSharing();return;}
      if(record.background){const permission=await Location.getBackgroundPermissionsAsync();if(!active)return;if(permission.status==='granted'&&await Location.hasStartedLocationUpdatesAsync('tryggpulse-family-location-v1')){setBackground(true);setLiveSharing(true);}else{await clearLocalSharing();try{await familyRequest('stop','POST');}catch{}}}
    });
    return()=>{active=false;};
  },[familyId,userId]);
  useEffect(()=>{if(!familyId||ownSharing===false){setLiveSharing(false);setBackground(false);if(ownSharing===false)void clearLocalSharing();}},[familyId,userId,ownSharing]);
  useEffect(()=>{
    if(!liveSharing||backgroundSharing||!foreground||!familyId)return;
    const generation=liveGeneration.current;
    let disposed=false,sending=false,subscription:Location.LocationSubscription|undefined;
    const share=async(position:Location.LocationObject)=>{
      if(disposed||sending||generation!==liveGeneration.current)return;
      sending=true;
      try{
        const record=await readSharing();if(!record)return;
        const request=sendLocation(position,record);
        liveRequest.current=request;
        try{await request;}finally{if(liveRequest.current===request)liveRequest.current=null;}
        if(!disposed){setLiveError('');await store.refresh(chat.current);}
      }catch(error){if(!disposed){setLiveError('Liveplatsen kunde inte uppdateras.');if([401,403,409].includes((error as {status:number}).status)){setLiveSharing(false);void clearLocalSharing();}}}
      finally{sending=false;}
    };
    void Location.watchPositionAsync({accuracy:Location.Accuracy.Balanced,timeInterval:45_000,distanceInterval:25},position=>{void share(position);}).then(value=>{if(disposed)value.remove();else subscription=value;}).catch(()=>{if(!disposed){setLiveError('Liveplatsen kunde inte startas. Kontrollera platsåtkomsten.');setLiveSharing(false);}});
    // Refresh stationary positions too, so an active live share does not expire.
    const timer=setInterval(()=>{
      if(disposed||sending||generation!==liveGeneration.current)return;
      void Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced}).then(share).catch(()=>{if(!disposed)setLiveError('Liveplatsen kunde inte uppdateras.');});
    },60_000);
    return()=>{disposed=true;clearInterval(timer);subscription?.remove();};
  },[liveSharing,backgroundSharing,foreground,familyId,userId,store]);
  async function startLiveSharing(oneShot=false){
    if(liveBusy||!familyId)return;
    const generation=++liveGeneration.current;
    setLiveBusy(true);setLiveError('');
    try{
      const permission=await Location.requestForegroundPermissionsAsync();
      if(permission.status!=='granted')throw new Error('Tillåt platsåtkomst för att dela liveplats.');
      const position=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
      if(generation!==liveGeneration.current)return;
      const previous=await readSharing();
      const record=liveSharing&&previous?previous:await beginSharing(userId!,familyId);
      if(generation!==liveGeneration.current){await clearLocalSharing();return;}
      await sendLocation(position,record);
      await store.refresh(chat.current);
      if(generation===liveGeneration.current&&!oneShot)setLiveSharing(true);
    }catch(error){if(generation===liveGeneration.current)setLiveError(error instanceof Error?error.message:'Liveplatsen kunde inte startas.');}
    finally{if(generation===liveGeneration.current)setLiveBusy(false);}
  }
  async function stopLiveSharing(){
    const generation=++liveGeneration.current;setLiveSharing(false);setLiveBusy(true);setLiveError('');
    setBackground(false);
    try{
      await clearLocalSharing();
      await liveRequest.current?.catch(()=>{});
      if(generation!==liveGeneration.current)return;
      await familyRequest('stop','POST');await store.refresh(chat.current);
    }
    catch{if(generation===liveGeneration.current)setLiveError('Delningen kunde inte stoppas på servern. Försök igen.');}
    finally{if(generation===liveGeneration.current)setLiveBusy(false);}
  }
  async function toggleBackgroundSharing(enabled:boolean){
    if(liveBusy)return;const generation=liveGeneration.current;setLiveBusy(true);setLiveError('');
    try{await setBackgroundSharing(enabled);if(generation===liveGeneration.current)setBackground(enabled);}
    catch(error){if(generation===liveGeneration.current)setLiveError(error instanceof Error?error.message:'Bakgrundsdelningen kunde inte ändras.');}
    finally{if(generation===liveGeneration.current)setLiveBusy(false);}
  }
  const overview = data.overview && { ...data.overview, members: data.overview.members.map(member => positionFresh(member, clock) ? member : { ...member, lat: undefined, lon: undefined }) };
  const trails=updateFamilyTrails(data.trails,overview?.members||[],clock);
  return { ...data, overview, trails, clock, foreground, liveSharing,liveBusy,liveError,backgroundSharing,backgroundBuildSupported,toggleBackgroundSharing,startLiveSharing,stopLiveSharing,setChatActive, refresh: () => store.refresh(chat.current), acknowledge: store.acknowledge };
}
export function FamilyProvider({ children }: { children: ReactNode }) { const value = useSharedFamily(); return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>; }
export function useFamily() { const value = useContext(FamilyContext); if (!value) throw new Error('FamilyProvider missing'); return value; }
