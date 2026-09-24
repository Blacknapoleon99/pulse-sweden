import { useEffect, useState } from "react";
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { getJson, type BraStats, type Event, type Feature } from "./api";

type Section = "overview" | "history" | "common" | "factors";
const sections: { id: Section; title: string }[] = [
  { id: "overview", title: "Övergripande" },
  { id: "history", title: "Senaste tio år" },
  { id: "common", title: "Vanligt förekommande" },
  { id: "factors", title: "Riskfaktorer" },
];
const blue = "#176FE1",
  ink = "#142942",
  muted = "#64768D";

export function StatsScreen({
  nearby,
  areas,
}: {
  nearby: Event[];
  areas: Feature[];
}) {
  const [section, setSection] = useState<Section>("overview");
  const [data, setData] = useState<BraStats | null>(null);
  const [error, setError] = useState("");
  const [region, setRegion] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    getJson<BraStats>("/api/bra-stats")
      .then((result) => {
        setData(result);
        setRegion(
          result.regions.find((r) => r.region === "Stockholm")?.region ||
            result.regions[0]?.region ||
            "",
        );
      })
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "BRÅ-data kunde inte hämtas",
        ),
      );
  }, []);
  const current = data?.regions.find((r) => r.region === region);
  const counts = Object.entries(
    nearby.reduce<Record<string, number>>((all, e) => {
      all[e.type || "Övrigt"] = (all[e.type || "Övrigt"] || 0) + 1;
      return all;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const openBra = () => {
    void Linking.openURL(
      data?.sourceUrl ||
        "https://bra.se/statistik/statistik-om-rattsvasendet/anmalda-brott",
    );
  };
  const openHistory = () => {
    void Linking.openURL(
      "https://bra.se/download/18.11dab50419d723e44d315606/1776153587771/10La_anm_10_ar.xlsx",
    );
  };
  return (
    <View>
      <Text style={s.eyebrow}>STATISTIK · OFFENTLIGA KÄLLOR</Text>
      <Text style={s.heading}>Utforska din lägesbild</Text>
      <Text style={s.note}>
        BRÅ:s årsstatistik och polisens publicerade notiser avser olika mått. De
        visar inte risken för dig som person.
      </Text>
      <View style={s.menu}>
        {sections.map((item) => (
          <Pressable
            key={item.id}
            style={[s.menuItem, section === item.id && s.menuSelected]}
            onPress={() => setSection(item.id)}
          >
            <Text
              style={[s.menuText, section === item.id && s.menuTextSelected]}
            >
              {item.title}
            </Text>
          </Pressable>
        ))}
      </View>
      {!!error && <Text style={s.error}>{error}</Text>}
      {section === "overview" && (
        <>
          <Text style={s.title}>Anmälda brott per kommun</Text>
          <Text style={s.note}>
            Välj kommun. Siffrorna avser hela kommunen, inte en gata eller ett
            kvarter.
          </Text>
          <TextInput
            style={s.input}
            placeholder="Sök kommun"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="words"
          />
          <View style={s.regionRow}>
            {data?.regions
              .filter(
                (r) =>
                  !query ||
                  r.region
                    .toLocaleLowerCase("sv-SE")
                    .includes(query.toLocaleLowerCase("sv-SE")),
              )
              .slice(0, query ? 20 : 8)
              .map((r) => (
                <Pressable
                  key={r.region}
                  style={[s.region, region === r.region && s.regionOn]}
                  onPress={() => {
                    setRegion(r.region);
                    setQuery("");
                  }}
                >
                  <Text
                    style={[
                      s.regionText,
                      region === r.region && s.regionTextOn,
                    ]}
                  >
                    {r.region}
                  </Text>
                </Pressable>
              ))}
          </View>
          {current ? (
            <View style={s.card}>
              <Text style={s.title}>
                {current.region} · {data?.referenceYear || "år ej angivet"}
              </Text>
              <Text style={s.number}>
                {current.totalPer100k.toLocaleString("sv-SE")}
              </Text>
              <Text style={s.note}>anmälda brott per 100 000 invånare</Text>
              <Text style={s.detail}>
                {current.total.toLocaleString("sv-SE")} anmälningar · plats{" "}
                {current.rank} av {data?.regions.length} kommuner
              </Text>
              <Text style={s.detail}>{current.riskIndex}</Text>
              <Text style={s.note}>
                Rikssnitt:{" "}
                {data?.nationalAverage.totalPer100k.toLocaleString("sv-SE")} per
                100 000 invånare{data?.stale ? " · äldre hämtning" : ""}
              </Text>
            </View>
          ) : (
            <Text style={s.note}>Hämtar BRÅ-statistik…</Text>
          )}
          <Pressable onPress={openBra}>
            <Text style={s.link}>Källa och metod hos BRÅ ↗</Text>
          </Pressable>
        </>
      )}
      {section === "history" && (
        <View style={s.card}>
          <Text style={s.title}>Utveckling över tio år</Text>
          <Text style={s.note}>
            TryggPuls nuvarande BRÅ-API ger ett referensår per kommun. En
            jämförbar tioårig serie finns hos BRÅ, men hämtas ännu inte till
            appen. Här visas därför inga uppskattade värden.
          </Text>
          <Pressable onPress={openHistory}>
            <Text style={s.link}>Hämta BRÅ:s officiella tioårsfil ↗</Text>
          </Pressable>
        </View>
      )}
      {section === "common" && (
        <>
          <Text style={s.title}>Vanliga typer i hämtade polisnotiser</Text>
          <Text style={s.note}>
            Det här är typer bland de senast hämtade polisnotiserna inom cirka
            35 km från kartans mitt eller din plats, inte statistik över alla
            begångna brott.
          </Text>
          {counts.length ? (
            counts.map(([name, count]) => (
              <View key={name} style={s.listItem}>
                <Text style={s.listName}>{name}</Text>
                <Text style={s.count}>{count}</Text>
              </View>
            ))
          ) : (
            <Text style={s.note}>Inga polisnotiser i valt område.</Text>
          )}
        </>
      )}
      {section === "factors" && (
        <>
          <Text style={s.title}>Publicerade områdesuppgifter</Text>
          <Text style={s.note}>
            Områdesbedömningar och säkerhetszoner är myndighetsuppgifter, inte
            en personlig riskpoäng eller en livekarta över brott.
          </Text>
          <Pressable
            onPress={() =>
              void Linking.openURL(
                "https://bra.se/statistik/indikatorer-for-kommuners-lagesbild",
              )
            }
          >
            <Text style={s.link}>BRÅ:s indikatorer för kommuner ↗</Text>
          </Pressable>
          {areas.length ? (
            areas.slice(0, 10).map((area, i) => (
              <Pressable
                key={`${area.id || area.properties.name}-${i}`}
                style={s.listItem}
                onPress={() =>
                  area.properties.sourceUrl &&
                  Linking.openURL(area.properties.sourceUrl)
                }
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.listName}>{area.properties.name}</Text>
                  <Text style={s.note}>
                    {area.properties.category ||
                      area.properties.kind ||
                      "Officiellt område"}
                  </Text>
                </View>
                <Text style={s.link}>Källa ↗</Text>
              </Pressable>
            ))
          ) : (
            <Text style={s.note}>Inga publicerade områden i hämtad data.</Text>
          )}
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  eyebrow: { color: blue, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  heading: { color: ink, fontSize: 25, fontWeight: "800", marginTop: 7 },
  note: { color: muted, fontSize: 12, lineHeight: 18, marginTop: 7 },
  menu: { marginTop: 19, marginBottom: 18, gap: 7 },
  menuItem: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E3EAF3",
  },
  menuSelected: { backgroundColor: "#E7F1FF", borderColor: blue },
  menuText: { color: ink, fontWeight: "700", fontSize: 14 },
  menuTextSelected: { color: blue },
  title: { color: ink, fontWeight: "800", fontSize: 17, marginTop: 7 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 17,
    borderWidth: 1,
    borderColor: "#E3EAF3",
    marginTop: 12,
  },
  regionRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  region: {
    backgroundColor: "#fff",
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  regionOn: { backgroundColor: blue },
  regionText: { color: ink, fontSize: 10 },
  regionTextOn: { color: "#fff" },
  input: {
    borderColor: "#D9E3EE",
    borderWidth: 1,
    borderRadius: 12,
    padding: 11,
    marginTop: 12,
    backgroundColor: "#fff",
    color: ink,
  },
  number: { color: blue, fontSize: 38, fontWeight: "800", marginTop: 8 },
  detail: { color: ink, fontSize: 12, marginTop: 10 },
  link: { color: blue, fontWeight: "800", fontSize: 12, marginTop: 14 },
  listItem: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 13,
    marginTop: 9,
    flexDirection: "row",
    alignItems: "center",
  },
  listName: { color: ink, fontWeight: "700", fontSize: 13, flex: 1 },
  count: { color: blue, fontWeight: "800", fontSize: 16 },
  error: { color: "#A43E31", marginTop: 12 },
});
