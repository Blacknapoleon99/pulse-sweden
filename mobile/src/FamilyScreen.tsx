import { Text, TextInput } from './Typography';
import { useEffect, useState } from "react";
import Ionicons from '@expo/vector-icons/Ionicons';
import * as SecureStore from "expo-secure-store";
import MapView, { Polyline } from "react-native-maps";
import {MapLabelMarker} from './MapLabelMarker';
import { ActivityIndicator, Linking, Pressable, Share, Switch, StyleSheet, View } from 'react-native';
import {
  API_BASE,
  clearFamilyToken,
  familyRequest,
  geocode,
  type Event,
  type FamilyMessage,
  type FamilyOverview,
} from "./api";

import { useFamily } from "./FamilyState";
import {useIsFocused,useNavigation} from '@react-navigation/native';
import {familyTrailSegments} from './familyTrails';
import {openPrototypeTab} from './PrototypeChrome';
import {IncidentHeat,IncidentTiles,MapPill,PlaceLabel,SectionHeader} from './ReferenceKit';
import {PrivateFamilyChat} from './PrivateFamilyChat';
import {FamilyStrip} from './FamilyStrip';
import {positionFresh} from './mobileState';
import {referenceMapStyle} from './referenceMapStyle';

const ink = "#11152A",
  blue = "#2187F5",
  muted = "#72788D";
type Props = {
  nearby: Event[];
  openSource: (url?: string) => void;
  onMessages?: (messages: FamilyMessage[]) => void;
  onOverview?: (overview: FamilyOverview | null) => void;
};
type AirTagReference = { id: string; child_name: string; item_name: string };

