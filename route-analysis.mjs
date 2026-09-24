import { areaContains } from './police-areas.mjs';

const radians = value => value * Math.PI / 180;

export function routeDistanceMeters(a, b) {
  const dLat = radians(b[1] - a[1]);
  const dLon = radians(b[0] - a[0]);
  const lat1 = radians(a[1]), lat2 = radians(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function nearestRoutePosition(pLat, pLon, coordinates) {
  let minimum = Infinity, nearestMeters = null, routeProgress = 0;
  for (let i = 0; i < (coordinates?.length || 0) - 1; i++) {
    const [lon1, lat1] = coordinates[i], [lon2, lat2] = coordinates[i + 1];
    const latMid = ((lat1 + lat2 + pLat) / 3) * Math.PI / 180;
    const kx = 111_320 * Math.cos(latMid), ky = 110_540;
    const px = pLon * kx, py = pLat * ky;
    const x1 = lon1 * kx, y1 = lat1 * ky, x2 = lon2 * kx, y2 = lat2 * ky;
    const dx = x2 - x1, dy = y2 - y1;
    const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    const distance = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    const segmentMeters = routeDistanceMeters([lon1, lat1], [lon2, lat2]);
    if (distance < minimum) { minimum = distance; nearestMeters = routeProgress + segmentMeters * t; }
    routeProgress += segmentMeters;
  }
  return { distanceMeters: minimum, alongRouteMeters: nearestMeters };
}

export function pointToRouteDistanceMeters(pLat, pLon, coordinates) {
  return nearestRoutePosition(pLat, pLon, coordinates).distanceMeters;
}

export function selectApproximateRouteEvents(events, coordinates, { bufferMeters = 600, now = Date.now } = {}) {
  const threshold = Math.max(Number(bufferMeters) || 0, 8_000);
  return (Array.isArray(events) ? events : []).flatMap(event => {
    const timestamp = Number(event?.ts);
    const gps = event?.location?.gps;
    if (!Number.isFinite(timestamp) || timestamp < now() - 24 * 60 * 60_000 || !Array.isArray(gps) || gps.length < 2) return [];
    const [lat, lon] = gps.map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const routePosition = nearestRoutePosition(lat, lon, coordinates);
    return routePosition.distanceMeters <= threshold ? [{ ...event, locationPrecision: 'Kommunens eller länets ungefärliga kartpunkt', approximateRelevance: true, _sortDistance: routePosition.distanceMeters }] : [];
  }).sort((a, b) => a._sortDistance - b._sortDistance).map(({ _sortDistance, ...event }) => event);
}

function pointInFeature(feature, point) {
  try { return areaContains(feature, point[1], point[0]); }
  catch { return false; }
}

function pointOnSegment(a, b, fraction) {
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
}

function geometryRings(feature) {
  const polygons = feature?.geometry?.type === 'Polygon'
    ? [feature.geometry.coordinates]
    : feature?.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
  const rings = [];
  for (const polygon of polygons) for (const ring of polygon || []) {
    if (!Array.isArray(ring) || ring.length < 4) continue;
    const points = ring.filter(point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]));
    if (points.length < 4) continue;
    rings.push({ points, bounds: points.reduce((bounds, point) => ({ minX: Math.min(bounds.minX, point[0]), minY: Math.min(bounds.minY, point[1]), maxX: Math.max(bounds.maxX, point[0]), maxY: Math.max(bounds.maxY, point[1]) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }) });
  }
  return rings;
}

function boundsOverlap(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function segmentIntersectionParameters(a, b, c, d) {
  const rx = b[0] - a[0], ry = b[1] - a[1];
  const sx = d[0] - c[0], sy = d[1] - c[1];
  const denominator = rx * sy - ry * sx;
  const qx = c[0] - a[0], qy = c[1] - a[1];
  const epsilon = 1e-12;
  if (Math.abs(denominator) <= epsilon) {
    if (Math.abs(qx * ry - qy * rx) > epsilon) return [];
    const lengthSquared = rx * rx + ry * ry;
    if (lengthSquared <= epsilon) return [];
    const first = (qx * rx + qy * ry) / lengthSquared;
    const second = ((d[0] - a[0]) * rx + (d[1] - a[1]) * ry) / lengthSquared;
    const low = Math.max(0, Math.min(first, second));
    const high = Math.min(1, Math.max(first, second));
    return high >= low - epsilon ? [low, high] : [];
  }
  const t = (qx * sy - qy * sx) / denominator;
  const u = (qx * ry - qy * rx) / denominator;
  return t >= -epsilon && t <= 1 + epsilon && u >= -epsilon && u <= 1 + epsilon
    ? [Math.max(0, Math.min(1, t))]
    : [];
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

// Split every route segment at polygon boundaries, then classify each interval.
// This preserves narrow polygons, holes and multipart boundaries without relying
// on a sampling interval. Distances are positions along the route, never crime distances.
export function findRouteZonePassages(coords, features) {
  if (!Array.isArray(coords) || coords.length < 2 || !Array.isArray(features)) return [];
  const passages = [];
  for (const feature of features) {
    if (!['Polygon', 'MultiPolygon'].includes(feature?.geometry?.type)) continue;
    const rings = geometryRings(feature);
    if (!rings.length) continue;
    let along = 0;
    let start = null;
    for (let segment = 1; segment < coords.length; segment++) {
      const a = coords[segment - 1], b = coords[segment];
      const length = routeDistanceMeters(a, b);
      if (!Number.isFinite(length) || length === 0) continue;
      const segmentBounds = { minX: Math.min(a[0], b[0]), minY: Math.min(a[1], b[1]), maxX: Math.max(a[0], b[0]), maxY: Math.max(a[1], b[1]) };
      const cuts = [0, 1];
      for (const ring of rings) {
        if (!boundsOverlap(segmentBounds, ring.bounds)) continue;
        for (let edge = 1; edge < ring.points.length; edge++) {
          const c = ring.points[edge - 1], d = ring.points[edge];
          const edgeBounds = { minX: Math.min(c[0], d[0]), minY: Math.min(c[1], d[1]), maxX: Math.max(c[0], d[0]), maxY: Math.max(c[1], d[1]) };
          if (boundsOverlap(segmentBounds, edgeBounds)) cuts.push(...segmentIntersectionParameters(a, b, c, d));
        }
      }
      cuts.sort((x, y) => x - y);
      const uniqueCuts = cuts.filter((value, index) => index === 0 || value - cuts[index - 1] > 1e-10);
      for (let interval = 1; interval < uniqueCuts.length; interval++) {
        const low = uniqueCuts[interval - 1], high = uniqueCuts[interval];
        if (high - low <= 1e-10) continue;
        const inside = pointInFeature(feature, pointOnSegment(a, b, (low + high) / 2));
        const intervalStart = along + length * low;
        const intervalEnd = along + length * high;
        if (inside && start === null) start = intervalStart;
        else if (!inside && start !== null) {
          passages.push({ feature, startMeters: start, endMeters: intervalStart });
          start = null;
        }
      }
      along += length;
    }
    if (start !== null) passages.push({ feature, startMeters: start, endMeters: along });
  }
  return passages.sort((a, b) => a.startMeters - b.startMeters || a.endMeters - b.endMeters);
}

export function findGeographicItemsAlongRoute(coords, items) {
  if (!Array.isArray(items)) return [];
  const matches = [];
  for (const item of items) {
    const areas = Array.isArray(item?.areas) && item.areas.length
      ? item.areas
      : [{ name: item?.area || '', geometry: item?.geometry || null }];
    for (const area of areas) {
      const rawGeometry = area?.geometry || item?.geometry;
      const geometry = rawGeometry?.type === 'Feature' ? rawGeometry.geometry : rawGeometry;
      if (!['Polygon', 'MultiPolygon'].includes(geometry?.type)) continue;
      const passages = findRouteZonePassages(coords, [{ type: 'Feature', geometry }]);
      if (!passages.length) continue;
      matches.push({
        id: `${item.id || item.title || 'notice'}-${area.name || area.code || ''}`,
        type: item.type || 'notice',
        title: item.title || 'Myndighetsnotis',
        area: area.name || item.area || '',
        areaCode: area.code || null,
        level: item.level || null,
        levelLabel: item.levelLabel || null,
        publishedAt: item.publishedAt || null,
        validFrom: item.validFrom || null,
        validTo: item.validTo || null,
        source: item.source || '',
        geometry,
        passages: passages.map(passage => ({
          startMeters: Math.round(passage.startMeters),
          endMeters: Math.round(passage.endMeters),
          line: routeSlice(coords, passage.startMeters, passage.endMeters)
        }))
      });
    }
  }
  return matches.sort((a, b) => a.passages[0].startMeters - b.passages[0].startMeters || a.title.localeCompare(b.title, 'sv'));
}
