import { Text } from './Typography';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { colors, ui } from './theme';
import {useState} from 'react';
export function SourceDisclosure({summary,children}:{summary:string;children:React.ReactNode}){
  const [open,setOpen]=useState(false);
  return <View><Pressable accessibilityRole="button" accessibilityState={{expanded:open}} onPress={()=>setOpen(value=>!value)} style={{minHeight:26,justifyContent:'center'}}><Text style={[ui.meta,{color:colors.muted}]}>{summary} {open?'⌃':'⌄'}</Text></Pressable>{open&&<View style={{paddingBottom:6,gap:4}}>{children}</View>}</View>;
}
export function Button({title,onPress,disabled=false,busy=false,secondary=false}:{title:string;onPress:()=>void;disabled?:boolean;busy?:boolean;secondary?:boolean}) {
  return <Pressable accessibilityRole="button" accessibilityState={{disabled:disabled||busy,busy}} disabled={disabled||busy} onPress={onPress} style={({pressed})=>[ui.button,secondary&&ui.secondary,(disabled||busy)&&ui.disabled,pressed&&{opacity:.76,transform:[{scale:.99}]}]}>{busy?<ActivityIndicator color={secondary?colors.blue:'#fff'}/>:<Text style={[ui.buttonText,secondary&&ui.secondaryText]}>{title}</Text>}</Pressable>;
}
export function StateCard({title,body,retry}:{title:string;body?:string;retry?:()=>void}) { return <View style={ui.card}><Text style={ui.heading}>{title}</Text>{!!body&&<Text style={ui.body}>{body}</Text>}{retry&&<Button title="Försök igen" onPress={retry} secondary/>}</View>; }
export function Freshness({fetchedAt,error,refreshing}:{fetchedAt?:string|null;error?:string|null;refreshing?:boolean}) {
  const stamp=fetchedAt?new Date(fetchedAt).toLocaleString('sv-SE',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):null;
  return <View style={ui.row}>{refreshing&&<ActivityIndicator size="small" color={colors.blue}/>}<Text style={[ui.meta,error&&ui.error]}>{error?`${stamp?`Visar uppgifter från ${stamp}`:'Källan är inte tillgänglig'} · ${error}`:refreshing?'Uppdaterar…':stamp?`Hämtat ${stamp}`:'Väntar på uppgifter'}</Text></View>;
}
