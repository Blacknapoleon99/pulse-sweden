import Ionicons from '@expo/vector-icons/Ionicons';
import {Pressable,ScrollView,StyleSheet,View} from 'react-native';
import {Circle} from 'react-native-maps';
import type {Event,Point} from './api';
import {useFamily} from './FamilyState';
import {MapLabelMarker} from './MapLabelMarker';
import {MemberAvatar} from './MemberAvatar';
import {Text} from './Typography';
import {categoryOf} from './incidentSummary';
import {eventPoint,km,positionFresh} from './mobileState';
import {distanceLabel,placeStyle,relativeTime} from './ReferenceKit';
import {flareColor} from './MapFlares';

export const familyMapColors={
  ink:'#10133F',muted:'#4C527A',blue:'#0765DF',red:'#E5243B',amber:'#FFC329',border:'#DBE4F0',
};

// Opt-in styling for Karta. Keep the shared Home map's appearance independent.
export const familyMapStyle=[
  {elementType:'geometry',stylers:[{color:'#EFF1EC'}]},
  {elementType:'labels.text.fill',stylers:[{color:'#46536A'}]},
  {elementType:'labels.text.stroke',stylers:[{color:'#FFFFFF'},{weight:3}]},
  {featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]},
  {featureType:'poi.park',elementType:'geometry',stylers:[{color:'#D5EACB'}]},
  {featureType:'landscape.natural',elementType:'geometry',stylers:[{color:'#E0EED8'}]},
  {featureType:'road',elementType:'geometry',stylers:[{color:'#FFFFFF'}]},
  {featureType:'road',elementType:'geometry.stroke',stylers:[{color:'#D6DDD9'}]},
  {featureType:'road',elementType:'labels.icon',stylers:[{visibility:'off'}]},
  {featureType:'road.highway',elementType:'geometry',stylers:[{color:'#FFF0C9'}]},
  {featureType:'water',elementType:'geometry',stylers:[{color:'#C8E5F4'}]},
  {featureType:'transit',elementType:'labels',stylers:[{visibility:'off'}]},
];

