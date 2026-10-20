import type { Region } from 'react-native-maps';
import type { Event, Point } from './api';
import { eventPoint, km } from './mobileState.ts';

export function neighborhoodRegion(point: Point): Region {
  return { latitude: point.lat, longitude: point.lon, latitudeDelta: .022, longitudeDelta: .06 };
}
export function recentHomeEvents(events: Event[], now=Date.now()): Event[] {
  return events.filter(event=>Number.isFinite(event.ts)&&event.ts>=now-7*86_400_000&&event.ts<=now+60_000);
}
export function closestEvents(events: Event[], origin: Point, limit = 3): Event[] {
  const center = { latitude: origin.lat, longitude: origin.lon };
  return events.flatMap(event => {
    const point = eventPoint(event);
    return point ? [{ event, distance: km(center, point) }] : [];
  }).sort((a, b) => a.distance - b.distance || b.event.ts - a.event.ts).slice(0, limit).map(item => item.event);
}
export function latestNearbyEvents(events: Event[], origin: Point, radiusKm = 35, limit = 3): Event[] {
  const center={latitude:origin.lat,longitude:origin.lon};
  return events.flatMap(event=>{
    const point=eventPoint(event);
    if(!point)return [];
    const distance=km(center,point);
    return distance<=radiusKm?[{event,distance}]:[];
  }).sort((a,b)=>b.event.ts-a.event.ts||a.distance-b.distance).slice(0,limit).map(item=>item.event);
}
export function eventsInViewport(events: Event[], region: Region): Event[] {
  return events.filter(event => {
    const point = eventPoint(event);
    return point && Math.abs(point.latitude - region.latitude) <= region.latitudeDelta / 2 && Math.abs(point.longitude - region.longitude) <= region.longitudeDelta / 2;
  }).sort((a, b) => b.ts - a.ts).slice(0, 8);
}
