import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import MapView, { Circle, Marker } from "react-native-maps";
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  API_BASE,
  clearFamilyToken,
  familyRequest,
  geocode,
  type Event,
  type FamilyMessage,
  type FamilyOverview,
} from "./api";

const ink = "#142942",
  blue = "#176FE1",
  muted = "#64768D";
type Props = {
  nearby: Event[];
  openSource: (url?: string) => void;
  onMessages?: (messages: FamilyMessage[]) => void;
  onOverview?: (overview: FamilyOverview | null) => void;
};

export function FamilyScreen({
  nearby,
  openSource,
  onMessages,
  onOverview,
}: Props) {
  const [overview, setOverview] = useState<FamilyOverview | null>(null);
  const [messages, setMessages] = useState<FamilyMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [groupName, setGroupName] = useState(""),
    [inviteCode, setInviteCode] = useState("");
  const [childName, setChildName] = useState(""),
    [itemName, setItemName] = useState("");
  const [draft, setDraft] = useState("");
  const [zoneName, setZoneName] = useState(""),
    [zoneAddress, setZoneAddress] = useState("");
  const [zoneKind, setZoneKind] = useState<"safe" | "watch">("safe");
  const [radius, setRadius] = useState(300);
  const [eventFilter, setEventFilter] = useState("Alla");
  async function refresh() {
    try {
      const data = await familyRequest<FamilyOverview>("me");
      setOverview(data);
      onOverview?.(data);
      if (data.family) {
        const chat = await familyRequest<{ messages: FamilyMessage[] }>(
          "messages",
        );
        setMessages(chat.messages);
        onMessages?.(chat.messages);
      } else {
        setMessages([]);
        onMessages?.([]);
      }
      setError("");
    } catch (err) {
      setOverview(null);
      onOverview?.(null);
      setError(
        err instanceof Error && !err.message.includes("Logga in")
          ? err.message
          : "",
      );
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function action(run: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await run();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel.");
    } finally {
      setBusy(false);
    }
  }
  const members = overview?.members || [];
  const located = members.filter(
    (m) => m.sharing && Number.isFinite(m.lat) && Number.isFinite(m.lon),
  );
  const center = located[0] || overview?.zones[0];
  const eventCenter = center
    ? { lat: Number(center.lat), lon: Number(center.lon) }
    : null;
  const familyEvents = nearby.filter((e) => {
    const gps = e.location?.gps;
    if (!eventCenter || !gps) return false;
    const dy = (gps[0] - eventCenter.lat) * 111;
    const dx =
      (gps[1] - eventCenter.lon) *
      111 *
      Math.cos((eventCenter.lat * Math.PI) / 180);
    return Math.hypot(dx, dy) <= 10;
  });
  const shownEvents = familyEvents.filter(
    (e) =>
      eventFilter === "Alla" ||
      (eventFilter === "Bilstöld"
        ? /(?:stöld.{0,30}(?:bil|fordon)|(?:bil|fordon).{0,30}stöld)/i.test(
            `${e.type} ${e.summary}`,
          )
        : e.type.toLowerCase().includes(eventFilter.toLowerCase())),
  );
  return (
    <View>
      <Text style={s.eyebrow}>FAMILJ · DELADE PLATSER</Text>
      <Text style={s.heading}>{overview?.family?.name || "Min familj"}</Text>
      <Text style={s.description}>
        Varje medlem väljer själv när en position delas. Endast aktuella
        positioner visas, högst 15 minuter efter senaste delning.
      </Text>
      {!!error && <Text style={s.error}>{error}</Text>}
      {!overview ? (
        <View style={s.card}>
          <Text style={s.title}>
            {mode === "login" ? "Logga in" : "Skapa konto"}
          </Text>
          {mode === "register" && (
            <TextInput
              style={s.input}
              placeholder="Ditt namn"
              value={name}
              onChangeText={setName}
              autoComplete="name"
            />
          )}
          <TextInput
            style={s.input}
            placeholder="E-post"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <TextInput
            style={s.input}
            placeholder="Lösenord"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
          />
          <Button
            label={
              busy ? "Vänta…" : mode === "login" ? "Logga in" : "Skapa konto"
            }
            disabled={busy}
            onPress={() =>
              action(async () => {
                await familyRequest(mode, "POST", { name, email, password });
                setPassword("");
              })
            }
          />
          <Pressable
            onPress={() => setMode(mode === "login" ? "register" : "login")}
          >
            <Text style={s.link}>
              {mode === "login"
                ? "Skapa ett nytt konto"
                : "Jag har redan konto"}
            </Text>
          </Pressable>
          <Text style={s.note}>
            Familjekontot sparas på TryggPuls server. Inloggningen lagras säkert
            på din enhet.
          </Text>
        </View>
      ) : !overview.family ? (
        <View style={s.card}>
          <Text style={s.title}>Välkommen, {overview.user.display_name}</Text>
          <Text style={s.description}>
            Skapa en familj eller använd en engångskod från en inbjudan.
          </Text>
          <TextInput
            style={s.input}
            placeholder="Familjens namn"
            value={groupName}
            onChangeText={setGroupName}
          />
          <Button
            label="Skapa familj"
            disabled={busy}
            onPress={() =>
              action(() => familyRequest("group", "POST", { name: groupName }))
            }
          />
          <TextInput
            style={s.input}
            placeholder="Inbjudningskod"
            value={inviteCode}
            onChangeText={setInviteCode}
            autoCapitalize="none"
          />
          <Button
            label="Gå med"
            disabled={busy}
            onPress={() =>
              action(() =>
                familyRequest("join", "POST", { token: inviteCode.trim() }),
              )
            }
          />
          <Pressable
            onPress={() =>
              action(async () => {
                await familyRequest("logout", "POST");
                await clearFamilyToken();
                setOverview(null);
              })
            }
          >
            <Text style={s.link}>Logga ut</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={s.memberRow}>
            {members.map((m) => (
              <View key={m.id} style={s.memberChip}>
                <View
                  style={[
                    s.dot,
                    { backgroundColor: m.updated_at ? "#36AB86" : "#AAB6C4" },
                  ]}
                />
                <Text style={s.memberName}>{m.display_name}</Text>
              </View>
            ))}
          </View>
          <Text style={s.section}>Barn utan telefon · AirTag på tillhörighet</Text>
          <View style={s.card}>
            <Text style={s.description}>
              Parkoppla AirTagen i Hitta på en förälders Apple-enhet och spara
              sedan dess namn här. Att spara namnet parkopplar inte AirTagen.
              Barnet behöver ingen telefon eller uppkoppling. Platsen uppdateras
              bara när Apples Hitta-nätverk upptäcker AirTagen. Föräldern behöver
              en Apple-enhet och internet för att se den. TryggPuls får ingen
              AirTag-position och kan inte ge zon- eller nödlarm för den.
            </Text>
            {(overview.childItems || []).map((item) => (
              <View key={item.id} style={s.item}>
                <Text style={s.title}>{item.child_name}</Text>
                <Text style={s.description}>{item.item_name} · Visa i Hitta → Föremål</Text>
                {overview.family?.owner_id === overview.user.id && (
                  <Button
                    label="Ta bort referens"
                    secondary
                    disabled={busy}
                    onPress={() => action(() => familyRequest(`child-items/${encodeURIComponent(item.id)}`, "DELETE"))}
                  />
                )}
              </View>
            ))}
            {overview.family.owner_id === overview.user.id && (
              <>
                <TextInput style={s.input} placeholder="Barnets namn" value={childName} onChangeText={setChildName} maxLength={80} />
                <TextInput style={s.input} placeholder="AirTagens namn i Hitta" value={itemName} onChangeText={setItemName} maxLength={80} />
                <Button
                  label="Spara AirTag-referens"
                  disabled={busy}
                  onPress={() => action(async () => {
                    await familyRequest("child-items", "POST", { childName, itemName });
                    setChildName("");
                    setItemName("");
                  })}
                />
              </>
            )}
            <Button
              label="Så parkopplar du AirTag"
              secondary
              onPress={() => openSource("https://support.apple.com/en-gb/101602")}
            />
            <Button
              label="Så hittar du AirTag i Hitta"
              secondary
              onPress={() => openSource("https://support.apple.com/guide/iphone/locate-an-item-ipha779f0c10/ios")}
            />
            <Text style={s.note}>AirTag är gjord för föremål, inte för att spåra personer. Platsen kan vara fördröjd eller saknas.</Text>
          </View>
          <Text style={s.section}>Familjens karta</Text>
          <View style={s.mapCard}>
            {center ? (
              <MapView
                style={s.map}
                scrollEnabled={false}
                initialRegion={{
                  latitude: Number(center.lat),
                  longitude: Number(center.lon),
                  latitudeDelta: 0.075,
                  longitudeDelta: 0.075,
                }}
              >
                {located.map((m) => (
                  <Marker
                    key={m.id}
                    coordinate={{
                      latitude: Number(m.lat),
                      longitude: Number(m.lon),
                    }}
                    title={m.display_name}
                    description="Delad position, ungefärlig"
                  />
                ))}
                {overview.zones.map((z) => (
                  <Circle
                    key={z.id}
                    center={{ latitude: z.lat, longitude: z.lon }}
                    radius={z.radius}
                    strokeColor={z.kind === "safe" ? "#2C9F81" : "#D97C50"}
                    fillColor={
                      z.kind === "safe"
                        ? "rgba(44,159,129,0.13)"
                        : "rgba(217,124,80,0.13)"
                    }
                  />
                ))}
              </MapView>
            ) : (
              <View style={s.mapEmpty}>
                <Ionicons name="map-outline" size={28} color={muted} />
                <Text style={s.description}>
                  Ingen medlem delar en aktuell position och inga zoner är
                  sparade.
                </Text>
              </View>
            )}
          </View>
          <Text style={s.note}>
            Kartmarkörer visar frivilligt delade positioner. De kan vara
            ungefärliga.
          </Text>
          <View style={s.buttonRow}>
            <Button
              label="Dela min plats nu"
              disabled={busy}
              onPress={() =>
                action(async () => {
                  const permission =
                    await Location.requestForegroundPermissionsAsync();
                  if (permission.status !== "granted")
                    throw new Error("Platsåtkomst nekades.");
                  const p = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                  });
                  await familyRequest("location", "POST", {
                    lat: p.coords.latitude,
                    lon: p.coords.longitude,
                    accuracy: p.coords.accuracy ?? 100,
                  });
                })
              }
            />
            <Button
              label="Stoppa delning"
              secondary
              disabled={busy}
              onPress={() => action(() => familyRequest("stop", "POST"))}
            />
          </View>
          <Text style={s.note}>
            Expo Go delar bara när du trycker på knappen. Ingen
            bakgrundsspårning eller pushavisering är aktiv i mobilprototypen.
          </Text>
          <Text style={s.section}>Händelser inom 10 km</Text>
          <View style={s.memberRow}>
            {["Alla", "Trafikolycka", "Rån", "Bilstöld"].map((f) => (
              <Pressable
                key={f}
                style={[s.filter, eventFilter === f && s.filterOn]}
                onPress={() => setEventFilter(f)}
              >
                <Text
                  style={[s.filterText, eventFilter === f && s.filterTextOn]}
                >
                  {f}
                </Text>
              </Pressable>
            ))}
          </View>
          {shownEvents.length ? (
            shownEvents.slice(0, 5).map((e) => (
              <Pressable
                key={e.id}
                style={s.item}
                onPress={() => openSource(e.url)}
              >
                <Text style={s.title}>
                  {e.type} · {e.name}
                </Text>
                <Text style={s.note}>
                  {new Date(e.ts).toLocaleString("sv-SE")} · ungefärlig plats ↗
                </Text>
              </Pressable>
            ))
          ) : (
            <Text style={s.note}>
              {eventCenter
                ? "Inga matchande polisnotiser i hämtade data."
                : "Dela en position eller skapa en zon för lokala händelser."}
            </Text>
          )}
          <Text style={s.section}>Familjechatt</Text>
          <View style={s.card}>
            {messages.length ? (
              messages.map((m) => (
                <View key={m.id} style={s.message}>
                  <Text style={s.messageSender}>
                    {m.sender_name} ·{" "}
                    {new Date(m.created_at).toLocaleString("sv-SE")}
                  </Text>
                  <Text style={s.description}>{m.body}</Text>
                </View>
              ))
            ) : (
              <Text style={s.note}>Inga meddelanden ännu.</Text>
            )}
            <TextInput
              style={[s.input, s.chatInput]}
              placeholder="Skriv till familjen"
              value={draft}
              onChangeText={setDraft}
              maxLength={500}
              multiline
            />
            <View style={s.buttonRow}>
              <Button
                label="Skicka"
                disabled={busy || !draft.trim()}
                onPress={() =>
                  action(async () => {
                    await familyRequest("messages", "POST", { body: draft });
                    setDraft("");
                  })
                }
              />
              <Button
                label="Uppdatera"
                secondary
                disabled={busy}
                onPress={() => action(refresh)}
              />
            </View>
          </View>
          <Text style={s.section}>Familjens zoner</Text>
          {overview.zones.length ? (
            overview.zones.map((z) => (
              <Text key={z.id} style={s.item}>
                {z.name} · {z.kind === "safe" ? "Trygg plats" : "Bevakad plats"}{" "}
                · {z.radius} m
              </Text>
            ))
          ) : (
            <Text style={s.note}>Inga zoner tillagda.</Text>
          )}
          {overview.family.owner_id === overview.user.id && (
            <View style={s.card}>
              <Text style={s.title}>Lägg till zon</Text>
              <TextInput
                style={s.input}
                placeholder="Namn, t.ex. Skola"
                value={zoneName}
                onChangeText={setZoneName}
              />
              <TextInput
                style={s.input}
                placeholder="Adress eller ort"
                value={zoneAddress}
                onChangeText={setZoneAddress}
              />
              <View style={s.memberRow}>
                {["safe", "watch"].map((k) => (
                  <Pressable
                    key={k}
                    style={[s.filter, zoneKind === k && s.filterOn]}
                    onPress={() => setZoneKind(k as "safe" | "watch")}
                  >
                    <Text
                      style={[s.filterText, zoneKind === k && s.filterTextOn]}
                    >
                      {k === "safe" ? "Trygg plats" : "Bevakad plats"}
                    </Text>
                  </Pressable>
                ))}
                {[300, 500, 1000].map((n) => (
                  <Pressable
                    key={n}
                    style={[s.filter, radius === n && s.filterOn]}
                    onPress={() => setRadius(n)}
                  >
                    <Text
                      style={[s.filterText, radius === n && s.filterTextOn]}
                    >
                      {n} m
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Button
                label="Spara zon"
                disabled={busy}
                onPress={() =>
                  action(async () => {
                    const result = await geocode(zoneAddress);
                    const point = result.results[0];
                    if (!point) throw new Error("Platsen hittades inte.");
                    await familyRequest("zones", "POST", {
                      name: zoneName,
                      kind: zoneKind,
                      radius,
                      lat: point.lat,
                      lon: point.lon,
                    });
                    setZoneName("");
                    setZoneAddress("");
                  })
                }
              />
            </View>
          )}
          <Text style={s.section}>Senaste familjevarningar</Text>
          {overview.alerts.length ? (
            overview.alerts.slice(0, 8).map((a) => (
              <Pressable
                key={a.id}
                style={s.item}
                onPress={() => openSource(a.source_url)}
              >
                <Text style={s.title}>{a.title}</Text>
                <Text style={s.description}>{a.detail}</Text>
                <Text style={s.note}>
                  {new Date(a.created_at).toLocaleString("sv-SE")}
                </Text>
              </Pressable>
            ))
          ) : (
            <Text style={s.note}>
              Inga familjevarningar de senaste sju dagarna.
            </Text>
          )}
          <Button
            label={
              overview.user.police_area_alerts
                ? "Stäng av områdesvarningar"
                : "Aktivera områdesvarningar"
            }
            secondary
            disabled={busy}
            onPress={() =>
              action(() =>
                familyRequest("police-area-alerts", "POST", {
                  enabled: !overview.user.police_area_alerts,
                }),
              )
            }
          />
          {overview.family.owner_id === overview.user.id && (
            <Button
              label="Bjud in familjemedlem"
              secondary
              disabled={busy}
              onPress={() =>
                action(async () => {
                  const result = await familyRequest<{ token: string }>(
                    "invite",
                    "POST",
                  );
                  await Share.share({
                    message: `${API_BASE}/#familj-invite=${result.token}`,
                  });
                })
              }
            />
          )}
          <Pressable
            onPress={() =>
              action(async () => {
                await familyRequest("logout", "POST");
                await clearFamilyToken();
                setOverview(null);
              })
            }
          >
            <Text style={s.link}>Logga ut</Text>
          </Pressable>
        </>
      )}
      {busy && <ActivityIndicator color={blue} style={{ marginTop: 12 }} />}
    </View>
  );
}
function Button({
  label,
  onPress,
  disabled,
  secondary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        secondary && s.buttonSecondary,
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: blue }]}>{label}</Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  eyebrow: { color: blue, fontSize: 10, letterSpacing: 1.5, fontWeight: "800" },
  heading: { color: ink, fontSize: 25, fontWeight: "800", marginTop: 7 },
  description: { color: muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  note: { color: muted, fontSize: 11, lineHeight: 16, marginTop: 8 },
  error: {
    color: "#A43E31",
    backgroundColor: "#FFF1ED",
    borderRadius: 12,
    padding: 12,
    marginVertical: 10,
  },
  section: {
    color: ink,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 22,
    marginBottom: 9,
  },
  card: {
    backgroundColor: "#fff",
    borderColor: "#E3EAF3",
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginTop: 12,
  },
  title: { color: ink, fontSize: 13, fontWeight: "800" },
  input: {
    borderColor: "#D9E3EE",
    borderWidth: 1,
    borderRadius: 12,
    padding: 11,
    marginTop: 10,
    color: ink,
    backgroundColor: "#fff",
  },
  button: {
    backgroundColor: blue,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 10,
    flexGrow: 1,
  },
  buttonSecondary: { backgroundColor: "#E8F2FF" },
  buttonText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  link: { color: blue, fontSize: 13, fontWeight: "700", marginTop: 16 },
  memberRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  memberChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  memberName: { color: ink, fontSize: 11, fontWeight: "700" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  mapCard: {
    height: 220,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#E3EAF3",
  },
  map: { flex: 1 },
  mapEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  filter: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderColor: "#DBE5EF",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  filterOn: { backgroundColor: blue, borderColor: blue },
  filterText: { color: ink, fontSize: 10, fontWeight: "700" },
  filterTextOn: { color: "#fff" },
  item: {
    backgroundColor: "#fff",
    borderColor: "#E4EAF2",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 7,
    color: ink,
    fontSize: 12,
  },
  message: {
    borderBottomColor: "#E9EFF5",
    borderBottomWidth: 1,
    paddingVertical: 9,
  },
  messageSender: { color: blue, fontSize: 11, fontWeight: "800" },
  chatInput: { minHeight: 60, textAlignVertical: "top" },
});