export function FamilyScreen({
  nearby,
  openSource,
  onMessages,
  onOverview,
}: Props) {
  const { overview, messages, trails, refresh: refreshShared, error: placesError,chatError,alarmError, revision,clock,setChatActive,liveSharing,liveBusy,liveError,startLiveSharing,stopLiveSharing,backgroundSharing,backgroundBuildSupported,toggleBackgroundSharing } = useFamily();
  const sharedError=placesError||chatError||alarmError;
  const focused=useIsFocused();
  useEffect(()=>{if(!focused)return;setChatActive(true);return()=>setChatActive(false);},[focused]);
  const [membersOpen,setMembersOpen]=useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bankIdEnabled, setBankIdEnabled] = useState(false);
  const [bankIdEnvironment, setBankIdEnvironment] = useState("test");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [groupName, setGroupName] = useState(""),
    [inviteCode, setInviteCode] = useState("");
  const [childName, setChildName] = useState(""),
    [itemName, setItemName] = useState("");
  const [deviceItems, setDeviceItems] = useState<AirTagReference[]>([]);
  const [draft, setDraft] = useState("");
  const [zoneName, setZoneName] = useState(""),
    [zoneAddress, setZoneAddress] = useState("");
  const [zoneKind, setZoneKind] = useState<"safe" | "watch">("safe");
  const [radius, setRadius] = useState(300);
  const [eventFilter, setEventFilter] = useState("Alla");
  const [showAllEvents, setShowAllEvents] = useState(false);
  const navigation = useNavigation<any>();
  async function refresh() { await refreshShared(); }
  useEffect(() => { setPassword(""); setDraft(""); setDeviceItems([]); setInviteCode(""); setZoneName(""); setZoneAddress(""); setError(""); }, [revision]);
  useEffect(() => {
    void refresh();
    void familyRequest<{ enabled: boolean; environment: string }>("bankid/config")
      .then(config => { setBankIdEnabled(config.enabled); setBankIdEnvironment(config.environment); })
      .catch(() => setBankIdEnabled(false));
  }, []);
  useEffect(() => {
    if (!overview?.family) { setDeviceItems([]); return; }
    const key = `tryggpuls-airtags-${overview.user.id}-${overview.family.id}`;
    let active = true;
    void SecureStore.getItemAsync(key).then(raw => {
      if (!active) return;
      try {
        const parsed = JSON.parse(raw || '[]');
        setDeviceItems(Array.isArray(parsed) ? parsed.filter(item => typeof item?.id === 'string' && typeof item?.child_name === 'string' && typeof item?.item_name === 'string').slice(0, 5) : []);
      } catch { setDeviceItems([]); }
    }).catch(() => { if (active) setDeviceItems([]); });
    return () => { active = false; };
  }, [overview?.user.id, overview?.family?.id]);
  async function saveDeviceItems(items: AirTagReference[]) {
    if (!overview?.family) throw new Error('Gå med i en familj först.');
    const key = `tryggpuls-airtags-${overview.user.id}-${overview.family.id}`;
    await SecureStore.setItemAsync(key, JSON.stringify(items));
    setDeviceItems(items);
  }
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
  async function bankIdLogin() {
    setBusy(true); setError("");
    try {
      const start = await familyRequest<{ flowToken: string; autoStartToken: string }>("bankid/start", "POST", {});
      await Linking.openURL(`https://app.bankid.com/?autostarttoken=${encodeURIComponent(start.autoStartToken)}`);
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const result = await familyRequest<{ status: "pending" | "complete" | "failed" }>("bankid/collect", "POST", { flowToken: start.flowToken });
        if (result.status === "failed") throw new Error("BankID-identifieringen slutfördes inte. Försök igen.");
        if (result.status === "complete") { await refresh(); return; }
      }
      throw new Error("BankID-sessionen gick ut. Starta inloggningen igen.");
    } catch (err) { setError(err instanceof Error ? err.message : "BankID kunde inte startas."); }
    finally { setBusy(false); }
  }
  const members = overview?.members || [];
  const located = members.filter(
    (m) => m.sharing && positionFresh(m,clock),
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
  }).sort((a,b)=>b.ts-a.ts);
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
      <View style={s.titleRow}>
        <Text style={s.heading}>{overview?.family?.name || "Familj"}</Text>
        {!!overview?.family && (
          <Pressable
            style={s.shareButton}
            accessibilityRole="button"
            disabled={busy || liveBusy}
            onPress={() => void startLiveSharing(true)}
          >
            <Ionicons name="lock-closed-outline" size={15} color="#fff" />
            <Text style={s.shareText}>{liveSharing ? "Plats delas" : "Dela plats"}</Text>
          </Pressable>
        )}
      </View>
      {!!(error || sharedError) && <Text style={s.error}>{error || sharedError}</Text>}
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
          <Button label={busy ? "Vänta på BankID…" : "Logga in eller registrera med BankID"} disabled={busy || !bankIdEnabled} onPress={() => { void bankIdLogin(); }} />
          <Text style={s.note}>{bankIdEnabled ? `BankID ${bankIdEnvironment} är anslutet.` : "BankID är inte anslutet på servern ännu."} En ny BankID-identitet skapar ett konto automatiskt. Cajklops lagrar en nycklad identifierare, inte ditt personnummer.</Text>
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
            Familjekontot sparas på Cajklops server. Inloggningen lagras säkert
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

              })
            }
          >
            <Text style={s.link}>Logga ut</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <FamilyStrip showStatus showLabel={false} onOpen={()=>setMembersOpen(value=>!value)} onInvite={()=>void action(async()=>{const response=await familyRequest<{token:string}>("invite","POST",{});await Share.share({message:`Gå med i vår familj i TryggPuls. Inbjudningskod: ${response.token}`});})}/>
          {membersOpen&&<View style={s.card}>{members.map(member=><View key={member.id} style={s.message}><Text style={s.title}>{member.display_name}</Text><Text style={s.note}>{member.sharing&&positionFresh(member,clock)?"Aktuell plats delas":"Ingen aktuell delad plats"}</Text></View>)}</View>}
          <View style={s.mapCard}>
            {center ? (
              <MapView
                style={s.map}
                initialRegion={{
                  latitude: Number(center.lat),
                  longitude: Number(center.lon),
                  latitudeDelta: 0.05,
                  longitudeDelta: 0.05,
                }}
                rotateEnabled={false}
                pitchEnabled={false}
                toolbarEnabled={false}
                customMapStyle={referenceMapStyle}
              >
                <IncidentHeat events={familyEvents.slice(0, 8)} onOpen={(event) => openSource(event.url)} />
                {Object.entries(trails).flatMap(([id, trail]) =>
                  located.some((member) => member.id === id)
                    ? familyTrailSegments(trail).map((segment, index) => (
                        <Polyline
                          key={`${id}-${index}`}
                          coordinates={segment}
                          strokeWidth={3}
                          strokeColor={blue}
                          lineDashPattern={[6, 5]}
                        />
                      ))
                    : [],
                )}
                {overview.zones.map((z) => (
                  <MapLabelMarker
                    key={z.id}
                    coordinate={{ latitude: z.lat, longitude: z.lon }}
                    title={z.name}
                    description="Familjens valda plats"
                  >
                    <PlaceLabel name={z.name} kind={z.kind} />
                  </MapLabelMarker>
                ))}
                {located.map((m) => (
                  <MapLabelMarker
                    key={m.id}
                    coordinate={{
                      latitude: Number(m.lat),
                      longitude: Number(m.lon),
                    }}
                    title={m.display_name}
                    description="Delad position, ungefärlig"
                  >
                    <View style={s.memberPin}>
                      <Text style={s.memberPinText}>
                        {m.display_name.trim().slice(0, 1).toLocaleUpperCase("sv-SE")}
                      </Text>
                    </View>
                  </MapLabelMarker>
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
            <MapPill
              icon="map-outline"
              label="Familjekarta"
              onPress={() => openPrototypeTab(navigation, "map")}
              style={{ right: 10, bottom: 10 }}
            />
          </View>
          <SectionHeader title="Händelser i närheten" action={showAllEvents ? "Visa färre" : "Visa alla"} onPress={() => setShowAllEvents((value) => !value)} />
          <IncidentTiles
            events={familyEvents}
            origin={eventCenter}
            onOpen={(event) => openSource(event.url)}
            empty={
              eventCenter
                ? "Inga polisnotiser inom 10 km i hämtade data."
                : "Dela en position eller skapa en zon för lokala händelser."
            }
          />
          {showAllEvents && (
            <>
              <View style={[s.memberRow, { marginTop: 10 }]}>
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
              {shownEvents.slice(0, 12).map((e) => (
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
              ))}
              {!shownEvents.length && (
                <Text style={s.note}>Inga matchande polisnotiser i hämtade data.</Text>
              )}
            </>
          )}
          <Text style={s.section}>Platsdelning</Text>
          <Text style={s.note}>
            Kartmarkörer visar frivilligt delade positioner. De kan vara
            ungefärliga.
          </Text>
          <View style={s.buttonRow}>
            <Button label={liveSharing?'Liveplats delas':'Dela liveplats'} disabled={busy||liveBusy||liveSharing} onPress={()=>void startLiveSharing()}/>
            <Button
              label="Dela min plats nu"
              disabled={busy||liveBusy}
              onPress={() => void startLiveSharing(true)}
            />
            <Button
              label="Stoppa delning"
              secondary
              disabled={busy||liveBusy}
              onPress={() => void stopLiveSharing()}
            />
          </View>
          <View style={s.memberRow}>
            <Text style={[s.title,{flex:1}]}>Dela plats även i bakgrunden</Text>
            <Switch accessibilityLabel="Dela plats även i bakgrunden" value={backgroundSharing} disabled={busy||liveBusy||!liveSharing||!backgroundBuildSupported} onValueChange={value=>void toggleBackgroundSharing(value)}/>
          </View>
          <Text style={s.note}>
            {backgroundBuildSupported?'Starta liveplats först. Bakgrundsdelning är frivillig och låter familjen se din plats när appen inte är öppen. Den använder batteri och Android visar en avisering. Uppdateringar kan stoppas av telefonens system.':'Expo Go delar liveplats medan appen är öppen. Bakgrundsdelning kräver den installerade Android-appen.'}
            {' '}Stoppa delning stänger av både vanlig delning och bakgrundsdelning och raderar delad platshistorik.
          </Text>
          {!!liveError&&<Text style={s.error}>{liveError}</Text>}
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
          <PrivateFamilyChat/>
          <Text style={s.section}>Barn utan telefon · AirTag på tillhörighet</Text>
          <View style={s.card}>
            <Text style={s.description}>
              Parkoppla AirTagen i Hitta på en förälders Apple-enhet och spara
              sedan dess namn här. Att spara namnet parkopplar inte AirTagen.
              Barnet behöver ingen telefon eller uppkoppling. Platsen uppdateras
              bara när Apples Hitta-nätverk upptäcker AirTagen. Föräldern behöver
              en Apple-enhet och internet för att se den. Cajklops får ingen
              AirTag-position och kan inte ge zon- eller nödlarm för den.
            </Text>
            <Text style={s.note}>Referenserna sparas på denna telefon. Övriga familjemedlemmar ser dem inte automatiskt.</Text>
            {deviceItems.map((item) => (
              <View key={item.id} style={s.item}>
                <Text style={s.title}>{item.child_name}</Text>
                <Text style={s.description}>{item.item_name} · Visa i Hitta → Föremål</Text>
                {overview.family?.owner_id === overview.user.id && (
                  <Button
                    label="Ta bort referens"
                    secondary
                    disabled={busy}
                    onPress={() => action(() => saveDeviceItems(deviceItems.filter(saved => saved.id !== item.id)))}
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
                    const child = childName.trim(), item = itemName.trim();
                    if (!child || !item) throw new Error('Ange barnets namn och AirTagens namn i Hitta.');
                    if (deviceItems.length >= 5) throw new Error('Du kan spara högst fem AirTag-referenser på denna telefon.');
                    await saveDeviceItems([...deviceItems, { id: `${Date.now()}-${Math.random()}`, child_name: child, item_name: item }]);
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
  heading: { color: ink, fontSize: 16, fontWeight: "700", letterSpacing: -0.3, flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: blue,
    borderRadius: 7,
    paddingHorizontal: 10,
    minHeight: 34,
  },
  shareText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  memberPin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: blue,
    borderWidth: 3,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  memberPinText: { color: "#fff", fontSize: 12, fontWeight: "800" },
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
    fontSize: 16,
    fontWeight: "800",
    marginTop: 18,
    marginBottom: 9,
  },
  card: {
    backgroundColor: "#fff",
    borderColor: "#E6EAF2",
    borderWidth: 1,
    borderRadius: 9,
    padding: 14,
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
    minHeight:44,
    justifyContent:"center",
    backgroundColor: blue,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 10,
    flexGrow: 1,
  },
  buttonSecondary: { backgroundColor: "#EAF1FF" },
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
    height: 270,
    borderRadius: 7,
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
    minHeight:44,
    justifyContent:"center",
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
    borderRadius: 9,
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
