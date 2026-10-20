import { Text, TextInput } from './Typography';
import { useEffect, useRef, useState } from "react";
import Ionicons from '@expo/vector-icons/Ionicons';
import * as SecureStore from "expo-secure-store";
import { Pressable, StyleSheet, View } from 'react-native';
import { calculateRoute, geocode, type EventsResponse, type Feature, type MapItem, type Point, type RouteResponse } from "./api";
import { latestRequest, passageId, feedAvailable, validAt } from "./mobileState";
import { incidentGroup, MapLegend, MapPreview, START_REGION, type IncidentGroup } from "./MapPreview";
import { IncidentBars } from './IncidentBars';
import { Freshness } from './UI';

const blue = "#2187F5", ink = "#11152A", muted = "#61748A";
function km(a: Point, b: Point) {
  const rad = Math.PI / 180, dLat = (a.lat - b.lat) * rad, dLon = (a.lon - b.lon) * rad;
  return 12742 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2));
}
function date(ts: number) { return new Date(ts).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
export function RouteExploreScreen({
  events, areas, items, initialTo, locate, openSource, onExpand,
}: {
  events: EventsResponse | null; areas: Feature[]; items: MapItem[]; initialTo: string;
  locate: () => Promise<Point | null>;
  openSource: (url?: string) => void;
  onExpand: (route: RouteResponse) => void;
}) {
  const [from, setFrom] = useState(""), [to, setTo] = useState(initialTo);
  const [gps, setGps] = useState(false), [advanced, setAdvanced] = useState(false);
  const [mode, setMode] = useState<"walking" | "driving">("walking");
  const [filter, setFilter] = useState<"all" | IncidentGroup>("all");
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [destination, setDestination] = useState<{ latitude: number; longitude: number; title: string } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [saved, setSaved] = useState<Record<string,string>>({});
  useEffect(() => { setTo(initialTo); }, [initialTo]);
  useEffect(() => { SecureStore.getItemAsync("tryggpuls-saved-places").then(raw => { if (raw) setSaved(JSON.parse(raw)); }).catch(() => {}); }, []);
  const searches = useRef(latestRequest()).current;
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => { searches.invalidate(); abort.current?.abort(); }, []);
  function invalidate() { searches.invalidate(); abort.current?.abort(); setBusy(false); setRoute(null); setDestination(null); }
  async function search() {
    const request = searches.next();
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError(""); setRoute(null); setDestination(null);
    try {
      if (!to.trim() || (!gps && !from.trim())) throw new Error("Ange både start och mål, eller välj min plats som start.");
      const [start, target] = await Promise.all([
        gps ? locate() : geocode(from, controller.signal).then(result => result.results[0]),
        geocode(to, controller.signal).then(result => result.results[0]),
      ]);
      if (gps && !start) throw new Error("Platsen kunde inte hämtas. Ange en startadress eller tillåt platsåtkomst.");
      if (!start || !target) throw new Error("En adress kunde inte hittas. Prova en tydligare svensk adress.");
      const next = await calculateRoute(start,target,mode,controller.signal);
      if (!searches.current(request)) return;
      setRoute(next);
      setDestination({ latitude: target.lat, longitude: target.lon, title: target.displayName || to });
    } catch (caught) { if (!searches.current(request)) return; setError(caught instanceof Error ? caught.message : "Rutten kunde inte hämtas."); }
    finally { if (searches.current(request)) setBusy(false); }
  }
  const point = destination && { lat: destination.latitude, lon: destination.longitude };
  const nearby = point ? (events?.events || []).filter(event => event.location?.gps && km(point,{ lat: event.location.gps[0], lon: event.location.gps[1] }) <= 10).sort((a,b) => b.ts - a.ts) : [];
  const shown = nearby.filter(event => filter === "all" || incidentGroup(event.type) === filter);
  const officialItems = items.filter(item => validAt(item.properties) && point && km(point, { lat: item.geometry.coordinates[1], lon: item.geometry.coordinates[0] }) <= 10);
  const routeAreas = route ? [...(route.policeAreaPassages || []), ...(route.securityZonePassages || []), ...(route.networkAreaPassages || [])].sort((a,b) => a.startMeters - b.startMeters) : [];
  const routeAreaIds = new Set(routeAreas.map(area => area.id));
  const mapAreas = route ? areas.filter(area => routeAreaIds.has(passageId(area)) && validAt(area.properties)).slice(0,60) : [];
  const servicePlaces = officialItems.filter(item => item.properties.kind === "service-point");
  return <View>
    <View style={s.hero}><View style={s.heroIcon}><Ionicons name="person-outline" size={24} color={ink}/></View><Text style={s.heading}>Vart vill du gå?</Text></View>
    <Text style={s.note}>Sök en svensk adress. Kartan visar rutten, publicerade områden och tillgängliga notiser.</Text>
    <TextInput accessibilityLabel="Måladress" style={s.input} placeholder="Sök adress eller plats" value={to} onChangeText={text => { invalidate(); setTo(text); }} returnKeyType="search" onSubmitEditing={search} />
    <Pressable style={s.advancedButton} onPress={() => setAdvanced(!advanced)} accessibilityRole="button" accessibilityState={{expanded:advanced}}><Ionicons name="options-outline" size={18} color={blue} /><Text style={s.link}>Avancerad sökning {advanced ? "⌃" : "⌄"}</Text></Pressable>
    <View style={s.startRow}>
      <TextInput accessibilityLabel="Startadress" style={[s.input,{ flex: 1, marginBottom: 0 }]} placeholder="Startadress" value={from} onChangeText={text => { invalidate(); setFrom(text); }} editable={!gps} />
      <Pressable style={[s.smallButton,gps && s.smallButtonOn]} onPress={() => { invalidate(); setGps(!gps); }} accessibilityRole="button"><Ionicons name="locate-outline" size={17} color={gps ? "#fff" : blue} /><Text style={[s.smallText,gps && {color:"#fff"}]}>Min plats</Text></Pressable>
    </View>
    {advanced && <View style={s.advanced}>
      <Text style={s.subTitle}>Resesätt</Text><View style={s.row}>{([ ["walking","Gång"],["driving","Bil"] ] as const).map(([value,label]) => <Pressable key={value} style={[s.chip,mode===value && s.chipOn]} onPress={() => { invalidate(); setMode(value); }}><Text style={[s.chipText,mode===value && s.chipTextOn]}>{label}</Text></Pressable>)}</View>
      <Text style={s.subTitle}>Publicerade notiser vid målet</Text><View style={s.row}>{([ ["all","Alla"],["traffic","Trafik"],["violence","Våld"],["other","Övrigt"] ] as const).map(([value,label]) => <Pressable key={value} style={[s.chip,filter===value && s.chipOn]} onPress={() => setFilter(value)}><Text style={[s.chipText,filter===value && s.chipTextOn]}>{label}</Text></Pressable>)}</View>
    </View>}
    <Pressable style={s.primary} onPress={search} disabled={busy} accessibilityRole="button"><Text style={s.primaryText}>{busy ? "Söker rutt…" : "Visa rutt"}</Text></Pressable>
    {!!error && <Text style={s.error}>{error}</Text>}
    <Text style={s.section}>Karta och händelser</Text>
    <MapPreview region={destination ? { ...destination, latitudeDelta: 0.12, longitudeDelta: 0.12 } : START_REGION} route={route} destination={destination} events={shown} routeEvents={route?.incidentsNearRoute || []} areas={mapAreas} items={officialItems} height={300} openSource={openSource} onExpand={route ? () => onExpand(route) : undefined} />
    <MapLegend /><Text style={s.note}>Lila nålar: rapporter längs rutten. Kategorifärgade nålar: andra rapporter inom 10 km från målet.</Text>
    {route && <View style={s.summary}><Text style={s.summaryTitle}>{route.distanceKm} km · {route.durationMinutes} min</Text><Text style={s.note}>{route.incidentsCount} publicerade polisnotiser nära rutten. Händelser kan vara fördröjda och punkterna är ungefärliga.</Text>{route.eventsStale && <Text style={s.note}>Polisflödet är äldre än väntat; kontrollera originalkällan.</Text>}</View>}
    {route && <><Text style={s.section}>Rapporter nära rutten</Text>{route.incidentsNearRoute?.length ? route.incidentsNearRoute.slice(0,8).map(event => <Pressable key={event.id} style={s.listItem} onPress={() => openSource(event.url)}><Text style={s.itemTitle}>{event.type || "Polisnotis"} · {event.name}</Text><Text style={s.note}>{date(event.ts)} · ungefärligt område · Polisen ↗</Text></Pressable>) : <Text style={s.note}>{route.sourceStatus?.["polisen-events"]?.status === "unavailable" || route.sourceStatus?.["polisen-events"]?.status === "error" ? "Polisflödet är inte tillgängligt längs rutten." : "Inga matchande rapporter längs rutten i tillgängliga data."}</Text>}</>}
    <Text style={s.section}>Händelser inom 10 km från målet</Text>
    <Freshness fetchedAt={events?.fetchedAt}/>
    {destination ? !feedAvailable(events) ? <Text style={s.note}>Polisflödet är inte tillgängligt. Uppdatera för att försöka igen.</Text> : shown.length ? shown.slice(0,8).map(event => <Pressable key={event.id} style={s.listItem} onPress={() => openSource(event.url)}><Text style={s.itemTitle}>{event.type || "Polisnotis"} · {event.name}</Text><Text style={s.note}>{date(event.ts)} · ungefärlig plats · Polisen ↗</Text></Pressable>) : <Text style={s.note}>Inga matchande notiser i den hämtade datan. Det säger inget om säkerheten på platsen.</Text> : <Text style={s.note}>Sök en rutt för att se händelser kring målet.</Text>}
    <Text style={s.section}>Vanligt förekommande incidenter</Text>
    <IncidentBars events={nearby} available={!!destination&&feedAvailable(events)}/>
    <Text style={s.note}>Antal publicerade notiser inom 10 km från målet i det hämtade flödet. Staplarna visar samma tidsutsnitt och är ingen säkerhetsbedömning.</Text>
    <Text style={s.section}>Riskfaktorer och områden längs rutten</Text>
    {routeAreas.length ? routeAreas.slice(0,8).map((area,index) => <Pressable key={`${area.id}-${index}`} style={s.listItem} onPress={() => openSource(area.sourceUrl)}><Text style={s.itemTitle}>{area.name}</Text><Text style={s.note}>{area.category} · {(area.startMeters/1000).toFixed(1)}–{(area.endMeters/1000).toFixed(1)} km längs rutten {area.stale ? "· äldre underlag" : ""}</Text><Text style={s.link}>Källa ↗</Text></Pressable>) : <Text style={s.note}>Inga områdesträffar i tillgängliga källor. En tom lista är ingen garanti.</Text>}
    <Text style={s.section}>Trygga platser och service</Text>
    {Object.entries(saved).filter(([,address]) => !!address).map(([key,address]) => <Pressable key={key} style={s.listItem} onPress={() => { invalidate(); setTo(address); }}><Text style={s.itemTitle}>{key === "home" ? "Hem" : key === "school" ? "Skola" : key === "work" ? "Arbete" : "Sparad plats"}</Text><Text style={s.note}>{address} · sparad på denna telefon</Text></Pressable>)}
    {servicePlaces.map(item => <Pressable key={item.id} style={s.listItem} onPress={() => openSource(item.properties.sourceUrl)}><Text style={s.itemTitle}>{item.properties.title}</Text><Text style={s.note}>Granskad servicepunkt · källa ↗</Text></Pressable>)}
    {!Object.values(saved).some(Boolean) && !servicePlaces.length && <Text style={s.note}>Inga sparade eller granskade serviceplatser här. En platsmarkering är ingen säkerhetsgaranti.</Text>}
    <Text style={s.section}>Tips / att tänka på</Text><Text style={s.note}>Kontrollera alltid myndighetens aktuella information. Polisnotiser visar ungefärliga platser och är inte en prognos för rutten.</Text>
  </View>;
}
const s = StyleSheet.create({
  hero:{alignItems:'center',paddingVertical:10},heroIcon:{width:42,height:42,borderRadius:12,backgroundColor:'#E7EFF9',alignItems:'center',justifyContent:'center'},
  eyebrow: { color: blue, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  heading: { color: ink, fontSize: 20, fontWeight: "800", letterSpacing:-.8, marginTop: 7 },
  note: { color: muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#DAE5F0", borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11, marginTop: 12, marginBottom: 5, color: ink, fontSize: 14 },
  advancedButton: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 7, minHeight:44 },
  link: { color: blue, fontSize: 12, fontWeight: "800" },
  startRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  smallButton: { minHeight: 43, borderRadius: 12, backgroundColor: "#E7F1FF", paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 4 },
  smallButtonOn: { backgroundColor: blue }, smallText: { color: blue, fontWeight: "800", fontSize: 11 },
  advanced: { marginTop: 12, backgroundColor: "#fff", borderRadius: 9, padding: 12, borderWidth: 1, borderColor: "#E3EAF3" },
  subTitle: { color: ink, fontSize: 12, fontWeight: "800", marginBottom: 6, marginTop: 4 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  chip: { borderRadius: 12, backgroundColor: "#EDF3F9", paddingHorizontal: 12, paddingVertical: 8 }, chipOn: { backgroundColor: blue },
  chipText: { color: ink, fontSize: 11, fontWeight: "700" }, chipTextOn: { color: "#fff" },
  primary: { backgroundColor: blue, borderRadius: 9, paddingVertical: 13, alignItems: "center", marginTop: 13, marginBottom: 5 },
  primaryText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  error: { color: "#9E2837", backgroundColor: "#FFE9EB", padding: 10, borderRadius: 10, marginTop: 8 },
  section: { color: ink, fontSize: 17, fontWeight: "800", marginTop: 20, marginBottom: 9 },
  summary: { backgroundColor: "#E8F2FF", borderRadius: 9, padding: 13, marginTop: 4 }, summaryTitle: { color: ink, fontSize: 18, fontWeight: "800" },
  listItem: { backgroundColor: "#fff", borderColor: "#E2EAF3", borderWidth: 1, borderRadius: 13, padding: 11, marginBottom: 7 },
  itemTitle: { color: ink, fontSize: 13, fontWeight: "800" },
});
