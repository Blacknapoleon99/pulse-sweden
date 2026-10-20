import { Text } from './Typography';
import { memo, useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, View } from 'react-native';
import { Circle, Marker, type Region } from 'react-native-maps';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COMMUNITY_LABEL, categoryNames, categoryStyle, type CommunityReport } from './communityApi';
import { colors, ui } from './theme';
import { Button } from './UI';
import {useVisibleClock} from './useVisibleClock';
export function clusterReports(reports:CommunityReport[],region:Region){
  const step=Math.max(.00001,region.latitudeDelta/10),groups=new Map<string,CommunityReport[]>();
  for(const report of reports){if(report.status!=='active'||Date.parse(report.expiresAt)<=Date.now()||Math.abs(report.location.lat-region.latitude)>region.latitudeDelta/2||Math.abs(report.location.lon-region.longitude)>region.longitudeDelta/2)continue;
    const key=`${Math.floor(report.location.lat/step)}:${Math.floor(report.location.lon/step)}`;groups.set(key,[...(groups.get(key)||[]),report]);}
  return [...groups.entries()].map(([key,items])=>({key,items,latitude:items.reduce((total,item)=>total+item.location.lat,0)/items.length,longitude:items.reduce((total,item)=>total+item.location.lon,0)/items.length}));
}
function ReportPin({category,count}:{category:CommunityReport['category'];count:number}){
  const style=categoryStyle[category],dark=category==='suspicious'||category==='hazard'||category==='other'||category==='disturbance';
  return <View style={{minWidth:44,minHeight:44,borderRadius:22,borderWidth:4,borderColor:'#fff',backgroundColor:style.color,alignItems:'center',justifyContent:'center',elevation:8,shadowColor:'#000',shadowOpacity:.5,shadowRadius:4,shadowOffset:{width:0,height:2}}}>
    <View style={{position:'absolute',top:-3,left:-3,right:-3,bottom:-3,borderRadius:25,borderWidth:2,borderColor:'#101D35'}}/>
    {count>1?<Text style={{color:dark?'#101D35':'#fff',fontWeight:'900',fontSize:16}}>{count}</Text>:<Ionicons name={style.icon} size={24} color={dark?'#101D35':'#fff'}/>}
  </View>;
}
export const CommunityMarkers=memo(function CommunityMarkers({reports,region,onOpen,onZoom}:{reports:CommunityReport[];region:Region;onOpen:(id:string)=>void;onZoom?:(region:Region)=>void}){
  const [track,setTrack]=useState(true);useEffect(()=>{setTrack(true);const t=setTimeout(()=>setTrack(false),800);return()=>clearTimeout(t);},[reports,region.latitudeDelta]);
  const clock=useVisibleClock(),clusters=useMemo(()=>clusterReports(reports,region),[reports,region,clock]);
  const [selected,setSelected]=useState<string[]>([]);
  const selectedReports=reports.filter(report=>selected.includes(report.id)&&report.status==='active'&&Date.parse(report.expiresAt)>clock);
  return <>{clusters.map(cluster=><Marker key={cluster.key} tracksViewChanges={track} zIndex={10} coordinate={{latitude:cluster.latitude,longitude:cluster.longitude}} title={cluster.items.length>1?`${cluster.items.length} obekräftade användarrapporter`:`${categoryNames[cluster.items[0].category]} · ${cluster.items[0].title}`} description={COMMUNITY_LABEL+' · ungefärlig plats'} onCalloutPress={()=>{
    if(cluster.items.length===1){onOpen(cluster.items[0].id);return;}
    const samePoint=cluster.items.every(item=>item.location.lat===cluster.items[0].location.lat&&item.location.lon===cluster.items[0].location.lon);
    if(onZoom&&!samePoint&&region.latitudeDelta>.006)onZoom({...region,latitude:cluster.latitude,longitude:cluster.longitude,latitudeDelta:region.latitudeDelta/2,longitudeDelta:region.longitudeDelta/2});
    else setSelected(cluster.items.map(item=>item.id));
  }}>
    <ReportPin category={cluster.items.length>1&&new Set(cluster.items.map(i=>i.category)).size===1||cluster.items.length===1?cluster.items[0].category:'other'} count={cluster.items.length}/>
  </Marker>)}{clusters.filter(cluster=>cluster.items.length===1).map(cluster=><Circle key={'area-'+cluster.key} center={{latitude:cluster.latitude,longitude:cluster.longitude}} radius={75} strokeWidth={3} strokeColor={categoryStyle[cluster.items[0].category].color} fillColor={categoryStyle[cluster.items[0].category].color+'40'}/>)}
  <Modal visible={selectedReports.length>0} transparent animationType="none" onRequestClose={()=>setSelected([])}>
    <View style={{flex:1,justifyContent:'center',backgroundColor:'rgba(20,41,66,.45)',padding:20}}><View accessibilityViewIsModal style={[ui.card,{maxHeight:'80%',gap:12}]}>
      <Text style={ui.heading}>Rapporter i samma ungefärliga område</Text><Text style={ui.badge}>{COMMUNITY_LABEL}</Text>
      <FlatList data={selectedReports} keyExtractor={item=>item.id} renderItem={({item})=><Pressable style={ui.card} accessibilityRole="button" onPress={()=>{setSelected([]);onOpen(item.id);}}><Text style={ui.badge}>{COMMUNITY_LABEL}</Text><Text style={ui.heading}>{item.title}</Text><Text style={ui.meta}>{item.author.alias} · {new Date(item.observedAt).toLocaleString('sv-SE')}</Text></Pressable>}/>
      <Button title="Stäng" secondary onPress={()=>setSelected([])}/>
    </View></View>
  </Modal></>;
});
