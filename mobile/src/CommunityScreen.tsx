import { Text } from './Typography';
import { useMemo, useRef, useState } from 'react';
import { AppState, FlatList, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppData, useFeedInterest } from './AppData';
import { appRequest, type CommunityPage, type CommunityReport } from './communityApi';
import { CommunityCard } from './CommunityCard';
import { useReadingList } from './useReadingList';
import { Button, Freshness, StateCard } from './UI';
import { useIsFocused } from '@react-navigation/native';
import { useEffect } from 'react';
import { subscribeFamilySession } from './api';
import { ui } from './theme';
import type { RootStackParams } from './navigation';
import {useVisibleClock} from './useVisibleClock';
export function CommunityScreen({navigation,route}:NativeStackScreenProps<RootStackParams,'community'>){
  const data=useAppData();useFeedInterest(['community','config']);const focused=useIsFocused(),mine=!!route.params?.mine;
  const clock=useVisibleClock();
  const feed=data.feeds.community,page=feed.data as CommunityPage|null;
  const [extra,setExtra]=useState<CommunityReport[]>([]),[cursor,setCursor]=useState<string|null>(null),[own,setOwn]=useState<CommunityPage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const version=useRef(0);
  const source=mine?own:page;
  const loadedPages=useRef(1),refreshing=useRef(false);
  useEffect(()=>{if(loadedPages.current===1)setCursor(source?.nextCursor||null);},[source]);
  useEffect(()=>{const unsubscribe=subscribeFamilySession(()=>{version.current++;loadedPages.current=1;setExtra([]);setOwn(null);setCursor(null);setBusy(false);});return()=>{version.current++;unsubscribe();};},[]);
  async function history(){if(refreshing.current)return;refreshing.current=true;const sequence=version.current;try{let next:string|null=null,first:CommunityPage|null=null,rest:CommunityReport[]=[];for(let index=0;index<loadedPages.current;index++){const result:CommunityPage=await appRequest<CommunityPage>(`/api/community-reports?limit=100${mine?'&mine=1':''}${next?'&cursor='+encodeURIComponent(next):''}`);if(!first)first=result;else rest.push(...result.items);next=result.nextCursor;if(!next)break;}if(sequence===version.current){if(mine)setOwn(first);setExtra(rest);setCursor(next);setError('');}}catch(err){if(sequence===version.current)setError(err instanceof Error?err.message:'Rapporterna kunde inte hämtas');}finally{refreshing.current=false;}}
  useEffect(()=>{if(!focused)return;let active=AppState.currentState==='active';if(mine||loadedPages.current>1)void history();const timer=setInterval(()=>{if(active&&(mine||loadedPages.current>1))void history();},10_000),state=AppState.addEventListener('change',value=>{active=value==='active';if(active&&(mine||loadedPages.current>1))void history();});return()=>{clearInterval(timer);state.remove();};},[focused,mine]);
  const incoming=useMemo(()=>{const rows=new Map([...extra,...(source?.items||[])].map(item=>[item.id,item]));return [...rows.values()].filter(item=>mine||item.status==='active'&&Date.parse(item.expiresAt)>clock).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));},[source,extra,mine,clock]);
  const reading=useReadingList(incoming),list=useRef<FlatList<CommunityReport>>(null);
  async function more(){if(!cursor||busy||refreshing.current)return;setBusy(true);const sequence=version.current;try{const result=await appRequest<CommunityPage>(`/api/community-reports?limit=100&${mine?'mine=1&':''}cursor=${encodeURIComponent(cursor)}`);if(sequence===version.current){loadedPages.current++;setExtra(current=>[...current,...result.items]);setCursor(result.nextCursor);setError('');}}catch(err){if(sequence===version.current)setError(err instanceof Error?err.message:'Nästa sida kunde inte hämtas');}finally{if(sequence===version.current)setBusy(false);}}
  return <View style={ui.page}><FlatList ref={list} data={reading.items} keyExtractor={item=>item.id} maintainVisibleContentPosition={{minIndexForVisible:0}} contentContainerStyle={ui.content} onScroll={event=>reading.setAtTop(event.nativeEvent.contentOffset.y<20)} scrollEventThrottle={100}
    refreshing={feed.loading||busy} onRefresh={()=>{if(mine||loadedPages.current>1)void history();if(!mine)void data.store.refresh('community',true);}}
    ListHeaderComponent={<View style={{gap:14}}><Text style={ui.title}>{mine?'Mina rapporter':'Användarrapporter'}</Text><Text style={ui.body}>Observationer från användare, med ungefärlig plats. Uppgifterna är obekräftade och visas i 24 timmar.</Text><Button title="Rapportera en observation" onPress={()=>navigation.navigate('compose')}/><Freshness fetchedAt={source?.fetchedAt} error={feed.error} refreshing={feed.loading}/>{!!error&&<Text style={ui.error}>{error}</Text>}{reading.pending.length>0&&<Button title={`Visa nya uppdateringar (${reading.pending.length})`} onPress={()=>{reading.apply();list.current?.scrollToOffset({offset:0,animated:true});}}/>}</View>}
    renderItem={({item})=><CommunityCard report={item} onPress={()=>navigation.navigate('report',{id:item.id})}/>}
    ListEmptyComponent={<StateCard title={feed.loading?'Hämtar rapporter…':feed.error?'Rapportflödet är inte tillgängligt':'Inga rapporter i detta flöde'} body={mine?'Dina rapporter sparas i din privata historik i 30 dagar.':'Här visas publicerade användarobservationer.'} retry={feed.error?()=>void data.store.refresh('community',true):undefined}/>}
    ListFooterComponent={cursor?<Button title="Visa fler" busy={busy} onPress={()=>void more()} secondary/>:null}/></View>;
}
