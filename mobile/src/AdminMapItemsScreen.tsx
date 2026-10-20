import { Text, TextInput } from './Typography';
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { adminMapRequest } from "./api";

type Item = {
  id: string; title: string; description: string; kind: string; lat: number; lon: number;
  sourceTitle: string; sourceUrl: string; validTo: string; status: string;
};
const ink = "#11152A", blue = "#2187F5", muted = "#72788D";
const statusName: Record<string, string> = { draft: "Utkast", review: "Väntar på publicering", published: "Publicerad", ended: "Avslutad" };

export function AdminMapItemsScreen({ onBack, onPublished }: { onBack: () => void; onPublished: () => void }) {
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [canReview, setCanReview] = useState(false);
  const [role, setRole] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"safety-notice" | "service-point">("safety-notice");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceExcerpt, setSourceExcerpt] = useState("");

  async function refresh() {
    setError("");
    try {
      const result = await adminMapRequest<{ items: Item[]; canCreate: boolean; canReview: boolean; role: string }>("", token.trim());
      setItems(result.items);
      setCanCreate(result.canCreate);
      setCanReview(result.canReview);
      setRole(result.role);
      setConnected(true);
    } catch (err) { setConnected(false); setError(err instanceof Error ? err.message : "Administrationsvyn kunde inte öppnas."); }
  }
  async function submit() {
    setBusy(true); setError("");
    try {
      const start = new Date();
      const end = new Date(start.getTime() + (kind === "safety-notice" ? 24 : 24 * 30) * 60 * 60 * 1000);
      await adminMapRequest("", token.trim(), "POST", {
        title, description, kind, lat: Number(lat.replace(",", ".")), lon: Number(lon.replace(",", ".")), sourceTitle, sourceUrl, sourceExcerpt,
        sourceDate: start.toISOString(), validFrom: start.toISOString(), validTo: end.toISOString(),
      });
      setTitle(""); setDescription(""); setLat(""); setLon(""); setSourceTitle(""); setSourceUrl(""); setSourceExcerpt("");
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Markören kunde inte sparas."); }
    finally { setBusy(false); }
  }
  async function transition(item: Item, action: "review" | "publish" | "end") {
    setBusy(true); setError("");
    try {
      await adminMapRequest(`/${encodeURIComponent(item.id)}/${action}`, token.trim(), "POST", {});
      await refresh();
      if (action === "publish") onPublished();
    } catch (err) { setError(err instanceof Error ? err.message : "Ändringen kunde inte sparas."); }
    finally { setBusy(false); }
  }
  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack}><Text style={s.link}>← Tillbaka</Text></Pressable>
      <Text style={s.kicker}>ADMINISTRATÖR · KARTA</Text>
      <Text style={s.heading}>Kartmarkörer</Text>
      <Text style={s.note}>Markörer kräver en aktuell svensk myndighetskälla, granskning och ett slutdatum. De märks som Cajklops-granskade, inte som officiella varningar.</Text>
      {!!role && <Text style={s.status}>Behörighet: {role} · {canCreate ? "skapa utkast" : "visa"} · {canReview ? "granska/publicera" : "ingen publiceringsbehörighet"}</Text>}
      {!connected && <View style={s.card}>
        <Text style={s.label}>Administratörsnyckel</Text>
        <TextInput value={token} onChangeText={setToken} style={s.input} secureTextEntry autoCapitalize="none" placeholder="Nyckeln från serverns ägare" />
        <Button label="Anslut" onPress={() => { void refresh(); }} disabled={!token.trim() || busy} />
      </View>}
      {!!error && <Text style={s.error}>{error}</Text>}
      {connected && <>
        {canCreate && <View style={s.card}>
          <Text style={s.section}>Ny kartmarkör</Text>
          <TextInput value={title} onChangeText={setTitle} style={s.input} placeholder="Rubrik" maxLength={120} />
          <TextInput value={description} onChangeText={setDescription} style={[s.input, s.multiline]} placeholder="Beskrivning" multiline maxLength={600} />
          <View style={s.row}>
            <Button label={kind === "safety-notice" ? "Typ: säkerhetsnotis" : "Typ: servicepunkt"} onPress={() => setKind(kind === "safety-notice" ? "service-point" : "safety-notice")} disabled={busy} secondary />
          </View>
          <Text style={s.note}>Placera markören med svenska WGS84-koordinater. Exempel: Stockholm 59.3293, 18.0686.</Text>
          <View style={s.row}>
            <TextInput value={lat} onChangeText={setLat} style={[s.input, s.coord]} placeholder="Latitud" keyboardType="decimal-pad" />
            <TextInput value={lon} onChangeText={setLon} style={[s.input, s.coord]} placeholder="Longitud" keyboardType="decimal-pad" />
          </View>
          <TextInput value={sourceTitle} onChangeText={setSourceTitle} style={s.input} placeholder="Rubrik på officiell källa" maxLength={240} />
          <TextInput value={sourceUrl} onChangeText={setSourceUrl} style={s.input} placeholder="HTTPS-länk till myndighet" autoCapitalize="none" keyboardType="url" />
          <TextInput value={sourceExcerpt} onChangeText={setSourceExcerpt} style={[s.input, s.multiline]} placeholder="Kort ordagrant stödjande utdrag" multiline maxLength={1000} />
          <Button label={busy ? "Sparar…" : "Spara som utkast"} onPress={() => { void submit(); }} disabled={busy || !title.trim() || !sourceUrl.trim()} />
        </View>}
        <View style={s.rowBetween}><Text style={s.section}>Granskning</Text><Pressable onPress={() => { void refresh(); }}><Text style={s.link}>Uppdatera</Text></Pressable></View>
        {items.map(item => <View key={item.id} style={s.card}>
          <Text style={s.status}>{statusName[item.status] || item.status}</Text>
          <Text style={s.itemTitle}>{item.title}</Text>
          <Text style={s.note}>{item.kind === "safety-notice" ? "Säkerhetsnotis" : "Servicepunkt"} · {item.lat}, {item.lon}</Text>
          <Text style={s.note}>{item.description}</Text>
          <Text style={s.note}>Källa: {item.sourceTitle} · giltig till {new Date(item.validTo).toLocaleDateString("sv-SE")}</Text>
          {canReview && item.status === "draft" && <Button label="Markera granskad" onPress={() => { void transition(item, "review"); }} disabled={busy} secondary />}
          {canReview && item.status === "review" && <Button label="Publicera" onPress={() => { void transition(item, "publish"); }} disabled={busy} />}
          {canReview && item.status === "published" && <Button label="Avsluta publicering" onPress={() => { void transition(item, "end"); }} disabled={busy} secondary />}
        </View>)}
      </>}
    </ScrollView>
  );
}
function Button({ label, onPress, disabled, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} style={[s.button, secondary && s.secondary, disabled && { opacity: 0.55 }]}><Text style={[s.buttonText, secondary && s.secondaryText]}>{label}</Text></Pressable>;
}
const s = StyleSheet.create({
  page: { padding: 20, paddingBottom: 48 }, kicker: { color: blue, fontSize: 10, fontWeight: "800", letterSpacing: 1.3, marginTop: 14 },
  heading: { color: ink, fontSize: 26, fontWeight: "800", marginTop: 6 }, note: { color: muted, fontSize: 12, lineHeight: 18, marginTop: 7 }, link: { color: blue, fontWeight: "800" },
  card: { backgroundColor: "#fff", borderColor: "#E4EAF2", borderWidth: 1, borderRadius: 9, padding: 14, marginTop: 14, gap: 8 }, section: { color: ink, fontSize: 16, fontWeight: "800" }, label: { color: ink, fontWeight: "700" },
  input: { borderColor: "#D9E3EE", borderWidth: 1, borderRadius: 11, padding: 11, color: ink, backgroundColor: "#fff" }, multiline: { minHeight: 74, textAlignVertical: "top" }, row: { flexDirection: "row", gap: 8 }, coord: { flex: 1 }, rowBetween: { flexDirection: "row", justifyContent: "space-between", marginTop: 18, alignItems: "center" },
  button: { backgroundColor: blue, padding: 12, borderRadius: 11, alignSelf: "flex-start", marginTop: 6 }, buttonText: { color: "#fff", fontSize: 12, fontWeight: "800" }, secondary: { backgroundColor: "#EAF2FD" }, secondaryText: { color: blue }, status: { color: blue, fontSize: 11, fontWeight: "800", marginTop: 8 }, itemTitle: { color: ink, fontSize: 17, fontWeight: "800" }, error: { color: "#A43E31", marginTop: 10 },
});
