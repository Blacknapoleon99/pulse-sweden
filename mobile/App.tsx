import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Location from "expo-location";
import MapView, {
  Marker,
  Polygon,
  Polyline,
  type Region,
} from "react-native-maps";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  API_BASE,
  calculateRoute,
  geocode,
  getJson,
  refreshRoute,
  type AreasResponse,
  type CrisisResponse,
  type Event,
  type EventsResponse,
  type Feature,
  type FeedResponse,
  type Point,
  type RouteResponse,
  type ZonesResponse,
} from "./src/api";
import { Dashboard, type Destination } from "./src/Dashboard";

type Tab = Destination;
const START: Region = {
  latitude: 59.3293,
  longitude: 18.0686,
  latitudeDelta: 0.14,
  longitudeDelta: 0.14,
};
const blue = "#176FE1",
  ink = "#142A43",
  muted = "#607287";
const toMap = ([lon, lat]: number[]) => ({ latitude: lat, longitude: lon });
function polygonRings(feature: Feature) {
  const polygons =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates as number[][][]]
      : (feature.geometry.coordinates as number[][][][]);
  return polygons.map((p) => (p[0] || []).map(toMap));
}
function eventPoint(event: Event) {
  const gps = event.location?.gps;
  return gps && Number.isFinite(gps[0]) && Number.isFinite(gps[1])
    ? { latitude: gps[0], longitude: gps[1] }
    : null;
}
function km(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = Math.PI / 180,
    dLat = (a.latitude - b.latitude) * rad,
    dLon = (a.longitude - b.longitude) * rad;
  return (
    12742 *
    Math.asin(
      Math.sqrt(
        Math.sin(dLat / 2) ** 2 +
          Math.cos(a.latitude * rad) *
            Math.cos(b.latitude * rad) *
            Math.sin(dLon / 2) ** 2,
      ),
    )
  );
}
function Source({ label, status }: { label: string; status?: string }) {
  return (
    <View style={s.source}>
      <View
        style={[
          s.dot,
          { backgroundColor: status === "ok" ? "#19A978" : "#E5A34B" },
        ]}
      />
      <Text style={s.sourceName}>{label}</Text>
      <Text style={s.sourceState}>
        {status === "ok"
          ? "Aktuell"
          : status === "stale"
            ? "Äldre data"
            : status === "requires_setup"
              ? "Ej ansluten"
              : "Ej tillgänglig"}
      </Text>
    </View>
  );
}
function AppScreen() {
  const inset = useSafeAreaInsets(),
    map = useRef<MapView>(null),
    fade = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false),
    [tab, setTab] = useState<Tab>("home");
  const [region, setRegion] = useState(START),
    [position, setPosition] = useState<Point | null>(null);
  const [events, setEvents] = useState<EventsResponse | null>(null),
    [areas, setAreas] = useState<AreasResponse | null>(null),
    [zones, setZones] = useState<ZonesResponse | null>(null);
  const [showAreas, setShowAreas] = useState(true),
    [showEvents, setShowEvents] = useState(true);
  const [weather, setWeather] = useState<FeedResponse | null>(null),
    [crisis, setCrisis] = useState<CrisisResponse | null>(null),
    [news, setNews] = useState<FeedResponse | null>(null),
    [zoneNews, setZoneNews] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(false),
    [message, setMessage] = useState("");
  const [from, setFrom] = useState("Stockholm central"),
    [to, setTo] = useState("Gamla stan, Stockholm");
  const [gpsStart, setGpsStart] = useState(false),
    [mode, setMode] = useState<"walking" | "driving">("walking");
  const [route, setRoute] = useState<RouteResponse | null>(null),
    [routeBusy, setRouteBusy] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
    reload();
  }, []);
  function changeTab(next: Tab) {
    setTab(next);
    if (!reduceMotion) {
      fade.setValue(0);
      Animated.timing(fade, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }
  async function reload() {
    setLoading(true);
    setMessage("");
    const results = await Promise.allSettled([
      getJson<EventsResponse>("/api/events"),
      getJson<AreasResponse>("/api/police-areas"),
      getJson<ZonesResponse>("/api/public-zones"),
      getJson<FeedResponse>("/api/weather-warnings"),
      getJson<CrisisResponse>("/api/crisis-updates"),
      getJson<FeedResponse>("/api/crisis-news"),
      getJson<FeedResponse>("/api/security-zone-news"),
    ]);
    if (results[0].status === "fulfilled") setEvents(results[0].value);
    if (results[1].status === "fulfilled") setAreas(results[1].value);
    if (results[2].status === "fulfilled") setZones(results[2].value);
    if (results[3].status === "fulfilled") setWeather(results[3].value);
    if (results[4].status === "fulfilled") setCrisis(results[4].value);
    if (results[5].status === "fulfilled") setNews(results[5].value);
    if (results[6].status === "fulfilled") setZoneNews(results[6].value);
    if (results.some((r) => r.status === "rejected"))
      setMessage(
        "Några källor kunde inte hämtas. Tryck på uppdatera för att försöka igen.",
      );
    setLoading(false);
  }
  async function locate() {
    setMessage("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted")
        throw new Error(
          "Platsåtkomst nekades. Du kan fortfarande använda kartan och söka adresser.",
        );
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const point = { lat: loc.coords.latitude, lon: loc.coords.longitude };
      setPosition(point);
      map.current?.animateToRegion(
        {
          latitude: point.lat,
          longitude: point.lon,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        },
        400,
      );
      return point;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Positionen kunde inte läsas.",
      );
      return null;
    }
  }
  async function analyze(refresh = false) {
    setRouteBusy(true);
    setMessage("");
    try {
      let result: RouteResponse;
      if (refresh && route) result = await refreshRoute(route.routeId);
      else {
        if (!to.trim() || (!gpsStart && !from.trim()))
          throw new Error("Ange start och mål.");
        const [start, destination] = await Promise.all([
          gpsStart
            ? position
              ? Promise.resolve(position)
              : locate()
            : geocode(from).then((data) => data.results[0]),
          geocode(to).then((data) => data.results[0]),
        ]);
        if (!start || !destination)
          throw new Error(
            "Start eller mål kunde inte hittas. Prova en mer specifik svensk adress.",
          );
        result = await calculateRoute(start, destination, mode);
      }
      setRoute(result);
      const path = result.geometry.coordinates.map(toMap);
      if (path.length > 1) {
        changeTab("map");
        setTimeout(
          () =>
            map.current?.fitToCoordinates(path, {
              edgePadding: { top: 160, right: 40, bottom: 270, left: 40 },
              animated: true,
            }),
          300,
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Ruttanalysen kunde inte hämtas.",
      );
    } finally {
      setRouteBusy(false);
    }
  }
  const center = { latitude: region.latitude, longitude: region.longitude };
  const visibleEvents = (events?.events || [])
    .filter((event) => {
      const p = eventPoint(event);
      return p && km(center, p) < Math.max(28, region.latitudeDelta * 170);
    })
    .slice(0, 40);
  const around = position
    ? { latitude: position.lat, longitude: position.lon }
    : center;
  const nearby = (events?.events || [])
    .filter((event) => {
      const p = eventPoint(event);
      return p && km(around, p) < 35;
    })
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 12);
  const visibleAreas = [...(areas?.features || []), ...(zones?.features || [])]
    .filter((f) => {
      const first = polygonRings(f)[0]?.[0];
      return (
        first && km(center, first) < Math.max(60, region.latitudeDelta * 180)
      );
    })
    .slice(0, 80);
  const open = (url?: string) => {
    if (url?.startsWith("https://")) Linking.openURL(url).catch(() => {});
  };
  const chip = (label: string, active: boolean, action: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={action}
      style={[s.chip, active && s.chipOn]}
    >
      <Text style={[s.chipText, active && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={START}
        onRegionChangeComplete={setRegion}
        showsUserLocation={!!position}
      >
        {showAreas &&
          visibleAreas.flatMap((f) =>
            polygonRings(f).map((ring, i) =>
              ring.length > 2 ? (
                <Polygon
                  key={`${f.id || f.properties.name}-${i}`}
                  coordinates={ring}
                  strokeColor={
                    f.properties.kind === "security-zone"
                      ? "#D86B42"
                      : "#675BBB"
                  }
                  fillColor={
                    f.properties.kind === "security-zone"
                      ? "rgba(216,107,66,0.16)"
                      : "rgba(103,91,187,0.12)"
                  }
                  strokeWidth={2}
                />
              ) : null,
            ),
          )}
        {showEvents &&
          visibleEvents.map((event) => {
            const p = eventPoint(event);
            return (
              p && (
                <Marker
                  key={event.id}
                  coordinate={p}
                  title={`${event.type} · ${event.name}`}
                  description="Ungefärlig områdespunkt"
                  pinColor="#DC8654"
                  onCalloutPress={() => open(event.url)}
                />
              )
            );
          })}
        {route?.geometry?.coordinates?.length && (
          <Polyline
            coordinates={route.geometry.coordinates.map(toMap)}
            strokeColor={blue}
            strokeWidth={5}
          />
        )}
      </MapView>
      {(["home", "alerts", "news", "family"] as Tab[]).includes(tab) && (
        <Dashboard
          screen={tab as "home" | "alerts" | "news" | "family"}
          topInset={inset.top}
          bottomInset={inset.bottom}
          events={events}
          nearby={nearby}
          weather={weather}
          crisis={crisis}
          news={news}
          zoneNews={zoneNews}
          hasLocation={!!position}
          loading={loading}
          notice={message}
          onRefresh={reload}
          onLocate={() => {
            void locate();
          }}
          go={changeTab}
          openSource={open}
        />
      )}
      {(["map", "events", "route", "info"] as Tab[]).includes(tab) && (
        <View style={[s.headerWrap, { top: inset.top + 10 }]}>
          <View style={s.glass}>
            <View style={s.header}>
              <View style={s.logo}>
                <Ionicons name="shield-checkmark" color="white" size={19} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.brand}>TryggPuls</Text>
                <Text style={s.kicker}>SVERIGE · MOBIL DEMO</Text>
              </View>
              <Pressable accessibilityLabel="Uppdatera källor" onPress={reload}>
                {loading ? (
                  <ActivityIndicator color={blue} />
                ) : (
                  <Ionicons name="refresh" size={22} color={ink} />
                )}
              </Pressable>
            </View>
          </View>
          {tab === "map" && (
            <View style={s.chips}>
              {chip("Områden", showAreas, () => setShowAreas(!showAreas))}
              {chip("Polisnotiser", showEvents, () =>
                setShowEvents(!showEvents),
              )}
            </View>
          )}
        </View>
      )}
      {tab === "map" && (
        <Pressable
          style={[s.locate, { bottom: inset.bottom + 190 }]}
          onPress={locate}
          accessibilityLabel="Visa min plats"
        >
          <Ionicons name="locate" color={blue} size={23} />
        </Pressable>
      )}
      {(["map", "events", "route", "info"] as Tab[]).includes(tab) && (
        <Animated.View
          style={[s.panelWrap, { bottom: inset.bottom + 77, opacity: fade }]}
        >
          <View style={s.glass}>
            {Platform.OS === "ios" && (
              <BlurView
                intensity={75}
                tint="light"
                style={StyleSheet.absoluteFill}
              />
            )}
            <View style={s.panel}>
              {tab === "map" && (
                <View>
                  <Text style={s.kicker}>
                    LÄGESBILD ·{" "}
                    {events?.fetchedAt
                      ? new Date(events.fetchedAt).toLocaleTimeString("sv-SE", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "HÄMTAR"}
                  </Text>
                  <Text style={s.title}>Se vad som finns runt dig</Text>
                  <Text style={s.body}>
                    {visibleEvents.length} ungefärliga polisnotiser och{" "}
                    {visibleAreas.length} publicerade områden i kartvyn.
                  </Text>
                  {route && (
                    <Pressable
                      onPress={() => changeTab("route")}
                      style={s.routeLink}
                    >
                      <Ionicons name="navigate" size={17} color={blue} />
                      <Text style={s.link}>
                        {route.distanceKm} km · {route.durationMinutes} min · se
                        analys
                      </Text>
                    </Pressable>
                  )}
                  <Text style={s.disclaimer}>
                    Polisnotiser kan vara fördröjda. Kartpunkter är inte exakta
                    brottsplatser.
                  </Text>
                </View>
              )}
              {tab === "events" && (
                <ScrollView style={s.scroll}>
                  <Text style={s.kicker}>HÄNDELSER</Text>
                  <Text style={s.title}>
                    Nära {position ? "din plats" : "kartans mitt"}
                  </Text>
                  <Text style={s.body}>
                    Publicerade polisnotiser inom cirka 35 km. Tryck för
                    originalkällan.
                  </Text>
                  {nearby.length ? (
                    nearby.map((e) => (
                      <Pressable
                        key={e.id}
                        style={s.item}
                        onPress={() => open(e.url)}
                      >
                        <Text style={s.itemTitle}>
                          {e.type} · {e.name} ↗
                        </Text>
                        <Text style={s.body} numberOfLines={2}>
                          {e.summary}
                        </Text>
                        <Text style={s.meta}>
                          {e.location?.name || "Område"} ·{" "}
                          {new Date(e.ts).toLocaleString("sv-SE")}
                        </Text>
                      </Pressable>
                    ))
                  ) : (
                    <Text style={s.empty}>
                      Inga notiser matchar området i tillgängliga data. Det är
                      ingen garanti för säkerhet.
                    </Text>
                  )}
                </ScrollView>
              )}
              {tab === "route" && (
                <ScrollView
                  style={s.scroll}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={s.kicker}>RUTTANALYS</Text>
                  <Text style={s.title}>Planera din väg</Text>
                  <Text style={s.body}>
                    Se zoner och ungefärliga polisnotiser längs en svensk rutt.
                  </Text>
                  <Text style={s.label}>FRÅN</Text>
                  <TextInput
                    value={from}
                    onChangeText={setFrom}
                    editable={!gpsStart}
                    style={s.input}
                    placeholder="Startadress"
                  />
                  {chip("Använd min plats", gpsStart, () =>
                    setGpsStart(!gpsStart),
                  )}
                  <Text style={s.label}>TILL</Text>
                  <TextInput
                    value={to}
                    onChangeText={setTo}
                    style={s.input}
                    placeholder="Destination"
                  />
                  <View style={s.chips}>
                    {chip("Gång", mode === "walking", () => setMode("walking"))}
                    {chip("Bil", mode === "driving", () => setMode("driving"))}
                  </View>
                  <Pressable
                    style={s.primary}
                    disabled={routeBusy}
                    onPress={() => analyze()}
                  >
                    <Text style={s.primaryText}>
                      {routeBusy ? "Analyserar…" : "Analysera rutt →"}
                    </Text>
                  </Pressable>
                  {route && (
                    <View style={s.results}>
                      <Text style={s.title}>
                        {route.distanceKm} km · {route.durationMinutes} min
                      </Text>
                      <Pressable
                        onPress={() => analyze(true)}
                        disabled={routeBusy}
                      >
                        <Text style={s.link}>Uppdatera källor ↻</Text>
                      </Pressable>
                      <Text style={s.meta}>
                        {route.policeAreaPassages?.length || 0} polisområden ·{" "}
                        {route.securityZonePassages?.length || 0} säkerhetszoner
                        · {route.networkAreaPassages?.length || 0}{" "}
                        nätverksområden · {route.incidentsCount} områdesnotiser
                      </Text>
                      {[
                        ...(route.securityZonePassages || []),
                        ...(route.networkAreaPassages || []),
                        ...(route.policeAreaPassages || []),
                      ]
                        .sort((a, b) => a.startMeters - b.startMeters)
                        .map((p) => (
                          <Pressable
                            key={p.id}
                            style={s.item}
                            onPress={() => open(p.sourceUrl)}
                          >
                            <Text style={s.itemTitle}>
                              {p.category} · {p.name}
                            </Text>
                            <Text style={s.meta}>
                              {(p.startMeters / 1000).toFixed(1)}–
                              {(p.endMeters / 1000).toFixed(1)} km längs rutten{" "}
                              {p.stale ? "· äldre underlag" : ""}
                            </Text>
                            {p.sourceTitle && (
                              <Text style={s.link}>{p.sourceTitle} ↗</Text>
                            )}
                          </Pressable>
                        ))}
                      {route.incidentsNearRoute?.slice(0, 8).map((e) => (
                        <Pressable
                          key={e.id}
                          style={s.item}
                          onPress={() => open(e.url)}
                        >
                          <Text style={s.itemTitle}>
                            {e.type} · {e.name}
                          </Text>
                          <Text style={s.meta}>
                            Ungefärligt område ·{" "}
                            {new Date(e.ts).toLocaleString("sv-SE")}
                          </Text>
                        </Pressable>
                      ))}
                      <Source
                        label="Polisens områden"
                        status={route.sourceStatus?.["polisen-areas"]?.status}
                      />
                      <Source
                        label="Granskade zoner"
                        status={route.sourceStatus?.["reviewed-zones"]?.status}
                      />
                      <Source
                        label="Polisnotiser"
                        status={route.sourceStatus?.["polisen-events"]?.status}
                      />
                      <Text style={s.disclaimer}>
                        En tom träfflista betyder bara att tillgängligt underlag
                        saknar matchningar.
                      </Text>
                    </View>
                  )}
                </ScrollView>
              )}
              {tab === "info" && (
                <ScrollView style={s.scroll}>
                  <Text style={s.kicker}>OM TJÄNSTEN</Text>
                  <Text style={s.title}>Information med källor</Text>
                  <Text style={s.body}>
                    TryggPuls visar publicerade svenska myndighetsuppgifter. Det
                    är inte ett realtidslarm eller en säkerhetsgaranti.
                  </Text>
                  <Source
                    label="Polisnotiser"
                    status={
                      events ? (events.stale ? "stale" : "ok") : undefined
                    }
                  />
                  <Source
                    label={`Polisens områden ${areas?.year || ""}`}
                    status={areas ? (areas.stale ? "stale" : "ok") : undefined}
                  />
                  <Source
                    label="Granskade zoner"
                    status={zones ? "ok" : "requires_setup"}
                  />
                  <Text style={s.section}>Familj och platsdelning</Text>
                  <Text style={s.body}>
                    Expo Go-demon använder platsen bara på begäran och när appen
                    är öppen. Familjekonton, bakgrundsposition och pushlarm
                    ingår inte; de kräver en separat native utvecklingsbuild och
                    uttryckligt samtycke.
                  </Text>
                  <Text style={s.section}>Kartans begränsningar</Text>
                  <Text style={s.body}>
                    Polisnotiser är ungefärliga kommun- eller länsmarkörer.
                    Polisens områdesbedömning uppdateras periodiskt. Ingen
                    verifierad rikstäckande livekarta över gängrekrytering finns
                    här.
                  </Text>
                  <Pressable
                    onPress={() =>
                      open(
                        "https://polisen.se/om-polisen/polisens-arbete/utsatta-omraden/",
                      )
                    }
                  >
                    <Text style={s.link}>Läs Polisens områdesbedömning ↗</Text>
                  </Pressable>
                  <Text style={s.meta}>API: {API_BASE}</Text>
                </ScrollView>
              )}
              {!!message && <Text style={s.warning}>{message}</Text>}
            </View>
          </View>
        </Animated.View>
      )}
      <View style={[s.tabsWrap, { bottom: inset.bottom + 8 }]}>
        <View style={s.glass}>
          <View style={s.tabs}>
            {(
              [
                ["home", "home-outline", "Hem"],
                ["map", "map-outline", "Karta"],
                ["events", "pulse-outline", "Händelser"],
                ["route", "navigate-outline", "Rutt"],
                ["info", "information-circle-outline", "Info"],
              ] as const
            ).map(([id, icon, label]) => (
              <Pressable
                key={id}
                style={s.tab}
                accessibilityRole="tab"
                accessibilityState={{
                  selected:
                    tab === id ||
                    (id === "home" &&
                      (["alerts", "news", "family"] as Tab[]).includes(tab)),
                }}
                onPress={() => changeTab(id)}
              >
                <Ionicons
                  name={icon}
                  size={22}
                  color={
                    tab === id ||
                    (id === "home" &&
                      (["alerts", "news", "family"] as Tab[]).includes(tab))
                      ? blue
                      : muted
                  }
                />
                <Text
                  style={[
                    s.tabText,
                    (tab === id ||
                      (id === "home" &&
                        (["alerts", "news", "family"] as Tab[]).includes(
                          tab,
                        ))) && { color: blue },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <AppScreen />
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#E4EBF1" },
  headerWrap: { position: "absolute", left: 16, right: 16 },
  glass: {
    backgroundColor:
      Platform.OS === "ios" ? "rgba(255,255,255,0.82)" : "#F9FCFF",
    borderColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#2D4F70",
    shadowOpacity: 0.17,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  header: { padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  logo: {
    width: 39,
    height: 39,
    borderRadius: 13,
    backgroundColor: blue,
    justifyContent: "center",
    alignItems: "center",
  },
  brand: { color: ink, fontSize: 19, fontWeight: "800" },
  kicker: { color: blue, fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  chips: { flexDirection: "row", gap: 7, marginTop: 8 },
  chip: {
    backgroundColor: "#fff",
    borderColor: "#D9E5F0",
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: 13,
    alignSelf: "flex-start",
    marginRight: 5,
  },
  chipOn: { backgroundColor: blue, borderColor: blue },
  chipText: { color: ink, fontSize: 12, fontWeight: "700" },
  chipTextOn: { color: "#fff" },
  locate: {
    position: "absolute",
    right: 18,
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 7,
  },
  panelWrap: { position: "absolute", left: 16, right: 16 },
  panel: { padding: 16 },
  title: {
    color: ink,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 7,
    marginBottom: 6,
    letterSpacing: -0.4,
  },
  body: { color: muted, fontSize: 13, lineHeight: 19 },
  disclaimer: { color: "#748499", fontSize: 11, lineHeight: 16, marginTop: 10 },
  routeLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 12,
    padding: 10,
    backgroundColor: "#E9F3FF",
    borderRadius: 12,
  },
  link: { color: blue, fontSize: 12, fontWeight: "700", marginTop: 5 },
  scroll: { maxHeight: 330 },
  item: {
    borderBottomColor: "#DFE8F0",
    borderBottomWidth: 1,
    paddingVertical: 11,
  },
  itemTitle: { color: ink, fontSize: 13, fontWeight: "700", marginBottom: 3 },
  meta: { color: "#77889B", fontSize: 11, marginTop: 6 },
  empty: { color: muted, fontSize: 13, lineHeight: 19, paddingVertical: 15 },
  label: {
    color: muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 14,
    marginBottom: 5,
  },
  input: {
    color: ink,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D9E5F0",
    borderRadius: 13,
    padding: 11,
    fontSize: 14,
    marginBottom: 8,
  },
  primary: {
    backgroundColor: blue,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    marginTop: 14,
  },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  results: {
    borderTopWidth: 1,
    borderTopColor: "#DFE8F0",
    marginTop: 16,
    paddingTop: 12,
  },
  source: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E8F0",
  },
  dot: { height: 8, width: 8, borderRadius: 4 },
  sourceName: { color: ink, fontSize: 12, flex: 1 },
  sourceState: { color: muted, fontSize: 11 },
  section: {
    color: ink,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 17,
    marginBottom: 6,
  },
  warning: { color: "#9D591A", fontSize: 11, marginTop: 9 },
  tabsWrap: { position: "absolute", left: 16, right: 16 },
  tabs: { flexDirection: "row", padding: 9 },
  tab: { flex: 1, alignItems: "center", gap: 3 },
  tabText: { color: muted, fontSize: 10, fontWeight: "700" },
});
