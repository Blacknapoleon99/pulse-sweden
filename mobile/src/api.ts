export const API_BASE = (
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://tryggpuls.onrender.com"
).replace(/\/$/, "");

export type Point = { lat: number; lon: number };
export type Event = {
  id: string;
  type: string;
  name: string;
  summary: string;
  ts: number;
  url?: string;
  location?: { name?: string; gps?: [number, number] };
};
export type Feature = {
  id?: string;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
  properties: {
    name: string;
    category?: string;
    locality?: string;
    kind?: string;
    sourceUrl?: string;
    sourceTitle?: string;
    validTo?: string;
  };
};
export type EventsResponse = {
  events?: Event[];
  fetchedAt?: string;
  stale?: boolean;
  error?: string;
};
export type AreasResponse = {
  features?: Feature[];
  year?: number;
  stale?: boolean;
  sourceUrl?: string;
};
export type ZonesResponse = {
  features?: Feature[];
  fetchedAt?: string;
  status?: string;
  error?: string;
};
export type RouteResponse = {
  ok: boolean;
  routeId: string;
  distanceKm: string;
  durationMinutes: number;
  geometry: { coordinates: [number, number][] };
  incidentsNearRoute: Event[];
  incidentsCount: number;
  policeAreaPassages: Passage[];
  securityZonePassages: Passage[];
  networkAreaPassages: Passage[];
  sourceStatus?: Record<
    string,
    { status: string; error?: string; dataYear?: number }
  >;
  routeAnalysisUpdatedAt?: string;
  eventsStale?: boolean;
};
export type Passage = {
  id: string;
  name: string;
  category: string;
  startMeters: number;
  endMeters: number;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceDate?: string;
  stale?: boolean;
};
export type GeocodeResult = Point & { displayName: string; city?: string };

export async function getJson<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || `Tjänsten svarade ${response.status}`);
  return data as T;
}

export function geocode(query: string) {
  return getJson<{ results: GeocodeResult[] }>(
    `/api/geocode?q=${encodeURIComponent(query.trim())}`,
  );
}

export function calculateRoute(
  from: Point,
  to: Point,
  mode: "walking" | "driving",
) {
  const params = new URLSearchParams({
    fromLat: String(from.lat),
    fromLon: String(from.lon),
    toLat: String(to.lat),
    toLon: String(to.lon),
    mode,
    buffer: "600",
  });
  return getJson<RouteResponse>(`/api/route?${params}`);
}

export function refreshRoute(routeId: string) {
  return getJson<RouteResponse>(
    `/api/route-refresh?routeId=${encodeURIComponent(routeId)}`,
  );
}
