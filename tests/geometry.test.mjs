import assert from 'node:assert';
import { test } from 'node:test';

// Exakt kopia av pointToSegmentDistanceMeters + minDistanceToRouteMeters
// från server.mjs:438–474.
function pointToSegmentDistanceMeters(pLat, pLon, lat1, lon1, lat2, lon2) {
  const latMid = ((lat1 + lat2 + pLat) / 3) * (Math.PI / 180);
  const cosLat = Math.cos(latMid);
  const kx = 111320 * cosLat;
  const ky = 110540;

  const px = pLon * kx;
  const py = pLat * ky;
  const x1 = lon1 * kx;
  const y1 = lat1 * ky;
  const x2 = lon2 * kx;
  const y2 = lat2 * ky;

  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function minDistanceToRouteMeters(pLat, pLon, coordinates) {
  let minDist = Infinity;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lon1, lat1] = coordinates[i];
    const [lon2, lat2] = coordinates[i + 1];
    const dist = pointToSegmentDistanceMeters(pLat, pLon, lat1, lon1, lat2, lon2);
    if (dist < minDist) {
      minDist = dist;
    }
  }
  return minDist;
}

test('punkt 0.001° N om segment -> ~124 m', () => {
  const route = [[18.0680, 59.3350], [18.0710, 59.3420]];
  const dist = minDistanceToRouteMeters(59.3430, 18.0700, route);
  assert.ok(Math.abs(dist - 124.3) < 1, `förväntat ~124.3 m, fick ${dist.toFixed(1)} m`);
});

test('punkt på segment -> 0.000 m', () => {
  const route = [[18.0680, 59.3350], [18.0710, 59.3420]];
  const dist = minDistanceToRouteMeters(59.3385, 18.0695, route);
  assert.ok(dist < 0.001, `förväntat 0, fick ${dist}`);
});

test('L-formad rutt -> korrekt avstånd', () => {
  const route = [[18.0600, 59.3300], [18.0700, 59.3300], [18.0700, 59.3400]];
  const dist = minDistanceToRouteMeters(59.3350, 18.0650, route);
  assert.ok(Math.abs(dist - 283.9) < 1, `förväntat ~283.9 m, fick ${dist.toFixed(1)} m`);
});

test('punkt bortom änden av rutt', () => {
  const route = [[18.0680, 59.3350], [18.0710, 59.3420]];
  const dist = minDistanceToRouteMeters(59.3500, 18.0750, route);
  assert.ok(dist > 900 && dist < 920, `förväntat ~913 m, fick ${dist.toFixed(1)} m`);
});

test('punkt ~100 m söder om rutt', () => {
  const route = [[18.0680, 59.3350], [18.0710, 59.3420]];
  const dist = minDistanceToRouteMeters(59.3345, 18.0695, route);
  assert.ok(dist > 95 && dist < 108, `förväntat ~101.5 m, fick ${dist.toFixed(1)} m`);
});

test('tom rutt returnerar Infinity', () => {
  assert.strictEqual(minDistanceToRouteMeters(59.33, 18.06, []), Infinity);
});

test('rutt med en punkt returnerar Infinity', () => {
  assert.strictEqual(minDistanceToRouteMeters(59.33, 18.06, [[18.06, 59.33]]), Infinity);
});
