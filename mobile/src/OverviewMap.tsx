import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import MapView, {
  Circle,
  Marker,
  Polyline,
  type Region,
} from "react-native-maps";
import type { Event, Point, RouteResponse } from "./api";
import { useFamily } from "./FamilyState";
import { eventPoint, positionFresh } from "./mobileState";
import { familyTrailSegments } from "./familyTrails";
import { IncidentHeat, MapFab, MapPill, PlaceLabel, distanceLabel } from "./ReferenceKit";
import { colors } from "./theme";
import {referenceMapStyle} from './referenceMapStyle';
import { closestEvents, eventsInViewport } from './homeMapState';
import { savedPlaceLabels, useSavedPlaces, type PlaceKey } from './savedPlaces';
import {MapLabelMarker} from './MapLabelMarker';
import {MapFlares} from './MapFlares';
import {FamilyIncidentHeat,FamilyPlaceLabel,FamilyMapFab,FamilyMapPill,familyMapStyle} from './FamilyMapDetails';
export function OverviewMap({
  region,
  events = [],
  position,
  onOpenEvent,
  onLocate,
  onOpenPlace,
  onEditPlaces,
  onExpand,
  locked=false,
  route,
  onInteraction,
  height = 250,
  appearance = 'default',
}: {
  region: Region;
  events?: Event[];
  position?: Point | null;
  onOpenEvent?: (event: Event) => void;
  onLocate?: () => void;
  onOpenPlace?: (address:string) => void;
  onEditPlaces?: () => void;
  onExpand?: () => void;
  locked?: boolean;
  route?: RouteResponse|null;
  onInteraction?: (active: boolean) => void;
  height?: number;
  appearance?: 'default'|'family';
}) {
  const family = useFamily(),
    map = useRef<MapView>(null);
  const {coordinates:saved}=useSavedPlaces();
  const [ready,setReady]=useState(false),[viewport,setViewport]=useState(region);
  const [moving,setMoving]=useState(false),[width,setWidth]=useState(0);
  useEffect(() => {
    if(ready){setViewport(region);map.current?.animateToRegion(region,0);}
  }, [ready,region.latitude,region.longitude,region.latitudeDelta,region.longitudeDelta]);
  const close=eventsInViewport(events,viewport);
  const nearest=closestEvents(events,position||{lat:region.latitude,lon:region.longitude},1)[0];
  const zones=family.overview?.zones||[];
  const Place=appearance==='family'?FamilyPlaceLabel:PlaceLabel;
  const Heat=appearance==='family'?FamilyIncidentHeat:IncidentHeat;
  const Fab=appearance==='family'?FamilyMapFab:MapFab;
  const Pill=appearance==='family'?FamilyMapPill:MapPill;
  const localPlaces=(Object.keys(saved) as PlaceKey[]).filter(key=>!zones.some(zone=>zone.name===savedPlaceLabels[key]&&Math.abs(zone.lat-saved[key]!.lat)<.0002&&Math.abs(zone.lon-saved[key]!.lon)<.0002));
  return (
    <View style={[s.frame,appearance==='family'&&s.familyFrame, { height }]} onLayout={event=>setWidth(event.nativeEvent.layout.width)}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        customMapStyle={appearance==='family'?familyMapStyle:referenceMapStyle}
        userInterfaceStyle={appearance==='family'?'light':undefined}
        mapType="standard"
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        scrollEnabled={!locked}
        zoomEnabled={!locked}
        onMapReady={()=>setReady(true)}
        onRegionChange={()=>setMoving(true)}
        onRegionChangeComplete={next=>{setViewport(next);setMoving(false);}}
        onTouchStart={() => onInteraction?.(true)}
        onTouchEnd={() => onInteraction?.(false)}
        onTouchCancel={() => onInteraction?.(false)}
      >
        <Heat events={close} onOpen={onOpenEvent} />
        {!!route?.geometry.coordinates.length&&<Polyline coordinates={route.geometry.coordinates.map(([longitude,latitude])=>({latitude,longitude}))} strokeColor={colors.blue} strokeWidth={3} lineCap="round" lineJoin="round"/>}
        {localPlaces.map(key=><MapLabelMarker key={`saved-${key}`} coordinate={{latitude:saved[key]!.lat,longitude:saved[key]!.lon}} title={savedPlaceLabels[key]} description={saved[key]!.address} onCalloutPress={()=>onOpenPlace?.(saved[key]!.address)}>
          <Place name={savedPlaceLabels[key]}/>
        </MapLabelMarker>)}
        {zones.map(zone=><Circle key={`zone-halo-${zone.id}`} center={{latitude:zone.lat,longitude:zone.lon}} radius={zone.radius} strokeWidth={1} strokeColor={zone.kind==='watch'?'#F7BE2138':'#29B96338'} fillColor={zone.kind==='watch'?'#F7BE2118':'#29B96318'}/>)}
        {(family.overview?.zones || []).map((zone) => (
          <MapLabelMarker
            key={`zone-${zone.id}`}
            coordinate={{ latitude: zone.lat, longitude: zone.lon }}
            title={zone.name}
            description="Familjens valda plats"
          >
            <Place name={zone.name} kind={zone.kind} />
          </MapLabelMarker>
        ))}
        {(family.overview?.members || [])
          .filter(
            (member) => member.sharing && positionFresh(member, family.clock),
          )
          .map((member) => (
            <Marker
              key={`member-${member.id}`}
              coordinate={{ latitude: member.lat!, longitude: member.lon! }}
              title={member.display_name}
              description="Frivilligt delad plats"
              pinColor={colors.blue}
            />
          ))}
        {Object.entries(family.trails).flatMap(([id, trail]) =>
          family.overview?.members.some(
            (member) => member.id === id && member.sharing,
          )
            ? familyTrailSegments(trail).map((segment, index) => (
                <Polyline
                  key={`${id}-${index}`}
                  coordinates={segment}
                  strokeWidth={3}
                  strokeColor="#2B6CF699"
                />
              ))
            : [],
        )}
        {position && (
          <>
          <Circle
            center={{ latitude: position.lat, longitude: position.lon }}
            radius={60}
            strokeColor={colors.blue}
            fillColor="#2B6CF62A"
          />
          <MapLabelMarker coordinate={{latitude:position.lat,longitude:position.lon}} title="Din plats" anchor={{x:.5,y:.5}} zIndex={100}>
            <View style={[s.positionDot,appearance==='family'&&s.familyPositionDot]}/>
          </MapLabelMarker>
          </>
        )}
      </MapView>
      <MapFlares map={map} events={close} position={position} region={viewport} ready={ready} moving={moving} height={height} width={width}/>
      {onLocate && (
        <Fab
          icon="navigate"
          label="Visa min plats"
          onPress={()=>{if(position){setViewport(region);map.current?.animateToRegion(region,0);}onLocate();}}
          style={{ right: 10, top: 10 }}
        />
      )}
      {!close.length&&nearest&&<Pill icon="alert-circle-outline" label={`Närmaste notis · ${distanceLabel(nearest,position||{lat:region.latitude,lon:region.longitude})}`} style={{left:9,bottom:appearance==='family'&&onExpand?64:9,right:9}} onPress={()=>{
        const point=eventPoint(nearest);
        if(point)map.current?.fitToCoordinates([{latitude:position?.lat??region.latitude,longitude:position?.lon??region.longitude},point],{edgePadding:{top:45,right:35,bottom:45,left:35},animated:true});
      }}/>}
      {!localPlaces.length&&!zones.length&&onEditPlaces&&<Pill icon="home-outline" label="Lägg till Hem, Skola och Jobb" onPress={onEditPlaces} style={{left:9,top:9,right:appearance==='family'?64:54}}/>}
      {onExpand&&<Pill icon="map-outline" label="Familjekarta" onPress={onExpand} style={{right:10,bottom:10}}/>}
    </View>
  );
}
const s = StyleSheet.create({
  familyFrame:{borderRadius:16,borderColor:'#E0E8EC',backgroundColor:'#EFF3EE'},
  familyPositionDot:{width:24,height:24,borderRadius:12,backgroundColor:'#0877F9',shadowColor:'#0877F9',shadowRadius:8},
  positionDot:{width:22,height:22,borderRadius:11,backgroundColor:'#0864D9',borderWidth:3,borderColor:'#fff',shadowColor:'#102C57',shadowOpacity:.5,shadowRadius:5,elevation:4},
  frame: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#E8EFF6",
    borderWidth: 1,
    borderColor: '#8EA5BC',
  },
});
