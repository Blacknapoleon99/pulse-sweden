import { Text } from './Typography';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Ionicons from '@expo/vector-icons/Ionicons';
import * as SecureStore from "expo-secure-store";
import { useFocusEffect } from "@react-navigation/native";
import { Image, Pressable, StyleSheet, View } from 'react-native';
import {
  geocode,
  type EventsResponse,
  type Feature,
  type MapItem,
  type Point,
} from "./api";
import { latestRequest, feedAvailable, validAt } from "./mobileState";
import { useFamily } from "./FamilyState";
import { Segments, Section, Surface, DetailRow } from "./ReferenceUI";
import { ReferenceBars } from "./ReferenceCharts";
import { incidentCategory, incidentCounts } from "./incidentSummary";
import { AppHeader, DropdownPill, SearchBar, UnderlineTabs } from "./ReferenceKit";
import { MapPreview } from "./MapPreview";
import { Freshness, StateCard, SourceDisclosure } from "./UI";
import { colors, shadow, ui } from "./theme";
type Place = Point & { name: string; city?: string };
const centralStation:Place={name:'Centralstationen',city:'Stockholm',lat:59.3304,lon:18.0587};
const favoriteKey = "tryggpuls-place-favorites";
const sections = [
  { id: "overview", label: "Översikt" },
  { id: "stats", label: "Statistik" },
  { id: "history", label: "Historik" },
  { id: "nearby", label: "I närheten" },
] as const;
function distance(a: Point, b: Point) {
  const rad = Math.PI / 180,
    dLat = (a.lat - b.lat) * rad,
    dLon = (a.lon - b.lon) * rad;
  return (
    12742 *
    Math.asin(
      Math.sqrt(
        Math.sin(dLat / 2) ** 2 +
          Math.cos(a.lat * rad) *
            Math.cos(b.lat * rad) *
            Math.sin(dLon / 2) ** 2,
      ),
    )
  );
}
function containsPoint(ring: number[][], point: Point) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (
      yi > point.lat !== yj > point.lat &&
      point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}
