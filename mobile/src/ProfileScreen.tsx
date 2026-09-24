import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { geocode } from "./api";

type PlaceKey = "home" | "school" | "work" | "leisure";
const places: {
  key: PlaceKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "home", label: "Hem", icon: "home-outline" },
  { key: "school", label: "Skola", icon: "school-outline" },
  { key: "work", label: "Arbete", icon: "briefcase-outline" },
  { key: "leisure", label: "Nöje", icon: "sparkles-outline" },
];
const STORAGE = "tryggpuls-saved-places";
const blue = "#176FE1",
  ink = "#142942",
  muted = "#64768D";
export function ProfileScreen({
  onRouteTo,
}: {
  onRouteTo: (address: string) => void;
}) {
  const [saved, setSaved] = useState<Partial<Record<PlaceKey, string>>>({});
  const [editing, setEditing] = useState<PlaceKey | null>(null);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    SecureStore.getItemAsync(STORAGE)
      .then((raw) => {
        if (raw) setSaved(JSON.parse(raw));
      })
      .catch(() => setError("Sparade platser kunde inte läsas."));
  }, []);
  async function save() {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      const result = await geocode(address);
      if (!result.results.length)
        throw new Error(
          "Adressen hittades inte. Prova en tydligare svensk adress.",
        );
      const next = { ...saved, [editing]: result.results[0].displayName };
      await SecureStore.setItemAsync(STORAGE, JSON.stringify(next));
      setSaved(next);
      setEditing(null);
      setAddress("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Platsen kunde inte sparas.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <View>
      <Text style={s.eyebrow}>PROFIL · MINA PLATSER</Text>
      <Text style={s.heading}>Platser som betyder något</Text>
      <Text style={s.note}>
        Spara adresser på den här enheten och använd dem som mål i ruttanalysen.
        Platserna delas inte med familjen automatiskt.
      </Text>
      {!!error && <Text style={s.error}>{error}</Text>}
      {places.map((place) => (
        <View key={place.key} style={s.place}>
          <View style={s.icon}>
            <Ionicons name={place.icon} size={21} color={blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.placeTitle}>{place.label}</Text>
            <Text style={s.note} numberOfLines={2}>
              {saved[place.key] || "Ingen plats sparad"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ändra ${place.label}`}
            onPress={() => {
              setEditing(place.key);
              setAddress(saved[place.key] || "");
            }}
          >
            <Ionicons name="create-outline" size={21} color={blue} />
          </Pressable>
          {!!saved[place.key] && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Planera rutt till ${place.label}`}
              onPress={() => onRouteTo(saved[place.key]!)}
            >
              <Ionicons name="navigate-outline" size={21} color={blue} />
            </Pressable>
          )}
        </View>
      ))}
      {editing && (
        <View style={s.editor}>
          <Text style={s.placeTitle}>
            Spara {places.find((p) => p.key === editing)?.label.toLowerCase()}
          </Text>
          <TextInput
            style={s.input}
            value={address}
            onChangeText={setAddress}
            placeholder="Svensk adress eller ort"
            autoFocus
          />
          <View style={s.row}>
            <Pressable style={s.button} disabled={busy} onPress={save}>
              <Text style={s.buttonText}>
                {busy ? "Söker…" : "Spara plats"}
              </Text>
            </Pressable>
            <Pressable style={s.cancel} onPress={() => setEditing(null)}>
              <Text style={s.cancelText}>Avbryt</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  eyebrow: { color: blue, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  heading: { color: ink, fontSize: 25, fontWeight: "800", marginTop: 7 },
  note: { color: muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  error: { color: "#A43E31", marginTop: 10 },
  place: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderColor: "#E4EAF2",
    borderWidth: 1,
    borderRadius: 17,
    padding: 13,
    marginTop: 10,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#E8F2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  placeTitle: { color: ink, fontSize: 14, fontWeight: "800" },
  editor: {
    backgroundColor: "#fff",
    borderRadius: 17,
    padding: 15,
    marginTop: 16,
  },
  input: {
    borderColor: "#D9E3EE",
    borderWidth: 1,
    borderRadius: 12,
    padding: 11,
    marginTop: 10,
    color: ink,
  },
  row: { flexDirection: "row", gap: 8, marginTop: 12 },
  button: { backgroundColor: blue, padding: 11, borderRadius: 11 },
  buttonText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  cancel: { padding: 11 },
  cancelText: { color: blue, fontSize: 12, fontWeight: "800" },
});
