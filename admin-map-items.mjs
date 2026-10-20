import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { authorizeAdmin, adminCapabilities } from './admin-auth.mjs';

const officialHosts = ['polisen.se', 'krisinformation.se', 'smhi.se', 'mcf.se', 'msb.se', 'lansstyrelsen.se', 'trafikverket.se'];
const parseDate = value => {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw Object.assign(new Error('Ange datum och tid i giltigt format'), { status: 400 });
  return new Date(time).toISOString();
};

function validate(input, now) {
  const title = String(input?.title || '').trim();
  const description = String(input?.description || '').trim();
  const sourceTitle = String(input?.sourceTitle || '').trim();
  const sourceExcerpt = String(input?.sourceExcerpt || '').trim();
  if (!['safety-notice', 'service-point'].includes(input?.kind)) throw Object.assign(new Error('Välj en giltig typ'), { status: 400 });
  if (!title || title.length > 120 || !description || description.length > 600 || !sourceTitle || sourceTitle.length > 240 || !sourceExcerpt || sourceExcerpt.length > 1000) throw Object.assign(new Error('Rubrik, beskrivning och källutdrag krävs'), { status: 400 });
  const lat = Number(input.lat), lon = Number(input.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 54 || lat > 71 || lon < 10 || lon > 25) throw Object.assign(new Error('Koordinaterna måste vara inom Sverige'), { status: 400 });
  let sourceUrl;
  try { sourceUrl = new URL(input.sourceUrl); } catch { throw Object.assign(new Error('Ange en giltig HTTPS-källa'), { status: 400 }); }
  if (sourceUrl.protocol !== 'https:' || !officialHosts.some(host => sourceUrl.hostname === host || sourceUrl.hostname.endsWith(`.${host}`))) throw Object.assign(new Error('Källan måste ligga på en godkänd svensk myndighetsdomän'), { status: 400 });
  const validFrom = parseDate(input.validFrom || new Date(now()).toISOString());
  const validTo = parseDate(input.validTo);
  const maxDuration = (input.kind === 'safety-notice' ? 14 : 90) * 24 * 60 * 60 * 1000;
  if (Date.parse(validTo) <= Date.parse(validFrom) || Date.parse(validTo) > now() + maxDuration) throw Object.assign(new Error(input.kind === 'safety-notice' ? 'Notiser kan gälla högst 14 dagar' : 'Servicepunkter måste granskas inom 90 dagar'), { status: 400 });
  return { title, description, kind: input.kind, lat, lon, sourceTitle, sourceExcerpt, sourceUrl: sourceUrl.href, sourceDate: parseDate(input.sourceDate), validFrom, validTo };
}

