const endpoint = 'https://api.trafikinfo.trafikverket.se/v2/data.json';
const ttlMs = 60_000;
let cache = null;
let attemptedAt = 0;
let pending = null;
let lastError = null;

const escapeXml = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const asArray = value => value == null ? [] : Array.isArray(value) ? value : [value];
function redactTrafficError(error) {
  let message = String(error?.message || 'Trafikverkets API kunde inte hämtas');
  const secret = process.env.TRAFIKVERKET_API_KEY;
  if (secret) for (const candidate of new Set([secret, escapeXml(secret), encodeURIComponent(secret)])) message = message.replaceAll(candidate, '[redigerad]');
  return message.slice(0, 500);
}

function parseWktGeometry(value) {
  if (value && typeof value === 'object') return value.type ? value : value.coordinates ? { type: 'LineString', coordinates: value.coordinates } : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const pair = input => input.trim().split(/[\s,]+/).map(Number).slice(0, 2);
  const pairs = input => input.split(',').map(pair).filter(xy => xy.length === 2 && xy.every(Number.isFinite));
  let match = /^POINT\s*(?:Z\s*)?\(([^)]+)\)$/i.exec(text);
  if (match) { const coordinates = pair(match[1]); return coordinates.length === 2 && coordinates.every(Number.isFinite) ? { type: 'Point', coordinates } : null; }
  match = /^LINESTRING\s*(?:Z\s*)?\(([^)]+)\)$/i.exec(text);
  if (match) { const coordinates = pairs(match[1]); return coordinates.length > 1 ? { type: 'LineString', coordinates } : null; }
  match = /^MULTILINESTRING\s*(?:Z\s*)?\((.+)\)$/i.exec(text);
  if (match) { const coordinates = [...match[1].matchAll(/\(([^()]+)\)/g)].map(item => pairs(item[1])).filter(line => line.length > 1); return coordinates.length ? { type: 'MultiLineString', coordinates } : null; }
  return null;
}

export function normalizeTrafficResponse(payload, now = Date.now()) {
  const root = payload?.RESPONSE;
  const result = Array.isArray(root?.RESULT) ? root.RESULT[0] : root?.RESULT;
  if (result?.ERROR) throw new Error(String(result.ERROR.MESSAGE || 'Trafikverkets API-fel'));
  const situations = asArray(result?.Situation);
  const items = [];
  for (const situation of situations) {
    for (const [deviationIndex, deviation] of asArray(situation?.Deviation).entries()) {
      const geometry = parseWktGeometry(deviation.Geometry?.WGS84 || deviation.Geometry?.WGS84Geometry || deviation.Geometry || null);
      items.push({
        id: String(deviation.Id || `${situation.Id || 'situation'}-${deviationIndex + 1}`),
        title: String(deviation.Header || 'Trafikstörning'),
        description: String(deviation.Message || deviation.PositionalDescription || ''),
        road: String(deviation.RoadNumber || ''),
        countyCode: deviation.CountyNo == null ? null : String(deviation.CountyNo),
        severity: String(deviation.SeverityText || ''),
        severityCode: Number(deviation.SeverityCode) || null,
        type: String(deviation.MessageType || deviation.TrafficRestrictionType || ''),
        startAt: deviation.StartTime || null,
        validTo: deviation.EndTime || null,
        modifiedAt: situation.ModifiedTime || null,
        publishedAt: situation.PublicationTime || null,
        location: String(deviation.PositionalDescription || ''),
        geometry,
        source: 'https://www.trafikverket.se/resa-och-trafik/'
      });
    }
  }
  const unique = new Map(items.map(item => [item.id, item]));
  return [...unique.values()].sort((a, b) => String(b.modifiedAt || b.publishedAt || '').localeCompare(String(a.modifiedAt || a.publishedAt || ''))).slice(0, 500);
}

export function trafficStatus() {
  return { status: !process.env.TRAFIKVERKET_API_KEY ? 'requires_key' : !cache ? (lastError ? 'unavailable' : 'not_checked') : lastError ? 'stale' : 'ok', fetchedAt: cache?.fetchedAt || null };
}

export async function readTraffic({ fetcher = fetch, now = Date.now } = {}) {
  if (!process.env.TRAFIKVERKET_API_KEY) return { items: [], fetchedAt: null, stale: false, status: 'requires_key', error: 'Trafikverkets API-nyckel saknas på servern.', source: endpoint };
  if (!pending && (!attemptedAt || now() - attemptedAt >= ttlMs || (lastError && now() - attemptedAt >= 15_000))) {
    attemptedAt = now();
    const xml = `<REQUEST><LOGIN authenticationkey="${escapeXml(process.env.TRAFIKVERKET_API_KEY)}"/><QUERY objecttype="Situation" schemaversion="1.2" limit="500" orderby="ModifiedTime desc"><INCLUDE>Id</INCLUDE><INCLUDE>ModifiedTime</INCLUDE><INCLUDE>PublicationTime</INCLUDE><INCLUDE>Deviation.Header</INCLUDE><INCLUDE>Deviation.Message</INCLUDE><INCLUDE>Deviation.PositionalDescription</INCLUDE><INCLUDE>Deviation.RoadNumber</INCLUDE><INCLUDE>Deviation.CountyNo</INCLUDE><INCLUDE>Deviation.SeverityText</INCLUDE><INCLUDE>Deviation.SeverityCode</INCLUDE><INCLUDE>Deviation.MessageType</INCLUDE><INCLUDE>Deviation.TrafficRestrictionType</INCLUDE><INCLUDE>Deviation.StartTime</INCLUDE><INCLUDE>Deviation.EndTime</INCLUDE><INCLUDE>Deviation.Geometry.WGS84</INCLUDE></QUERY></REQUEST>`;
    pending = (async () => {
      try {
        const response = await fetcher(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', Accept: 'application/json' }, body: xml, signal: AbortSignal.timeout(12_000) });
        if (!response.ok) throw new Error(`Trafikverkets API svarade ${response.status}`);
        const payload = await response.json();
        cache = { items: normalizeTrafficResponse(payload, now()), fetchedAt: new Date(now()).toISOString() };
        lastError = null;
      } catch (error) {
        lastError = redactTrafficError(error);
        console.warn('[trafikverket] Källa otillgänglig:', lastError);
      } finally { pending = null; }
    })();
  }
  await pending;
  return { items: cache?.items || [], fetchedAt: cache?.fetchedAt || null, stale: Boolean(lastError), status: cache ? lastError ? 'stale' : 'ok' : 'unavailable', error: lastError || undefined, source: endpoint };
}
