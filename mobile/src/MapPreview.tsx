import { Text } from './Typography';
import { useEffect, useRef } from "react";
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polygon, Polyline, type Region } from "react-native-maps";
import { polygonParts, mapFocus, destinationOnly, validAt } from "./mobileState";
import type { Event, Feature, MapItem, RouteResponse } from "./api";
import { CommunityMarkers } from './CommunityMarkers';
import type { CommunityReport } from './communityApi';
import {colors} from './theme';
import {referenceMapStyle} from './referenceMapStyle';

export const START_REGION: Region = { latitude: 59.3293, longitude: 18.0686, latitudeDelta: 0.16, longitudeDelta: 0.16 };
export type IncidentGroup = "traffic" | "violence" | "other";
export function incidentGroup(type = ""): IncidentGroup {
  if (/trafik|olycka|fordon|väg|kollision/i.test(type)) return "traffic";
  if (/misshandel|rån|våld|skott|skjut|mord|dråp|kniv/i.test(type)) return "violence";
  return "other";
}
export const incidentColors: Record<IncidentGroup, string> = { traffic: "#E39A39", violence: "#C4495D", other: "#3679C6" };
const policeAreaSource = "https://polisen.se/om-polisen/polisens-arbete/utsatta-omraden/";
function areaColor(feature: Feature) { return feature.properties.kind === "security-zone" ? "#DA7A40" : feature.properties.kind === "organized-crime-area" ? "#B05277" : "#775AB2"; }
const toMap = ([lon, lat]: number[]) => ({ latitude: lat, longitude: lon });
function eventPoint(event: Event) {
  const gps = event.location?.gps;
  return gps && Number.isFinite(gps[0]) && Number.isFinite(gps[1]) ? { latitude: gps[0], longitude: gps[1] } : null;
}
export function MapPreview({
  region = START_REGION, events = [], areas = [], items = [], route,
  destination, routeEvents = [], onExpand, openSource, height = 260, communityReports = [], onOpenReport, bare = false,
}: {
  region?: Region;
  events?: Event[];
  routeEvents?: Event[];
  areas?: Feature[];
  items?: MapItem[];
  route?: RouteResponse | null;
  destination?: { latitude: number; longitude: number; title: string } | null;
  onExpand?: () => void;
  openSource: (url?: string) => void;
  height?: number;
  communityReports?: CommunityReport[];
  onOpenReport?: (id:string)=>void;
  bare?: boolean;
}) {
  const map = useRef<MapView>(null);
  useEffect(() => {
    const coordinates = route?.geometry?.coordinates?.map(toMap) || [];
    if (coordinates.length > 1) {
      const timer = setTimeout(() => map.current?.fitToCoordinates(coordinates, { edgePadding: { top: 30, right: 30, bottom: 30, left: 30 }, animated: true }), 350);
      return () => clearTimeout(timer);
    }
    map.current?.animateToRegion(mapFocus(region, destination), 300);
  }, [route?.routeId, destination?.latitude, destination?.longitude, region.latitude, region.longitude, region.latitudeDelta, region.longitudeDelta]);
  return (
    <View style={[s.frame, { height }]}>
      <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={region} customMapStyle={referenceMapStyle} scrollEnabled={false} rotateEnabled={false} pitchEnabled={false}>
        {areas.filter(f => validAt(f.properties)).slice(0, 60).flatMap((feature, index) => polygonParts(feature).map((part, inner) => (
          <Polygon key={`${feature.id || index}-${inner}`} coordinates={part.coordinates} holes={part.holes} strokeColor={areaColor(feature)} fillColor={feature.properties.kind === "security-zone" ? "rgba(218,122,64,0.15)" : "rgba(119,90,178,0.12)"} strokeWidth={2} tappable onPress={() => openSource(feature.properties.sourceUrl || policeAreaSource)} />
        )))}
        {onOpenReport && <CommunityMarkers reports={communityReports} region={region || START_REGION} onOpen={onOpenReport} onZoom={next=>map.current?.animateToRegion(next,250)}/>}
        {route?.geometry?.coordinates?.length ? <Polyline coordinates={route.geometry.coordinates.map(toMap)} strokeColor="#2187F5" strokeWidth={5} /> : null}
        {destinationOnly(events, routeEvents).slice(0, 35).map(event => {
          const point = eventPoint(event);
          return point ? <Marker key={event.id} coordinate={point} title={event.type || "Polisnotis"} description={(route ? "Vid målet · " : "") + new Date(event.ts).toLocaleString("sv-SE") + " · ungefärlig områdespunkt"} pinColor={incidentColors[incidentGroup(event.type)]} onCalloutPress={() => openSource(event.url)} /> : null;
        })}
        {routeEvents.map(event => {
          const point = eventPoint(event);
          return point ? <Marker key={"route-" + event.id} coordinate={point} title={"Längs rutten · " + event.type} description={new Date(event.ts).toLocaleString("sv-SE") + " · ungefärlig områdespunkt"} pinColor="#5634A5" onCalloutPress={() => openSource(event.url)} /> : null;
        })}
        {items.filter(item => validAt(item.properties)).slice(0, 35).map(item => <Marker key={`reviewed-${item.id}`} coordinate={toMap(item.geometry.coordinates)} title={item.properties.title} description={`Cajklops-granskad kartpost · gäller till ${new Date(item.properties.validTo).toLocaleDateString("sv-SE")} · öppna källa`} pinColor="#258A77" onCalloutPress={() => openSource(item.properties.sourceUrl)} />)}
        {destination && <Marker coordinate={destination} title={destination.title} pinColor="#2187F5" />}
      </MapView>
      {onExpand && <Pressable style={s.expand} onPress={onExpand} accessibilityRole="button" accessibilityLabel="Öppna större karta"><Ionicons name="expand-outline" size={17} color="#2187F5" /><Text style={s.expandText}>Stor karta</Text></Pressable>}
      {!bare&&<View style={s.mapLabel}><Text style={s.mapLabelText}>{communityReports.length ? 'KARTA · MYNDIGHETSKÄLLOR OCH OB­EKRÄFTADE RAPPORTER' : 'KARTA · MYNDIGHETSKÄLLOR'}</Text></View>}
    </View>
  );
}
export function MapLegend({prototype=false}:{prototype?:boolean}={}) {
  const entries=prototype?[["Polisnotis","#DC8654"],["Polisområde","#675BBB"],["Säkerhetszon","#D86B42"],["Nätverksområde","#B05277"],["Granskad post","#258A77"],["Ruttrapport","#5634A5"],["Rutt / mål","#2187F5"]]:[["Trafik",incidentColors.traffic],["Våld",incidentColors.violence],["Övrigt",incidentColors.other],["Polisområde","#775AB2"],["Säkerhetszon","#DA7A40"],["Nätverksområde","#B05277"],["Granskad post","#258A77"],["Ruttrapport","#5634A5"],["Rutt / mål","#2187F5"]];
  return <View style={s.legend}>
    <View style={s.legendItem}><View style={[s.legendDot,{backgroundColor:'#fff',borderWidth:2,borderColor:colors.community}]}/><Text style={s.legendText}>Obekräftad användarrapport · ungefärlig plats</Text></View>
    {entries.map(([label, color]) =>
      <View key={label} style={s.legendItem}><View style={[s.legendDot,{ backgroundColor: color }]} /><Text style={s.legendText}>{label}</Text></View>
    )}
  </View>;
}
const s = StyleSheet.create({
  frame: { borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#DDE7F1", backgroundColor: "#E9EFF4" },
  expand: { position: "absolute", right: 10, top: 10, backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 },
  expandText: { color: "#2187F5", fontWeight: "800", fontSize: 11 },
  mapLabel: { position: "absolute", left: 9, bottom: 9, backgroundColor: "#FFFFFFEA", borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 },
  mapLabelText: { color: "#49627B", fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 9, marginBottom: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: "#637489", fontSize: 10 },
});
