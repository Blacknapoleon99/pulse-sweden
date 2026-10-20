import type { Event } from "./api";
export const incidentCategories = [
  { id: "robbery", label: "Rån", color: "#F33E49", icon: "shield-checkmark" },
  { id: "violence", label: "Våldsbrott", color: "#F7BE21", icon: "hand-left" },
  { id: "traffic", label: "Trafikolycka", color: "#2187F5", icon: "car" },
  { id: "theft", label: "Stöld", color: "#29B963", icon: "bag-handle" },
  { id: "other", label: "Övrigt", color: "#843DCE", icon: "ellipsis-horizontal-circle" },
] as const;
export function incidentCategory(type = "") {
  if (/rån/i.test(type)) return "robbery";
  if (/misshandel|våld|skott|skjut|mord|dråp|kniv/i.test(type))
    return "violence";
  if (/stöld|inbrott/i.test(type)) return "theft";
  if (/trafik|olycka|fordon|väg|kollision/i.test(type)) return "traffic";
  return "other";
}
export function observedIncidents(
  events: Event[],
  days: number,
  now = Date.now(),
) {
  const cutoff = now - days * 86_400_000;
  return events.filter(
    (event) =>
      Number.isFinite(event.ts) && event.ts >= cutoff && event.ts <= now,
  );
}
export function incidentCounts(events: Event[]) {
  return incidentCategories.map((category) => ({
    ...category,
    count: events.filter(
      (event) => incidentCategory(event.type) === category.id,
    ).length,
  }));
}
export function incidentDays(events: Event[]) {
  const buckets = new Map<string, number>();
  for (const event of events) {
    if (!Number.isFinite(event.ts)) continue;
    const day = new Date(event.ts).toLocaleDateString("sv-SE", {
      timeZone: "Europe/Stockholm",
    });
    buckets.set(day, (buckets.get(day) || 0) + 1);
  }
  // Missing dates are deliberately not invented as zero-count days.
  return [...buckets]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => ({ day, count }));
}
export function categoryOf(type = "") {
  const id = incidentCategory(type);
  return incidentCategories.find((category) => category.id === id)!;
}
export type SeriesPeriod = "week" | "month" | "year";
const monthNames = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
// Buckets per category for the comparison chart. Buckets that start before the
// oldest fetched notice are dropped instead of being shown as zero.
export function incidentSeries(
  events: Event[],
  period: SeriesPeriod,
  now = Date.now(),
) {
  const day = 86_400_000,
    buckets: { start: number; end: number; label: string }[] = [];
  if (period === "year") {
    const today = new Date(now);
    for (let back = 11; back >= 0; back -= 1) {
      const start = new Date(today.getFullYear(), today.getMonth() - back, 1),
        end = new Date(today.getFullYear(), today.getMonth() - back + 1, 1);
      buckets.push({ start: start.getTime(), end: Math.min(end.getTime(), now + 1), label: monthNames[start.getMonth()] });
    }
  } else {
    const size = period === "week" ? 1 : 5,
      count = period === "week" ? 7 : 6,
      midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const lastEnd = midnight.getTime() + day;
    for (let index = count - 1; index >= 0; index -= 1) {
      const end = lastEnd - index * size * day,
        start = end - size * day,
        date = new Date(start);
      buckets.push({
        start,
        end,
        label: period === "week"
          ? date.toLocaleDateString("sv-SE", { weekday: "short" }).replace(".", "")
          : `${date.getDate()}/${date.getMonth() + 1}`,
      });
    }
  }
  const valid = events.filter((event) => Number.isFinite(event.ts));
  const oldest = valid.length ? Math.min(...valid.map((event) => event.ts)) : now;
  const covered = buckets.filter((bucket) => bucket.start >= oldest - day / 2);
  return {
    labels: covered.map((bucket) => bucket.label),
    series: incidentCategories.map((category) => ({
      label: category.label,
      color: category.color,
      values: covered.map(
        (bucket) =>
          valid.filter(
            (event) =>
              event.ts >= bucket.start &&
              event.ts < bucket.end &&
              incidentCategory(event.type) === category.id,
          ).length,
      ),
    })),
    complete: covered.length === buckets.length,
  };
}
