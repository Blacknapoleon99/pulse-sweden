import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import Constants,{ExecutionEnvironment} from 'expo-constants';
import {familyRequest,familyToken,registerFamilyCleanup} from './api';
import {locationPayload} from './locationSample';
export const LOCATION_TASK='tryggpulse-family-location-v1';
const SHARING_KEY='tryggpulse-location-sharing-v1';
export type SharingRecord={userId:string;familyId:string;sharingSessionId:string;background:boolean};
export const backgroundBuildSupported=Constants.executionEnvironment!==ExecutionEnvironment.StoreClient;
let operation=0;
export async function readSharing():Promise<SharingRecord|null>{
  try{const raw=await SecureStore.getItemAsync(SHARING_KEY),value=raw?JSON.parse(raw):null;return value&&typeof value.sharingSessionId==='string'&&typeof value.userId==='string'&&typeof value.familyId==='string'?value:null;}catch{return null;}
}
async function saveSharing(record:SharingRecord){await SecureStore.setItemAsync(SHARING_KEY,JSON.stringify(record));}
export async function clearLocalSharing(){
  operation++;await SecureStore.deleteItemAsync(SHARING_KEY);
  try{if(backgroundBuildSupported&&await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))await Location.stopLocationUpdatesAsync(LOCATION_TASK);}catch{ /* The cleared consent prevents any further uploads even if native cleanup fails. */ }
}
registerFamilyCleanup(clearLocalSharing);
export async function beginSharing(userId:string,familyId:string){
  const generation=++operation;
  const value=await familyRequest<{sharingSessionId:string}>('sharing/start','POST');
  if(generation!==operation)throw new Error('Delningen avbröts.');
  const record={userId,familyId,sharingSessionId:value.sharingSessionId,background:false};
  await saveSharing(record);
  if(generation!==operation){await SecureStore.deleteItemAsync(SHARING_KEY);throw new Error('Delningen avbröts.');}
  return record;
}
export async function sendLocation(sample:Location.LocationObject,record:SharingRecord){
  const payload=locationPayload(sample,record.sharingSessionId);if(!payload)throw new Error('En färsk och giltig GPS-position saknas. Försök igen.');
  const active=await readSharing();if(active?.sharingSessionId!==record.sharingSessionId||!await familyToken())return;
  await familyRequest('location','POST',payload);
}
export async function setBackgroundSharing(enabled:boolean){
  const generation=operation;
  if(!backgroundBuildSupported)throw new Error('Bakgrundsdelning kräver den installerade appen. Expo Go delar bara när appen är öppen.');
  const record=await readSharing();if(!record)throw new Error('Starta liveplats innan du aktiverar bakgrundsdelning.');
  if(!enabled){await saveSharing({...record,background:false});if(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))await Location.stopLocationUpdatesAsync(LOCATION_TASK);return;}
  if((await Location.getForegroundPermissionsAsync()).status!=='granted')throw new Error('Tillåt vanlig platsåtkomst först.');
  if((await Location.requestBackgroundPermissionsAsync()).status!=='granted')throw new Error('Bakgrundsbehörighet nekades. Liveplats fungerar fortfarande när appen är öppen.');
  if(generation!==operation||(await readSharing())?.sharingSessionId!==record.sharingSessionId)throw new Error('Delningen avbröts.');
  await saveSharing({...record,background:true});
  try{
    await Location.startLocationUpdatesAsync(LOCATION_TASK,{accuracy:Location.Accuracy.Balanced,timeInterval:45_000,distanceInterval:25,deferredUpdatesInterval:45_000,deferredUpdatesDistance:25,pausesUpdatesAutomatically:true,activityType:Location.ActivityType.OtherNavigation,showsBackgroundLocationIndicator:true,foregroundService:{notificationTitle:'TryggPulse delar din plats',notificationBody:'Din familj kan se din plats. Stoppa delningen i appen.',killServiceOnDestroy:true}});
    if(generation!==operation){const active=await readSharing();if(!active)await clearLocalSharing();}
  }catch(error){if(generation===operation)await saveSharing({...record,background:false});throw error;}
}
if(backgroundBuildSupported&&!TaskManager.isTaskDefined(LOCATION_TASK))TaskManager.defineTask<{locations:Location.LocationObject[]}>(LOCATION_TASK,async({data,error})=>{
  if(error)return;
  const record=await readSharing();
  if(!record?.background||!await familyToken()){await clearLocalSharing();return;}
  if((await Location.getBackgroundPermissionsAsync()).status!=='granted'){await clearLocalSharing();try{await familyRequest('stop','POST');}catch{}return;}
  const sample=data?.locations?.slice().sort((a,b)=>b.timestamp-a.timestamp)[0];if(!sample)return;
  try{await sendLocation(sample,record);}catch(error){const status=(error as {status?:number}).status;if(status===401||status===403||status===409)await clearLocalSharing();}
  // Network failures leave a gap. Never retry an old point as a fresh position.
});