export function createAdminMapItemsService({ connectionString = process.env.DATABASE_URL, pool: providedPool, now = Date.now } = {}) {
  const pool = providedPool || (connectionString ? new pg.Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000 }) : null);
  const query = (sql, args = []) => pool.query(sql, args);
  async function init() {
    if (!pool) return;
    await query(`CREATE TABLE IF NOT EXISTS admin_map_items (id text PRIMARY KEY, title text NOT NULL, description text NOT NULL, kind text NOT NULL CHECK (kind IN ('safety-notice','service-point')), lat double precision NOT NULL, lon double precision NOT NULL, source_title text NOT NULL, source_excerpt text NOT NULL, source_url text NOT NULL, source_date timestamptz NOT NULL, valid_from timestamptz NOT NULL, valid_to timestamptz NOT NULL, status text NOT NULL CHECK (status IN ('draft','review','published','ended')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
    await query(`CREATE TABLE IF NOT EXISTS admin_map_item_audit (id text PRIMARY KEY, item_id text NOT NULL, action text NOT NULL, actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), detail jsonb NOT NULL DEFAULT '{}'::jsonb)`);
  }
  async function audit(id, action, detail = {}, actor = 'system') {
    await query('INSERT INTO admin_map_item_audit(id,item_id,action,actor,detail) VALUES($1,$2,$3,$4,$5)', [randomUUID(), id, action, actor, JSON.stringify(detail)]);
  }
  async function expire() {
    const stamp = new Date(now()).toISOString();
    const old = await query("UPDATE admin_map_items SET status='ended',updated_at=$1 WHERE status='published' AND valid_to<=$1 RETURNING id", [stamp]);
    for (const row of old.rows) await audit(row.id, 'auto-ended-expired', { expiredAt: stamp }, 'system');
  }
  async function publicItems() {
    await expire();
    const stamp = new Date(now()).toISOString();
    const rows = await query(`SELECT id,title,description,kind,lat,lon,source_title AS "sourceTitle",source_excerpt AS "sourceExcerpt",source_url AS "sourceUrl",source_date AS "sourceDate",valid_from AS "validFrom",valid_to AS "validTo",updated_at AS "updatedAt" FROM admin_map_items WHERE status='published' AND valid_from<=$1 AND valid_to>$1 ORDER BY valid_from`, [stamp]);
    return { type: 'FeatureCollection', features: rows.rows.map(item => ({ type: 'Feature', id: item.id, geometry: { type: 'Point', coordinates: [item.lon, item.lat] }, properties: { name: item.title, title: item.title, description: item.description, kind: item.kind, sourceTitle: item.sourceTitle, sourceExcerpt: item.sourceExcerpt, sourceUrl: item.sourceUrl, sourceDate: item.sourceDate, validFrom: item.validFrom, validTo: item.validTo, reviewedByTryggPuls: true, updatedAt: item.updatedAt } })), status: 'ok', fetchedAt: stamp, stale: false };
  }
  async function adminItems() {
    await expire();
    return (await query(`SELECT id,title,description,kind,lat,lon,source_title AS "sourceTitle",source_excerpt AS "sourceExcerpt",source_url AS "sourceUrl",source_date AS "sourceDate",valid_from AS "validFrom",valid_to AS "validTo",status,created_at AS "createdAt",updated_at AS "updatedAt" FROM admin_map_items ORDER BY updated_at DESC LIMIT 200`)).rows;
  }
  async function createDraft(input, actor) {
    const item = validate(input, now), id = randomUUID();
    await query(`INSERT INTO admin_map_items(id,title,description,kind,lat,lon,source_title,source_excerpt,source_url,source_date,valid_from,valid_to,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft')`, [id,item.title,item.description,item.kind,item.lat,item.lon,item.sourceTitle,item.sourceExcerpt,item.sourceUrl,item.sourceDate,item.validFrom,item.validTo]);
    await audit(id, 'draft-created', { kind: item.kind, sourceUrl: item.sourceUrl }, actor);
    return { id, status: 'draft' };
  }
  async function transition(id, target, actor) {
    const prior = (await query('SELECT status,valid_from,valid_to FROM admin_map_items WHERE id=$1', [id])).rows[0];
    if (!prior) throw Object.assign(new Error('Kartposten finns inte'), { status: 404 });
    const allowed = { review: 'draft', published: 'review', ended: 'published' };
    if (prior.status !== allowed[target]) throw Object.assign(new Error('Ogiltig statusövergång'), { status: 409 });
    if (target === 'published' && (Date.parse(prior.valid_from) > now() || Date.parse(prior.valid_to) <= now())) throw Object.assign(new Error('Kartposten saknar en aktiv giltighetsperiod'), { status: 409 });
    await query('UPDATE admin_map_items SET status=$1,updated_at=now() WHERE id=$2', [target, id]);
    await audit(id, target, {}, actor);
    return { id, status: target };
  }
  async function readBody(req) {
    if (req.headers['content-type']?.split(';')[0] !== 'application/json' || req.headers['x-tryggpuls-action'] !== '1') throw Object.assign(new Error('JSON och appens begäran krävs'), { status: 415 });
    const origin = req.headers.origin;
    if ((origin && new URL(origin).host !== req.headers.host) || req.headers['sec-fetch-site'] === 'cross-site') throw Object.assign(new Error('Otillåten källa'), { status: 403 });
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 32_000) throw Object.assign(new Error('För stort meddelande'), { status: 413 }); }
    try { return JSON.parse(raw); } catch { throw Object.assign(new Error('Ogiltig JSON'), { status: 400 }); }
  }
  async function handle(req, res, url) {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(req.method === 'HEAD' ? undefined : JSON.stringify(body)); };
    try {
      if (!pool) return send(503, { error: 'Kartpostregistret kräver en konfigurerad databas', status: 'requires_setup' });
      if (url.pathname === '/api/public-map-items' && ['GET','HEAD'].includes(req.method)) return send(200, await publicItems());
      if (!url.pathname.startsWith('/api/admin/map-items')) return false;
      const actor = authorizeAdmin(req);
      if (!actor) return send(401, { error: 'Administratörsnyckel saknas eller är ogiltig' });
      if (req.method === 'GET' && url.pathname === '/api/admin/map-items') return send(200, { items: await adminItems(), ...adminCapabilities(actor) });
      if (req.method !== 'POST') return send(405, { error: 'Metoden stöds inte' });
      const body = await readBody(req);
      if (url.pathname === '/api/admin/map-items') {
        if (!adminCapabilities(actor).canCreate) return send(403, { error: 'Din roll får inte skapa kartutkast' });
        return send(201, await createDraft(body, actor.id));
      }
      const match = /^\/api\/admin\/map-items\/([a-z0-9-]+)\/(review|publish|end)$/.exec(url.pathname);
      if (match) {
        if (!adminCapabilities(actor).canReview) return send(403, { error: 'Publicering kräver en granskarroll' });
        return send(200, await transition(match[1], match[2], actor.id));
      }
      return send(404, { error: 'Administratörsendpointen finns inte' });
    } catch (error) { return send(error.status || 500, { error: error.status ? error.message : 'Kartpostregistret svarar inte' }); }
  }
  return { available: Boolean(pool), init, handle, publicItems, adminItems };
}
