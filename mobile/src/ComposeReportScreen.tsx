import { Text, TextInput } from './Typography';
import { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAccount } from './useAccount';
import { useAppData, useFeedInterest } from './AppData';
import { geocode, type GeocodeResult } from './api';
import { appRequest, categoryNames, categoryStyle, COMMUNITY_LABEL, uploadReportPhoto, type AccountConfig, type CommunityReport } from './communityApi';
import { publicPoint } from './publicPoint';
import { Button, StateCard } from './UI';
import { colors, ui } from './theme';
import type { RootStackParams } from './navigation';
type Draft={category:CommunityReport['category'];title:string;body:string;observedAt:string;location:{lat:number;lon:number}|null;photoUri?:string;requestId:string;submittedId?:string};
const emptyDraft=():Draft=>({category:'theft',title:'',body:'',observedAt:new Date().toISOString(),location:null,requestId:Crypto.randomUUID()});
export function ComposeReportScreen({navigation,route}:NativeStackScreenProps<RootStackParams,'compose'>){
  const {account,loading,error:accountError}=useAccount(),data=useAppData();useFeedInterest(['config']);const config=data.feeds.config.data as AccountConfig|null;
  const [draft,setDraft]=useState<Draft>(emptyDraft),[query,setQuery]=useState(''),[results,setResults]=useState<GeocodeResult[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState(false),[hydrated,setHydrated]=useState(false);
  const [timeMode,setTimeMode]=useState<'date'|'time'|null>(null);
  const observed=new Date(draft.observedAt),validTime=Number.isFinite(observed.getTime())&&observed.getTime()>Date.now()-86_400_000&&observed.getTime()<=Date.now()+60_000;
  const publishing=useRef(false),mounted=useRef(true),sequence=useRef(0),map=useRef<MapView>(null),draftKey=account?`report-draft-${account.user.id}`:null;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;sequence.current++;};},[]);
  useEffect(()=>{let alive=true;sequence.current++;setHydrated(false);publishing.current=false;setTimeMode(null);setBusy(false);setResults([]);setDraft(emptyDraft());setPreview(false);if(draftKey)void SecureStore.getItemAsync(draftKey).then(value=>{if(alive){try{if(value)setDraft(JSON.parse(value));}catch{}setHydrated(true);}}).catch(()=>{if(alive)setHydrated(true);});return()=>{alive=false;};},[draftKey]);
  useEffect(()=>{if(!draftKey||!hydrated)return;const timer=setTimeout(()=>void SecureStore.setItemAsync(draftKey,JSON.stringify(draft)).catch(()=>setError('Utkastet kunde inte sparas på telefonen.')),350);return()=>clearTimeout(timer);},[draft,draftKey,hydrated]);
  useEffect(()=>{const p=route.params;if(p&&hydrated&&!draft.submittedId){const point=publicPoint(p.lat,p.lon);setDraft(current=>({...current,location:point,requestId:Crypto.randomUUID()}));navigation.setParams(undefined as never);}},[route.params,hydrated]);
  function change(values:Partial<Draft>){if(publishing.current)return;setPreview(false);setDraft(current=>({...current,...values,requestId:Crypto.randomUUID()}));}
  function choose(lat:number,lon:number){const point=publicPoint(lat,lon);change({location:point});map.current?.animateToRegion({latitude:point.lat,longitude:point.lon,latitudeDelta:.006,longitudeDelta:.006},250);}
  async function action(fn:(current:()=>boolean)=>Promise<void>){setBusy(true);setError('');const version=sequence.current,current=()=>version===sequence.current&&mounted.current;try{await fn(current);}catch(err){if(current())setError(err instanceof Error?err.message:'Något gick fel');}finally{if(current())setBusy(false);}}
  async function pickPhoto(){await action(async current=>{const picked=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:.85,exif:false});if(picked.canceled||!current())return;const asset=picked.assets[0];if(asset.fileSize&&asset.fileSize>5*1024*1024)throw new Error('Välj en bild på högst 5 MB.');const result=await ImageManipulator.manipulateAsync(asset.uri,[{resize:{width:Math.min(1600,asset.width)}}],{compress:.82,format:ImageManipulator.SaveFormat.JPEG});if(current())change({photoUri:result.uri});});}
  async function finish(){if(!draftKey)return;await SecureStore.deleteItemAsync(draftKey);data.store.reset('community');void data.store.refresh('community',true);setDraft(emptyDraft());navigation.replace('report',{id:draft.submittedId!});}
  async function publish(){if(publishing.current)return;const publishSequence=sequence.current;publishing.current=true;try{await action(async()=>{
    const owner=account?.user.id,version=sequence.current;if(!owner||!draft.location)throw new Error('Välj en plats och logga in först.');
    let id=draft.submittedId;
    if(!id){const result=await appRequest<{report:CommunityReport}>('/api/community-reports','POST',{requestId:draft.requestId,category:draft.category,title:draft.title,body:draft.body,observedAt:draft.observedAt,lat:draft.location.lat,lon:draft.location.lon});id=result.report.id;if(version!==sequence.current)return;setDraft(current=>({...current,submittedId:id}));if(draftKey)await SecureStore.setItemAsync(draftKey,JSON.stringify({...draft,submittedId:id}));}
    if(draft.photoUri)await uploadReportPhoto(id,draft.photoUri);
    if(version!==sequence.current)return;
    if(draftKey)await SecureStore.deleteItemAsync(draftKey);setDraft(emptyDraft());data.store.reset('community');void data.store.refresh('community',true);navigation.replace('report',{id});
  });}finally{if(publishSequence===sequence.current)publishing.current=false;}}
  if(loading)return <View style={ui.content}><StateCard title="Kontrollerar ditt konto…"/></View>;
  if(!account?.community.canContribute)return <View style={[ui.page,ui.content]}><StateCard title="Förbered ditt konto" body={accountError||'Logga in, bekräfta din e-post eller BankID och godkänn att du är minst 16 år samt användarreglerna.'}/><Button title="Öppna mitt konto" onPress={()=>navigation.navigate('account')}/></View>;
  return <KeyboardAvoidingView style={ui.page} behavior={Platform.OS==='ios'?'padding':'height'}><ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
    <Text style={ui.title}>{draft.submittedId?'Rapporten är publicerad':'Rapportera en observation'}</Text><Text style={ui.badge}>{COMMUNITY_LABEL}</Text><Text style={ui.meta}>Ring 112 vid akut fara. Beskriv vad du själv har observerat och undvik personuppgifter.</Text>
    {!config?.publishingEnabled&&<StateCard title="Publicering är inte aktiverad i denna miljö"/>}{!!error&&<Text accessibilityRole="alert" style={ui.error}>{draft.submittedId?'Texten är sparad. ':''}{error}</Text>}
    {!draft.submittedId&&<>
      <View style={ui.row}>{(Object.entries(categoryNames) as [Draft['category'],string][]).map(([key,label])=><Pressable key={key} disabled={busy} accessibilityRole="button" accessibilityState={{selected:draft.category===key}} onPress={()=>change({category:key})} style={[ui.button,ui.secondary,{flexDirection:'row',gap:8,borderWidth:2,borderColor:'transparent'},draft.category===key&&{borderColor:colors.ink}]}><View style={{width:18,height:18,borderRadius:9,backgroundColor:categoryStyle[key].color,borderWidth:2,borderColor:colors.ink}}/><Text style={[ui.buttonText,ui.secondaryText]}>{label}</Text></Pressable>)}</View>
      <TextInput editable={!busy} style={ui.field} accessibilityLabel="Rapportens rubrik" value={draft.title} onChangeText={title=>change({title})} placeholder="Kort rubrik" maxLength={120}/>
      <TextInput editable={!busy} style={[ui.field,{minHeight:110,textAlignVertical:'top'}]} multiline accessibilityLabel="Din observation" value={draft.body} onChangeText={body=>change({body})} placeholder="Vad observerade du?" maxLength={600}/>
      <Text style={ui.heading}>Observationens tid</Text><Text style={ui.meta}>Välj när du såg händelsen. Rapporten visas i 24 timmar från den tiden.</Text>
      <View style={ui.row}><Button title={Number.isFinite(observed.getTime())?observed.toLocaleDateString('sv-SE'):'Välj datum'} secondary disabled={busy} onPress={()=>setTimeMode('date')}/><Button title={Number.isFinite(observed.getTime())?observed.toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'}):'Välj tid'} secondary disabled={busy} onPress={()=>setTimeMode('time')}/></View>
      {timeMode&&<View style={ui.card}><DateTimePicker value={Number.isFinite(observed.getTime())?observed:new Date()} mode={timeMode} display={Platform.OS==='ios'?'spinner':'default'} locale="sv-SE" is24Hour minimumDate={new Date(Date.now()-86_400_000)} maximumDate={new Date()} onValueChange={(_event,value)=>{if(Platform.OS==='android')setTimeMode(null);value.setSeconds(0,0);change({observedAt:value.toISOString()});}} onDismiss={()=>setTimeMode(null)}/>{Platform.OS==='ios'&&<Button title="Klart" secondary disabled={busy} onPress={()=>setTimeMode(null)}/>}</View>}
      {!validTime&&<Text style={ui.error}>Välj en observation från det senaste dygnet, fram till tiden nu.</Text>}<Button title="Använd tiden nu" secondary onPress={()=>change({observedAt:new Date().toISOString()})}/>
      <Text style={ui.heading}>Ungefärlig offentlig plats</Text><TextInput editable={!busy} style={ui.field} accessibilityLabel="Sök plats" value={query} onChangeText={setQuery} placeholder="Adress eller ort"/><Button title="Sök plats" busy={busy} secondary onPress={()=>void action(async current=>{const result=await geocode(query);if(current())setResults(result.results);})}/>
      {results.map((result,index)=><Button key={`${result.lat}-${index}`} title={result.displayName} secondary onPress={()=>{choose(result.lat,result.lon);setResults([]);}}/>)}
      <Button title="Använd min plats" secondary busy={busy} onPress={()=>void action(async current=>{const permission=await Location.requestForegroundPermissionsAsync();if(permission.status!=='granted')throw new Error('Platsåtkomst nekades. Du kan välja plats på kartan.');if(!current())return;const point=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});if(current())choose(point.coords.latitude,point.coords.longitude);})}/>
      <MapView ref={map} style={{height:260,borderRadius:18}} initialRegion={draft.location?{latitude:draft.location.lat,longitude:draft.location.lon,latitudeDelta:.01,longitudeDelta:.01}:data.region} onPress={event=>{if(!busy)choose(event.nativeEvent.coordinate.latitude,event.nativeEvent.coordinate.longitude);}}>
        {draft.location&&<><Marker coordinate={{latitude:draft.location.lat,longitude:draft.location.lon}} title={COMMUNITY_LABEL} description="Ungefärlig plats, 100-metersrutnät" pinColor={categoryStyle[draft.category].color}/><Circle center={{latitude:draft.location.lat,longitude:draft.location.lon}} radius={75} strokeWidth={3} strokeColor={categoryStyle[draft.category].color} fillColor={categoryStyle[draft.category].color+'33'}/></>}
      </MapView><Text style={ui.meta}>Tryck på kartan för att välja plats. Den offentliga platsen avrundas till ett rutnät på ungefär 100 meter.</Text>
      {config?.photosEnabled&&<Button title={draft.photoUri?'Byt bild':'Lägg till en bild'} secondary busy={busy} onPress={()=>void pickPhoto()}/>}{draft.photoUri&&<><Image source={{uri:draft.photoUri}} style={{height:180,borderRadius:14}} resizeMode="contain"/><Text style={ui.meta}>Bilden visas först efter personalens granskning. Identifierbara personer och personuppgifter får inte publiceras.</Text><Button title="Ta bort bilden" secondary onPress={()=>change({photoUri:undefined})}/></>}
      <Button title="Förhandsgranska" disabled={busy||!draft.location||draft.title.trim().length<3||draft.body.trim().length<3||!validTime} onPress={()=>setPreview(true)}/>
    </>}
    {preview&&<View style={ui.card}><Text style={ui.badge}>{COMMUNITY_LABEL}</Text><Text style={ui.heading}>{draft.title}</Text><Text style={ui.body}>{draft.body}</Text><Text style={ui.meta}>{account.community.alias} · ungefärlig plats · {new Date(draft.observedAt).toLocaleString('sv-SE')}</Text><Button title="Publicera rapport" busy={busy} disabled={!config?.publishingEnabled} onPress={()=>void publish()}/></View>}
    {draft.submittedId&&<><Text style={ui.body}>Din text och kartmarkör är publicerade. Du kan försöka skicka bilden igen.</Text><Button title="Försök skicka bilden igen" busy={busy} onPress={()=>void publish()}/><Button title="Visa rapporten utan bilden" secondary disabled={busy} onPress={()=>void finish()}/></>}
  </ScrollView></KeyboardAvoidingView>;
}
