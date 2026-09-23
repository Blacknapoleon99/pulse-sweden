import { areaContains } from './police-areas.mjs';

const radians = value => value * Math.PI / 180;

export function routeDistanceMeters(a, b) {
  const dLat = radians(b[1] - a[1]);
  const dLon = radians(b[0] - a[0]);
  const lat1 = radians(a[1]), lat2 = radians(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function pointInFeature(feature, point) {
  try { return areaContains(feature, point[1], point[0]); }
  catch { return false; }
}

function pointOnSegment(a, b, fraction) {
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
}

function crossingFraction(feature, a, b, low, high, insideLow) {
  for (let i = 0; i < 22; i++) {
    const middle = (low + high) / 2;
    if (pointInFeature(feature, pointOnSegment(a, b, middle)) === insideLow) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function routeTotal(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += routeDistanceMeters(coords[i - 1], coords[i]);
  return total;
}

function pointAtDistance(coords, target) {
  let passed = 0;
  for (let i = 1; i < coords.length; i++) {
    const length = routeDistanceMeters(coords[i - 1], coords[i]);
    if (passed + length >= target) return pointOnSegment(coords[i - 1], coords[i], length ? (target - passed) / length : 0);
    passed += length;
  }
  return coords.at(-1);
}

export function routeSlice(coords, fromMeters, toMeters) {
  if (!Array.isArray(coords) || coords.length < 2 || !(toMeters > fromMeters)) return [];
  const total = routeTotal(coords);
  const start = Math.max(0, Math.min(total, fromMeters));
  const end = Math.max(start, Math.min(total, toMeters));
  const slice = [pointAtDistance(coords, start)];
  let passed = 0;
  for (let i = 1; i < coords.length; i++) {
    passed += routeDistanceMeters(coords[i - 1], coords[i]);
    if (passed > start && passed < end) slice.push(coords[i]);
  }
  slice.push(pointAtDistance(coords, end));
  return slice;
}

// Approximate route/polygon crossings with bounded sampling and binary refinement.
// Output distances are positions along the route, never distances to a crime.
export function findRouteZonePassages(coords, features, { sampleMeters = 80 } = {}) {
  if (!Array.isArray(coords) || coords.length < 2 || !Array.isArray(features)) return [];
  const passages = [];
  const sampleSpacing = Math.max(20, Math.min(200, sampleMeters));
  for (const feature of features) {
    if (!['Polygon', 'MultiPolygon'].includes(feature?.geometry?.type)) continue;
    let along = 0;
    let start = null;
    let priorPoint = coords[0];
    let priorInside = pointInFeature(feature, priorPoint);
    if (priorInside) start = 0;
    for (let segment = 1; segment < coords.length; segment++) {
      const a = coords[segment - 1], b = coords[segment];
      const length = routeDistanceMeters(a, b);
      if (!Number.isFinite(length) || length === 0) continue;
      const count = Math.max(1, Math.ceil(length / sampleSpacing));
      for (let step = 1; step <= count; step++) {
        const fraction = step / count;
        const point = pointOnSegment(a, b, fraction);
        const inside = pointInFeature(feature, point);
        if (inside !== priorInside) {
          const local = crossingFraction(feature, a, b, (step - 1) / count, fraction, priorInside);
          const crossing = along + length * local;
          if (inside) start = crossing;
          else if (start !== null) {
            passages.push({ feature, startMeters: start, endMeters: crossing });
            start = null;
          }
        }
        priorInside = inside;
        priorPoint = point;
      }
      along += length;
    }
    if (start !== null) passages.push({ feature, startMeters: start, endMeters: along });
  }
  return passages.sort((a, b) => a.startMeters - b.startMeters || a.endMeters - b.endMeters);
}
