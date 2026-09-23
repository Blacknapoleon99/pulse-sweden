import { randomBytes, randomUUID, createHash, scrypt as callbackScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';
import webpush from 'web-push';

const scrypt = promisify(callbackScrypt);
const hash = value => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const minutes = n => new Date(Date.now() + n * 60_000);
const cookie = (value, secure) => `tp_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${value ? 2592000 : 0}${secure ? '; Secure' : ''}`;
const cleanName = value => typeof value === 'string' ? value.trim().slice(0, 80) : '';
const validPoint = p => Number.isFinite(p?.lat) && Number.isFinite(p?.lon) && p.lat >= 55 && p.lat <= 70 && p.lon >= 10 && p.lon <= 25;
const distance = (a, b) => {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

export function createFamilyService({ connectionString = process.env.DATABASE_URL, vapidPublic = process.env.VAPID_PUBLIC_KEY, vapidPrivate = process.env.VAPID_PRIVATE_KEY, pool: providedPool, push = webpush } = {}) {
  const pool = providedPool || (connectionString ? new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000 }) : null);
  const available = Boolean(pool);
  const pushEnabled = Boolean(vapidPublic && vapidPrivate);
  if (pushEnabled) push.setVapidDetails('mailto:contact@tryggpuls.se', vapidPublic, vapidPrivate);
  const query = (sql, args = []) => pool.query(sql, args);
  async function init() {
    if (!pool) return;
    await query(`CREATE TABLE IF NOT EXISTS family_users (id text PRIMARY KEY, email text UNIQUE NOT NULL, display_name text NOT NULL, salt text NOT NULL, password_hash text NOT NULL, family_id text, sharing boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now())`);
    await query(`CREATE TABLE IF NOT EXISTS family_groups (id text PRIMARY KEY, name text NOT NULL, owner_id text NOT NULL)`);
    await query(`CREATE TABLE IF NOT EXISTS family_sessions (token_hash text PRIMARY KEY, user_id text NOT NULL, expires_at timestamptz NOT NULL)`);
    await query(`CREATE TABLE IF NOT EXISTS family_invites (token_hash text PRIMARY KEY, family_id text NOT NULL, expires_at timestamptz NOT NULL, used boolean NOT NULL DEFAULT false)`);
    await query(`CREATE TABLE IF NOT EXISTS family_zones (id text PRIMARY KEY, family_id text NOT NULL, name text NOT NULL, kind text NOT NULL, lat double precision NOT NULL, lon double precision NOT NULL, radius integer NOT NULL)`);
    await query(`CREATE TABLE IF NOT EXISTS family_positions (user_id text PRIMARY KEY, lat double precision NOT NULL, lon double precision NOT NULL, accuracy double precision NOT NULL, updated_at timestamptz NOT NULL)`);
    await query(`CREATE TABLE IF NOT EXISTS family_zone_state (user_id text NOT NULL, zone_id text NOT NULL, inside boolean NOT NULL, PRIMARY KEY(user_id,zone_id))`);
    await query(`CREATE TABLE IF NOT EXISTS family_alerts (id text PRIMARY KEY, family_id text NOT NULL, subject_id text NOT NULL, alert_key text NOT NULL UNIQUE, kind text NOT NULL, title text NOT NULL, detail text NOT NULL, source_url text, created_at timestamptz NOT NULL DEFAULT now())`);
    await query(`CREATE TABLE IF NOT EXISTS family_push (endpoint text PRIMARY KEY, user_id text NOT NULL, subscription jsonb NOT NULL)`);
  }
  async function session(req) {
    if (!pool) return null;
    const value = /(?:^|;\s*)tp_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
    if (!value || value.length > 100) return null;
    const row = (await query(`SELECT u.id,u.email,u.display_name,u.family_id,u.sharing FROM family_sessions s JOIN family_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`, [hash(value)])).rows[0];
    return row || null;
  }
  async function signIn(user) {
    const value = token();
    await query(`INSERT INTO family_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)`, [hash(value), user.id, minutes(43200)]);
    return value;
  }
  async function register(body) {
    const email = String(body.email || '').trim().toLowerCase(), name = cleanName(body.name), password = body.password;
    if (!/^[^\s@]{1,64}@[^\s@]+\.[^\s@]+$/.test(email) || !name || typeof password !== 'string' || password.length < 12 || password.length > 200) throw Object.assign(new Error('Ange namn, giltig e-post och minst 12 teckens lösenord'), { status: 400 });
    const salt = randomBytes(16).toString('hex');
    const digest = (await scrypt(password, salt, 64)).toString('hex');
    const id = randomUUID();
    try { await query(`INSERT INTO family_users(id,email,display_name,salt,password_hash) VALUES($1,$2,$3,$4,$5)`, [id,email,name,salt,digest]); }
    catch (err) { if (err.code === '23505') throw Object.assign(new Error('E-postadressen används redan'), { status: 409 }); throw err; }
    return { user: { id, email, display_name: name, family_id: null, sharing: false }, token: await signIn({ id }) };
  }
  async function login(body) {
    const email = String(body.email || '').trim().toLowerCase();
    const user = (await query(`SELECT * FROM family_users WHERE email=$1`, [email])).rows[0];
    const digest = await scrypt(String(body.password || ''), user?.salt || '00000000000000000000000000000000', 64);
    if (!user || !timingSafeEqual(digest, Buffer.from(user.password_hash, 'hex'))) throw Object.assign(new Error('Fel e-post eller lösenord'), { status: 401 });
    return { user: { id: user.id, email: user.email, display_name: user.display_name, family_id: user.family_id, sharing: user.sharing }, token: await signIn(user) };
  }
  async function logout(req) {
    const value = /(?:^|;\s*)tp_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
    if (value) await query(`DELETE FROM family_sessions WHERE token_hash=$1`, [hash(value)]);
  }
  async function overview(user) {
    if (!user.family_id) return { user, family: null, members: [], zones: [], alerts: [] };
    const family = (await query('SELECT id,name,owner_id FROM family_groups WHERE id=$1',[user.family_id])).rows[0] || null;
    if (!family) return { user, family: null, members: [], zones: [], alerts: [] };
    const members = (await query(`SELECT u.id,u.display_name,u.sharing,p.updated_at,p.accuracy FROM family_users u LEFT JOIN family_positions p ON p.user_id=u.id AND p.updated_at>now()-interval '15 minutes' WHERE u.family_id=$1 ORDER BY u.display_name`,[family.id])).rows;
    const zones = (await query('SELECT id,name,kind,lat,lon,radius FROM family_zones WHERE family_id=$1 ORDER BY name',[family.id])).rows;
    const alerts = (await query(`SELECT id,subject_id,kind,title,detail,source_url,created_at FROM family_alerts WHERE family_id=$1 AND created_at>now()-interval '7 days' ORDER BY created_at DESC LIMIT 50`,[family.id])).rows;
    return { user, family, members, zones, alerts };
  }
  async function createGroup(user, name) {
    if (user.family_id) throw Object.assign(new Error('Du ingår redan i en familj'), { status: 409 });
    const title = cleanName(name);
    if (title.length < 2) throw Object.assign(new Error('Ange ett familjenamn'), { status: 400 });
    const id = randomUUID();
    await query('INSERT INTO family_groups(id,name,owner_id) VALUES($1,$2,$3)',[id,title,user.id]);
    await query('UPDATE family_users SET family_id=$1 WHERE id=$2 AND family_id IS NULL',[id,user.id]);
    return id;
  }
  async function invite(user) {
    const family = await requireOwner(user);
    const value = token();
    await query('INSERT INTO family_invites(token_hash,family_id,expires_at) VALUES($1,$2,$3)',[hash(value),family.id,minutes(1440)]);
    return value;
  }
  async function join(user, value) {
    if (user.family_id) throw Object.assign(new Error('Du ingår redan i en familj'), { status: 409 });
    if (typeof value !== 'string' || value.length < 20 || value.length > 100) throw Object.assign(new Error('Ogiltig inbjudan'), { status: 400 });
    const inviteRow = (await query('UPDATE family_invites SET used=true WHERE token_hash=$1 AND expires_at>now() AND used=false RETURNING family_id',[hash(value)])).rows[0];
    if (!inviteRow) throw Object.assign(new Error('Inbjudan har gått ut eller redan använts'), { status: 400 });
    await query('UPDATE family_users SET family_id=$1 WHERE id=$2 AND family_id IS NULL',[inviteRow.family_id,user.id]);
  }
  async function requireOwner(user) {
    const family = user.family_id && (await query('SELECT id,name,owner_id FROM family_groups WHERE id=$1',[user.family_id])).rows[0];
    if (!family || family.owner_id !== user.id) throw Object.assign(new Error('Endast familjens skapare kan ändra zoner och bjuda in'), { status: 403 });
    return family;
  }
  async function addZone(user, body) {
    const family = await requireOwner(user), name = cleanName(body.name);
    if (!name || !['safe','watch'].includes(body.kind) || !validPoint(body) || !Number.isInteger(body.radius) || body.radius < 100 || body.radius > 2000) throw Object.assign(new Error('Ange namn, sök en plats och välj radie 100–2000 m'), { status: 400 });
    const id = randomUUID();
    await query('INSERT INTO family_zones(id,family_id,name,kind,lat,lon,radius) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,family.id,name,body.kind,body.lat,body.lon,body.radius]);
    return id;
  }
  async function removeZone(user, id) {
    const family = await requireOwner(user);
    const removed = (await query('DELETE FROM family_zones WHERE id=$1 AND family_id=$2 RETURNING id',[id,family.id])).rows[0];
    if (removed) await query('DELETE FROM family_zone_state WHERE zone_id=$1',[id]);
  }
  async function leave(user) {
    if (!user.family_id) return;
    const family = (await query('SELECT owner_id FROM family_groups WHERE id=$1',[user.family_id])).rows[0];
    if (family?.owner_id === user.id) throw Object.assign(new Error('Skaparen kan inte lämna familjen; övriga medlemmar behöver först lämna'), { status: 409 });
    await stop(user);
    await query('UPDATE family_users SET family_id=NULL WHERE id=$1',[user.id]);
  }
  async function stop(user) {
    await query('UPDATE family_users SET sharing=false WHERE id=$1',[user.id]);
    await query('DELETE FROM family_positions WHERE user_id=$1',[user.id]);
    await query('DELETE FROM family_zone_state WHERE user_id=$1',[user.id]);
  }
  async function deleteAccount(user) {
    if (user.family_id) {
      const family = (await query('SELECT owner_id FROM family_groups WHERE id=$1',[user.family_id])).rows[0];
      if (family?.owner_id === user.id) {
        const members = (await query('SELECT id FROM family_users WHERE family_id=$1',[user.family_id])).rows;
        if (members.length > 1) throw Object.assign(new Error('Be familjens andra medlemmar lämna innan du raderar skaparkontot'), { status: 409 });
        await query('DELETE FROM family_invites WHERE family_id=$1',[user.family_id]);
        await query('DELETE FROM family_zone_state WHERE zone_id IN (SELECT id FROM family_zones WHERE family_id=$1)',[user.family_id]);
        await query('DELETE FROM family_zones WHERE family_id=$1',[user.family_id]);
        await query('DELETE FROM family_alerts WHERE family_id=$1',[user.family_id]);
        await query('DELETE FROM family_groups WHERE id=$1',[user.family_id]);
      }
    }
    await query('DELETE FROM family_alerts WHERE subject_id=$1',[user.id]);
    await query('DELETE FROM family_push WHERE user_id=$1',[user.id]);
    await query('DELETE FROM family_positions WHERE user_id=$1',[user.id]);
    await query('DELETE FROM family_zone_state WHERE user_id=$1',[user.id]);
    await query('DELETE FROM family_sessions WHERE user_id=$1',[user.id]);
    await query('DELETE FROM family_users WHERE id=$1',[user.id]);
  }
  async function sendToFamily(user, title, detail) {
    const recipients = (await query('SELECT u.id,s.endpoint,s.subscription FROM family_users u JOIN family_push s ON s.user_id=u.id WHERE u.family_id=$1',[user.family_id])).rows;
    await Promise.all(recipients.map(async recipient => {
      try { await push.sendNotification(recipient.subscription, JSON.stringify({ title, body: detail, url: '/#familj' }), { TTL: 900 }); }
      catch (err) { if ([404,410].includes(err.statusCode)) await query('DELETE FROM family_push WHERE endpoint=$1',[recipient.endpoint]); }
    }));
  }
  async function alert(user, key, kind, title, detail, sourceUrl = null) {
    const saved = (await query(`INSERT INTO family_alerts(id,family_id,subject_id,alert_key,kind,title,detail,source_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(alert_key) DO NOTHING RETURNING id`,[randomUUID(),user.family_id,user.id,key,kind,title,detail,sourceUrl])).rows[0];
    if (saved && pushEnabled) await sendToFamily(user,title,detail);
    return Boolean(saved);
  }
  async function checkPosition(user, point, events = []) {
    const zones = (await query('SELECT id,name,kind,lat,lon,radius FROM family_zones WHERE family_id=$1',[user.family_id])).rows;
    let count = 0;
    for (const zone of zones) {
      const prior = (await query('SELECT inside FROM family_zone_state WHERE user_id=$1 AND zone_id=$2',[user.id,zone.id])).rows[0];
      const metres = distance(point,zone);
      const margin = Math.max(50, point.accuracy || 0);
      const inside = prior ? (prior.inside ? metres <= zone.radius + margin : metres < zone.radius - margin) : metres <= zone.radius;
      await query('INSERT INTO family_zone_state(user_id,zone_id,inside) VALUES($1,$2,$3) ON CONFLICT(user_id,zone_id) DO UPDATE SET inside=EXCLUDED.inside',[user.id,zone.id,inside]);
      if (prior && prior.inside !== inside && ((zone.kind === 'safe' && !inside) || (zone.kind === 'watch' && inside))) {
        count += Number(await alert(user,`${user.id}:zone:${zone.id}:${inside}:${Date.now()}`, 'zone', `${user.display_name}: ${zone.kind === 'safe' ? 'lämnade' : 'gick in i'} ${zone.name}`, 'GPS-positionen är ungefärlig. Kontrollera direkt med familjemedlemmen.'));
      }
    }
    count += await checkReports(user, point, events);
    return count;
  }
  async function checkReports(user, point, events) {
    let count = 0;
    for (const event of events) {
      const gps = event.location?.gps;
      if (!Array.isArray(gps) || !Number.isFinite(event.ts) || event.ts < Date.now() - 24 * 3600000) continue;
      if (distance(point,{lat:gps[0],lon:gps[1]}) > 5000) continue;
      count += Number(await alert(user,`${user.id}:report:${event.id}`, 'report', `Ny polisnotis nära ${user.display_name}`, `${event.type || 'Händelse'} i ${event.location.name || 'området'}. Platsen är ungefärlig och rapporten kan vara fördröjd.`, event.url));
    }
    return count;
  }
  async function reportLocation(user, point, events = []) {
    if (!user.family_id) throw Object.assign(new Error('Skapa eller gå med i en familj först'), { status: 409 });
    if (!validPoint(point) || !Number.isFinite(point.accuracy) || point.accuracy < 0 || point.accuracy > 5000) throw Object.assign(new Error('Ogiltig GPS-position'), { status: 400 });
    await query('UPDATE family_users SET sharing=true WHERE id=$1',[user.id]);
    await query('INSERT INTO family_positions(user_id,lat,lon,accuracy,updated_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(user_id) DO UPDATE SET lat=EXCLUDED.lat,lon=EXCLUDED.lon,accuracy=EXCLUDED.accuracy,updated_at=now()',[user.id,point.lat,point.lon,point.accuracy]);
    if (point.accuracy > 200) return { alerts: 0, accuracyWarning: true };
    return { alerts: await checkPosition(user,point,events), accuracyWarning: false };
  }
  async function sweep(events) {
    if (!pool) return;
    await query('DELETE FROM family_sessions WHERE expires_at<now()');
    await query('DELETE FROM family_invites WHERE expires_at<now() OR used=true');
    await query(`DELETE FROM family_positions WHERE updated_at<now()-interval '15 minutes'`);
    await query(`DELETE FROM family_alerts WHERE created_at<now()-interval '7 days'`);
    const rows = (await query(`SELECT u.id,u.display_name,u.family_id,u.sharing,p.lat,p.lon,p.accuracy FROM family_users u JOIN family_positions p ON p.user_id=u.id WHERE u.sharing=true AND u.family_id IS NOT NULL AND p.accuracy<=200 AND p.updated_at>now()-interval '15 minutes'`)).rows;
    for (const row of rows) await checkReports(row,{lat:row.lat,lon:row.lon},events);
  }
  async function subscribe(user, subscription) {
    if (!pushEnabled) throw Object.assign(new Error('Push är inte konfigurerat'), { status: 503 });
    let endpoint;
    try { endpoint = new URL(subscription?.endpoint); } catch { /* invalid endpoint */ }
    const allowedHosts = ['fcm.googleapis.com','android.googleapis.com','updates.push.services.mozilla.com','push.services.mozilla.com'];
    const trustedHost = endpoint && (allowedHosts.includes(endpoint.hostname) || endpoint.hostname === 'push.apple.com' || endpoint.hostname.endsWith('.push.apple.com'));
    if (endpoint?.protocol !== 'https:' || !trustedHost || endpoint.port || subscription.endpoint.length > 2048 || typeof subscription.keys?.p256dh !== 'string' || typeof subscription.keys?.auth !== 'string' || subscription.keys.p256dh.length > 256 || subscription.keys.auth.length > 256) throw Object.assign(new Error('Ogiltig push-prenumeration'), { status: 400 });
    await query('INSERT INTO family_push(endpoint,user_id,subscription) VALUES($1,$2,$3) ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,subscription=EXCLUDED.subscription',[subscription.endpoint,user.id,subscription]);
  }
  async function unsubscribe(user, endpoint) { await query('DELETE FROM family_push WHERE user_id=$1 AND endpoint=$2',[user.id,endpoint]); }
  return { available, pushEnabled, vapidPublic: pushEnabled ? vapidPublic : null, init, session, register, login, logout, overview, createGroup, invite, join, addZone, removeZone, leave, stop, deleteAccount, reportLocation, sweep, subscribe, unsubscribe, cookie };
}
