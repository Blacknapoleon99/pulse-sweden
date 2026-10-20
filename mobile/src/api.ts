import * as SecureStore from "expo-secure-store";
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    validFrom?: string;
    validTo?: string;
  };
};
export type MapItem = {
  id?: string;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    title: string;
    description: string;
    kind: "safety-notice" | "service-point";
    sourceTitle: string;
    sourceUrl: string;
    sourceExcerpt: string;
    validFrom?: string;
    validTo: string;
  };
};
export type MapItemsResponse = { features?: MapItem[]; status?: string; error?: string };
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
  sourceName?: string;
  imageUrl?: string;
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
  privateChatEnabled?:boolean;
  positionHistory?:Record<string,{latitude:number;longitude:number;at:number}[]>;
  user: {
    id: string;
    display_name: string;
    email: string | null;
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
  recipient_id?:string|null;
  id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
};
export type FamilyAlarm = {
  id: string;
  senderId: string;
  senderName: string;
  createdAt: string;
  expiresAt: string;
  cancelledAt: string | null;
  active: boolean;
  recipients: { id: string; name: string; acknowledgedAt: string | null }[];
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
const sessionListeners = new Set<() => void>();
const familyCleanup=new Set<()=>Promise<void>>();
export function registerFamilyCleanup(fn:()=>Promise<void>){familyCleanup.add(fn);}
async function cleanFamilySharing(){for(const fn of familyCleanup)await fn();}
let sessionRevision = 0;
const notifySession = () => { sessionRevision++; sessionListeners.forEach(fn => fn()); };
export function subscribeFamilySession(fn: () => void) { sessionListeners.add(fn); return () => { sessionListeners.delete(fn); }; }
export const familyToken = () => SecureStore.getItemAsync(SESSION_KEY);
export async function clearFamilyToken() { await cleanFamilySharing();await SecureStore.deleteItemAsync(SESSION_KEY); notifySession(); }
export async function fetchJson(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener('abort', abort);
  const timer = setTimeout(abort, 15_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || `Tjänsten svarade ${response.status}`), { status: response.status,code:data.code });
    return data;
  } finally { clearTimeout(timer); init.signal?.removeEventListener('abort', abort); }
}
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
  const revision = sessionRevision;
  const token = await familyToken();
  if((method==='POST'&&['leave','group','join','login','register'].includes(path))||(path==='account'&&method==='DELETE'))await cleanFamilySharing();
  if (path === 'logout') {
    const preferences=await AsyncStorage.getItem('tryggpuls-push-preferences');
    try {const saved=preferences?JSON.parse(preferences):null;if(saved?.token)value={...(value as object||{}),pushToken:saved.token};}catch{}
    await AsyncStorage.removeItem('tryggpuls-push-preferences');
    await clearFamilyToken();
  }
  const data = await fetchJson(`${API_BASE}/api/family/${path}`, {
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
  if (path !== 'logout' && revision !== sessionRevision) throw new Error('Kontot ändrades under begäran.');
  if ((path === "login" || path === "register" || path === "bankid/collect") && data.token) {
    await SecureStore.setItemAsync(SESSION_KEY, data.token);
    notifySession();
  } else if (path === 'account' && method === 'DELETE') await clearFamilyToken();
  else if (method !== 'GET' && ['group', 'join', 'leave'].includes(path)) notifySession();
  return data as T;
}

export async function adminMapRequest<T>(
  path: string,
  adminToken: string,
  method = "GET",
  value?: unknown,
): Promise<T> {
  const response = await fetch(`${API_BASE}/api/admin/map-items${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${adminToken}`,
      ...(method === "GET" ? {} : { "Content-Type": "application/json", "X-TryggPuls-Action": "1" }),
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(value || {}) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Tjänsten svarade ${response.status}`);
  return data as T;
}

export async function getJson<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const data = await fetchJson(`${API_BASE}${path}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  return data as T;
}

export function geocode(query: string, signal?: AbortSignal) {
  return getJson<{ results: GeocodeResult[] }>(
    `/api/geocode?q=${encodeURIComponent(query.trim())}`,
    signal,
  );
}

export function calculateRoute(
  from: Point,
  to: Point,
  mode: "walking" | "driving",
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    fromLat: String(from.lat),
    fromLon: String(from.lon),
    toLat: String(to.lat),
    toLon: String(to.lon),
    mode,
    buffer: "600",
  });
  return getJson<RouteResponse>(`/api/route?${params}`, signal);
}

export function refreshRoute(routeId: string) {
  return getJson<RouteResponse>(
    `/api/route-refresh?routeId=${encodeURIComponent(routeId)}`,
  );
}
