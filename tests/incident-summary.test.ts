import test from "node:test";
import assert from "node:assert/strict";
import {
  incidentCounts,
  incidentDays,
  observedIncidents,
} from "../mobile/src/incidentSummary.ts";
import type { Event } from "../mobile/src/api.ts";
const event = (type: string, ts: number) =>
  ({ id: type + ts, type, ts }) as Event;
test("categories count every notice once, including vehicle theft and robbery", () => {
  const counts = incidentCounts([
    event("Rån", 1),
    event("Misshandel", 1),
    event("Trafikolycka", 1),
    event("Stöld, fordon", 1),
    event("Kontroll", 1),
  ]);
  assert.deepEqual(
    counts.map((item) => item.count),
    [1, 1, 1, 1, 1],
  );
});
test("time filter excludes old, future and invalid dates without changing the source array", () => {
  const now = Date.UTC(2026, 9, 14, 12),
    events = [
      event("A", now),
      event("B", now - 86_400_000),
      event("C", now - 86_400_001),
      event("D", now + 1),
      event("E", NaN),
    ];
  assert.deepEqual(
    observedIncidents(events, 1, now).map((item) => item.type),
    ["A", "B"],
  );
  assert.equal(events.length, 5);
});
test("daily series uses Swedish dates and never invents zero counts for missing days", () => {
  const events = [
    event("A", Date.parse("2026-10-14T23:30:00Z")),
    event("B", Date.parse("2026-10-12T12:00:00Z")),
    event("C", Date.parse("2026-10-15T10:00:00Z")),
  ];
  assert.deepEqual(incidentDays(events), [
    { day: "2026-10-12", count: 1 },
    { day: "2026-10-15", count: 2 },
  ]);
  assert.deepEqual(incidentDays([]), []);
});
