import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import proj4 from 'proj4';

export const sourcePage = 'https://polisen.se/om-polisen/polisens-arbete/utsatta-omraden/';
const bundledUrl = 'https://polisen.se/33a4eb398c9ca7879ac47049931a252f/contentassets/1f86e17354294629b5b66559eef35972/uso_2025_geojson.zip';
const bundledPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'uso_2025_geojson.zip');
const sweref99 = '+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs';
const validCategories = new Set(['Utsatt område', 'Särskilt utsatt område']);
let snapshot;
let lastCheck = 0;
let pending;

export function policeAreasStatus() {
  return { status: !snapshot ? 'not_checked' : snapshot.stale ? 'stale' : 'ok', fetchedAt: snapshot?.checkedAt || null };
}

function coordinatesToWgs84(coords) {
  if (typeof coords[0] === 'number') {
    const [lon, lat] = proj4(sweref99, 'WGS84', coords);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 54 || lat > 70 || lon < 10 || lon > 25) throw new Error('Ogiltiga svenska områdeskoordinater');
    return [lon, lat];
  }
  return coords.map(coordinatesToWgs84);
}

export function parsePoliceAreasZip(bytes, downloadUrl) {
  const files = unzipSync(new Uint8Array(bytes));
  const name = Object.keys(files).find(key => /\.geojson$/i.test(key));
  if (!name) throw new Error('GeoJSON saknas i Polisens arkiv');
  const raw = JSON.parse(strFromU8(files[name]));
  if (raw.type !== 'FeatureCollection' || raw.crs?.properties?.name !== 'EPSG:3006' || !Array.isArray(raw.features) || raw.features.length < 50) throw new Error('Polisens geodata har oväntat format');
  const features = raw.features.map(feature => {
    const p = feature.properties || {};
    if (!validCategories.has(p.KATEGORI) || !p.NAMN || !p.ORT || !['Polygon','MultiPolygon'].includes(feature.geometry?.type)) throw new Error('Ofullständig områdespost');
    return { type: 'Feature', id: String(p.SPECIALOMRADES_ID || p.OBJECTID), properties: { name: p.NAMN, category: p.KATEGORI, locality: p.ORT, region: p.REGION }, geometry: { type: feature.geometry.type, coordinates: coordinatesToWgs84(feature.geometry.coordinates) } };
  });
  const year = Number(downloadUrl.match(/uso_(20\d{2})_geojson\.zip/i)?.[1]);
  if (!year || year < 2025 || year > new Date().getUTCFullYear() + 1) throw new Error('Okänt år för Polisens områdesdata');
  return { type: 'FeatureCollection', features, year, sourceUrl: sourcePage, downloadUrl, checkedAt: new Date().toISOString(), stale: false };
}

function ringContains(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function areaContains(feature, lat, lon) {
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  return polygons.some(rings => ringContains(rings[0], lon, lat) && !rings.slice(1).some(hole => ringContains(hole, lon, lat)));
}

function findDownloadUrl(html) {
  const links = [...html.matchAll(/href=["']([^"']*uso_(20\d{2})_geojson\.zip[^"']*)["']/gi)];
  if (!links.length) throw new Error('Ingen GeoJSON-nedladdning på Polisens sida');
  const newest = links.sort((a, b) => Number(b[2]) - Number(a[2]))[0];
  const url = new URL(newest[1].replaceAll('&amp;', '&'), sourcePage);
  if (url.protocol !== 'https:' || url.hostname !== 'polisen.se') throw new Error('Ogiltig geodatakälla');
  return url.href;
}

export async function readPoliceAreas() {
  if (!snapshot) snapshot = parsePoliceAreasZip(await readFile(bundledPath), bundledUrl);
  if (Date.now() - lastCheck < 24 * 3600_000) return snapshot;
  if (!pending) {
    lastCheck = Date.now();
    pending = (async () => {
      try {
        const page = await fetch(sourcePage, { signal: AbortSignal.timeout(10_000) });
        if (!page.ok) throw new Error(`Källsidan svarade ${page.status}`);
        const url = findDownloadUrl(await page.text());
        const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`Geodata svarade ${response.status}`);
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 5_000_000) throw new Error('Oväntat stort geodataarkiv');
        snapshot = parsePoliceAreasZip(bytes, url);
      } catch (error) {
        console.warn('[police-areas] Kunde inte kontrollera senaste geodata:', error.message);
        snapshot = { ...snapshot, stale: true };
        lastCheck = Date.now() - 23 * 3600_000; // nytt försök om en timme
      } finally { pending = null; }
      return snapshot;
    })();
  }
  return pending;
}
