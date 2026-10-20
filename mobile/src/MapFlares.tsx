import { useEffect, useRef, useState, type RefObject } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type MapView from 'react-native-maps';
import type { Region } from 'react-native-maps';
import type { Event, Point } from './api';
import { eventPoint } from './mobileState';

export function flareColor(event:Event) {
  return /rån|misshandel|våld|skott|skjut|mord|dråp|kniv|brand/i.test(event.type) ? '#FF253B' : '#FFBA08';
}

// Use native map projection so the animation stays anchored to the actual map
// coordinates on both Apple Maps and Google Maps. No animated marker snapshots.
export function MapFlares({map,events,position,region,ready,moving,height,width}:{
  map:RefObject<MapView|null>;events:Event[];position?:Point|null;region:Region;
  ready:boolean;moving:boolean;height:number;width:number;
}) {
  const pulse=useRef(new Animated.Value(0)).current;
  const focused=useIsFocused();
  const [reduced,setReduced]=useState(true),[active,setActive]=useState(AppState.currentState==='active');
  const [points,setPoints]=useState<{id:string;x:number;y:number;color:string;own:boolean}[]>([]);
  const coordinates=events.map(event=>`${event.id}:${event.location?.gps?.join(',')}:${event.type}`).join('|');
  useEffect(()=>{
    let mounted=true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(mounted)setReduced(value);}).catch(()=>{});
    const motion=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);
    const app=AppState.addEventListener('change',value=>setActive(value==='active'));
    return()=>{mounted=false;motion.remove();app.remove();};
  },[]);
  useEffect(()=>{
    if(reduced||!focused||!active||moving){pulse.setValue(0);return;}
    const animation=Animated.loop(Animated.sequence([
      Animated.timing(pulse,{toValue:1,duration:1600,easing:Easing.inOut(Easing.sin),useNativeDriver:true}),
      Animated.timing(pulse,{toValue:0,duration:1600,easing:Easing.inOut(Easing.sin),useNativeDriver:true}),
    ]));
    animation.start();return()=>animation.stop();
  },[pulse,reduced,focused,active,moving]);
  useEffect(()=>{
    let cancelled=false;
    if(!ready||moving||!width){setPoints([]);return;}
    const targets=events.flatMap(event=>{const point=eventPoint(event);return point?[{id:event.id,coordinate:point,color:flareColor(event),own:false}]:[];});
    if(position)targets.push({id:'own-position',coordinate:{latitude:position.lat,longitude:position.lon},color:'#2187F5',own:true});
    void Promise.all(targets.map(async target=>{
      try {const point=await map.current?.pointForCoordinate(target.coordinate);return point&&Number.isFinite(point.x)&&Number.isFinite(point.y)?{id:target.id,...point,color:target.color,own:target.own}:null;}
      catch {return null;}
    })).then(projected=>{if(!cancelled)setPoints(projected.filter(point=>point!==null));});
    return()=>{cancelled=true;};
  },[map,ready,moving,width,height,region.latitude,region.longitude,region.latitudeDelta,region.longitudeDelta,coordinates,position?.lat,position?.lon]);
  const radius=Math.max(30,Math.min(72,350/(region.latitudeDelta*111000)*height));
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    {points.map(point=>{
      const size=point.own?58:radius*2;
      return <Animated.View key={point.id} style={{position:'absolute',left:point.x-size/2,top:point.y-size/2,width:size,height:size,opacity:pulse.interpolate({inputRange:[0,1],outputRange:[.45,.85]}),transform:[{scale:pulse.interpolate({inputRange:[0,1],outputRange:[.85,1.15]})}]}}>
        {[1,.83,.66,.5,.34].map((scale,index)=><View key={scale} style={{position:'absolute',width:size*scale,height:size*scale,left:size*(1-scale)/2,top:size*(1-scale)/2,borderRadius:size,backgroundColor:point.color,opacity:point.own?.04:.045+index*.01}}/>)}
      </Animated.View>;
    })}
  </View>;
}
