import { Text, TextInput } from './Typography';
import {useEffect,useMemo,useRef,useState} from 'react';
import { FlatList, Linking, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {BlurView} from 'expo-blur';
import MapView,{Marker,Polygon,Polyline} from 'react-native-maps';
import {useAppData,useFeedInterest} from './AppData';
import type {AreasResponse,Event,EventsResponse,MapItemsResponse,ZonesResponse} from './api';
import type {RootStackParams} from './navigation';
import {useReadingList} from './useReadingList';
import {Freshness} from './UI';
import {PrototypeMapHeader,PrototypeTabs} from './PrototypeChrome';
import {prototypeMapStyles as s} from './PrototypeMapStyles';
import {eventPoint,km,polygonParts,validAt} from './mobileState';
import {useVisibleClock} from './useVisibleClock';
import {useMapCommunity} from './useMapCommunity';
import {CommunityMarkers} from './CommunityMarkers';
import {categoryNames,categoryStyle} from './communityApi';
import Ionicons from '@expo/vector-icons/Ionicons';
import {categoryOf} from './incidentSummary';
import {relativeTime} from './ReferenceKit';

const categories={
  robbery:{label:'Rån',pattern:/rån/i},
  violence:{label:'Våldsbrott',pattern:/misshandel|våld|skott|skjut|mord|dråp|kniv/i},
  'traffic-accident':{label:'Trafikolyckor',pattern:/trafikolycka|kollision/i},
};
type Props=NativeStackScreenProps<RootStackParams,'events'>;
export function EventsScreen({route,navigation}:Props){
  const data=useAppData(),inset=useSafeAreaInsets(),focused=useIsFocused(),{height}=useWindowDimensions();
  useFeedInterest(['events','areas','zones','mapItems']);
  const map=useRef<MapView>(null),list=useRef<FlatList<Event>>(null),clock=useVisibleClock(30_000);
  const {region,position,showAreas,showEvents,showCommunity}=data;
  // Synchronize only on a tab return; feed arrivals never move the camera.
  useEffect(()=>{if(focused)map.current?.animateToRegion(region,0);},[focused]);
  const community=useMapCommunity(region,showCommunity);
  const feed=data.feeds.events,response=feed.data as EventsResponse|null;
  const [query,setQuery]=useState(''),[filterOpen,setFilterOpen]=useState(false),category=route.params?.category;
  const around=position?{latitude:position.lat,longitude:position.lon}:region;
  const filtered=useMemo(()=>[...(response?.events||[])].filter(event=>{
    const point=eventPoint(event);
    return point&&km(around,point)<35&&(!category||categories[category].pattern.test(event.type))&&
      (event.name+' '+event.type+' '+event.summary).toLocaleLowerCase('sv-SE').includes(query.toLocaleLowerCase('sv-SE'));
  }).sort((a,b)=>b.ts-a.ts),[response,around.latitude,around.longitude,query,category]);
  const reading=useReadingList(filtered);
  const visibleEvents=(response?.events||[]).filter(event=>{const point=eventPoint(event);return point&&km(region,point)<Math.max(28,region.latitudeDelta*170);}).slice(0,40);
  const areas=data.feeds.areas.data as AreasResponse|null,zones=data.feeds.zones.data as ZonesResponse|null;
  const visibleAreas=[...(areas?.features||[]),...(zones?.features||[])].filter(feature=>{
    const first=polygonParts(feature)[0]?.coordinates[0];return validAt(feature.properties,clock)&&first&&km(region,first)<Math.max(60,region.latitudeDelta*180);
  }).slice(0,80);
  const reviewed=((data.feeds.mapItems.data as MapItemsResponse|null)?.features||[]).filter(item=>validAt(item.properties,clock)).slice(0,100);
  const open=(url?:string)=>{if(url?.startsWith('https://'))void Linking.openURL(url).catch(()=>{});};
  function resetReading(){reading.setAtTop(true);list.current?.scrollToOffset({offset:0,animated:false});}
  return <View style={s.root}>
    <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={region} onRegionChangeComplete={data.setRegion} showsUserLocation={!!position} onLongPress={event=>navigation.navigate('compose',{lat:event.nativeEvent.coordinate.latitude,lon:event.nativeEvent.coordinate.longitude})}>
      {showAreas&&visibleAreas.flatMap(feature=>polygonParts(feature).map((part,index)=><Polygon key={(feature.id||feature.properties.name)+'-'+index} coordinates={part.coordinates} holes={part.holes} strokeWidth={2} strokeColor={feature.properties.kind==='security-zone'?'#D86B42':feature.properties.kind==='organized-crime-area'?'#B05277':'#675BBB'} fillColor={feature.properties.kind==='security-zone'?'rgba(216,107,66,0.16)':'rgba(103,91,187,0.12)'}/>))}
      {showEvents&&visibleEvents.map(event=><Marker key={event.id} coordinate={eventPoint(event)!} title={event.type+' · '+event.name} description="Ungefärlig områdespunkt" pinColor="#DC8654" onCalloutPress={()=>open(event.url)}/>)}
      {reviewed.map(item=><Marker key={'reviewed-'+item.id} coordinate={{latitude:item.geometry.coordinates[1],longitude:item.geometry.coordinates[0]}} title={item.properties.title} description="Cajklops-granskad kartpost · kontrollera källan" pinColor="#258A77" onCalloutPress={()=>open(item.properties.sourceUrl)}/>)}
      {showCommunity&&<CommunityMarkers reports={community.items} region={region} onOpen={id=>navigation.navigate('report',{id})} onZoom={next=>map.current?.animateToRegion(next,250)}/>}
      {!!data.route?.geometry?.coordinates.length&&<Polyline coordinates={data.route.geometry.coordinates.map(([longitude,latitude])=>({latitude,longitude}))} strokeColor="#2187F5" strokeWidth={5}/>}
    </MapView>
    <PrototypeMapHeader loading={feed.loading} onRefresh={()=>void data.refresh()}/>
    {showCommunity&&<View pointerEvents="box-none" style={{position:'absolute',left:12,right:12,top:inset.top+64,gap:8}}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:6}}>{(Object.keys(categoryStyle) as (keyof typeof categoryStyle)[]).map(key=><View key={key} style={{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:10,minHeight:30,borderRadius:15,backgroundColor:'#101D35',borderWidth:2,borderColor:'#fff'}}><View style={{width:14,height:14,borderRadius:7,backgroundColor:categoryStyle[key].color,borderWidth:1.5,borderColor:'#fff'}}/><Text style={{color:'#fff',fontSize:12,fontWeight:'800'}}>{categoryNames[key]}</Text></View>)}</ScrollView>
      <Pressable accessibilityRole="button" accessibilityLabel="Rapportera en händelse på kartan" onPress={()=>navigation.navigate('compose',{lat:region.latitude,lon:region.longitude})} style={{alignSelf:'flex-end',flexDirection:'row',alignItems:'center',gap:8,minHeight:48,paddingHorizontal:16,borderRadius:24,backgroundColor:'#FF1744',borderWidth:3,borderColor:'#fff',elevation:8}}><Ionicons name="add-circle" size={24} color="#fff"/><Text style={{color:'#fff',fontWeight:'900',fontSize:15}}>Rapportera här</Text></Pressable>
    </View>}
    <View style={[s.panelWrap,{bottom:inset.bottom+77}]}><View style={s.glass}>
      {Platform.OS==='ios'&&<BlurView intensity={75} tint="light" style={StyleSheet.absoluteFill}/>}
      <View style={s.panel}><FlatList ref={list} style={[s.scroll,{maxHeight:Math.min(330,Math.max(150,height-inset.top-inset.bottom-210))}]} data={reading.items} keyExtractor={item=>item.id}
        maintainVisibleContentPosition={{minIndexForVisible:0}} keyboardShouldPersistTaps="handled" initialNumToRender={12} windowSize={5}
        onScroll={event=>reading.setAtTop(event.nativeEvent.contentOffset.y<20)} scrollEventThrottle={100}
        refreshing={feed.loading} onRefresh={()=>void data.store.refresh('events',true)}
        ListHeaderComponent={<>
          <Text style={s.kicker}>HÄNDELSER</Text>
          <Text style={s.title}>Nära {position?'din plats':'kartans mitt'}</Text>
          <Text style={s.body}>Publicerade polisnotiser inom cirka 35 km. Tryck för originalkällan.</Text>
          {!!feed.error&&<Text style={s.warning}>{response?.fetchedAt?'Visar äldre uppgifter från '+new Date(response.fetchedAt).toLocaleString('sv-SE'):'Polisflödet är inte tillgängligt'} · {feed.error}</Text>}
          {category&&<Pressable hitSlop={12} accessibilityRole="button" onPress={()=>{resetReading();navigation.setParams({category:undefined});}}><Text style={s.link}>{categories[category].label} · visa alla kategorier</Text></Pressable>}
          {filterOpen&&<View>
            <TextInput accessibilityLabel="Filtrera polisnotiser" style={[s.input,{marginTop:10}]} value={query} onChangeText={value=>{resetReading();setQuery(value);}} placeholder="Sök ort eller kategori"/>
            <View style={[s.chips,{flexWrap:'wrap'}]}>{Object.entries(categories).map(([id,item])=><Pressable key={id} style={[s.chip,category===id&&s.chipOn]} accessibilityRole="button" accessibilityState={{selected:category===id}} onPress={()=>{resetReading();navigation.setParams({category:category===id?undefined:id as keyof typeof categories});}}><Text style={[s.chipText,category===id&&s.chipTextOn]}>{item.label}</Text></Pressable>)}</View>
          </View>}
          {!!reading.pending.length&&<Pressable style={s.routeLink} accessibilityRole="button" onPress={()=>{reading.apply();resetReading();}}><Text style={s.link}>Visa nya uppdateringar ({reading.pending.length})</Text></Pressable>}
        </>}
        renderItem={({item})=>{const category=categoryOf(item.type);return <Pressable style={[s.item,{flexDirection:'row',gap:10}]} accessibilityRole="button" onPress={()=>open(item.url)}>
          <View style={{width:32,height:32,borderRadius:9,alignItems:'center',justifyContent:'center',backgroundColor:`${category.color}1F`}}><Ionicons name={category.icon as any} size={17} color={category.color}/></View>
          <View style={{flex:1}}>
            <Text style={s.itemTitle}>{item.type} · {item.name} ↗</Text>
            <Text style={s.body} numberOfLines={2}>{item.summary}</Text>
            <Text style={s.meta}>{item.location?.name||'Område'} · {relativeTime(item.ts)}</Text>
          </View>
        </Pressable>;}}
        ListEmptyComponent={<Text style={s.empty}>{feed.loading&&!response?'Hämtar polisnotiser…':!response?'Polisflödet är inte tillgängligt. Försök uppdatera.':'Inga notiser matchar området i tillgängliga data. Det är ingen garanti för säkerhet.'}</Text>}
        ListFooterComponent={<>
          <Pressable hitSlop={12} accessibilityRole="button" accessibilityState={{expanded:filterOpen}} onPress={()=>setFilterOpen(!filterOpen)}><Text style={s.link}>{filterOpen?'Dölj sök och filter':'Sök och filtrera'}</Text></Pressable>
          <Freshness fetchedAt={response?.fetchedAt} error={feed.error}/>
          {!!community.error&&<Text style={s.warning}>Användarrapporter är fördröjda · {community.error}</Text>}
        </>}/>
      </View>
    </View></View>
    <PrototypeTabs/>
  </View>;
}
