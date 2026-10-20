import { Text } from './Typography';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFamily } from "./FamilyState";
import { positionFresh } from "./mobileState";
import { colors } from "./theme";
import type { FamilyOverview } from "./api";
import {MemberAvatar} from './MemberAvatar';
const palette = ["#2187F5", "#8B4FE0", "#22B07D", "#F5A623", "#E0457B"];
type Member = FamilyOverview["members"][number];
type Zone = FamilyOverview["zones"][number];
// "Nu · Hem" when a fresh shared position lies inside a family place.
function memberStatus(
  member: Member,
  zones: Zone[],
  clock: number,
) {
  if (!member.sharing || !positionFresh(member, clock)) return "Delar ej";
  const zone = zones.find((zone) => {
    const dy = (zone.lat - Number(member.lat)) * 111_000,
      dx = (zone.lon - Number(member.lon)) * 111_000 * Math.cos((zone.lat * Math.PI) / 180);
    return Math.hypot(dx, dy) <= zone.radius;
  });
  return zone ? `Nu · ${zone.name}` : "Nu";
}
export function FamilyStrip({
  onOpen,
  onAlarm,
  onInvite,
  showStatus = false,
  showLabel = true,
}: {
  onOpen: () => void;
  onAlarm?: () => void;
  onInvite?: () => void;
  showStatus?: boolean;
  showLabel?: boolean;
}) {
  const family = useFamily(),
    members = family.overview?.members || [];
  return (
    <View style={[s.row,!showStatus&&s.compactRow]}>
      {showLabel && (
        <Pressable onPress={onOpen} accessibilityRole="button" style={s.title}>
          <Text style={s.label}>Familj</Text>
        </Pressable>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.members}
        style={{ flex: 1 }}
      >
        {members.map((member, index) => (
          <Pressable
            key={member.id}
            hitSlop={5}
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={`${member.display_name}, ${member.sharing && positionFresh(member, family.clock) ? "aktuell delad plats" : "ingen aktuell delad plats"}`}
            style={[s.member,!showStatus&&s.compactMember]}
          >
            <View
              style={[
                s.avatar,!showStatus&&s.compactAvatar,
                {
                backgroundColor: `${palette[index % palette.length]}1A`,
                borderColor: palette[index % palette.length],
              },
              ]}
            >
              <MemberAvatar index={index} size={showStatus?36:33}/>
              <View
                style={[
                  s.dot,
                  {
                    backgroundColor:
                      member.sharing && positionFresh(member, family.clock)
                        ? colors.green
                        : "#AAB6C4",
                  },
                ]}
              />
            </View>
            {showStatus&&<Text numberOfLines={1} style={s.name}>
              {member.display_name}
            </Text>}
            {showStatus && (
              <Text numberOfLines={1} style={s.status}>
                {memberStatus(member, family.overview?.zones || [], family.clock)}
              </Text>
            )}
          </Pressable>
        ))}
        <Pressable
          onPress={onInvite || onOpen}
          hitSlop={5}
          accessibilityRole="button"
          accessibilityLabel={
            family.overview?.family
              ? "Bjud in till familjen"
              : "Öppna familj och logga in"
          }
          style={[s.member,!showStatus&&s.compactMember]}
        >
          <View style={[s.avatar, s.add,!showStatus&&s.compactAvatar]}>
            <Ionicons name="add" size={22} color={colors.blue} />
          </View>
          {showStatus&&<Text style={s.name}>{members.length ? "Bjud in" : "Lägg till"}</Text>}
        </Pressable>
      </ScrollView>
      {onAlarm && (
        <Pressable onPress={onAlarm} accessibilityRole="button" style={s.alarm}>
          <View style={{width:16,height:16}} accessible={false}>
            <View style={{position:'absolute',left:4,top:5,width:8,height:8,borderTopLeftRadius:5,borderTopRightRadius:5,borderWidth:1.5,borderColor:'#fff'}}/>
            <View style={{position:'absolute',left:2,top:13,width:12,height:2,borderRadius:1,backgroundColor:'#fff'}}/>
            <View style={{position:'absolute',left:7,top:0,width:1.5,height:3,backgroundColor:'#fff'}}/>
            <View style={{position:'absolute',left:1,top:3,width:1.5,height:3,backgroundColor:'#fff',transform:[{rotate:'-45deg'}]}}/>
            <View style={{position:'absolute',right:1,top:3,width:1.5,height:3,backgroundColor:'#fff',transform:[{rotate:'45deg'}]}}/>
          </View>
          <Text style={s.alarmText}>Larm</Text>
        </Pressable>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  compactRow:{minHeight:56,marginBottom:0,gap:7},
  compactMember:{minWidth:34,width:34,minHeight:40,justifyContent:'center'},
  compactAvatar:{width:34,height:34,borderWidth:0},
  title: { minHeight: 44, justifyContent: "center" },
  label: { fontSize: 14, color: colors.ink, fontWeight: "700" },
  members: { gap: 7, alignItems: "center" },
  member: { minWidth: 46, maxWidth: 64, alignItems: "center", gap: 3 },
  avatar: {
    height: 38,
    width: 38,
    borderRadius: 19,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  add: { borderColor: '#EDF2FA', backgroundColor: "#fff" },
  initial: { fontSize: 15, fontWeight: "800" },
  dot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#fff",
  },
  name: { fontSize: 11, color: colors.ink, fontWeight: "600" },
  status: { fontSize: 10, color: colors.muted },
  alarm: {
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: 12,
    backgroundColor: '#CF2035',
    shadowColor:'#FF3545',shadowOpacity:.28,shadowRadius:8,shadowOffset:{width:0,height:3},elevation:3,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  alarmText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
