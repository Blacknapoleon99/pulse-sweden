import { Text, TextInput } from './Typography';
import { useState } from "react";
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';
import { geocode } from "./api";
import { useSavedPlaces, type PlaceKey } from './savedPlaces';

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
const blue = "#2187F5",
  ink = "#11152A",
  muted = "#72788D";
export function ProfileScreen({
  onRouteTo,
  onOpenAdmin,
}: {
  onRouteTo: (address: string) => void;
  onOpenAdmin: () => void;
}) {
  const {addresses:saved,save:savePlace,error:storageError}=useSavedPlaces();
  const [editing, setEditing] = useState<PlaceKey | null>(null);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
      await savePlace(editing,result.results[0]);
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
      <Text style={s.heading}>Din profil</Text>
      <Text style={s.note}>
        Spara adresser på den här enheten. De visas på Hem-kartan och kan användas som mål i ruttanalysen.
        Platserna delas inte med familjen automatiskt.
      </Text>
      {!!(error||storageError) && <Text style={s.error}>{error||storageError}</Text>}
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
            style={s.iconAction}
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
              style={s.iconAction}
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
      <Pressable accessibilityRole="button" style={s.adminButton} onPress={onOpenAdmin}>
        <Text style={s.adminButtonText}>Administrationsverktyg · endast behöriga</Text>
      </Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  eyebrow: { color: blue, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  heading: { color: ink, fontSize: 20, fontWeight: "700", marginTop: 3 },
  note: { color: muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  error: { color: "#A43E31", marginTop: 10 },
  place: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderColor: "#E4EAF2",
    borderWidth: 1,
    borderRadius: 9,
    padding: 10,
    marginTop: 10,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#E8F2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  placeTitle: { color: ink, fontSize: 14, fontWeight: "800" },
  editor: {
    backgroundColor: "#fff",
    borderRadius: 9,
    padding: 12,
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
  iconAction:{width:44,minHeight:44,alignItems:'center',justifyContent:'center'},
  row: { flexDirection: "row", gap: 8, marginTop: 12 },
  button: { minHeight:44,justifyContent:'center',backgroundColor: blue, padding: 11, borderRadius: 11 },
  buttonText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  cancel: { padding: 11 },
  cancelText: { color: blue, fontSize: 12, fontWeight: "800" },
  adminButton: { borderColor: "#D9E3EE", borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 18, alignSelf: "flex-start" },
  adminButtonText: { color: ink, fontSize: 12, fontWeight: "700" },
});
