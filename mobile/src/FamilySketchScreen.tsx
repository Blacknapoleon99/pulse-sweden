import { Text, TextInput } from './Typography';
import { useEffect, useRef, useState } from "react";
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker } from "react-native-maps";
import { API_BASE, familyRequest, geocode, type Event, type FamilyMessage, type FamilyOverview } from "./api";
import { FamilyScreen } from "./FamilyScreen";
import { useFamily } from "./FamilyState";
import { START_REGION } from "./MapPreview";

const ink="#11152A",blue="#2187F5",muted="#72788D";
export function FamilySketchScreen({ nearby, openSource }: { nearby: Event[]; openSource: (url?: string) => void }) {
  const { overview, messages, refresh, setChatActive, error: refreshError, revision } = useFamily();
  const map = useRef<MapView>(null);
  const [selected,setSelected] = useState<string | null>(null);
  function focus(lat?: number, lon?: number) {
    if (lat == null || lon == null) { setError("Ingen aktuell delad position för denna medlem."); return; }
    map.current?.animateToRegion({latitude:lat,longitude:lon,latitudeDelta:0.025,longitudeDelta:0.025},300);
  }
  const [detail,setDetail]=useState(false), [add,setAdd]=useState<"none"|"person"|"place">("none");
  const [placeName,setPlaceName]=useState(""),[placeAddress,setPlaceAddress]=useState(""),[draft,setDraft]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(() => { setChatActive(true); return () => setChatActive(false); }, [setChatActive]);
  useEffect(() => { setSelected(null); setDraft(""); setAdd("none"); setError(""); setPlaceName(""); setPlaceAddress(""); }, [revision]);
  async function invite() {
    setBusy(true);setError("");
    try {const result=await familyRequest<{token:string}>("invite","POST",{}); await Share.share({message:`Gå med i min Cajklops-familj: ${API_BASE}/#familj-invite=${result.token}`}); setAdd("none");}
    catch(caught){setError(caught instanceof Error?caught.message:"Inbjudan kunde inte skapas.");}
    finally{setBusy(false);}
  }
  async function savePlace() {
    setBusy(true);setError("");
    try {
      const point=(await geocode(placeAddress)).results[0];
      if(!point)throw new Error("Adressen kunde inte hittas.");
      await familyRequest("zones","POST",{name:placeName.trim(),kind:"safe",lat:point.lat,lon:point.lon,radius:300});
      setPlaceName("");setPlaceAddress("");setAdd("none");await refresh();
    }catch(caught){setError(caught instanceof Error?caught.message:"Platsen kunde inte sparas.");}
    finally{setBusy(false);}
  }
  async function sendMessage() {
    if(!draft.trim())return;
    setBusy(true);setError("");
    try{await familyRequest("messages","POST",{body:draft.trim()});setDraft("");await refresh();}
    catch(caught){setError(caught instanceof Error?caught.message:"Meddelandet kunde inte skickas.");}
    finally{setBusy(false);}
  }
  if(!overview?.family || detail) return <View>
    {overview?.family && <Pressable style={s.back} onPress={()=>{setDetail(false);void refresh();}}><Ionicons name="chevron-back" size={16} color={blue}/><Text style={s.link}>Familjens översikt</Text></Pressable>}
    <FamilyScreen nearby={nearby} openSource={openSource} onOverview={() => { void refresh(); }}/>
  </View>;
  const memberPositions=overview.members.filter(member=>member.sharing && Number.isFinite(member.lat) && Number.isFinite(member.lon));
  const first=memberPositions[0] || overview.zones[0];
  const center=first ? {latitude:Number(first.lat),longitude:Number(first.lon),latitudeDelta:0.08,longitudeDelta:0.08}:START_REGION;
  const owner=overview.family.owner_id===overview.user.id;
  return <View>
    <View style={s.hero}><View style={s.heroIcon}><Ionicons name="people-outline" size={24} color="#675DBA"/></View><Text style={s.heading}>Familj</Text><Text style={s.note}>{overview.family.name} · {overview.members.length} medlemmar</Text></View>
    <View style={s.actionRow}><Pressable style={s.addButton} onPress={()=>setAdd(add==="none"?"person":"none")} accessibilityRole="button"><Ionicons name="add-circle-outline" size={18} color="#fff"/><Text style={s.addText}>Lägg till</Text></Pressable><Pressable style={s.settings} onPress={()=>setDetail(true)} accessibilityRole="button"><Ionicons name="settings-outline" size={18} color={blue}/><Text style={s.link}>Inställningar</Text></Pressable></View>
    {add!=="none"&&<View style={s.addPanel}><View style={s.actionRow}><Pressable style={s.pill} onPress={()=>setAdd("person")}><Text style={s.link}>Person</Text></Pressable><Pressable style={s.pill} onPress={()=>setAdd("place")}><Text style={s.link}>Plats</Text></Pressable></View>{!owner?<Text style={s.note}>Familjens skapare kan bjuda in personer och lägga till delade platser.</Text>:add==="person"?<><Text style={s.note}>Skapa en engångsinbjudan och dela den med personen.</Text><Pressable style={s.addButton} disabled={busy} onPress={invite}><Text style={s.addText}>Dela inbjudan</Text></Pressable></>:<><TextInput style={s.input} placeholder="Platsens namn" value={placeName} onChangeText={setPlaceName}/><TextInput style={s.input} placeholder="Adress" value={placeAddress} onChangeText={setPlaceAddress}/><Pressable style={s.addButton} disabled={busy||!placeName.trim()||!placeAddress.trim()} onPress={savePlace}><Text style={s.addText}>Spara delad plats</Text></Pressable><Text style={s.note}>Familjen kan se platsen. Den är inte automatiskt en säker plats.</Text></>}</View>}
    {!!(error || refreshError)&&<Text style={s.error}>{error || refreshError}</Text>}
    <Text style={s.section}>Personer och platser</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.quickRow}>
      {overview.members.map(member=><Pressable key={member.id} style={[s.quick,selected===member.id&&s.quickSelected]} onPress={() => { setSelected(member.id); focus(member.lat,member.lon); }} accessibilityRole="button" accessibilityState={{selected:selected===member.id}} accessibilityLabel={"Visa " + member.display_name + " på kartan"}><View style={s.quickIcon}><Ionicons name="person-outline" size={20} color={blue}/></View><Text style={s.quickName}>{member.display_name}</Text><Text style={s.quickMeta}>{member.sharing&&member.lat!=null?"Delar plats":"Ingen aktiv plats"}</Text></Pressable>)}
      {overview.zones.map(zone=><Pressable key={zone.id} style={[s.quick,selected===zone.id&&s.quickSelected]} onPress={() => { setSelected(zone.id); focus(zone.lat,zone.lon); }} accessibilityRole="button" accessibilityState={{selected:selected===zone.id}} accessibilityLabel={"Visa " + zone.name + " på kartan"}><View style={s.quickIcon}><Ionicons name="home-outline" size={20} color="#5F55A7"/></View><Text style={s.quickName}>{zone.name}</Text><Text style={s.quickMeta}>Delad plats</Text></Pressable>)}
    </ScrollView>
    <Text style={s.section}>Familjens karta</Text><View style={s.mapFrame}><MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={center} rotateEnabled={false}>
      {memberPositions.map(member=><Marker key={member.id} coordinate={{latitude:Number(member.lat),longitude:Number(member.lon)}} title={member.display_name} description="Frivilligt delad position, kan vara fördröjd"/>)}
      {overview.zones.map(zone=><Circle key={zone.id} center={{latitude:zone.lat,longitude:zone.lon}} radius={zone.radius} strokeColor="#6B61B2" fillColor="rgba(107,97,178,0.13)"/>)}
    </MapView></View><Text style={s.note}>Positioner försvinner efter 15 minuter utan uppdatering. Nålar visar personer; lila cirklar visar delade platser. Delade platser och positioner har olika symboler.</Text>
    <Text style={s.section}>Familjechatt</Text><View style={s.chat}>
      {messages.length?messages.slice(-12).map(message=><View key={message.id} style={[s.bubble,message.sender_id===overview.user.id&&s.myBubble]}><Text style={s.sender}>{message.sender_name}</Text><Text style={s.message}>{message.body}</Text><Text style={s.time}>{new Date(message.created_at).toLocaleString("sv-SE")}</Text></View>):<Text style={s.note}>Inga meddelanden ännu.</Text>}
      <View style={s.compose}><TextInput style={s.composeInput} placeholder="Skriv till familjen" value={draft} onChangeText={setDraft} multiline/><Pressable style={s.send} disabled={busy||!draft.trim()} onPress={sendMessage} accessibilityRole="button" accessibilityLabel="Skicka meddelande"><Ionicons name="send" size={18} color="#fff"/></Pressable></View>
    </View>
    <Pressable style={s.extra} onPress={()=>setDetail(true)}><Text style={s.link}>Fler familjefunktioner, zoner och konto →</Text></Pressable>
  </View>;
}
const s=StyleSheet.create({
  hero:{alignItems:"center",paddingVertical:10},heroIcon:{width:42,height:42,borderRadius:12,backgroundColor:'#E9E9FF',alignItems:'center',justifyContent:'center'},heading:{color:ink,fontSize:20,fontWeight:"800",letterSpacing:-.8,marginTop:7},note:{color:muted,fontSize:12,lineHeight:18,marginTop:5},
  actionRow:{flexDirection:"row",alignItems:"center",gap:12,marginTop:10},addButton:{backgroundColor:blue,borderRadius:13,minHeight:43,paddingHorizontal:15,paddingVertical:10,flexDirection:"row",gap:5,alignItems:"center",justifyContent:"center"},addText:{color:"#fff",fontSize:13,fontWeight:"800"},
  settings:{minHeight:44,flexDirection:"row",alignItems:"center",gap:5},link:{color:blue,fontSize:12,fontWeight:"800"},
  addPanel:{backgroundColor:"#fff",borderRadius:16,borderWidth:1,borderColor:"#E2EAF3",padding:13,marginTop:10},pill:{minHeight:44,backgroundColor:"#ECF4FF",borderRadius:10,padding:9},
  input:{backgroundColor:"#F7FAFD",borderWidth:1,borderColor:"#DCE7F0",borderRadius:11,padding:11,marginTop:10,fontSize:14,color:ink},
  error:{color:"#9E2837",backgroundColor:"#FFE9EB",padding:10,borderRadius:10,marginTop:10},section:{color:ink,fontSize:17,fontWeight:"800",marginTop:22,marginBottom:10},
  quickRow:{gap:8},quick:{width:82,alignItems:"center",padding:5,borderWidth:1,borderColor:'transparent',borderRadius:12},quickSelected:{borderColor:blue,backgroundColor:'#EAF2FE'},quickIcon:{width:45,height:45,borderRadius:15,backgroundColor:"#EAF2FE",alignItems:"center",justifyContent:"center"},quickName:{color:ink,fontSize:13,fontWeight:"800",marginTop:5,textAlign:'center'},quickMeta:{color:muted,fontSize:11,textAlign:"center",marginTop:3},
  mapFrame:{height:250,borderRadius:19,overflow:"hidden",backgroundColor:"#E7EDF4"},chat:{backgroundColor:"#fff",borderRadius:17,padding:12,borderColor:"#E2EAF3",borderWidth:1},
  bubble:{backgroundColor:"#EDF3F9",borderRadius:13,padding:9,marginBottom:8,alignSelf:"flex-start",maxWidth:"90%"},myBubble:{backgroundColor:"#E7F1FF",alignSelf:"flex-end"},sender:{color:blue,fontSize:12,fontWeight:"800"},message:{color:ink,fontSize:15,marginTop:4},time:{color:muted,fontSize:11,marginTop:5},
  compose:{flexDirection:"row",gap:8,alignItems:"flex-end",marginTop:5},composeInput:{flex:1,minHeight:44,maxHeight:110,borderColor:"#DCE7F0",borderWidth:1,borderRadius:12,padding:10,color:ink,fontSize:13},send:{backgroundColor:blue,borderRadius:12,minHeight:44,width:44,alignItems:"center",justifyContent:"center"},
  extra:{padding:10,marginTop:8},back:{flexDirection:"row",alignItems:"center",marginBottom:12},
});
