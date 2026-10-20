import { Text } from './Typography';
import { useEffect, useMemo, useState } from "react";
import Ionicons from '@expo/vector-icons/Ionicons';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { matchMunicipality, feedAvailable } from "./mobileState";
import {
  getJson,
  type BraStats,
  type Event,
  type EventsResponse,
  type Feature,
} from "./api";
import {
  incidentCounts,
  incidentDays,
  incidentSeries,
  observedIncidents,
  type SeriesPeriod,
} from "./incidentSummary";
import {
  ReferenceBars,
  ReferenceLines,
  ReferenceTrend,
} from "./ReferenceCharts";
import { DropdownPill, SearchBar } from "./ReferenceKit";
import { Segments, Section, Surface, DetailRow } from "./ReferenceUI";
import { Freshness, StateCard, SourceDisclosure } from "./UI";
import { colors, ui } from "./theme";
import { useVisibleClock } from "./useVisibleClock";
const periods = [
  { id: "1", label: "Senaste 24 timmarna" },
  { id: "7", label: "Senaste 7 dagarna" },
  { id: "30", label: "Senaste 30 dagarna" },
  { id: "365", label: "Senaste 12 månaderna" },
] as const;
const seriesPeriods = [
  { id: "week", label: "Vecka" },
  { id: "month", label: "Månad" },
  { id: "year", label: "År" },
] as const;
const sections = [
  { id: "overview", label: "Översikt" },
  { id: "trends", label: "Trender" },
  { id: "compare", label: "Jämför områden" },
] as const;
export function StatsScreen({
  nearby,
  areas,
  initialMunicipality,
  eventsResponse,
  centerLabel = "kartans mitt",
}: {
  initialMunicipality?: string;
  nearby: Event[];
  areas: Feature[];
  eventsResponse?: EventsResponse | null;
  centerLabel?: string;
}) {
  const [section, setSection] = useState<"overview" | "trends" | "compare">(
      "overview",
    ),
    [data, setData] = useState<BraStats | null>(null),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0);
  const [region, setRegion] = useState(""),
    [comparison, setComparison] = useState(""),
    [query, setQuery] = useState(""),
    [days, setDays] = useState<(typeof periods)[number]["id"]>("30"),
    [periodOpen, setPeriodOpen] = useState(false),
    [seriesPeriod, setSeriesPeriod] = useState<SeriesPeriod>("week");
  const now = useVisibleClock(30_000);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void getJson<BraStats>("/api/bra-stats", controller.signal)
      .then((result) => setData(result))
      .catch((caught) => {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error
              ? caught.message
              : "BRÅ-data kunde inte hämtas",
          );
      });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    if (data && initialMunicipality)
      setRegion(matchMunicipality(initialMunicipality, data.regions));
  }, [initialMunicipality, data]);
  const selected = data?.regions.find((item) => item.region === region),
    compared = data?.regions.find((item) => item.region === comparison);
  const observed = useMemo(
      () => observedIncidents(nearby, Number(days), now),
      [nearby, days, now],
    ),
    buckets = useMemo(() => incidentDays(observed), [observed]),
    series = useMemo(
      () => incidentSeries(nearby, seriesPeriod, now),
      [nearby, seriesPeriod, now],
    );
  const available = feedAvailable(eventsResponse ?? null),
    source = () =>
      void Linking.openURL(data?.sourceUrl || "https://bra.se/statistik").catch(
        () => {},
      );
  const range = observed.length
    ? `${buckets[0]?.day}–${buckets.at(-1)?.day}`
    : null;
  const regionMatches = (data?.regions || []).filter(
    (item) =>
      !query ||
      item.region
        .toLocaleLowerCase("sv-SE")
        .includes(query.toLocaleLowerCase("sv-SE")),
  );
  function choose(name: string) {
    if (section === "compare" && region && region !== name)
      setComparison(name);
    else setRegion(name);
    setQuery("");
  }
  const comparisonCard = (
    <Surface>
      <View style={s.cardHead}>
        <Text style={[ui.heading, { flex: 1 }]}>Jämförelse över tid</Text>
        <View style={s.miniSegments}>
          {seriesPeriods.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: item.id === seriesPeriod }}
              onPress={() => setSeriesPeriod(item.id)}
              style={[
                s.miniSegment,
                item.id === seriesPeriod && s.miniSegmentOn,
              ]}
            >
              <Text
                style={[
                  s.miniText,
                  item.id === seriesPeriod && { color: "#fff" },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {!available ? (
        <Text style={ui.body}>Polisflödet är inte tillgängligt.</Text>
      ) : series.labels.length >= 2 ? (
        <ReferenceLines labels={series.labels} series={series.series} />
      ) : (
        <StateCard
          title="Underlaget är för kort för en kurva"
          body="De hämtade polisnotiserna täcker inte tillräckligt många perioder. Välj en kortare period."
        />
      )}
      <Text style={ui.meta}>
        {series.complete
          ? "Antal hämtade polisnotiser per period."
          : "Perioder före den äldsta hämtade notisen visas inte i stället för att visas som noll."}
      </Text>
    </Surface>
  );
  return (
    <View>
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Sök plats, adress eller område…"
        onSubmit={() => regionMatches[0] && choose(regionMatches[0].region)}
        onFilter={() => setPeriodOpen((open) => !open)}
        filterLabel="Välj period"
      />
      {!!query && (
        <View style={[ui.row, { marginBottom: 6 }]}>
          {regionMatches.slice(0, 8).map((item) => (
            <Pressable
              key={item.region}
              accessibilityRole="button"
              onPress={() => choose(item.region)}
              style={s.chip}
            >
              <Text style={s.chipText}>{item.region}</Text>
            </Pressable>
          ))}
          {!regionMatches.length && (
            <Text style={ui.meta}>
              {data ? "Ingen kommun matchar sökningen." : "Hämtar kommuner…"}
            </Text>
          )}
        </View>
      )}
      <Segments items={sections} value={section} onChange={setSection} />
      {section === "trends" && comparisonCard}
      {section !== "compare" && (
        <Surface>
          <Text style={ui.heading}>
            {section === "overview"
              ? "Vanligast förekommande incidenter"
              : "Notiser per datum"}
          </Text>
          <DropdownPill
            label={periods.find((item) => item.id === days)!.label}
            onPress={() => setPeriodOpen((open) => !open)}
          />
          {periodOpen && (
            <View style={s.menu}>
              {periods.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: item.id === days }}
                  onPress={() => {
                    setDays(item.id);
                    setPeriodOpen(false);
                  }}
                  style={s.menuItem}
                >
                  <Text
                    style={[
                      s.menuText,
                      item.id === days && {
                        color: colors.blue,
                        fontWeight: "800",
                      },
                    ]}
                  >
                    {item.label}
                  </Text>
                  {item.id === days && (
                    <Ionicons name="checkmark" size={16} color={colors.blue} />
                  )}
                </Pressable>
              ))}
            </View>
          )}
          {section === "overview" ? (
            <ReferenceBars
              items={incidentCounts(observed)}
              available={available}
            />
          ) : !available ? (
            <Text style={ui.body}>Polisflödet är inte tillgängligt.</Text>
          ) : buckets.length >= 3 ? (
            <ReferenceTrend items={buckets} />
          ) : (
            <StateCard
              title="Underlaget är för kort för en trend"
              body="Minst tre datum med publicerade notiser behövs för att visa en kurva. Appen har ingen komplett historik för den valda perioden."
            />
          )}
          <SourceDisclosure summary={`Hämtade polisnotiser · ${observed.length} i urvalet`}><Text style={ui.meta}>
            Inom cirka 35 km från {centerLabel}.{" "}
            {range ? `Observerade datum: ${range}. ` : ""}Antal i hämtade
            polisnotiser. Den valda perioden kan ha ofullständigt underlag;
            inga saknade dagar fylls med noll.
          </Text>
          <Freshness
            fetchedAt={eventsResponse?.fetchedAt}
            error={eventsResponse?.stale ? "Äldre hämtning" : undefined}
          />
          </SourceDisclosure>
        </Surface>
      )}
      {section === "overview" && comparisonCard}
      <Section
        title={
          section === "compare" ? "Jämför kommuner" : "BRÅ:s kommunstatistik"
        }
      />
      <Surface>
        <Text style={ui.body}>
          Anmälda brott per 100 000 invånare ·{" "}
          {data?.referenceYear || "referensår hämtas"}. Kommunnivå, separat från
          polisnotiserna. Sök kommun i fältet överst.
        </Text>
        <View style={ui.row}>
          {(data?.regions || []).slice(0, 6).map((item) => {
            const on = item.region === region || item.region === comparison;
            return (
              <Pressable
                key={item.region}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => choose(item.region)}
                style={[s.chip, on && s.chipOn]}
              >
                <Text style={[s.chipText, on && { color: "#fff" }]}>
                  {item.region}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {selected ? (
          <>
            <Text style={ui.heading}>{selected.region}</Text>
            <Text style={s.number}>
              {selected.totalPer100k.toLocaleString("sv-SE")}
            </Text>
            <Text style={ui.meta}>
              {selected.total.toLocaleString("sv-SE")} anmälningar ·{" "}
              {data?.stale ? "äldre hämtning · " : ""}referensår{" "}
              {data?.referenceYear || "saknas"}
            </Text>
          </>
        ) : (
          <Text style={ui.body}>
            {data
              ? "Välj en kommun för att se årsstatistiken."
              : "Hämtar BRÅ-statistik…"}
          </Text>
        )}
        {section === "compare" &&
          selected &&
          (compared ? (
            <>
              <Text style={ui.heading}>{compared.region}</Text>
              <Text style={s.number}>
                {compared.totalPer100k.toLocaleString("sv-SE")}
              </Text>
              <Text style={ui.meta}>
                Samma mått och referensår som kommunen ovan.
              </Text>
            </>
          ) : (
            <Text style={ui.body}>Välj en andra kommun för jämförelse.</Text>
          ))}
        {selected && data && (
          <DetailRow
            title="Rikssnitt"
            body={`${data.nationalAverage.totalPer100k.toLocaleString("sv-SE")} per 100 000 invånare`}
            icon="stats-chart-outline"
          />
        )}
        {error && (
          <StateCard
            title="BRÅ kunde inte hämtas"
            body={error}
            retry={() => setReload((value) => value + 1)}
          />
        )}
        <DetailRow
          title="Källa och metod hos BRÅ"
          onPress={source}
          icon="open-outline"
        />
      </Surface>
      {section === "overview" && areas.length > 0 && (
        <>
          <Section title="Publicerade områdesuppgifter" />
          <Surface>
            {areas.slice(0, 4).map((area, index) => (
              <DetailRow
                key={area.id || index}
                title={area.properties.name}
                body={area.properties.category || "Myndighetsbedömning"}
                icon="map-outline"
                color={colors.community}
                onPress={() =>
                  void Linking.openURL(
                    area.properties.sourceUrl ||
                      "https://polisen.se/om-polisen/polisens-arbete/utsatta-omraden/",
                  ).catch(() => {})
                }
              />
            ))}
          </Surface>
        </>
      )}
      <Text style={ui.meta}>
        Uppgifterna beskriver källornas underlag och är ingen personlig
        riskpoäng.
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  miniSegments: {
    flexDirection: "row",
    backgroundColor: "#F0F3F9",
    borderRadius: 8,
    padding: 2,
  },
  miniSegment: {
    paddingHorizontal: 10,
    minHeight: 28,
    justifyContent: "center",
    borderRadius: 7,
  },
  miniSegmentOn: { backgroundColor: colors.blue },
  miniText: { fontSize: 11, fontWeight: "700", color: colors.muted },
  menu: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  menuItem: {
    minHeight: 42,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuText: { fontSize: 13, color: colors.ink },
  chip: {
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: colors.secondary,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.blue },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.blue },
  number: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -1,
    marginVertical: 4,
  },
});
