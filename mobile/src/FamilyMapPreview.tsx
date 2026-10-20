import { Text } from './Typography';
import {Fragment,useEffect,useRef,useState} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MapView,{Marker,Polyline,type Region} from 'react-native-maps';
import {useFamily} from './FamilyState';
import {positionFresh} from './mobileState';
import {familyTrailSegments} from './familyTrails';

const palette=['#2187F5','#675DBA','#258A77','#C46E45','#B05277'];
export function FamilyMapPreview({region,onOpen,onInteraction}:{region:Region;onOpen:()=>void;onInteraction?:(active:boolean)=>void}){
  const family=useFamily(),map=useRef<MapView>(null),[ready,setReady]=useState(false);
  const manual=useRef(false),identity=`${family.overview?.user.id||''}:${family.overview?.family?.id||''}`;
  useEffect(()=>{manual.current=false;},[identity]);
  const members=(family.overview?.members||[]).filter(member=>member.sharing&&(positionFresh(member,family.clock)||family.trails[member.id]?.length));
  const sharing=family.liveSharing||family.overview?.members.some(member=>member.id===family.overview?.user.id&&member.sharing);
  const coordinates=members.flatMap(member=>family.trails[member.id]||[]);
  const fitKey=coordinates.map(point=>`${point.latitude},${point.longitude}`).join(';');
  // Fit only when the visible positions change, including the first native map render.
  const lastFit=useRef('');
  function fit(){
    if(!coordinates.length)return;
    const latitudes=coordinates.map(point=>point.latitude),longitudes=coordinates.map(point=>point.longitude);
    const small=Math.max(...latitudes)-Math.min(...latitudes)<.005&&Math.max(...longitudes)-Math.min(...longitudes)<.005;
    if(small)map.current?.animateToRegion({...region,latitude:(Math.max(...latitudes)+Math.min(...latitudes))/2,longitude:(Math.max(...longitudes)+Math.min(...longitudes))/2,latitudeDelta:.015,longitudeDelta:.015},0);
    else map.current?.fitToCoordinates(coordinates,{edgePadding:{top:36,right:36,bottom:36,left:36},animated:false});
    lastFit.current=fitKey;
  }
  useEffect(()=>{if(ready&&!manual.current&&lastFit.current!==fitKey)fit();},[ready,fitKey,identity]);
  return <View style={s.card}>
    <View style={s.frame}>
      <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={region} onMapReady={()=>setReady(true)} onTouchStart={()=>{manual.current=true;onInteraction?.(true);}} onTouchEnd={()=>onInteraction?.(false)} onTouchCancel={()=>onInteraction?.(false)} onPanDrag={()=>{manual.current=true;}} scrollEnabled zoomEnabled rotateEnabled={false} pitchEnabled={false} toolbarEnabled={false}>
        {members.map((member,index)=>{
          const color=palette[index%palette.length],points=family.trails[member.id]||[];
          const fresh=positionFresh(member,family.clock),last=points.at(-1);
          const point=fresh?{latitude:member.lat!,longitude:member.lon!}:last;
          if(!point)return null;
          return <Fragment key={member.id}>
            {familyTrailSegments(points).map((segment,index)=><Polyline key={index} coordinates={segment} strokeColor={color} strokeWidth={3}/>)}
            <Marker coordinate={point} title={member.display_name} description={`${fresh?'Delad plats':'Senast delad plats'} · ${new Date(fresh?member.updated_at!:last!.at).toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'})}`} pinColor={fresh?color:'#8494A7'}/>
          </Fragment>;
        })}
      </MapView>
      {!members.length&&<View pointerEvents="none" style={s.overlay}><Text style={s.empty}>{!family.overview?'Logga in för att se familjens delade platser.':!family.overview.family?'Skapa eller gå med i en familj.':'Inga delade platser under de senaste sex timmarna.'}</Text></View>}
      <View style={s.actions}><Pressable style={s.expand} accessibilityRole="button" accessibilityLabel="Visa hela familjens rörelser på kartan" onPress={()=>{manual.current=false;fit();}}><Text style={s.link}>Visa alla</Text></Pressable><Pressable style={s.expand} accessibilityRole="button" accessibilityLabel="Öppna familjekartan" onPress={onOpen}><Text style={s.link}>Öppna karta ↗</Text></Pressable></View>
    </View>
    <Text style={s.note}>Dra och zooma kartan · rörelser senaste 6 timmarna. Grå markör visar en äldre delad plats.</Text>
    {members.map((member,index)=><View key={member.id} style={s.member}><View style={[s.dot,{backgroundColor:palette[index%palette.length]}]}/><Text style={s.name}>{member.display_name}</Text><Text style={s.note}>{new Date(positionFresh(member,family.clock)?member.updated_at!:family.trails[member.id].at(-1)!.at).toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'})}</Text></View>)}
    {family.overview?.family&&!family.overview.positionHistory&&<Text style={s.note}>Servern saknar sex timmars historik. Visar platser som hämtats under denna session.</Text>}
    {!!family.overview?.family&&<Pressable style={s.share} disabled={family.liveBusy} accessibilityRole="button" onPress={()=>void(sharing?family.stopLiveSharing():family.startLiveSharing())}><Text style={s.link}>{family.liveBusy?'Vänta…':sharing?'Stoppa platsdelning':'Dela min liveplats när appen är öppen'}</Text></Pressable>}
    {!!(family.error||family.liveError)&&<Text style={s.error}>{family.liveError||family.error}</Text>}
  </View>;
}

const s=StyleSheet.create({
  card:{backgroundColor:'#fff',borderRadius:9,borderWidth:1,borderColor:'#E7EDF5',padding:10,marginBottom:17,gap:8},
  frame:{height:190,borderRadius:12,overflow:'hidden',backgroundColor:'#EAF0F8'},
  overlay:{position:'absolute',right:10,bottom:10,left:10,borderRadius:10,alignItems:'center',justifyContent:'center',padding:12,backgroundColor:'#FFFFFFED'},
  empty:{color:'#72788D',fontSize:12,textAlign:'center'},
  actions:{position:'absolute',right:8,top:8,flexDirection:'row',gap:6},
  expand:{backgroundColor:'#fff',padding:10,borderRadius:10,minHeight:44,justifyContent:'center'},
  link:{color:'#2187F5',fontSize:12,fontWeight:'700'},
  note:{color:'#72788D',fontSize:11,lineHeight:16},
  member:{flexDirection:'row',alignItems:'center',gap:7},dot:{width:8,height:8,borderRadius:4},
  name:{flex:1,color:'#11152A',fontSize:12,fontWeight:'600'},
  share:{minHeight:44,justifyContent:'center',backgroundColor:'#E8F2FF',borderRadius:10,paddingHorizontal:10},
  error:{color:'#B53C4A',fontSize:11},
});
