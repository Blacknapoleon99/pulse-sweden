import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { View } from 'react-native';
import { Marker, type MapMarkerProps } from 'react-native-maps';

// Android snapshots custom marker children. Allow their first text/icon layout
// to finish before freezing that snapshot, otherwise labels can be invisible.
export function MapLabelMarker({children,...props}:MapMarkerProps){
  const marker=useRef<ComponentRef<typeof Marker>>(null),[tracking,setTracking]=useState(true);
  useEffect(()=>{
    setTracking(true);
    const timer=setTimeout(()=>{marker.current?.redraw();setTracking(false);},1000);
    return()=>clearTimeout(timer);
  },[props.title]);
  return <Marker {...props} ref={marker} tracksViewChanges={tracking}>
    <View collapsable={false} onLayout={()=>marker.current?.redraw()}>{children}</View>
  </Marker>;
}
