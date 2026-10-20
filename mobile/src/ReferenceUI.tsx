import { Text } from './Typography';
import type { PropsWithChildren } from "react";
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { colors, ui } from "./theme";

export function Segments<T extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.segments}
    >
      {items.map((item) => (
        <Pressable
          key={item.id}
          hitSlop={6}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === item.id }}
          onPress={() => onChange(item.id)}
          style={[styles.segment, value === item.id && styles.segmentOn]}
        >
          <Text
            style={[
              styles.segmentText,
              value === item.id && styles.segmentTextOn,
            ]}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
export function Section({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={[ui.heading,{fontSize:14}]}>{title}</Text>
      {action && onPress && (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={styles.action}
        >
          <Text style={styles.link}>{action}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.blue} />
        </Pressable>
      )}
    </View>
  );
}
export function DetailRow({
  title,
  body,
  icon = "information-circle-outline",
  color = colors.blue,
  onPress,
}: {
  title: string;
  body?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  color?: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={[styles.icon, { backgroundColor: `${color}1A` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {body && <Text style={ui.meta}>{body}</Text>}
      </View>
      {onPress && (
        <Ionicons name="chevron-forward" size={17} color={colors.muted} />
      )}
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={3} style={styles.row}>
      {content}
    </Pressable>
  ) : (
    <View style={styles.row}>{content}</View>
  );
}
export function Surface({ children }: PropsWithChildren) {
  return <View style={ui.card}>{children}</View>;
}
const styles = StyleSheet.create({
  segments: {
    gap: 1,
    padding: 2,
    backgroundColor: "#F3F5FA",
    borderRadius: 7,
    borderWidth: 0,
    borderColor: colors.border,
    marginVertical: 8,
    flexGrow: 1,
  },
  segment: {
    minHeight: 32,
    paddingHorizontal: 10,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 6,
    flexGrow: 1,
  },
  segmentOn: { backgroundColor: colors.blue },
  segmentText: { color: colors.muted, fontSize: 11, fontWeight: "500" },
  segmentTextOn: { color: "#fff", fontWeight: "700" },
  section: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 10,
    marginBottom: 6,
  },
  action: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 2 },
  link: { fontSize: 13, fontWeight: "700", color: colors.blue },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 38,
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2,
  },
  icon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
});
