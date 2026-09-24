import { Ionicons } from "@expo/vector-icons";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import type {
  Bulletin,
  CrisisResponse,
  Event,
  EventsResponse,
  FeedResponse,
} from "./api";

export type DashboardScreen = "home" | "alerts" | "news" | "family";
export type Destination = DashboardScreen | "map" | "events" | "route" | "info";

type Props = {
  screen: DashboardScreen;
  topInset: number;
  bottomInset: number;
  events: EventsResponse | null;
  nearby: Event[];
  weather: FeedResponse | null;
  crisis: CrisisResponse | null;
  news: FeedResponse | null;
  zoneNews: FeedResponse | null;
  hasLocation: boolean;
  loading: boolean;
  notice?: string;
  onRefresh: () => void;
  onLocate: () => void;
  go: (screen: Destination) => void;
  openSource: (url?: string) => void;
};

const navy = "#142942";
const blue = "#176FE1";
const muted = "#64768D";

function time(value?: number | string) {
  if (!value) return "Tid ej angiven";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Tid ej angiven"
    : parsed.toLocaleString("sv-SE", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function ActionTile({
  icon,
  label,
  detail,
  tint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  tint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.actionTile, pressed && styles.pressed]}
    >
      <View style={[styles.tileIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={22} color={navy} />
      </View>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileDetail} numberOfLines={2}>
        {detail}
      </Text>
    </Pressable>
  );
}

function SectionTitle({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onPress && (
        <Pressable onPress={onPress} accessibilityRole="button">
          <Text style={styles.sectionAction}>
            {action} <Ionicons name="arrow-forward" size={14} />
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function BulletinCard({
  item,
  label,
  tone,
  onPress,
}: {
  item: Bulletin;
  label: string;
  tone: "red" | "amber" | "blue";
  onPress: () => void;
}) {
  const color =
    tone === "red" ? "#D34D5B" : tone === "amber" ? "#D78A36" : blue;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.bulletin, pressed && styles.pressed]}
    >
      <View style={[styles.bulletinRule, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.eyebrow, { color }]}>{label}</Text>
        <Text style={styles.bulletinTitle}>{item.title}</Text>
        {item.summary ? (
          <Text style={styles.body} numberOfLines={3}>
            {item.summary}
          </Text>
        ) : null}
        <Text style={styles.meta}>
          {item.area ? `${item.area} · ` : ""}
          {time(item.publishedAt)}
        </Text>
      </View>
      <Ionicons name="open-outline" size={16} color={muted} />
    </Pressable>
  );
}

function ReportRow({ event, onPress }: { event: Event; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.report, pressed && styles.pressed]}
    >
      <View style={styles.reportMark}>
        <Ionicons name="pulse" size={18} color="#CE7950" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.reportTitle} numberOfLines={1}>
          {event.type} · {event.name}
        </Text>
        <Text style={styles.body} numberOfLines={2}>
          {event.summary}
        </Text>
        <Text style={styles.meta}>
          {event.location?.name || "Område"} · {time(event.ts)} · ungefärlig
          plats
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color="#93A2B3" />
    </Pressable>
  );
}

