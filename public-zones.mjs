import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import pg from 'pg';

const officialHosts = ['polisen.se', 'krisinformation.se', 'smhi.se', 'mcf.se', 'msb.se', 'lansstyrelsen.se'];
const kinds = new Set(['security-zone', 'organized-crime-area']);
const states = new Set(['draft', 'review', 'published', 'ended']);
const maxSecurityZoneDurationMs = 14 * 24 * 60 * 60 * 1000;
const sha = value => createHash('sha256').update(value).digest();
const asIsoDate = (value, optional = false) => {
  if (optional && !value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw Object.assign(new Error('Datum måste anges i ISO-format'), { status: 400 });
  return new Date(time).toISOString();
};

function officialSource(value) {
  let url;
  try { url = new URL(value); } catch { throw Object.assign(new Error('Ange en giltig myndighetslänk'), { status: 400 }); }
  if (url.protocol !== 'https:' || !officialHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) throw Object.assign(new Error('Källan måste vara en officiell svensk myndighetssida'), { status: 400 });
  return url.href;
}

function coordinateCount(geometry) {
  const validateRing = ring => {
    if (!Array.isArray(ring) || ring.length < 4) throw Object.assign(new Error('Varje polygonring måste ha minst fyra positioner'), { status: 400 });
    for (const position of ring) {
      if (!Array.isArray(position) || position.length < 2 || position.length > 3 || position.some(value => !Number.isFinite(value))) throw Object.assign(new Error('GeoJSON innehåller en ogiltig koordinatstruktur'), { status: 400 });
      const [lon, lat] = position;
      if (lon < 10 || lon > 25 || lat < 54 || lat > 71) throw Object.assign(new Error('Zonens koordinater måste ligga i Sverige'), { status: 400 });
    }
    const first = ring[0], last = ring.at(-1);
    if (first.length !== last.length || first.some((value, index) => value !== last[index])) throw Object.assign(new Error('Varje polygonring måste vara sluten enligt GeoJSON'), { status: 400 });
    return ring.length;
  };
  const validatePolygon = polygon => {
    if (!Array.isArray(polygon) || polygon.length === 0) throw Object.assign(new Error('Varje polygon måste ha en yttre ring'), { status: 400 });
    return polygon.reduce((total, ring) => total + validateRing(ring), 0);
  };
  if (geometry?.type === 'Polygon') return validatePolygon(geometry.coordinates);
  if (geometry?.type === 'MultiPolygon' && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0) {
    return geometry.coordinates.reduce((total, polygon) => total + validatePolygon(polygon), 0);
  }
  throw Object.assign(new Error('GeoJSON innehåller en ogiltig koordinatstruktur'), { status: 400 });
}

export function validatePublicZone(input, { now = Date.now } = {}) {
  const name = String(input?.name || '').trim();
  const sourceTitle = String(input?.sourceTitle || '').trim();
  const sourceExcerpt = String(input?.sourceExcerpt || '').trim();
  if (!name || name.length > 120 || !sourceTitle || sourceTitle.length > 240 || !sourceExcerpt || sourceExcerpt.length > 1000) throw Object.assign(new Error('Namn, källrubrik och källutdrag måste anges'), { status: 400 });
  if (!kinds.has(input.kind)) throw Object.assign(new Error('Ogiltig zontyp'), { status: 400 });
  const sourceUrl = officialSource(input.sourceUrl);
  const geometry = input.geometry?.type ? input.geometry : input.geometry?.geometry;
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) throw Object.assign(new Error('Ange en GeoJSON-polygon eller multipolygon'), { status: 400 });
  const coordinateTotal = coordinateCount(geometry);
  if (coordinateTotal < 4 || coordinateTotal > 20_000) throw Object.assign(new Error('Polygonen måste ha 4–20 000 koordinater'), { status: 400 });
  const sourceDate = asIsoDate(input.sourceDate);
  const validFrom = asIsoDate(input.validFrom || new Date(now()).toISOString());
  if (!input.validTo) throw Object.assign(new Error('Ange sista giltighetsdag eller nästa granskningsdag'), { status: 400 });
  const validTo = asIsoDate(input.validTo);
  if (validTo && Date.parse(validTo) <= Date.parse(validFrom)) throw Object.assign(new Error('Giltig till måste vara efter giltig från'), { status: 400 });
  if (input.kind === 'security-zone' && Date.parse(validTo) - Date.parse(validFrom) > maxSecurityZoneDurationMs) {
    throw Object.assign(new Error('Ett säkerhetszonsbeslut får gälla i högst 14 dagar. Ange sluttiden från beslutet.'), { status: 400 });
  }
  return { name, kind: input.kind, sourceTitle, sourceExcerpt, sourceUrl, sourceDate, validFrom, validTo, geometry };
}

