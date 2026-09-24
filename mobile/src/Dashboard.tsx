import { useEffect, useState } from "react";
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
  Feature,
  FeedResponse,
  FamilyMessage,
} from "./api";
import { familyRequest, familyToken } from "./api";
import { FamilyScreen } from "./FamilyScreen";
import { StatsScreen } from "./StatsScreen";
import { ProfileScreen } from "./ProfileScreen";

export type DashboardScreen =
  | "home"
  | "alerts"
  | "news"
  | "family"
  | "stats"
  | "info";
export type Destination = DashboardScreen | "map" | "events" | "route" | "info";

type Props = {
  screen: DashboardScreen;
  topInset: number;
  bottomInset: number;
  events: EventsResponse | null;
  areas: Feature[];
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
  onRouteTo: (address: string) => void;
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

function EventTile({ event, onPress }: { event: Event; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.type}, ${event.name}, ${time(event.ts)}`}
      style={({ pressed }) => [styles.eventTile, pressed && styles.pressed]}
    >
      <View style={styles.eventIcon}>
        <Ionicons name="pulse-outline" size={18} color="#C46E45" />
      </View>
      <Text style={styles.eventType} numberOfLines={2}>
        {event.type || "Händelse"}
      </Text>
      <Text style={styles.eventTime}>{time(event.ts)}</Text>
      <Text style={styles.eventPlace} numberOfLines={1}>
        {event.location?.name || event.name || "Område"}
      </Text>
    </Pressable>
  );
}

export function Dashboard(props: Props) {
  const {
    screen,
    topInset,
    bottomInset,
    events,
    areas,
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
    onRouteTo,
  } = props;
  const urgent = crisis?.vmas || [];
  const notices = crisis?.notices || [];
  const weatherItems = weather?.items || [];
  const alertCount = urgent.length + notices.length + weatherItems.length;
  const newsItems = [...(news?.items || []), ...(zoneNews?.items || [])].sort(
    (a, b) => Date.parse(b.publishedAt || "") - Date.parse(a.publishedAt || ""),
  );
  const isHome = screen === "home";
  const [lastMessage, setLastMessage] = useState<FamilyMessage | null>(null);
  useEffect(() => {
    if (!isHome) return;
    let active = true;
    familyToken()
      .then((token) =>
        token ? familyRequest<{ messages: FamilyMessage[] }>("messages") : null,
      )
      .then((result) => {
        if (active) setLastMessage(result?.messages.at(-1) || null);
      })
      .catch(() => {
        if (active) setLastMessage(null);
      });
    return () => {
      active = false;
    };
  }, [isHome]);
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
            <Text style={styles.eyebrow}>HEM · DIN ÖVERBLICK</Text>
            <Text style={styles.heading}>Det viktigaste, på ett ställe.</Text>
            <Text style={styles.intro}>
              Se aktuella källor och ta dig snabbt vidare.
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
            <SectionTitle title="Snabböversikt" />
            <View style={styles.actions}>
              <ActionTile
                icon="notifications-outline"
                label="Varningar"
                detail={
                  crisis || weather
                    ? `${alertCount} i flödena · ${urgent[0]?.title || weatherItems[0]?.title || "Se läget"}`
                    : "Hämtar…"
                }
                tint="#FFE9E1"
                onPress={() => go("alerts")}
              />
              <ActionTile
                icon="people-outline"
                label="Familj"
                detail="Karta, medlemmar & chatt"
                tint="#E9E9FF"
                onPress={() => go("family")}
              />
              <ActionTile
                icon="newspaper-outline"
                label="Viktiga nyheter"
                detail={
                  news || zoneNews
                    ? `${newsItems.length} i flödet · ${newsItems[0]?.title || "Se uppdateringar"}`
                    : "Hämtar…"
                }
                tint="#E2F3F0"
                onPress={() => go("news")}
              />
            </View>
            <SectionTitle
              title="Händelser"
              action="Visa alla"
              onPress={() => go("events")}
            />
            <View style={styles.eventRow}>
              {nearby.length ? (
                nearby
                  .slice(0, 3)
                  .map((event) => (
                    <EventTile
                      key={event.id}
                      event={event}
                      onPress={() => openSource(event.url)}
                    />
                  ))
              ) : (
                <Text style={styles.emptyCard}>
                  {events
                    ? "Inga polisnotiser matchar det valda området i tillgängliga data."
                    : "Polisens händelser kunde inte hämtas just nu."}
                </Text>
              )}
            </View>
            <SectionTitle title="Chattar" />
            <Pressable
              style={styles.chatCard}
              onPress={() => go("family")}
              accessibilityRole="button"
            >
              <View style={styles.chatIcon}>
                <Ionicons
                  name="chatbubbles-outline"
                  size={21}
                  color="#675DBA"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.chatTitle}>
                  {lastMessage
                    ? `${lastMessage.sender_name} i familjechatten`
                    : "Familjechatten"}
                </Text>
                <Text style={styles.body}>
                  {lastMessage
                    ? lastMessage.body
                    : "Läs och skicka meddelanden i din familj. Logga in för att se chatten."}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={blue} />
            </Pressable>
            <SectionTitle title="Dina sidor" />
            <View style={styles.actions}>
              <ActionTile
                icon="person-outline"
                label="Profil"
                detail="Konto och källor"
                tint="#E7EFF9"
                onPress={() => go("info")}
              />
              <ActionTile
                icon="people-outline"
                label="Familj"
                detail="Medlemmar & zoner"
                tint="#E9E9FF"
                onPress={() => go("family")}
              />
              <ActionTile
                icon="stats-chart-outline"
                label="Statistik"
                detail="BRÅ och polisnotiser"
                tint="#E2F3F0"
                onPress={() => go("stats")}
              />
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
              <FamilyScreen
                nearby={events?.events || []}
                openSource={openSource}
              />
            )}
            {screen === "stats" && (
              <StatsScreen nearby={nearby} areas={areas} />
            )}
            {screen === "info" && (
              <>
                <ProfileScreen onRouteTo={onRouteTo} />
                <SectionTitle title="Datakällor" />
                <Text style={styles.body}>
                  Polisnotiser, BRÅ, SMHI och Krisinformation hämtas från
                  TryggPuls server. Publicerade uppgifter kan vara fördröjda och
                  kartpunkter ungefärliga.
                </Text>
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
    marginBottom: 16,
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
    fontSize: 25,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.8,
    marginTop: 8,
  },
  intro: {
    color: muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
    marginBottom: 10,
  },
  location: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#E8F2FF",
    borderRadius: 16,
    marginBottom: 13,
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
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
    marginTop: 2,
  },
  sectionTitle: {
    color: navy,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  sectionAction: { color: blue, fontSize: 12, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 8, marginBottom: 17 },
  actionTile: {
    flex: 1,
    minHeight: 100,
    borderRadius: 18,
    backgroundColor: "#fff",
    padding: 10,
    borderWidth: 1,
    borderColor: "#E7EDF5",
  },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  tileIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
  },
  tileLabel: { color: navy, fontSize: 11, fontWeight: "800" },
  tileDetail: { color: muted, fontSize: 10, lineHeight: 13, marginTop: 3 },
  eventRow: { flexDirection: "row", gap: 8, marginBottom: 17 },
  eventTile: {
    flex: 1,
    minHeight: 108,
    borderRadius: 17,
    padding: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E7EDF5",
  },
  eventIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#FFF0E8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
  },
  eventType: { color: navy, fontSize: 11, fontWeight: "800", lineHeight: 14 },
  eventTime: {
    color: "#A4623E",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 4,
  },
  eventPlace: { color: muted, fontSize: 9, marginTop: 4 },
  emptyCard: {
    flex: 1,
    color: muted,
    backgroundColor: "#fff",
    borderRadius: 17,
    padding: 15,
    fontSize: 12,
    lineHeight: 18,
  },
  chatCard: {
    flexDirection: "row",
    gap: 11,
    alignItems: "center",
    padding: 12,
    backgroundColor: "#fff",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#E7EDF5",
    marginBottom: 17,
  },
  chatIcon: {
    width: 37,
    height: 37,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EDEBFF",
  },
  chatTitle: { color: navy, fontSize: 12, fontWeight: "800" },
  body: { color: muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  meta: { color: "#8494A7", fontSize: 10, marginTop: 6 },
  empty: { color: muted, fontSize: 12, lineHeight: 18, paddingVertical: 15 },
  finePrint: { color: "#7D8DA2", fontSize: 10, lineHeight: 15, marginTop: 1 },
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
