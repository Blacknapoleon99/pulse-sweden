import * as SecureStore from "expo-secure-store";

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
export type Bulletin = {
  id?: string;
  title: string;
  summary?: string;
  area?: string;
  level?: string;
  levelLabel?: string;
  publishedAt?: string;
  validTo?: string;
  source?: string;
  url?: string;
};
export type FeedResponse = {
  items?: Bulletin[];
  fetchedAt?: string;
  stale?: boolean;
  status?: string;
};
export type CrisisResponse = {
  vmas?: Bulletin[];
  notices?: Bulletin[];
  fetchedAt?: string;
  stale?: boolean;
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
export type FamilyOverview = {
  user: {
    id: string;
    display_name: string;
    email: string;
    police_area_alerts?: boolean;
  };
  family: { id: string; name: string; owner_id: string } | null;
  members: {
    id: string;
    display_name: string;
    sharing: boolean;
    lat?: number;
    lon?: number;
    accuracy?: number;
    updated_at?: string;
  }[];
  childItems: {
    id: string;
    child_name: string;
    item_name: string;
  }[];
  zones: {
    id: string;
    name: string;
    kind: "safe" | "watch";
    lat: number;
    lon: number;
    radius: number;
  }[];
  alerts: {
    id: string;
    title: string;
    detail: string;
    created_at: string;
    source_url?: string;
  }[];
};
export type FamilyMessage = {
  id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
};
export type BraStats = {
  sourceUrl: string;
  referenceYear?: string;
  fetchedAt?: string;
  stale?: boolean;
  nationalAverage: { totalPer100k: number };
  regions: {
    region: string;
    total: number;
    totalPer100k: number;
    rank: number;
    riskIndex: string;
  }[];
};

const SESSION_KEY = "tryggpuls-family-session";
export const familyToken = () => SecureStore.getItemAsync(SESSION_KEY);
export const clearFamilyToken = () => SecureStore.deleteItemAsync(SESSION_KEY);
export async function familyRequest<T>(
  path: string,
  method = "GET",
  value?: unknown,
): Promise<T> {
  if (
    !API_BASE.startsWith("https://") &&
    !API_BASE.startsWith("http://localhost")
  )
    throw new Error("Familjekontot kräver en HTTPS-server.");
  const token = await familyToken();
  const response = await fetch(`${API_BASE}/api/family/${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-TryggPuls-Action": "1",
      "X-TryggPuls-Client": "native",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(value || {}) }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || `Tjänsten svarade ${response.status}`);
  if ((path === "login" || path === "register") && data.token)
    await SecureStore.setItemAsync(SESSION_KEY, data.token);
  return data as T;
}

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