function isPlace(value: any): value is Place {
  return (
    value &&
    typeof value.name === "string" &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lon) &&
    Math.abs(value.lat) <= 90 &&
    Math.abs(value.lon) <= 180
  );
}
export function PlaceHistoryScreen({
  events,
  areas,
  policeAreaYear,
  items,
  openSource,
  onOpenStats,
  onEditPlaces,
  onDetailChange,
}: {
  events: EventsResponse | null;
  areas: Feature[];
  policeAreaYear?: number;
  items: MapItem[];
  openSource: (url?: string) => void;
  onOpenStats: (city?: string) => void;
  onEditPlaces: () => void;
  onDetailChange?: (open: boolean) => void;
}) {
  const family = useFamily(),
    [query, setQuery] = useState(""),
    [place, setPlace] = useState<Place | null>(null),
    [section, setSection] = useState<
      "overview" | "stats" | "history" | "nearby"
    >("overview");
  const [radius, setRadius] = useState("10"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState<Record<string, string>>({}),
    [favorites, setFavorites] = useState<Place[]>([]);
  const searches = useRef(latestRequest()).current,
    abort = useRef<AbortController | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void Promise.all([
        SecureStore.getItemAsync("tryggpuls-saved-places"),
        SecureStore.getItemAsync(favoriteKey),
      ])
        .then(([raw, starred]) => {
          if (!active) return;
          try {
            const parsed = JSON.parse(raw || "{}");
            setSaved(
              Object.fromEntries(
                Object.entries(parsed).filter(
                  ([, value]) => typeof value === "string",
                ),
              ) as Record<string, string>,
            );
            const list = JSON.parse(starred || "[]");
            setFavorites(
              Array.isArray(list) ? list.filter(isPlace).slice(0, 4) : [],
            );
          } catch {
            setError("Sparade platser kunde inte läsas.");
          }
        })
        .catch(() => {
          if (active) setError("Sparade platser kunde inte läsas.");
        });
      return () => {
        active = false;
        searches.invalidate();
        abort.current?.abort();
        setBusy(false);
      };
    }, [searches]),
  );
  useEffect(
    () => () => {
      searches.invalidate();
      abort.current?.abort();
    },
    [searches],
  );
  useEffect(() => {
    onDetailChange?.(!!place);
  }, [!!place]);
  useEffect(() => () => onDetailChange?.(false), []);
  function invalidate() {
    searches.invalidate();
    abort.current?.abort();
    setBusy(false);
    setPlace(null);
    setError("");
  }
  async function search(address = query) {
    const request = searches.next();
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setPlace(null);
    setError("");
    if (!address.trim()) {
      setError("Ange en adress eller plats.");
      return;
    }
    setQuery(address);
    setBusy(true);
    try {
      const result = (await geocode(address, controller.signal)).results[0];
      if (!result)
        throw Error("Platsen hittades inte. Prova en tydligare svensk adress.");
      if (searches.current(request)) {
        setPlace({
          lat: result.lat,
          lon: result.lon,
          name: result.displayName,
          city: result.city,
        });
        setSection("overview");
      }
    } catch (caught) {
      if (searches.current(request))
        setError(
          caught instanceof Error ? caught.message : "Sökningen misslyckades.",
        );
    } finally {
      if (searches.current(request)) setBusy(false);
    }
  }
  const matched = useMemo(
    () =>
      place
        ? (events?.events || [])
            .filter(
              (event) =>
                event.location?.gps &&
                distance(place, {
                  lat: event.location.gps[0],
                  lon: event.location.gps[1],
                }) <= Number(radius),
            )
            .sort((a, b) => b.ts - a.ts)
        : [],
    [place, events, radius],
  );
  const closeItems = place
    ? items.filter(
        (item) =>
          validAt(item.properties) &&
          distance(place, {
            lat: item.geometry.coordinates[1],
            lon: item.geometry.coordinates[0],
          }) <= Number(radius),
      )
    : [];
  const nearAreas = place
    ? areas
        .filter((feature) => {
          if (!validAt(feature.properties)) return false;
          const polygons =
            feature.geometry.type === "Polygon"
              ? [feature.geometry.coordinates as number[][][]]
              : (feature.geometry.coordinates as number[][][][]);
          return polygons.some(
            (polygon) =>
              (containsPoint(polygon[0] || [], place) &&
                !polygon.slice(1).some((hole) => containsPoint(hole, place))) ||
              (polygon[0] || []).some(
                ([lon, lat]) =>
                  distance(place, { lat, lon }) <= Number(radius) + 5,
              ),
          );
        })
        .slice(0, 6)
    : [];
  const safeZones = (family.overview?.zones || []).filter(
    (zone) =>
      zone.kind === "safe" &&
      (!place || distance(place, zone) <= Number(radius)),
  );
  const favorite =
    place &&
    favorites.some((item) => item.lat === place.lat && item.lon === place.lon);
  async function toggleFavorite() {
    if (!place) return;
    const next = favorite
      ? favorites.filter(
          (item) => item.lat !== place.lat || item.lon !== place.lon,
        )
      : [...favorites, { ...place, name: place.name.slice(0, 160) }];
    if (next.length > 4) {
      setError("Du kan spara fyra favoriter. Ta bort en favorit först.");
      return;
    }
    try {
      await SecureStore.setItemAsync(favoriteKey, JSON.stringify(next));
      setFavorites(next);
      setError("");
    } catch {
      setError("Favoriten kunde inte sparas.");
    }
  }
  const placeParts = (place?.name || "").split(",").map((part) => part.trim());
  const placeTitle = placeParts[0] || "Plats",
    placeSubtitle = place?.city || placeParts[1] || "";
  const nowMs = Date.now(),
    week = 7 * 86_400_000,
    oldest = (events?.events || []).reduce(
      (min, event) => (Number.isFinite(event.ts) ? Math.min(min, event.ts) : min),
      nowMs,
    ),
    weeklyChange = nowMs - 2 * week >= oldest;
  const topCategories = incidentCounts(matched)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((category) => {
      if (!weeklyChange) return { ...category, change: null as number | null };
      const inRange = (from: number, to: number) =>
        matched.filter(
          (event) =>
            event.ts >= from &&
            event.ts < to &&
            incidentCategory(event.type) === category.id,
        ).length;
      const last = inRange(nowMs - week, nowMs + 1),
        previous = inRange(nowMs - 2 * week, nowMs - week);
      return {
        ...category,
        change: previous ? Math.round(((last - previous) / previous) * 100) : null,
      };
    });
  const windows = [22, 2, 6, 10, 14, 18].map((start) => ({
    start,
    count: matched.filter((event) => {
      const hour = new Date(event.ts).getHours();
      return (hour - start + 24) % 24 < 4;
    }).length,
  }));
  const peak = windows.reduce((best, item) => (item.count > best.count ? item : best));
  const pad = (hour: number) => String(hour % 24).padStart(2, "0");
  const riskRows = [
    matched.length >= 3 && peak.count > 0 && (
      <DetailRow
        key="peak"
        title={`Flest notiser kl ${pad(peak.start)}–${pad(peak.start + 4)}`}
        body={section==='overview'?undefined:`${peak.count} av ${matched.length} hämtade notiser`}
        icon="warning"
        color={colors.danger}
        onPress={() => setSection("history")}
      />
    ),
    topCategories[0]?.count > 0 && (
      <DetailRow
        key="common"
        title={`Vanligast: ${topCategories[0].label.toLocaleLowerCase("sv-SE")}`}
        body={section==='overview'?undefined:`${topCategories[0].count} notiser inom ${radius} km`}
        icon="people"
        color="#F08A24"
        onPress={() => setSection("history")}
      />
    ),
    ...nearAreas.map((area, index) => (
      <DetailRow
        key={area.id || `area-${index}`}
        title={area.properties.name}
        body={area.properties.category || "Myndighetsbedömning"}
        color={colors.amber}
        icon="alert-circle"
        onPress={() =>
          openSource(
            area.properties.sourceUrl ||
              "https://polisen.se/om-polisen/polisens-arbete/utsatta-omraden/",
          )
        }
      />
    )),
  ].filter(Boolean);
  const notices = (
    <>
      <Freshness
        fetchedAt={events?.fetchedAt}
        error={events?.stale ? "Äldre hämtning" : undefined}
      />
      {matched.length ? (
        matched
          .slice(0, 20)
          .map((event) => (
            <DetailRow
              key={event.id}
              title={event.type || "Händelse"}
              body={`${new Date(event.ts).toLocaleString("sv-SE")} · ${event.location?.name || event.name} · ungefärlig områdespunkt`}
              icon="time-outline"
              onPress={() => openSource(event.url)}
            />
          ))
      ) : (
        <StateCard
          title={
            feedAvailable(events)
              ? "Inga matchande notiser"
              : "Polisflödet är inte tillgängligt"
          }
          body="En tom lista är ingen säkerhetsgaranti."
        />
      )}
    </>
  );
  const service = (
    <>
      {safeZones.slice(0,section==='overview'?2:undefined).map((zone) => (
        <DetailRow
          key={zone.id}
          title={zone.name}
          body={section==='overview'?undefined:`Familjens valda trygga plats · ${zone.radius} m`}
          icon="checkmark-circle"
          color={colors.green}
          onPress={() => {
            invalidate();
            setQuery(zone.name);
            setPlace({ lat: zone.lat, lon: zone.lon, name: zone.name });
            setSection("overview");
          }}
        />
      ))}
      {closeItems
        .filter((item) => item.properties.kind === "service-point")
        .map((item) => (
          <DetailRow
            key={item.id}
            title={item.properties.title}
            body="Granskad servicepunkt · öppna källa"
            icon="checkmark-circle"
            color={colors.green}
            onPress={() => openSource(item.properties.sourceUrl)}
          />
        ))}
      {!safeZones.length &&
        !closeItems.some(
          (item) => item.properties.kind === "service-point",
        ) && (
          <Text style={ui.body}>
            Inga familjevalda platser eller granskade servicepunkter i vald
            radie.
          </Text>
        )}
    </>
  );
  return (
    <View>
      {!place && (
        <>
          <Text style={[ui.title, { marginBottom: 2 }]}>Dina platser</Text>
          <Text style={[ui.body, { marginBottom: 10 }]}>
            Sök en plats och utforska publicerade uppgifter.
          </Text>
        </>
      )}
      {!place && (
        <SearchBar
          value={query}
          onChangeText={(text) => {
            invalidate();
            setQuery(text);
          }}
          placeholder="Sök plats, adress eller område…"
          onSubmit={() => void search()}
          busy={busy}
        />
      )}
      {!!error && <Text style={ui.error}>{error}</Text>}
      {!place ? (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel="Utforska Centralstationen, Stockholm" onPress={()=>{setPlace(centralStation);setSection('overview');}} style={{marginTop:10}}>
            <Image source={require('../assets/stockholm-central.jpg')} style={{width:'100%',height:104,borderRadius:7}} resizeMode="cover"/>
            <DetailRow title="Centralstationen" body="Stockholm · utforska platsen" icon="train-outline"/>
          </Pressable>
          <Section
            title="Sparade platser"
            action="Ändra"
            onPress={onEditPlaces}
          />
          <Surface>
            {Object.entries(saved)
              .filter(([, address]) => address)
              .map(([key, address]) => (
                <DetailRow
                  key={key}
                  title={
                    key === "home"
                      ? "Hem"
                      : key === "school"
                        ? "Skola"
                        : key === "work"
                          ? "Jobb"
                          : "Fritid"
                  }
                  body={address}
                  icon={
                    key === "home"
                      ? "home-outline"
                      : key === "school"
                        ? "school-outline"
                        : "briefcase-outline"
                  }
                  onPress={() => void search(address)}
                />
              ))}
            {!Object.values(saved).some(Boolean) && (
              <DetailRow
                title="Spara hem, skola eller jobb"
                body="Dina adresser lagras på denna telefon."
                onPress={onEditPlaces}
                icon="add-circle-outline"
              />
            )}
          </Surface>
          <Section title="Favoriter" />
          <Surface>
            {favorites.length ? (
              favorites.map((item) => (
                <DetailRow
                  key={`${item.lat}:${item.lon}`}
                  title={item.name}
                  icon="heart"
                  onPress={() => {
                    invalidate();
                    setQuery(item.name);
                    setPlace(item);
                    setSection("overview");
                  }}
                />
              ))
            ) : (
              <Text style={ui.body}>
                Sök en plats och tryck på hjärtat för att spara den här.
              </Text>
            )}
          </Surface>
          {safeZones.length > 0 && (
            <>
              <Section title="Familjens platser" />
              <Surface>{service}</Surface>
            </>
          )}
        </>
      ) : (
        <>
          <AppHeader
            title={placeTitle}
            subtitle={placeSubtitle}
            onBack={() => {
              invalidate();
              setQuery("");
            }}
            trailing={
              <Pressable
                style={s.iconButton}
                accessibilityRole="button"
                accessibilityLabel={
                  favorite ? "Ta bort favorit" : "Spara som favorit"
                }
                accessibilityState={{ selected: !!favorite }}
                onPress={() => void toggleFavorite()}
              >
                <Ionicons
                  name={favorite ? "heart" : "heart-outline"}
                  size={24}
                  color={favorite ? colors.danger : colors.ink}
                />
              </Pressable>
            }
          />
          {distance(place,centralStation)<0.45&&/central(?:station|en)|stockholm c/i.test(place.name) ? <Image source={require('../assets/stockholm-central.jpg')} accessibilityLabel="Stockholms centralstation. Foto: Ypsilon from Finland, CC0." style={{width:'100%',height:105,borderRadius:7}} resizeMode="cover"/> : <MapPreview
            height={150}
            bare
            region={{
              latitude: place.lat,
              longitude: place.lon,
              latitudeDelta: 0.03,
              longitudeDelta: 0.03,
            }}
            destination={{
              latitude: place.lat,
              longitude: place.lon,
              title: place.name,
            }}
            events={matched}
            openSource={openSource}
          />}
          <UnderlineTabs items={sections} value={section} onChange={setSection} />
          {(section === "overview" || section === "stats") && (
            <>
              <View style={s.statRow}>
                {topCategories.map((category) => (
                  <View key={category.id} style={s.statCard}>
                    <View style={s.statHead}>
                      <View
                        style={[
                          s.statIcon,
                          { backgroundColor: `${category.color}1F` },
                        ]}
                      >
                        <Ionicons
                          name={category.icon as any}
                          size={14}
                          color={category.color}
                        />
                      </View>
                      <Text style={s.statLabel} numberOfLines={1}>
                        {category.label}
                      </Text>
                    </View>
                    <View style={s.statBottom}>
                      <Text style={s.statNumber}>{category.count}</Text>
                      {category.change !== null && (
                        <Text
                          style={[
                            s.statChange,
                            {
                              color:
                                category.change > 0
                                  ? colors.danger
                                  : colors.green,
                            },
                          ]}
                        >
                          {category.change > 0 ? "↑" : category.change < 0 ? "↓" : ""}
                          {Math.abs(category.change)}%
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
              <View style={[ui.row, { justifyContent: "space-between" }]}>
                <Text style={ui.meta}>
                  {weeklyChange
                    ? "Pilar: senaste 7 dagarna mot veckan innan."
                    : "Hämtade notiser nära platsen."}
                </Text>
                <DropdownPill
                  label={`Inom ${radius} km`}
                  onPress={() =>
                    setRadius(radius === "5" ? "10" : radius === "10" ? "25" : "5")
                  }
                />
              </View>
            </>
          )}
          {section === "stats" && (
            <Surface>
              <Text style={ui.heading}>Publicerade notiser nära platsen</Text>
              <ReferenceBars
                items={incidentCounts(matched)}
                available={feedAvailable(events)}
              />
              <Text style={ui.meta}>
                Hämtade notiser inom {radius} km. Ingen komplett brottshistorik
                eller personlig riskberäkning.
              </Text>
            </Surface>
          )}
          {section === "overview" && (
            <>
              <Section title="Riskfaktorer" />
              <Surface>
                {riskRows.length ? (
                  riskRows
                ) : (
                  <Text style={ui.body}>
                    Inga riskfaktorer i hämtat underlag. En tom lista är ingen
                    säkerhetsgaranti.
                  </Text>
                )}
              </Surface>
              <Section title="Tryggplatser i närheten" />
              <Surface>{service}</Surface>
              <Pressable
                style={s.tip}
                accessibilityRole="button"
                onPress={() => openSource("https://polisen.se")}
              >
                <Ionicons name="bulb" color={colors.amber} size={26} />
                <View style={{ flex: 1 }}>
                  <Text style={ui.heading}>Tips att tänka på</Text>
                  <Text style={ui.body}>
                    Undvik att gå ensam sent på kvällen och håll värdesaker
                    nära. Kontrollera källa och datum.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.blue} />
              </Pressable>
              <SourceDisclosure summary="Om underlaget"><Text style={ui.meta}>
                Polisens bedömningsår: {policeAreaYear || "saknas"}. Områdesgränser och avstånd är ungefärliga.
              </Text></SourceDisclosure>
            </>
          )}
          {section === "stats" && (
            <Surface>
              <DetailRow
                title="BRÅ:s kommunstatistik"
                body="Årsdata för hela kommunen, separat från polisnotiserna."
                icon="stats-chart-outline"
                onPress={() => onOpenStats(place.city)}
              />
            </Surface>
          )}
          {section === "history" && (
            <>
              <Section title="Tillgängliga notiser" />
              {notices}
            </>
          )}
          {section === "nearby" && (
            <>
              <Section title="Platser och service" />
              <Surface>{service}</Surface>
              <Section title="Händelser i närheten" />
              {notices}
            </>
          )}
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  statRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 7,
    gap: 4,
    ...shadow,
  },
  statHead: { flexDirection: "row", alignItems: "center", gap: 5 },
  statIcon: {
    width: 21,
    height: 21,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  statLabel: { flex: 1, fontSize: 11, color: colors.ink, fontWeight: "700" },
  statBottom: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  statNumber: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.6,
  },
  statChange: { fontSize: 11, fontWeight: "800" },
  tip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: colors.secondary,
    borderRadius: 8,
    marginTop: 8,
  },
});