export function createPublicZoneService({ connectionString = process.env.DATABASE_URL, pool: providedPool, now = Date.now } = {}) {
  const pool = providedPool || (connectionString ? new pg.Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000 }) : null);
  const query = (sql, args = []) => pool.query(sql, args);
  const available = Boolean(pool);
  async function init() {
    if (!pool) return;
    await query(`CREATE TABLE IF NOT EXISTS public_zones (id text PRIMARY KEY, name text NOT NULL, kind text NOT NULL, source_title text NOT NULL, source_excerpt text NOT NULL, source_url text NOT NULL, source_date timestamptz NOT NULL, valid_from timestamptz NOT NULL, valid_to timestamptz, geometry jsonb NOT NULL, status text NOT NULL CHECK (status IN ('draft','review','published','ended')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
    await query(`CREATE TABLE IF NOT EXISTS public_zone_audit (id text PRIMARY KEY, zone_id text NOT NULL, action text NOT NULL, actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), detail jsonb NOT NULL DEFAULT '{}'::jsonb)`);
  }
  async function audit(id, action, detail = {}, actor = 'admin-token') {
    await query('INSERT INTO public_zone_audit(id,zone_id,action,actor,detail) VALUES($1,$2,$3,$4,$5)', [randomUUID(), id, action, actor, JSON.stringify(detail)]);
  }
  async function endExpired() {
    const currentTime = new Date(now()).toISOString();
    const expired = await query("SELECT id FROM public_zones WHERE status='published' AND (valid_to IS NULL OR valid_to <= $1)", [currentTime]);
    for (const row of expired.rows) {
      const result = await query("UPDATE public_zones SET status='ended',updated_at=$1 WHERE id=$2 AND status='published' AND (valid_to IS NULL OR valid_to <= $1)", [currentTime, row.id]);
      if (result.rowCount) await audit(row.id, 'auto-ended-expired', { expiredAt: currentTime }, 'system');
    }
  }
  async function listPublic() {
    await endExpired();
    const currentTime = new Date(now()).toISOString();
    const result = await query(`SELECT id,name,kind,source_title AS "sourceTitle",source_excerpt AS "sourceExcerpt",source_url AS "sourceUrl",source_date AS "sourceDate",valid_from AS "validFrom",valid_to AS "validTo",geometry,updated_at AS "updatedAt" FROM public_zones WHERE status='published' AND valid_from<=$1 AND valid_to>$1 ORDER BY valid_from`, [currentTime]);
    return { type: 'FeatureCollection', features: result.rows.map(row => ({ type: 'Feature', id: row.id, properties: { name: row.name, kind: row.kind, sourceTitle: row.sourceTitle, sourceExcerpt: row.sourceExcerpt, sourceUrl: row.sourceUrl, sourceDate: row.sourceDate, validFrom: row.validFrom, validTo: row.validTo, updatedAt: row.updatedAt }, geometry: row.geometry })), status: 'ok', fetchedAt: new Date(now()).toISOString(), stale: false };
  }
  async function listAdmin() {
    await endExpired();
    const result = await query(`SELECT id,name,kind,source_title AS "sourceTitle",source_excerpt AS "sourceExcerpt",source_url AS "sourceUrl",source_date AS "sourceDate",valid_from AS "validFrom",valid_to AS "validTo",geometry,status,created_at AS "createdAt",updated_at AS "updatedAt" FROM public_zones ORDER BY updated_at DESC LIMIT 200`);
    return result.rows;
  }
  async function createDraft(input) {
    const zone = validatePublicZone(input, { now });
    const id = randomUUID();
    await query(`INSERT INTO public_zones(id,name,kind,source_title,source_excerpt,source_url,source_date,valid_from,valid_to,geometry,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft')`, [id, zone.name, zone.kind, zone.sourceTitle, zone.sourceExcerpt, zone.sourceUrl, zone.sourceDate, zone.validFrom, zone.validTo, JSON.stringify(zone.geometry)]);
    await audit(id, 'draft-created', { name: zone.name, kind: zone.kind, sourceUrl: zone.sourceUrl });
    return { id, status: 'draft' };
  }
  async function transition(id, target) {
    if (!states.has(target)) throw Object.assign(new Error('Ogiltig status'), { status: 400 });
    const result = await query('SELECT status,valid_from,valid_to FROM public_zones WHERE id=$1', [id]);
    const prior = result.rows[0];
    if (!prior) throw Object.assign(new Error('Zonen finns inte'), { status: 404 });
    const allowed = { review: ['draft'], published: ['review'], ended: ['published'] };
    if (!allowed[target]?.includes(prior.status)) throw Object.assign(new Error(`Kan inte ändra ${prior.status} till ${target}`), { status: 409 });
    if (target === 'published' && (!prior.valid_to || Date.parse(prior.valid_from) > now() || Date.parse(prior.valid_to) <= now())) throw Object.assign(new Error('Zonen kan inte publiceras utan en giltig start- och sluttid.'), { status: 409 });
    await query('UPDATE public_zones SET status=$1,updated_at=now() WHERE id=$2', [target, id]);
    await audit(id, target);
    return { id, status: target };
  }
  function authorized(req) {
    const token = process.env.ZONE_ADMIN_TOKEN;
    const supplied = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
    if (!token || !supplied) return false;
    return timingSafeEqual(sha(token), sha(supplied));
  }
  async function readBody(req) {
    if (req.headers['content-type']?.split(';')[0] !== 'application/json' || req.headers['x-tryggpuls-action'] !== '1') throw Object.assign(new Error('JSON och appens begäran krävs'), { status: 415 });
    const origin = req.headers.origin;
    if ((origin && new URL(origin).host !== req.headers.host) || req.headers['sec-fetch-site'] === 'cross-site') throw Object.assign(new Error('Otillåten källa'), { status: 403 });
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 2_000_000) throw Object.assign(new Error('För stort meddelande'), { status: 413 }); }
    try { return JSON.parse(raw); } catch { throw Object.assign(new Error('Ogiltig JSON'), { status: 400 }); }
  }
  async function handle(req, res, url) {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(req.method === 'HEAD' ? undefined : JSON.stringify(body)); };
    try {
      if (!available) return send(503, { error: 'Zonregistret kräver en serverdatabas och är inte konfigurerat i den här miljön', status: 'requires_setup' });
      if (url.pathname === '/api/public-zones' && ['GET', 'HEAD'].includes(req.method)) return send(200, await listPublic());
      if (!url.pathname.startsWith('/api/admin/zones')) return false;
      if (!authorized(req)) return send(401, { error: 'Administratörsnyckel saknas eller är ogiltig' });
      if (req.method === 'GET' && url.pathname === '/api/admin/zones') return send(200, { items: await listAdmin(), status: 'ok', fetchedAt: new Date(now()).toISOString(), stale: false });
      if (req.method !== 'POST') return send(405, { error: 'Metoden stöds inte' });
      const body = await readBody(req);
      if (url.pathname === '/api/admin/zones') return send(201, await createDraft(body));
      const match = /^\/api\/admin\/zones\/([a-z0-9-]+)\/(review|publish|end)$/.exec(url.pathname);
      if (match) return send(200, await transition(match[1], ({ review: 'review', publish: 'published', end: 'ended' })[match[2]]));
      return send(404, { error: 'Administratörsendpointen finns inte' });
    } catch (error) { return send(error.status || 500, { error: error.status ? error.message : 'Zonregistret svarar inte' }); }
  }
  return { available, init, handle, listPublic, listAdmin };
}