export function Dashboard(props: Props) {
  const {
    screen,
    topInset,
    bottomInset,
    events,
    nearby,
    weather,
    crisis,
    news,
    zoneNews,
    hasLocation,
    loading,
    notice,
    onRefresh,
    onLocate,
    go,
    openSource,
  } = props;
  const urgent = crisis?.vmas || [];
  const notices = crisis?.notices || [];
  const weatherItems = weather?.items || [];
  const alertCount = urgent.length + notices.length + weatherItems.length;
  const newsItems = [...(news?.items || []), ...(zoneNews?.items || [])].sort(
    (a, b) => Date.parse(b.publishedAt || "") - Date.parse(a.publishedAt || ""),
  );
  const isHome = screen === "home";
  return (
    <View style={styles.page}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topInset + 16, paddingBottom: bottomInset + 108 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={onRefresh}
            tintColor={blue}
          />
        }
      >
        <View style={styles.topRow}>
          <Pressable
            style={styles.brand}
            onPress={() => go("home")}
            accessibilityRole="button"
            accessibilityLabel="Till startsidan"
          >
            <View style={styles.brandMark}>
              <Ionicons name="shield-checkmark" size={20} color="#fff" />
            </View>
            <Text style={styles.brandText}>TryggPuls</Text>
          </Pressable>
          <Pressable
            style={styles.avatar}
            onPress={() => go("info")}
            accessibilityRole="button"
            accessibilityLabel="Information och profil"
          >
            <Ionicons name="person-outline" size={21} color={navy} />
          </Pressable>
        </View>

        {isHome ? (
          <>
            <Text style={styles.eyebrow}>DIN ÖVERBLICK</Text>
            <Text style={styles.heading}>Trygghet börjar med överblick.</Text>
            <Text style={styles.intro}>
              Händelser, varningar och viktiga uppdateringar samlade på ett
              ställe.
            </Text>
            <Pressable
              style={styles.location}
              onPress={onLocate}
              accessibilityRole="button"
            >
              <Ionicons name="location-outline" size={17} color={blue} />
              <Text style={styles.locationText}>
                {hasLocation
                  ? "Visar nära din plats"
                  : "Visar kring kartans mitt · välj min plats"}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={blue} />
            </Pressable>
            {!!notice && <Text style={styles.notice}>{notice}</Text>}
            <View style={styles.hero}>
              <View style={styles.heroHalo} />
              <View style={styles.heroTop}>
                <Ionicons name="radio-outline" size={21} color="#95EEE6" />
                <Text style={styles.heroEyebrow}>
                  {events?.stale
                    ? "SENAST HÄMTADE LÄGESBILD"
                    : "PUBLICERAD LÄGESBILD"}
                </Text>
                <View style={styles.heroDot} />
              </View>
              <Text style={styles.heroTitle}>
                {events
                  ? `${nearby.length} polisnotiser i området`
                  : "Hämtar polisens notiser"}
              </Text>
              <Text style={styles.heroBody}>
                Publicerade uppgifter nära{" "}
                {hasLocation ? "din plats" : "kartans mitt"}. Positioner och
                tider kan vara ungefärliga.
              </Text>
              <Pressable
                style={styles.heroButton}
                onPress={() => go("map")}
                accessibilityRole="button"
              >
                <Text style={styles.heroButtonText}>Utforska kartan</Text>
                <Ionicons name="arrow-forward" size={17} color={navy} />
              </Pressable>
            </View>
            <SectionTitle title="Genvägar" />
            <View style={styles.actions}>
              <ActionTile
                icon="notifications-outline"
                label="Varningar"
                detail={
                  crisis || weather ? `${alertCount} i flödena` : "Hämtar…"
                }
                tint="#FFE9E1"
                onPress={() => go("alerts")}
              />
              <ActionTile
                icon="people-outline"
                label="Familj"
                detail="Platser & delning"
                tint="#E9E9FF"
                onPress={() => go("family")}
              />
              <ActionTile
                icon="newspaper-outline"
                label="Viktigt"
                detail={
                  news || zoneNews ? `${newsItems.length} nyheter` : "Hämtar…"
                }
                tint="#E2F3F0"
                onPress={() => go("news")}
              />
            </View>
            <SectionTitle
              title="Senaste polisnotiser"
              action="Visa alla"
              onPress={() => go("events")}
            />
            <View style={styles.card}>
              {nearby.length ? (
                nearby
                  .slice(0, 3)
                  .map((event) => (
                    <ReportRow
                      key={event.id}
                      event={event}
                      onPress={() => openSource(event.url)}
                    />
                  ))
              ) : (
                <Text style={styles.empty}>
                  {events
                    ? "Inga polisnotiser matchar det valda området i tillgängliga data."
                    : "Polisens händelser kunde inte hämtas just nu."}
                </Text>
              )}
            </View>
            <View style={styles.utilityRow}>
              <Pressable style={styles.utility} onPress={() => go("route")}>
                <Ionicons name="navigate-outline" size={20} color={blue} />
                <Text style={styles.utilityText}>Planera rutt</Text>
              </Pressable>
              <Pressable
                style={styles.utility}
                onPress={() =>
                  openSource("https://tryggpuls.onrender.com/#bra")
                }
              >
                <Ionicons name="stats-chart-outline" size={20} color={blue} />
                <Text style={styles.utilityText}>Statistik ↗</Text>
              </Pressable>
            </View>
            <Text style={styles.finePrint}>
              Uppgifter från myndighetskällor kan vara fördröjda. En tom lista
              är ingen säkerhetsgaranti.
            </Text>
          </>
        ) : (
          <>
            <Pressable
              style={styles.back}
              onPress={() => go("home")}
              accessibilityRole="button"
            >
              <Ionicons name="chevron-back" size={18} color={blue} />
              <Text style={styles.backText}>Hem</Text>
            </Pressable>
            {screen === "alerts" && (
              <>
                <Text style={styles.eyebrow}>MYNDIGHETSFLÖDEN</Text>
                <Text style={styles.heading}>Varningar och meddelanden</Text>
                <Text style={styles.intro}>
                  VMA, Krisinformation och SMHI för hela Sverige. Kontrollera
                  alltid berört område och giltighet i originalkällan.
                </Text>
                <SectionTitle
                  title={`VMA ${urgent.length ? `· ${urgent.length}` : ""}`}
                />
                {urgent.length ? (
                  urgent.map((item, i) => (
                    <BulletinCard
                      key={item.id || i}
                      item={item}
                      label="VIKTIGT MEDDELANDE"
                      tone="red"
                      onPress={() => openSource(item.source)}
                    />
                  ))
                ) : (
                  <Text style={styles.empty}>
                    {crisis
                      ? "Inga VMA i hämtade data."
                      : "VMA-flödet är inte tillgängligt."}
                  </Text>
                )}
                <SectionTitle title="Övriga meddelanden" />
                {notices.length ? (
                  notices.map((item, i) => (
                    <BulletinCard
                      key={item.id || i}
                      item={item}
                      label="KRISINFORMATION"
                      tone="blue"
                      onPress={() => openSource(item.source)}
                    />
                  ))
                ) : (
                  <Text style={styles.empty}>
                    {crisis
                      ? "Inga meddelanden i hämtade data."
                      : "Flödet är inte tillgängligt."}
                  </Text>
                )}
                <SectionTitle title="Vädervarningar" />
                {weatherItems.length ? (
                  weatherItems
                    .slice(0, 20)
                    .map((item, i) => (
                      <BulletinCard
                        key={item.id || i}
                        item={item}
                        label={`SMHI · ${item.levelLabel || "VARNING"}`}
                        tone="amber"
                        onPress={() => openSource(item.source)}
                      />
                    ))
                ) : (
                  <Text style={styles.empty}>
                    {weather
                      ? "Inga vädervarningar i hämtade data."
                      : "SMHI-flödet är inte tillgängligt."}
                  </Text>
                )}
              </>
            )}
            {screen === "news" && (
              <>
                <Text style={styles.eyebrow}>VIKTIGA NYHETER</Text>
                <Text style={styles.heading}>Senaste uppdateringarna</Text>
                <Text style={styles.intro}>
                  Publiceringar från Krisinformation och Polisens nyheter om
                  säkerhetszoner. En nyhetsartikel betyder inte att en zon är
                  aktiv.
                </Text>
                {newsItems.length ? (
                  newsItems
                    .slice(0, 20)
                    .map((item, i) => (
                      <BulletinCard
                        key={item.id || `${item.title}-${i}`}
                        item={item}
                        label={
                          item.url
                            ? "POLISEN · SÄKERHETSZON"
                            : "KRISINFORMATION"
                        }
                        tone="blue"
                        onPress={() => openSource(item.url || item.source)}
                      />
                    ))
                ) : (
                  <Text style={styles.empty}>
                    {news || zoneNews
                      ? "Inga nya artiklar i de hämtade flödena."
                      : "Nyhetsflödena kunde inte hämtas just nu."}
                  </Text>
                )}
              </>
            )}
            {screen === "family" && (
              <>
                <Text style={styles.eyebrow}>FAMILJ & PLATSER</Text>
                <Text style={styles.heading}>Håll ihop, på era villkor.</Text>
                <Text style={styles.intro}>
                  Familjemedlemmar väljer själva om de vill dela sin plats och
                  vilka varningar de vill ha.
                </Text>
                <View style={styles.familyHero}>
                  <Ionicons name="people" size={34} color="#6763B9" />
                  <Text style={styles.familyTitle}>Min familj</Text>
                  <Text style={styles.body}>
                    Hantera familjekonto, inbjudningar och egna zoner i
                    TryggPuls webbversion.
                  </Text>
                  <Pressable
                    style={styles.familyButton}
                    onPress={() =>
                      openSource("https://tryggpuls.onrender.com/#familj")
                    }
                    accessibilityRole="button"
                  >
                    <Text style={styles.familyButtonText}>
                      Öppna familj på webben ↗
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.familyNote}>
                  <Ionicons
                    name="information-circle-outline"
                    size={20}
                    color={blue}
                  />
                  <Text style={styles.body}>
                    Den här Expo Go-demon delar inte plats i bakgrunden och
                    skickar inga familjelarm när appen är stängd.
                  </Text>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { ...StyleSheet.absoluteFill, backgroundColor: "#F4F7FC" },
  content: { paddingHorizontal: 20 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 29,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: {
    height: 37,
    width: 37,
    borderRadius: 12,
    backgroundColor: blue,
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: {
    fontSize: 20,
    fontWeight: "800",
    color: navy,
    letterSpacing: -0.5,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: "#EAF0F8",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: { fontSize: 10, fontWeight: "800", color: blue, letterSpacing: 1.8 },
  heading: {
    color: navy,
    fontSize: 29,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    marginTop: 8,
  },
  intro: {
    color: muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 9,
    marginBottom: 19,
  },
  location: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#E8F2FF",
    borderRadius: 16,
    marginBottom: 17,
  },
  locationText: { color: blue, fontWeight: "700", fontSize: 12 },
  notice: {
    color: "#9D5E20",
    backgroundColor: "#FFF1DA",
    borderRadius: 12,
    overflow: "hidden",
    padding: 10,
    fontSize: 12,
    marginBottom: 14,
  },
  hero: {
    backgroundColor: navy,
    borderRadius: 27,
    padding: 22,
    overflow: "hidden",
    marginBottom: 24,
  },
  heroHalo: {
    position: "absolute",
    top: -70,
    right: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(42,204,193,0.09)",
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroEyebrow: {
    flex: 1,
    color: "#A8E7E6",
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "800",
  },
  heroDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#48DDC7" },
  heroTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginTop: 22,
  },
  heroBody: { color: "#C1CDDC", fontSize: 13, lineHeight: 19, marginTop: 7 },
  heroButton: {
    backgroundColor: "#fff",
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 18,
  },
  heroButtonText: { color: navy, fontWeight: "800", fontSize: 13 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    marginTop: 2,
  },
  sectionTitle: {
    color: navy,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  sectionAction: { color: blue, fontSize: 12, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 9, marginBottom: 26 },
  actionTile: {
    flex: 1,
    minHeight: 118,
    borderRadius: 20,
    backgroundColor: "#fff",
    padding: 12,
    borderWidth: 1,
    borderColor: "#E7EDF5",
  },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  tileIcon: {
    width: 37,
    height: 37,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  tileLabel: { color: navy, fontSize: 12, fontWeight: "800" },
  tileDetail: { color: muted, fontSize: 10, lineHeight: 13, marginTop: 3 },
  card: {
    borderRadius: 21,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#E7EDF5",
  },
  report: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1F6",
  },
  reportMark: {
    width: 33,
    height: 33,
    borderRadius: 11,
    backgroundColor: "#FFF0E8",
    alignItems: "center",
    justifyContent: "center",
  },
  reportTitle: { color: navy, fontSize: 13, fontWeight: "800" },
  body: { color: muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  meta: { color: "#8494A7", fontSize: 10, marginTop: 6 },
  empty: { color: muted, fontSize: 12, lineHeight: 18, paddingVertical: 15 },
  finePrint: { color: "#7D8DA2", fontSize: 11, lineHeight: 16, marginTop: 19 },
  utilityRow: { flexDirection: "row", gap: 9, marginTop: 14 },
  utility: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 15,
    padding: 13,
    backgroundColor: "#E9F2FF",
  },
  utilityText: { color: navy, fontSize: 12, fontWeight: "800" },
  back: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginBottom: 19,
    gap: 3,
  },
  backText: { color: blue, fontWeight: "700", fontSize: 14 },
  bulletin: {
    flexDirection: "row",
    gap: 12,
    padding: 15,
    borderRadius: 19,
    backgroundColor: "#fff",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E8EDF5",
  },
  bulletinRule: { width: 4, borderRadius: 4 },
  bulletinTitle: { color: navy, fontSize: 14, fontWeight: "800", marginTop: 5 },
  familyHero: {
    borderRadius: 24,
    padding: 21,
    backgroundColor: "#EEEFFF",
    gap: 8,
  },
  familyTitle: { color: navy, fontSize: 21, fontWeight: "800" },
  familyButton: {
    alignSelf: "flex-start",
    backgroundColor: blue,
    borderRadius: 13,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginTop: 10,
  },
  familyButtonText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  familyNote: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: "#EAF3FF",
    padding: 15,
    borderRadius: 17,
    marginTop: 15,
  },
});
