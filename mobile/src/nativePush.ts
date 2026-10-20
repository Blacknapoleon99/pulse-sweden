import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { appRequest, type AccountOverview } from './communityApi';
import {subscribeFamilySession} from './api';
let revision=0;subscribeFamilySession(()=>{revision++;});
export const PUSH_SETTINGS='tryggpuls-push-preferences';
export async function readNotificationPreferences(userId:string){try{const value=JSON.parse(await AsyncStorage.getItem(PUSH_SETTINGS)||'null');return value?.userId===userId?value:null;}catch{return null;}}
export async function enableNotifications(preferences:{alarms:boolean;replies:boolean}){
  const sequence=revision;
  const account=await appRequest<AccountOverview>('/api/account/me');
  if(!Device.isDevice)throw new Error('Aviseringar behöver testas på en riktig telefon.');
  const projectId=Constants.expoConfig?.extra?.eas?.projectId||Constants.easConfig?.projectId;
  if(!projectId)throw new Error('Mobilaviseringar behöver en konfigurerad produktionsbyggnad.');
  if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('default',{name:'Cajklops',importance:Notifications.AndroidImportance.DEFAULT});
  let permission=await Notifications.getPermissionsAsync();if(permission.status!=='granted')permission=await Notifications.requestPermissionsAsync();
  if(permission.status!=='granted')throw new Error('Aviseringar är avstängda i telefonens inställningar.');
  const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
  if(sequence!==revision)throw new Error('Kontot ändrades. Spara inställningarna igen från rätt konto.');
  await appRequest('/api/account/notifications','POST',{token,...preferences});
  await AsyncStorage.setItem(PUSH_SETTINGS,JSON.stringify({...preferences,token,userId:account.user.id}));return token;
}
export async function disableNotifications(){const raw=await AsyncStorage.getItem(PUSH_SETTINGS);if(raw){const preferences=JSON.parse(raw);await appRequest('/api/account/notifications','DELETE',{token:preferences.token});}await AsyncStorage.removeItem(PUSH_SETTINGS);}
