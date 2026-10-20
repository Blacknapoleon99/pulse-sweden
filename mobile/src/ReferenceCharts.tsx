import { Text } from './Typography';
import { useState } from "react";
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { colors, ui } from "./theme";
type Bar = { label: string; count: number; color: string };

// Rounds the axis top to a readable step so gridlines read 0 / 50 / 100 etc.
function niceMax(value: number) {
  if (value <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(value)),
    scaled = value / step;
  return (scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * step;
}

function Grid({ max, height }: { max: number; height: number }) {
  return (
    <>
      {[0, 0.5, 1].map((share) => (
        <View
          key={share}
          pointerEvents="none"
          style={[s.gridLine, { bottom: share * height }]}
        >
          <Text style={s.gridLabel}>
            {Math.round(max * share).toLocaleString("sv-SE")}
          </Text>
        </View>
      ))}
    </>
  );
}

export function ReferenceBars({
  items,
  available = true,
}: {
  items: Bar[];
  available?: boolean;
}) {
  const { fontScale } = useWindowDimensions(),
    max = niceMax(Math.max(1, ...items.map((item) => item.count))),
    height = 120;
  if (!available)
    return (
      <Text style={ui.body}>
        Källan saknar tillgängliga uppgifter. Antal kan inte beräknas.
      </Text>
    );
  return (
    <View style={s.chart}>
      <View style={[s.plot, { height: height + 22 }]}>
        <Grid max={max} height={height} />
        <View style={[s.bars, { height: height + 22 }]}>
          {items.map((item) => (
            <View
              key={item.label}
              style={s.column}
              accessible
              accessibilityLabel={`${item.label}: ${item.count} publicerade notiser`}
            >
              <Text style={s.count}>{item.count.toLocaleString("sv-SE")}</Text>
              <View
                style={{
                  height: item.count ? Math.max(4, (item.count / max) * height) : 0,
                  width: "72%",
                  maxWidth: 38,
                  borderTopLeftRadius: 1,
                  borderTopRightRadius: 1,
                  backgroundColor: item.color,
                }}
              />
            </View>
          ))}
        </View>
      </View>
      <View style={[s.labels, fontScale > 1.3 && { flexWrap: "wrap" }]}>
        {items.map((item) => (
          <Text key={item.label} style={s.label} numberOfLines={1}>
            {item.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

export type LineSeries = { label: string; color: string; values: number[] };

export function ReferenceLines({
  labels,
  series,
}: {
  labels: string[];
  series: LineSeries[];
}) {
  const [width, setWidth] = useState(0),
    height = 112,
    max = niceMax(Math.max(1, ...series.flatMap((line) => line.values))),
    step = labels.length > 1 ? Math.max(0, width - 12) / (labels.length - 1) : 0;
  const point = (value: number, index: number) => ({
    x: 6 + index * step,
    y: height - (value / max) * height,
  });
  return (
    <View
      accessible
      accessibilityLabel={series
        .map((line) => `${line.label}: ${line.values.join(", ")}`)
        .join(". ")}
    >
      <View style={[s.plot, { height }]}>
        <Grid max={max} height={height} />
        <View
          style={[StyleSheet.absoluteFill, { left: 30 }]}
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        >
          {width > 0 &&
            series.map((line) => {
              const points = line.values.map(point);
              return (
                <View key={line.label} style={StyleSheet.absoluteFill}>
                  {points.slice(1).map((next, index) => {
                    const previous = points[index],
                      dx = next.x - previous.x,
                      dy = next.y - previous.y,
                      length = Math.hypot(dx, dy);
                    return (
                      <View
                        key={index}
                        style={{
                          position: "absolute",
                          left: (next.x + previous.x) / 2 - length / 2,
                          top: (next.y + previous.y) / 2 - 1,
                          width: length,
                          height: 2,
                          backgroundColor: line.color,
                          transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
                        }}
                      />
                    );
                  })}
                  {points.map((dot, index) => (
                    <View
                      key={`dot-${index}`}
                      style={[
                        s.dot,
                        { left: dot.x - 3.5, top: dot.y - 3.5, backgroundColor: line.color },
                      ]}
                    />
                  ))}
                </View>
              );
            })}
        </View>
      </View>
      <View style={[s.xLabels, { marginLeft: 30 }]}>
        {labels.map((label, index) => (
          <Text key={`${label}-${index}`} style={s.xLabel} numberOfLines={1}>
            {label}
          </Text>
        ))}
      </View>
      <View style={s.legend}>
        {series.map((line) => (
          <View key={line.label} style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: line.color }]} />
            <Text style={s.legendText}>{line.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Kept for single-series callers: total notices per observed date.
export function ReferenceTrend({
  items,
}: {
  items: { day: string; count: number }[];
}) {
  return (
    <ReferenceLines
      labels={items.map((item) => item.day.slice(5))}
      series={[
        { label: "Alla notiser", color: colors.blue, values: items.map((item) => item.count) },
      ]}
    />
  );
}

const s = StyleSheet.create({
  chart: { paddingTop: 8 },
  plot: { position: "relative", marginTop: 6 },
  gridLine: {
    position: "absolute",
    left: 30,
    right: 0,
    height: 1,
    backgroundColor: colors.border,
  },
  gridLabel: {
    position: "absolute",
    left: -30,
    top: -7,
    width: 26,
    textAlign: "right",
    fontSize: 10,
    color: colors.muted,
  },
  bars: {
    position: "absolute",
    left: 30,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  column: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  count: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: 4,
  },
  labels: { flexDirection: "row", marginLeft: 30, marginTop: 8 },
  label: {
    flex: 1,
    fontSize: 10,
    color: colors.muted,
    textAlign: "center",
  },
  dot: {
    position: "absolute",
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  xLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  xLabel: { fontSize: 9, color: colors.muted },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    justifyContent: "center",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 9, color: colors.muted },
});
