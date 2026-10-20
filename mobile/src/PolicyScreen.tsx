import { Text } from './Typography';
import { useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { FlatList, Linking, ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { appRequest, type AccountConfig } from './communityApi';
import { useAppData, useFeedInterest } from './AppData';
import { Button, StateCard } from './UI';
import { ui } from './theme';
import type { RootStackParams } from './navigation';
import { subscribeFamilySession } from './api';
export function PolicyScreen({route,navigation}:NativeStackScreenProps<RootStackParams,'policy'>){
  const data=useAppData();useFeedInterest(['config']);const config=data.feeds.config.data as AccountConfig|null,page=route.params.page;
  const titles={privacy:'Din integritet',support:'Support', 'community-rules':'Regler för användarrapporter','account-deletion':'Radera konto'};
  return <ScrollView style={ui.page} contentContainerStyle={ui.content}><Text style={ui.title}>{titles[page]}</Text>
    {page==='community-rules'?<><Text style={ui.body}>Du måste vara minst 16 år, ha ett bekräftat konto och godkänna reglerna för att publicera rapporter och kommentarer.</Text><Text style={ui.body}>Beskriv egna observationer sakligt. Uppgifterna är obekräftade och dina bidrag verifierar inte vad som inträffat. Publicera inte namn på andra personer, personnummer, kontaktuppgifter, identifierbara personer, hot, kränkningar, diskriminering eller sexuellt eller grafiskt innehåll.</Text><Text style={ui.body}>Rapporter visas med ungefärlig plats och tas bort från den aktiva kartan efter 24 timmar. Bilder visas först efter personalens granskning. Du kan anmäla innehåll och blockera användare. Personalen kan ta bort innehåll och stänga av bidragsgivare.</Text><Text style={ui.meta}>Regelversion {config?.rulesVersion||'2026-09-29'}</Text></>:<><Text style={ui.body}>Offentliga rapporter visar ett separat alias och en avrundad plats. Ditt kontonamn, din e-post och dina privata familjeuppgifter följer inte med.</Text><Text style={ui.body}>Originalbildens metadata, inklusive GPS, tas bort. Bilder lagras privat. Rapporter, kommentarer och bilder sparas i högst 30 dagar. En granskningslogg utan rapporttext sparas i 90 dagar.</Text><Text style={ui.body}>Familjens platser och meddelanden är tillgängliga för den egna familjen. Frivilliga familjepositioner gäller i 15 minuter. Platsåtkomst startas av dig och används i förgrunden. Platsökningar och rutter skickas till kartleverantören.</Text><Text style={ui.body}>Konton kan använda e-post och lösenord eller BankID när det är anslutet. BankID-personnummer sparas inte. Aviseringar kan väljas och stängas av. Teknisk felrapportering skickar inte avsiktligt konto-, rapport- eller GPS-uppgifter.</Text><Text style={ui.body}>Du kan radera ditt konto i kontovyn. Dina bidrag blir otillgängliga direkt, och privata bildobjekt rensas av bakgrundsjobbet. Om du skapat en familj får nästa medlem ta över. Säkerhetskopior omfattas av driftleverantörens separata lagringsperiod.</Text><Button title="Öppna mitt konto" onPress={()=>navigation.navigate('account')}/></>}
    <View style={ui.card}><Text style={ui.heading}>Kontakta support</Text><Text style={ui.body}>{config?.supportEmail||'Support via e-post är ännu inte tillgänglig.'}</Text>{config?.supportEmail&&<Button title="Skicka e-post till support" secondary onPress={()=>void Linking.openURL(`mailto:${config.supportEmail}`)}/>}</View>
  </ScrollView>;
}
export function BlockedUsersScreen(){
  const focused=useIsFocused(),generation=useRef(0);
  const [items,setItems]=useState<{authorKey:string;alias:string}[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function load(){const version=generation.current;setBusy(true);try{const result=await appRequest<{items:typeof items}>('/api/community/blocks');if(version===generation.current){setItems(result.items);setError('');}}catch(err){if(version===generation.current)setError(err instanceof Error?err.message:'Listan kunde inte hämtas');}finally{if(version===generation.current)setBusy(false);}}
  useEffect(()=>{generation.current++;if(focused)void load();const session=subscribeFamilySession(()=>{generation.current++;setItems([]);setError('');setBusy(false);if(focused)void load();});return()=>{generation.current++;session();};},[focused]);
  async function unblock(key:string){const version=generation.current;setBusy(true);try{await appRequest('/api/community/blocks','DELETE',{authorKey:key});if(version===generation.current)await load();}catch(err){if(version===generation.current)setError(err instanceof Error?err.message:'Blockeringen kunde inte tas bort');}finally{if(version===generation.current)setBusy(false);}}
  return <FlatList style={ui.page} contentContainerStyle={ui.content} data={items} keyExtractor={item=>item.authorKey} refreshing={busy} onRefresh={()=>void load()}
    ListHeaderComponent={<><Text style={ui.title}>Blockerade användare</Text>{!!error&&<Text style={ui.error}>{error}</Text>}</>}
    renderItem={({item})=><View style={ui.card}><Text style={ui.body}>{item.alias}</Text><Button title="Ta bort blockering" secondary disabled={busy} onPress={()=>void unblock(item.authorKey)}/></View>}
    ListEmptyComponent={<StateCard title={busy?'Hämtar blockeringar…':error?'Blockeringarna kunde inte hämtas':'Inga blockerade användare'} retry={error?()=>void load():undefined}/>}/>;
}
