import type { Event, EventsResponse, Feature, FamilyOverview } from './api';

export function eventPoint(event:Event){
  const gps=event.location?.gps;
  return gps&&Number.isFinite(gps[0])&&Number.isFinite(gps[1])?{latitude:gps[0],longitude:gps[1]}:null;
}
export function latestEvents(events:Event[],limit=3){
  return [...events].sort((a,b)=>b.ts-a.ts||String(a.id).localeCompare(String(b.id))).slice(0,limit);
}
export function km(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}){
  const rad=Math.PI/180,dLat=(a.latitude-b.latitude)*rad,dLon=(a.longitude-b.longitude)*rad;
  return 12742*Math.asin(Math.sqrt(Math.sin(dLat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dLon/2)**2));
}

export const POSITION_TTL_MS = 15 * 60_000;
export function validAt(properties: { validFrom?: string; validTo?: string }, now = Date.now()) {
  return (!properties.validFrom || Date.parse(properties.validFrom) <= now) &&
    (!properties.validTo || Date.parse(properties.validTo) > now);
}
export function positionFresh(member: FamilyOverview['members'][number], now = Date.now()) {
  const time = Date.parse(member.updated_at || '');
  return member.sharing && Number.isFinite(member.lat) && Number.isFinite(member.lon) &&
    Number.isFinite(time) && time <= now + 60_000 && now - time < POSITION_TTL_MS;
}
export function passageId(feature: Feature) {
  if (!feature.id) return '';
  return feature.properties.kind === 'security-zone' || feature.properties.kind === 'organized-crime-area' || feature.id.startsWith('police-')
    ? feature.id : `police-${feature.id}`;
}
export function polygonParts(feature: Feature) {
  const polygons = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates as number[][][]] : feature.geometry.coordinates as number[][][][];
  const convert = (ring: number[][]) => ring.map(([longitude, latitude]) => ({ latitude, longitude }));
  return polygons.filter(p => p[0]?.length >= 3).map(p => ({ coordinates: convert(p[0]), holes: p.slice(1).filter(r => r.length >= 3).map(convert) }));
}
export function mapFocus(region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }, destination?: { latitude: number; longitude: number } | null) {
  return destination ? { latitude: destination.latitude, longitude: destination.longitude, latitudeDelta: 0.1, longitudeDelta: 0.1 } : region;
}
export function feedAvailable(feed: EventsResponse | null) { return Array.isArray(feed?.events) && (!feed?.error || !!feed?.fetchedAt); }
export function destinationOnly(events: Event[], routeEvents: Event[]) {
  const ids = new Set(routeEvents.map(e => e.id));
  return events.filter(e => !ids.has(e.id));
}
export function matchMunicipality(name: string | undefined, regions: { region: string }[]) {
  const normalize = (s: string) => s.trim().toLocaleLowerCase('sv-SE').replace(/\s+kommun$/, '');
  const matches = name ? regions.filter(r => normalize(r.region) === normalize(name)) : [];
  return matches.length === 1 ? matches[0].region : '';
}
// A new search or logout invalidates every older asynchronous continuation.
export function latestRequest() {
  let version = 0;
  return { next: () => ++version, current: (id: number) => id === version, invalidate: () => { version++; } };
}
