import { Text, TextInput } from './Typography';
import {useEffect,useRef,useState} from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {familyRequest,type FamilyMessage} from './api';
import {useFamily} from './FamilyState';

export function PrivateFamilyChat(){
  const family=useFamily(),focused=useIsFocused();
  const peers=(family.overview?.members||[]).filter(member=>member.id!==family.overview?.user.id);
  const [recipientId,setRecipientId]=useState(''),[messages,setMessages]=useState<FamilyMessage[]>([]),[draft,setDraft]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const peer=peers.find(member=>member.id===recipientId);
  const enabled=family.overview?.privateChatEnabled===true;
  const key=`${family.revision}:${family.overview?.user.id}:${family.overview?.family?.id}:${peer?.id||''}`;
  const current=useRef(key);current.current=key;
  const reload=useRef<()=>Promise<void>>(async()=>{});
  useEffect(()=>{
    setMessages([]);setDraft('');setError('');setBusy(false);
    if(!focused||!enabled||!peer)return;
    let alive=true,active=AppState.currentState==='active',pending=false;
    const load=async()=>{
      if(!alive||!active||pending)return;
      pending=true;
      try{
        const result=await familyRequest<{messages:FamilyMessage[]}>(`messages?memberId=${encodeURIComponent(peer.id)}`);
        if(alive&&current.current===key){
          if(!Array.isArray(result.messages))throw new Error('Chattsvaret kunde inte läsas.');
          const userId=family.overview!.user.id;
          const privateMessages=result.messages.filter(message=>(message.sender_id===userId&&message.recipient_id===peer.id)||(message.sender_id===peer.id&&message.recipient_id===userId));
          setMessages(privateMessages);setError('');
        }
      }catch(caught){if(alive&&current.current===key)setError(caught instanceof Error?caught.message:'Den privata chatten kunde inte uppdateras.');}
      finally{pending=false;}
    };
    reload.current=load;void load();
    const timer=setInterval(()=>void load(),5000);
    const app=AppState.addEventListener('change',state=>{active=state==='active';if(active)void load();});
    return()=>{alive=false;clearInterval(timer);app.remove();};
  },[key,focused,enabled]);
  async function send(){
    if(!peer||!enabled||busy||!draft.trim())return;
    const thread=key;
    setBusy(true);setError('');
    try{
      await familyRequest('messages','POST',{body:draft.trim(),recipientId:peer.id});
      if(current.current===thread){setDraft('');await reload.current();}
    }catch(caught){if(current.current===thread)setError(caught instanceof Error?caught.message:'Meddelandet kunde inte skickas.');}
    finally{if(current.current===thread)setBusy(false);}
  }
  return <View style={s.card}>
    <Text style={s.title}>Privat chatt</Text>
    <Text style={s.note}>Välj en familjemedlem. Bara ni två kan läsa samtalet.</Text>
    {!enabled?<Text style={s.note}>Servern behöver uppdateras innan privata meddelanden kan skickas.</Text>:<>
      <View style={s.peers}>{peers.map(member=><Pressable key={member.id} accessibilityRole="button" accessibilityState={{selected:member.id===recipientId}} style={[s.chip,member.id===recipientId&&s.selected]} onPress={()=>setRecipientId(member.id)}><Text style={[s.peer,member.id===recipientId&&s.white]}>{member.display_name}</Text></Pressable>)}</View>
      {!peers.length&&<Text style={s.note}>Bjud in en familjemedlem för att börja chatta.</Text>}
      {peer&&<>
        <Text style={s.title}>Du och {peer.display_name}</Text>
        {messages.length?messages.map(message=><View key={message.id} style={s.message}><Text style={s.sender}>{message.sender_name} · {new Date(message.created_at).toLocaleString('sv-SE')}</Text><Text style={s.body}>{message.body}</Text></View>):<Text style={s.note}>Inga privata meddelanden ännu.</Text>}
        <TextInput accessibilityLabel={`Privat meddelande till ${peer.display_name}`} style={s.input} value={draft} onChangeText={setDraft} placeholder={`Skriv till ${peer.display_name}`} maxLength={500} multiline/>
        <Pressable style={[s.send,(busy||!draft.trim())&&{opacity:.5}]} accessibilityRole="button" disabled={busy||!draft.trim()} onPress={()=>void send()}><Text style={s.white}>{busy?'Skickar…':'Skicka privat'}</Text></Pressable>
      </>}
    </>}
    {!!error&&<Text style={s.error}>{error}</Text>}
  </View>;
}
const s=StyleSheet.create({
  card:{backgroundColor:'#fff',borderColor:'#E4EBF3',borderWidth:1,borderRadius:9,padding:15,gap:10},
  title:{fontSize:16,fontWeight:'800',color:'#11152A'},note:{color:'#72788D',fontSize:12,lineHeight:18},
  peers:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{minHeight:44,paddingHorizontal:12,paddingVertical:10,borderRadius:12,backgroundColor:'#EDF3F9',justifyContent:'center'},selected:{backgroundColor:'#2187F5'},peer:{fontSize:13,color:'#11152A',fontWeight:'700'},white:{color:'#fff',fontWeight:'700'},
  message:{paddingVertical:8,borderBottomWidth:1,borderColor:'#EDF3F9'},sender:{fontSize:11,color:'#72788D',marginBottom:4},body:{fontSize:14,lineHeight:20,color:'#11152A'},
  input:{backgroundColor:'#F4F7FC',borderRadius:12,padding:12,minHeight:60,fontSize:14,color:'#11152A'},send:{backgroundColor:'#2187F5',minHeight:44,borderRadius:12,padding:12,alignItems:'center',justifyContent:'center'},error:{color:'#B53C4A',fontSize:12,lineHeight:18},
});
