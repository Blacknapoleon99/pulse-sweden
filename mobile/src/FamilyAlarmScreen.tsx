import { Text } from './Typography';
import { useEffect, useRef, useState } from "react";
import Ionicons from '@expo/vector-icons/Ionicons';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { familyRequest, type FamilyAlarm } from "./api";
import { useFamily } from "./FamilyState";
import { appRequest } from './communityApi';
import { useIsFocused } from '@react-navigation/native';
import { AppState } from 'react-native';

const ink = "#11152A", blue = "#2187F5", red = "#B93649", muted = "#65778B";
const contactNumbers = [
  { number: "112", title: "Akut nödläge", detail: "Polis, räddningstjänst och ambulans" },
  { number: "114 14", title: "Polisen, ej akut", detail: "Polisärenden som inte är akuta" },
  { number: "1177", title: "Sjukvårdsrådgivning", detail: "Råd om vård och hälsa" },
];
function call(number: string) { void Linking.openURL(`tel:${number.replace(/\s/g, "")}`); }
function requestId() { return `alarm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`; }

export function FamilyAlarmScreen({ onOpenFamily }: { onOpenFamily: () => void }) {
  const { overview, alarms: rawAlarms, refresh, loading, error:placesError,alarmError, clock, revision } = useFamily();
  const loadError=placesError||alarmError;
  const alarms = rawAlarms.map(alarm => ({ ...alarm, active: alarm.active && !alarm.cancelledAt && Date.parse(alarm.expiresAt) > clock }));
  const [confirm,setConfirm] = useState(false), [busy,setBusy] = useState(false);
  const [error,setError] = useState(""), [notice,setNotice] = useState("");
  const request = useRef<string | null>(null);
  const focused=useIsFocused(),[delivery,setDelivery]=useState<Record<string,{status:string;errorCode:string|null}[]>>({});
  const deliveryIds=rawAlarms.filter(alarm=>alarm.senderId===overview?.user.id).slice(0,8).map(alarm=>alarm.id).join(',');
  useEffect(()=>{let alive=true,active=AppState.currentState==='active';setDelivery({});const load=async()=>{if(!focused||!active)return;const rows=await Promise.allSettled(deliveryIds.split(',').filter(Boolean).map(async id=>({id,result:await appRequest<{items:{status:string;errorCode:string|null}[]}>(`/api/account/alarms/${id}/delivery`)})));if(alive)setDelivery(Object.fromEntries(rows.filter(row=>row.status==='fulfilled').map(row=>{const value=(row as PromiseFulfilledResult<{id:string;result:{items:{status:string;errorCode:string|null}[]}}>).value;return [value.id,value.result.items];})));};void load();const timer=setInterval(()=>void load(),10_000),state=AppState.addEventListener('change',value=>{active=value==='active';if(active)void load();});return()=>{alive=false;clearInterval(timer);state.remove();};},[focused,deliveryIds,revision]);
  useEffect(() => { request.current = null; setConfirm(false); setError(""); setNotice(""); }, [revision]);
  async function send() {
    if (!overview?.family) return;
    setBusy(true); setError(""); setNotice("");
    request.current ||= requestId();
    try {
      const result = await familyRequest<{alarm:FamilyAlarm}>("alarms","POST",{requestId:request.current});
      request.current = null; setConfirm(false);
      setNotice(`Familjelarm sparat för ${result.alarm.recipients.length} mottagare. Vänta på deras bekräftelse.`);
      await refresh();
    } catch (caught) { setError(`Familjelarmet kunde inte bekräftas av servern. ${caught instanceof Error ? caught.message : "Försök igen."}`); }
    finally { setBusy(false); }
  }
  async function cancel(id: string) {
    setBusy(true); setError("");
    try { await familyRequest(`alarms/${id}/cancel`,"POST",{}); setNotice("Familjelarmet har avslutats."); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Larmet kunde inte avslutas."); }
    finally { setBusy(false); }
  }
  const recipients = overview?.members.filter(member => member.id !== overview.user.id) || [];
  const mine = alarms.filter(alarm => alarm.senderId === overview?.user.id);
  return <View>
    <Text style={s.eyebrow}>LARM · FAMILJ</Text><Text style={s.heading}>Behöver du hjälp?</Text>
    <Text style={s.note}>Vid omedelbar fara, ring 112. Familjelarm visas i appen. Mobilaviseringar kräver en ansluten byggnad och mottagarens godkännande. Leverans betyder inte att larmet har setts.</Text>
    <View style={s.contacts}>{contactNumbers.map(item => <Pressable key={item.number} style={s.contact} onPress={() => call(item.number)} accessibilityRole="button" accessibilityLabel={`Ring ${item.number}, ${item.title}`}><Ionicons name="call-outline" size={19} color={item.number === "112" ? red : blue} /><View style={{flex:1}}><Text style={s.contactTitle}>Ring {item.number} · {item.title}</Text><Text style={s.contactDetail}>{item.detail}</Text></View></Pressable>)}</View>
    <Text style={s.section}>Larma familjen</Text>
    {loading && <Text style={s.note}>Hämtar familjen…</Text>}
    {!!loadError && <Text style={s.error}>{loadError}</Text>}
    {overview?.family ? <>
      <Text style={s.note}>Mottagare: {recipients.length ? recipients.map(member => member.display_name).join(", ") : "Ingen annan medlem ännu"}.</Text>
      <Pressable style={[s.primary,(!recipients.length || busy) && {opacity:0.5}]} disabled={!recipients.length || busy} onPress={() => setConfirm(true)} accessibilityRole="button"><Ionicons name="notifications-outline" color="#fff" size={21} /><Text style={s.primaryText}>Larma familjen</Text></Pressable>
    </> : !loading && !loadError ? <><Text style={s.note}>Logga in och gå med i en familj för att skicka familjelarm.</Text><Pressable style={s.secondary} onPress={onOpenFamily}><Text style={s.secondaryText}>Öppna familjen</Text></Pressable></> : null}
    {!!loadError && <Pressable style={s.secondary} onPress={() => void refresh()}><Text style={s.secondaryText}>Försök hämta igen</Text></Pressable>}
    {!!notice && <Text style={s.success}>{notice}</Text>}{!!error && <Text style={s.error}>{error}</Text>}
    <Text style={s.section}>Skickade familjelarm</Text>
    {mine.length ? mine.slice(0,8).map(alarm => <View key={alarm.id} style={s.history}><Text style={s.contactTitle}>{alarm.active ? "Aktivt familjelarm" : alarm.cancelledAt ? "Avslutat familjelarm" : "Utgånget familjelarm"}</Text><Text style={s.note}>{new Date(alarm.createdAt).toLocaleString("sv-SE")}</Text><Text style={s.note}>Sett av {alarm.recipients.filter(member=>member.acknowledgedAt).length} av {alarm.recipients.length} mottagare.</Text><Text style={s.note}>Mobilaviseringar: {delivery[alarm.id]?.length?`${delivery[alarm.id].filter(item=>item.status==='delivered').length} levererade till aviseringsleverantören · ${delivery[alarm.id].filter(item=>item.status==='failed'||item.errorCode).length} med leveransfel · ${delivery[alarm.id].filter(item=>item.status==='no_device').length} utan aktiv enhet`:'Inga anslutna mobilaviseringar eller ännu ingen leveransstatus'}.</Text>{alarm.active && <Pressable disabled={busy} onPress={() => cancel(alarm.id)}><Text style={s.cancel}>Avsluta larm</Text></Pressable>}</View>) : <Text style={s.note}>Inga familjelarm skickade.</Text>}
    <Modal visible={confirm} transparent animationType="fade" onRequestClose={() => setConfirm(false)}><View style={s.overlay}><ScrollView style={s.dialog} contentContainerStyle={{padding:23}} keyboardShouldPersistTaps="handled"><Text style={s.dialogTitle}>Skicka familjelarm?</Text><Text style={s.note}>Cajklops meddelar {recipients.map(member=>member.display_name).join(", ")} i appen och via godkända, anslutna mobilaviseringar. Ingen plats delas automatiskt.</Text><Pressable style={s.primary} disabled={busy} onPress={send}><Text style={s.primaryText}>{busy ? "Skickar…" : "Skicka familjelarm"}</Text></Pressable><Pressable style={s.secondary} onPress={() => setConfirm(false)} disabled={busy}><Text style={s.secondaryText}>Avbryt</Text></Pressable>{!!error && <Text style={s.error}>{error}</Text>}</ScrollView></View></Modal>
  </View>;
}

export function AlarmCoordinator() {
  const { overview, alarms, foreground, clock, acknowledge: acknowledgeAlarm } = useFamily();
  const [error,setError] = useState(""), [busy,setBusy] = useState(false);
  const current = foreground ? alarms.filter(alarm => alarm.active && !alarm.cancelledAt && Date.parse(alarm.expiresAt) > clock && alarm.senderId !== overview?.user.id && alarm.recipients.some(r => r.id === overview?.user.id && !r.acknowledgedAt)).sort((a,b) => Date.parse(a.createdAt)-Date.parse(b.createdAt))[0] : undefined;
  useEffect(() => { setError(""); setBusy(false); }, [current?.id]);
  async function acknowledge() {
    if (!current) return;
    setBusy(true); setError("");
    try { await acknowledgeAlarm(current.id); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Kunde inte bekräfta larmet."); }
    finally { setBusy(false); }
  }
  return <Modal visible={!!current} transparent animationType="fade" onRequestClose={() => {}}><View style={s.overlay}><ScrollView style={s.dialog} contentContainerStyle={{padding:23}} keyboardShouldPersistTaps="handled"><View style={s.alertIcon}><Ionicons name="notifications" size={30} color="#fff" /></View><Text style={s.dialogTitle}>Familjelarm från {current?.senderName}</Text><Text style={s.note}>{current && new Date(current.createdAt).toLocaleString("sv-SE")}</Text><Text style={s.note}>{current?.senderName} behöver hjälp. Detta är ett meddelande från en familjemedlem, inte ett larm till SOS Alarm.</Text><Pressable style={s.emergency} onPress={() => call("112")}><Text style={s.emergencyText}>Ring 112 vid akut fara</Text></Pressable><Pressable style={s.primary} disabled={busy} onPress={acknowledge}><Text style={s.primaryText}>{busy ? "Bekräftar…" : "Jag har sett larmet"}</Text></Pressable>{!!error && <Text style={s.error}>{error}</Text>}</ScrollView></View></Modal>;
}
const s=StyleSheet.create({
  eyebrow:{color:red,fontSize:11,fontWeight:"800",letterSpacing:1.2},heading:{color:ink,fontSize:27,fontWeight:"800",marginTop:7},
  note:{color:muted,fontSize:12,lineHeight:18,marginTop:6},contacts:{gap:8,marginTop:17},
  contact:{backgroundColor:"#fff",borderColor:"#E2EAF3",borderWidth:1,borderRadius:16,padding:13,flexDirection:"row",alignItems:"center",gap:11,minHeight:65},
  contactTitle:{color:ink,fontSize:13,fontWeight:"800"},contactDetail:{color:muted,fontSize:11,marginTop:3},
  section:{color:ink,fontSize:18,fontWeight:"800",marginTop:25,marginBottom:6},
  primary:{backgroundColor:red,borderRadius:9,paddingVertical:14,paddingHorizontal:16,alignItems:"center",justifyContent:"center",flexDirection:"row",gap:8,marginTop:15,minHeight:48},
  primaryText:{color:"#fff",fontSize:14,fontWeight:"800"},secondary:{alignItems:"center",padding:12,marginTop:8},secondaryText:{color:blue,fontWeight:"800",fontSize:13},
  success:{color:"#1B735C",backgroundColor:"#E3F7EF",padding:11,borderRadius:12,marginTop:12},error:{color:"#9E2837",backgroundColor:"#FFE9EB",padding:11,borderRadius:12,marginTop:10},
  history:{backgroundColor:"#fff",borderWidth:1,borderColor:"#E2EAF3",borderRadius:15,padding:12,marginTop:9},cancel:{color:red,fontWeight:"800",fontSize:12,marginTop:10},
  overlay:{flex:1,backgroundColor:"rgba(15,32,50,0.65)",justifyContent:"center",padding:23},dialog:{backgroundColor:"#fff",borderRadius:22,maxHeight:"90%"},
  dialogTitle:{color:ink,fontSize:22,fontWeight:"800",marginBottom:6},alertIcon:{width:54,height:54,borderRadius:17,backgroundColor:red,alignItems:"center",justifyContent:"center",marginBottom:15},
  emergency:{backgroundColor:"#FFF0F0",borderRadius:13,padding:14,alignItems:"center",marginTop:18},emergencyText:{color:red,fontWeight:"800",fontSize:14},
});