export function FamilyMapMembers({onOpen}:{onOpen:()=>void}){
  const family=useFamily(),members=family.overview?.members||[],zones=family.overview?.zones||[];
  return <View style={s.familyRow}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={members.length?s.memberScroll:s.emptyMemberScroll} contentContainerStyle={s.members}>
      {members.map((member,index)=>{
        const fresh=member.sharing&&positionFresh(member,family.clock);
        const zone=fresh?zones.find(zone=>km({latitude:member.lat!,longitude:member.lon!},{latitude:zone.lat,longitude:zone.lon})*1000<=zone.radius):undefined;
        const status=fresh?(zone?`Nu · ${zone.name}`:'Delar plats'):'Delar ej';
        return <Pressable key={member.id} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${member.display_name}, ${status}`} style={s.member}>
          <View><MemberAvatar index={index} size={44}/><View style={[s.statusDot,{backgroundColor:fresh?'#238552':'#77839A'}]}/></View>
          <Text style={s.memberName} numberOfLines={1}>{member.display_name}</Text>
          <Text style={s.memberStatus} numberOfLines={1}>{status}</Text>
        </Pressable>;
      })}
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={members.length?'Bjud in till familjen':'Lägg till familj'} style={s.member}>
        <View style={s.addAvatar}><Ionicons name="add" size={27} color={familyMapColors.blue}/></View>
        <Text style={s.addLabel}>{members.length?'Bjud in':'Lägg till'}</Text>
      </Pressable>
    </ScrollView>
    {!members.length&&<Text style={s.familyEmpty}>{family.overview?.family?'Bjud in familjen och se era delade platser här.':'Samla familjens delade platser på en karta.'}</Text>}
  </View>;
}

export function FamilyPlaceLabel({name,kind}:{name:string;kind?:string}){
  const place=placeStyle(name,kind);
  return <View style={s.placeLabel}>
    <Ionicons name={place.icon} size={25} color={/hem|home/i.test(name)?familyMapColors.blue:place.color}/>
    <Text style={s.placeText} numberOfLines={1}>{name}</Text>
  </View>;
}

type MapActionProps={icon:keyof typeof Ionicons.glyphMap;label:string;onPress:()=>void;style?:object};
export function FamilyMapPill({icon,label,onPress,style}:MapActionProps){
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({pressed})=>[s.mapAction,s.mapPill,style,pressed&&s.pressed]}>
    <Ionicons name={icon} size={21} color={familyMapColors.blue}/><Text style={s.mapActionText}>{label}</Text>
  </Pressable>;
}
export function FamilyMapFab({icon,label,onPress,style}:MapActionProps){
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({pressed})=>[s.mapAction,s.mapFab,style,pressed&&s.pressed]}>
    <Ionicons name={icon} size={21} color={familyMapColors.blue}/>
  </Pressable>;
}

const heatRings=[{radius:380,alpha:'08'},{radius:310,alpha:'0C'},{radius:240,alpha:'14'},{radius:175,alpha:'20'},{radius:110,alpha:'30'},{radius:60,alpha:'40'}];
export function FamilyIncidentHeat({events,onOpen}:{events:Event[];onOpen?:(event:Event)=>void}){
  return <>{events.map(event=>{
    const point=eventPoint(event);
    if(!point)return null;
    const severe=flareColor(event)==='#FF253B',color=severe?familyMapColors.red:familyMapColors.amber;
    return [
      ...heatRings.map((ring,index)=><Circle key={`family-heat-${event.id}-${index}`} center={point} radius={ring.radius} strokeWidth={0} fillColor={`${color}${ring.alpha}`}/>),
      <MapLabelMarker key={`family-pin-${event.id}`} coordinate={point} anchor={{x:.5,y:.5}} zIndex={severe?30:20} title={event.type} description="Publicerad polisnotis · ungefärlig plats" onCalloutPress={()=>onOpen?.(event)}>
        <View style={s.pinSpace}><View style={[s.pin,{backgroundColor:color,shadowColor:color}]}><Text style={[s.pinText,!severe&&s.amberText]}>!</Text></View></View>
      </MapLabelMarker>,
    ];
  })}</>;
}

export function FamilyNearbyEvents({events,origin,onOpen,refreshing}:{events:Event[];origin:Point;onOpen:(event:Event)=>void;refreshing:boolean}){
  if(!events.length)return <View style={s.emptyCard} accessibilityLiveRegion="polite">
    <View style={s.emptyIcon}><Ionicons name={refreshing?'sync-outline':'map-outline'} size={22} color={familyMapColors.blue}/></View>
    <View style={{flex:1,gap:4}}><Text style={s.emptyTitle}>{refreshing?'Hämtar händelser…':'Inga hämtade notiser i närheten'}</Text><Text style={s.emptyBody}>{refreshing?'Publicerade polisnotiser visas här.':'Inga publicerade polisnotiser de senaste sju dagarna inom 35 km i hämtade data.'}</Text></View>
  </View>;
  return <View style={s.events}>{events.slice(0,3).map(event=>{
    const category=categoryOf(event.type),place=event.location?.name||event.name||'Område',distance=distanceLabel(event,origin);
    const tint=category.id==='robbery'?'#E5243B':category.id==='violence'?'#FFBF19':category.id==='traffic'?'#0765DF':category.color;
    return <Pressable key={event.id} accessibilityRole="button" accessibilityLabel={`${event.type}, ${place}${distance?`, cirka ${distance}`:''}, ${relativeTime(event.ts)}. Öppna polisnotis.`} onPress={()=>onOpen(event)} style={({pressed})=>[s.eventCard,pressed&&s.pressed]}>
      <View style={s.eventHeading}>
        <View style={[s.eventIcon,{backgroundColor:tint}]}><Ionicons name={category.icon} size={14} color={category.id==='violence'?'#543500':'#FFFFFF'}/></View>
        <Text style={s.eventTitle} numberOfLines={2}>{category.id==='other'?event.type:category.label}</Text>
      </View>
      <Text style={s.eventPlace} numberOfLines={2}>{place}{distance?`, ${distance}`:''}</Text>
      <Text style={s.eventTime}>{relativeTime(event.ts)}</Text>
    </Pressable>;
  })}</View>;
}

const s=StyleSheet.create({
  familyRow:{marginTop:2,marginBottom:12,flexDirection:'row',alignItems:'center',gap:12},
  memberScroll:{flex:1},emptyMemberScroll:{flexGrow:0,flexShrink:0,width:65},
  members:{flexGrow:1,justifyContent:'space-around',alignItems:'flex-start',gap:8,paddingVertical:2,paddingHorizontal:2},
  member:{width:57,alignItems:'center',gap:4,minHeight:80},
  memberName:{fontSize:11,fontWeight:'700',color:familyMapColors.ink,maxWidth:'100%'},
  memberStatus:{fontSize:10,color:familyMapColors.muted,maxWidth:'100%'},
  statusDot:{position:'absolute',right:0,bottom:0,width:11,height:11,borderRadius:6,borderWidth:2,borderColor:'#FFF'},
  addAvatar:{width:44,height:44,borderRadius:22,borderWidth:1,borderColor:'#BFD7FA',backgroundColor:'#FAFCFF',alignItems:'center',justifyContent:'center'},
  addLabel:{fontSize:10,color:familyMapColors.blue,marginTop:2,fontWeight:'500'},
  familyEmpty:{flex:1,fontSize:12,lineHeight:18,color:familyMapColors.muted,paddingRight:12},
  placeLabel:{maxWidth:170,flexDirection:'row',alignItems:'center',gap:7,backgroundColor:'#FFFFFF',borderRadius:16,paddingVertical:10,paddingHorizontal:12,borderWidth:1,borderColor:'#E1E7EF',shadowColor:'#24365D',shadowOffset:{width:0,height:4},shadowOpacity:.16,shadowRadius:8,elevation:5},
  placeText:{flexShrink:1,fontSize:14,fontWeight:'800',color:familyMapColors.ink},
  mapAction:{position:'absolute',zIndex:10,minHeight:44,backgroundColor:'#FFF',borderRadius:13,borderWidth:1,borderColor:'#DBE4EF',alignItems:'center',justifyContent:'center',shadowColor:'#24365D',shadowOffset:{width:0,height:3},shadowOpacity:.14,shadowRadius:8,elevation:5},
  mapPill:{flexDirection:'row',gap:7,paddingHorizontal:13,paddingVertical:9},mapFab:{width:44,height:44},
  mapActionText:{flexShrink:1,fontSize:13,lineHeight:19,fontWeight:'700',color:familyMapColors.blue},
  pinSpace:{padding:8},
  pin:{width:32,height:32,borderRadius:16,borderWidth:2,borderColor:'#FFF',alignItems:'center',justifyContent:'center',shadowOpacity:.55,shadowRadius:9,shadowOffset:{width:0,height:2},elevation:5},
  pinText:{fontSize:22,lineHeight:26,fontWeight:'800',color:'#FFF'},amberText:{color:'#543500'},
  events:{flexDirection:'row',gap:8,alignItems:'stretch'},
  eventCard:{flex:1,minWidth:0,minHeight:100,borderRadius:12,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#E2E8F2',paddingHorizontal:8,paddingVertical:11,shadowColor:'#254577',shadowOpacity:.07,shadowRadius:8,shadowOffset:{width:0,height:3},elevation:2},
  pressed:{opacity:.78},
  eventHeading:{flexDirection:'row',alignItems:'center',gap:5,minHeight:26},
  eventIcon:{width:22,height:22,borderRadius:11,alignItems:'center',justifyContent:'center'},
  eventTitle:{flex:1,fontSize:11,lineHeight:15,fontWeight:'800',color:familyMapColors.ink},
  eventPlace:{fontSize:10,lineHeight:15,color:familyMapColors.muted,marginTop:8},
  eventTime:{fontSize:10,lineHeight:15,color:familyMapColors.muted,marginTop:3},
  emptyCard:{flexDirection:'row',alignItems:'center',gap:11,padding:14,borderWidth:1,borderColor:familyMapColors.border,borderRadius:12,backgroundColor:'#F8FBFF'},
  emptyIcon:{width:42,height:42,borderRadius:13,backgroundColor:'#EAF2FF',alignItems:'center',justifyContent:'center'},
  emptyTitle:{fontSize:13,fontWeight:'700',color:familyMapColors.ink},
  emptyBody:{fontSize:11,lineHeight:17,color:familyMapColors.muted},
});
