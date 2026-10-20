import {useState} from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {Pressable,RefreshControl,ScrollView,StyleSheet,View,useWindowDimensions} from 'react-native';
import type {Region} from 'react-native-maps';
import type {Event,Point,RouteResponse} from './api';
import {Text} from './Typography';
import {AppHeader} from './ReferenceKit';
import {FamilyMapMembers,FamilyNearbyEvents,familyMapColors as palette} from './FamilyMapDetails';
import {OverviewMap} from './OverviewMap';
import {useFamily} from './FamilyState';
import {latestNearbyEvents,neighborhoodRegion,recentHomeEvents} from './homeMapState';
import {positionFresh} from './mobileState';

export function FamilyMapScreen({region,position,events,route,topInset,bottomInset,refreshing,onRefresh,onOpenFamily,onExpand,onLocate,openSource,onEditPlaces}:{
  region:Region;position:Point|null;events:Event[];topInset:number;bottomInset:number;
  refreshing:boolean;onRefresh:()=>void;onOpenFamily:()=>void;onExpand:()=>void;onLocate:()=>void;
  openSource:(url?:string)=>void;onEditPlaces:()=>void;
  route?:RouteResponse|null;
}){
  const family=useFamily(),[touching,setTouching]=useState(false),[locked,setLocked]=useState(false);
  const {height}=useWindowDimensions();
  const member=family.overview?.members.find(item=>positionFresh(item,family.clock));
  const zone=family.overview?.zones[0];
  const center=position||(member?{lat:member.lat!,lon:member.lon!}:zone?{lat:zone.lat,lon:zone.lon}:null);
  const mapRegion=center?neighborhoodRegion(center):region;
  const recent=recentHomeEvents(events);
  const origin=center||{lat:region.latitude,lon:region.longitude};
  const nearby=latestNearbyEvents(recent,origin);
  return <View style={s.page}>
    <ScrollView scrollEnabled={!touching} showsVerticalScrollIndicator={false} contentContainerStyle={[s.content,{paddingTop:topInset+10,paddingBottom:bottomInset+88}]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.blue} colors={[palette.blue]}/>}>
      <AppHeader right="settings-outline" rightLabel="Familjens inställningar och platsdelning" onRight={onOpenFamily}/>
      <View style={s.titleRow}>
        <Text accessibilityRole="header" style={s.title}>Familj</Text>
        <Pressable style={({pressed})=>[s.share,pressed&&s.pressed]} accessibilityRole="button" accessibilityLabel={locked?'Lås upp kartan':'Lås kartan till min plats'} accessibilityState={{selected:locked}} onPress={()=>{if(!position){onLocate();return;}setLocked(value=>!value);}}>
          <Ionicons name={locked?'lock-open':'lock-closed'} size={14} color="#fff"/><Text style={s.shareText}>{locked?'Lås upp':'Lås till plats'}</Text>
        </Pressable>
      </View>
      <FamilyMapMembers onOpen={onOpenFamily}/>
      <OverviewMap appearance="family" region={mapRegion} position={position} events={recent} route={route} height={Math.max(252,Math.min(320,Math.round(height*.34)))} locked={locked&&!!position} onOpenEvent={event=>openSource(event.url)} onInteraction={setTouching} onLocate={onLocate} onEditPlaces={onEditPlaces} onExpand={onExpand}/>
      <View style={s.sectionRow}>
        <Text accessibilityRole="header" style={s.sectionTitle}>Händelser i närheten</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Visa alla händelser på kartan" onPress={onExpand} style={s.showAll}><Text style={s.showAllText}>Visa alla</Text><Ionicons name="chevron-forward" size={15} color={palette.blue}/></Pressable>
      </View>
      <FamilyNearbyEvents events={nearby} origin={origin} onOpen={event=>openSource(event.url)} refreshing={refreshing}/>
      <View style={s.mapNote}><Ionicons name="information-circle-outline" size={13} color={palette.muted}/><Text style={s.mapNoteText}>Polisnotiser · ungefärliga platser</Text></View>
      {!!family.liveError&&<Text style={s.error}>{family.liveError}</Text>}
      <Pressable accessibilityRole="button" style={s.manage} onPress={onOpenFamily}><Ionicons name="people-outline" size={17} color={palette.blue}/><Text style={s.manageText}>Familj, platsdelning och chatt</Text><Ionicons name="chevron-forward" size={15} color={palette.blue}/></Pressable>
    </ScrollView>
  </View>;
}
const s=StyleSheet.create({
  page:{flex:1,backgroundColor:'#FFFFFF'},content:{paddingHorizontal:14},
  titleRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginTop:8,marginBottom:8},
  title:{fontSize:18,fontWeight:'800',color:palette.ink},
  share:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:palette.blue,borderRadius:11,minHeight:44,paddingHorizontal:12},
  shareText:{fontSize:12,fontWeight:'700',color:'#fff'},pressed:{opacity:.8},
  sectionRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:6,marginTop:8,marginBottom:4},
  sectionTitle:{flexShrink:1,fontSize:17,lineHeight:22,fontWeight:'800',letterSpacing:-.4,color:palette.ink},
  showAll:{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:2,minHeight:44,paddingLeft:6},
  showAllText:{fontSize:12,fontWeight:'600',color:palette.blue},
  mapNote:{flexDirection:'row',alignItems:'center',gap:4,marginTop:10},
  mapNoteText:{fontSize:10,lineHeight:15,color:palette.muted},
  manage:{flexDirection:'row',alignItems:'center',gap:7,minHeight:44,marginTop:12,paddingHorizontal:11,borderWidth:1,borderColor:'#DDE8F8',borderRadius:12,backgroundColor:'#F5F9FF'},
  manageText:{flex:1,fontSize:12,color:palette.blue,fontWeight:'600'},error:{color:'#B32035',fontSize:12,lineHeight:18,marginTop:8},
});
