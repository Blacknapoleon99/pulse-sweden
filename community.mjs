import { createHash, randomBytes, randomUUID } from 'node:crypto';
import proj4 from 'proj4';
import { authorizeAdmin } from './admin-auth.mjs';
import { fail, readBytes, readJson, requireAction, sendJson } from './http-api.mjs';
import { createMediaStorage, PHOTO_LIMIT, sanitizePhoto } from './community-media.mjs';
import { communityPublishingAllowed } from './release-config.mjs';
export const COMMUNITY_LABEL = 'Obekräftad användarrapport';
export const RULES_VERSION = '2026-09-29';
const day = 86_400_000;
const CATEGORIES = ['theft','violence','vandalism','suspicious','disturbance','traffic','hazard','other'];
const gridProjection = '+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs';
const digest = value => createHash('sha256').update(value).digest('hex');
const idPattern = /^[a-f0-9-]{36}$/i;
const requestPattern = /^[A-Za-z0-9_-]{20,80}$/;
export function approximatePoint(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 54 || lat > 71 || lon < 10 || lon > 25) throw fail(400, 'Välj en plats i Sverige');
  const [x, y] = proj4('WGS84', gridProjection, [lon, lat]);
  const [lng, latitude] = proj4(gridProjection, 'WGS84', [Math.floor(x / 100) * 100 + 50, Math.floor(y / 100) * 100 + 50]);
  return { lat: Number(latitude.toFixed(7)), lon: Number(lng.toFixed(7)), precisionMeters: 100 };
}
export function cleanCommunityText(value, max, min = 3) {
  if (typeof value !== 'string') throw fail(400, 'Skriv en kort saklig observation');
  const text = value.normalize('NFKC').trim();
  if (text.length < min || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw fail(400, `Texten måste vara ${min}–${max} tecken`);
  // Plain text only. Privacy/abuse filters run before publication; staff also review flags.
  const blocked = [/<[^>]+>/, /https?:\/\/|www\./i, /\b\d{6,8}[-+]\d{4}\b/, /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i, /\b(?:döda alla|jag ska döda|heil hitler|sieg heil|nigger|negerjävel|hora|bögjävel)\b/i];
  let additional = [];
  try { additional = JSON.parse(process.env.COMMUNITY_BLOCKED_TERMS_JSON || '[]'); } catch { throw fail(503, 'Textgranskningen är inte tillgänglig'); }
  if (blocked.some(pattern => pattern.test(text)) || (Array.isArray(additional) && additional.some(term => typeof term === 'string' && term.trim() && text.toLocaleLowerCase('sv-SE').includes(term.toLocaleLowerCase('sv-SE'))))) throw fail(422, 'Ta bort personuppgifter, länkar eller kränkande innehåll. Beskriv bara vad du själv har observerat.');
  return text;
}
export function createCommunityService({ pool, accounts, storage = createMediaStorage(), notifications, enabled = communityPublishingAllowed, now = Date.now } = {}) {
  const query = (sql, values = []) => pool.query(sql, values);
  const stamp = () => new Date(now()).toISOString();
  async function profile(user, client = pool, create = true) {
    if (create) {
      const key = randomUUID(), alias = `Användare ${randomBytes(4).toString('hex').toUpperCase()}`;
      await client.query('INSERT INTO community_profiles(user_id,author_key,alias) VALUES($1,$2,$3) ON CONFLICT(user_id) DO NOTHING', [user.id, key, alias]);
    }
    const row = (await client.query('SELECT * FROM community_profiles WHERE user_id=$1', [user.id])).rows[0];
    const account = (await client.query('SELECT email_verified_at FROM family_users WHERE id=$1', [user.id])).rows[0];
    const bankid = (await client.query('SELECT user_id FROM bankid_accounts WHERE user_id=$1', [user.id])).rows.length > 0;
    return row ? { ...row, identityConfirmed: Boolean(account?.email_verified_at || bankid) } : null;
  }
  async function eligibility(user, client = pool) {
    if (!enabled()) throw fail(503, 'Publicering av användarrapporter är inte aktiverad', 'COMMUNITY_DISABLED');
    const value = await profile(user, client);
    if (value.suspended) throw fail(403, 'Ditt konto är avstängt från offentliga rapporter', 'CONTRIBUTOR_SUSPENDED');
    if (!value.identityConfirmed) throw fail(403, 'Bekräfta din e-post eller logga in med BankID först', 'IDENTITY_REQUIRED');
    if (!value.age_attested_at || value.rules_version !== RULES_VERSION) throw fail(403, 'Bekräfta att du är minst 16 år och godkänn användarreglerna', 'ELIGIBILITY_REQUIRED');
    return value;
  }
  async function acceptRules(user, body) {
    if (body?.atLeast16 !== true || body.rulesVersion !== RULES_VERSION) throw fail(400, 'Du måste vara minst 16 år och godkänna reglerna');
    await profile(user);
    await query('UPDATE community_profiles SET age_attested_at=$2,rules_version=$3,accepted_at=$2 WHERE user_id=$1', [user.id, stamp(), RULES_VERSION]);
    return me(user);
  }
  async function me(user) {
    const p = await profile(user);
    return { authorKey: p.author_key, alias: p.alias, identityConfirmed: p.identityConfirmed, ageEligible: Boolean(p.age_attested_at), rulesAccepted: p.rules_version === RULES_VERSION, suspended: p.suspended, canContribute: Boolean(enabled() && p.identityConfirmed && p.age_attested_at && p.rules_version === RULES_VERSION && !p.suspended) };
  }
  async function transact(user, fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await profile(user, client);
      await client.query('SELECT user_id FROM community_profiles WHERE user_id=$1 FOR UPDATE', [user.id]);
      const p = await eligibility(user, client);
      const result = await fn(client, p);
      await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async function limit(client, user, kind, max, period) {
    const count = (await client.query('SELECT id FROM community_activity WHERE user_id=$1 AND kind=$2 AND created_at>$3', [user.id, kind, new Date(now() - period).toISOString()])).rows.length;
    if (count >= max) throw fail(429, 'För många inlägg. Vänta innan du försöker igen.');
  }
  const activity = (client, user, kind) => client.query('INSERT INTO community_activity(id,user_id,kind,created_at) VALUES($1,$2,$3,$4)', [randomUUID(), user.id, kind, stamp()]);
  async function blocked(user, author, client = pool) {
    return user && (await client.query('SELECT user_id FROM community_blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)', [user.id, author])).rows.length > 0;
  }
  async function blockedIds(user) {
    if (!user) return [];
    return (await query('SELECT user_id,blocked_id FROM community_blocks WHERE user_id=$1 OR blocked_id=$1', [user.id])).rows.map(row => row.user_id === user.id ? row.blocked_id : row.user_id);
  }
  function publicReport(row, user) {
    const status = row.status === 'active' && new Date(row.expires_at).getTime() <= now() ? 'expired' : row.status;
    const owner = row.author_id === user?.id;
    return { id: row.id, origin: 'community', verification: 'unverified', label: COMMUNITY_LABEL, title: row.title, body: row.body, category: row.category,
      location: { lat: row.lat, lon: row.lon, precisionMeters: 100 }, author: { key: row.author_key, alias: row.alias },
      observedAt: row.observed_at, createdAt: row.created_at, expiresAt: row.expires_at, status, isOwner: owner,
      photo: { status: row.photo_status === 'approved' || owner ? row.photo_status : 'none', ...(row.photo_status === 'approved' && status !== 'removed' ? { url: `/api/community-reports/${row.id}/photo` } : {}), ...(owner && row.photo_reason ? { reason: row.photo_reason } : {}) } };
  }
  async function rawReport(id, client = pool) {
    if (!idPattern.test(id)) throw fail(404, 'Rapporten finns inte');
    return (await client.query('SELECT r.*,p.alias,p.author_key,p.suspended FROM community_reports r JOIN community_profiles p ON p.user_id=r.author_id WHERE r.id=$1', [id])).rows[0];
  }
  async function accessibleReport(id, user, client = pool) {
    const row = await rawReport(id, client);
    const owner = row?.author_id === user?.id;
    if (!row || (!owner && (row.suspended || row.status === 'removed' || new Date(row.expires_at).getTime() <= now() || await blocked(user, row.author_id, client)))) throw fail(404, 'Rapporten är avslutad eller inte tillgänglig');
    return row;
  }
  async function list(user, params) {
    const mine = params.get('mine') === '1';
    if (mine && !user) throw fail(401, 'Logga in för att se din historik');
    const count = Math.min(100, Math.max(1, Number(params.get('limit') || 30)));
    if (!Number.isInteger(count)) throw fail(400, 'Ogiltig sidstorlek');
    const values = [], conditions = [];
    const add = value => { values.push(value); return `$${values.length}`; };
    if (mine) conditions.push(`r.author_id=${add(user.id)}`, `r.created_at>${add(new Date(now() - 30 * day).toISOString())}`);
    else conditions.push("r.status='active'", 'p.suspended=false', `r.expires_at>${add(stamp())}`);
    const excluded = await blockedIds(user);
    if (excluded.length) conditions.push(`r.author_id NOT IN (${excluded.map(add).join(',')})`);
    if (params.get('category')) {
      if (!CATEGORIES.includes(params.get('category'))) throw fail(400, 'Ogiltig kategori');
      conditions.push(`r.category=${add(params.get('category'))}`);
    }
    if (params.get('bbox')) {
      const box = params.get('bbox').split(',').map(Number);
      if (box.length !== 4 || box.some(n => !Number.isFinite(n)) || box[0] >= box[2] || box[1] >= box[3] || box[0] < -180 || box[2] > 180 || box[1] < -90 || box[3] > 90) throw fail(400, 'Ogiltigt kartutsnitt');
      conditions.push(`r.lon>=${add(box[0])}`, `r.lat>=${add(box[1])}`, `r.lon<=${add(box[2])}`, `r.lat<=${add(box[3])}`);
    }
    if (params.get('cursor')) {
      let cursor; try { cursor = JSON.parse(Buffer.from(params.get('cursor'), 'base64url').toString('utf8')); } catch { throw fail(400, 'Ogiltig sidmarkör'); }
      if (!idPattern.test(cursor?.id) || !Number.isFinite(Date.parse(cursor?.time))) throw fail(400, 'Ogiltig sidmarkör');
      const time = add(new Date(cursor.time).toISOString()), id = add(cursor.id);
      conditions.push(`(r.created_at<${time} OR (r.created_at=${time} AND r.id<${id}))`);
    }
    const rows = (await query(`SELECT r.*,p.alias,p.author_key FROM community_reports r JOIN community_profiles p ON p.user_id=r.author_id WHERE ${conditions.join(' AND ')} ORDER BY r.created_at DESC,r.id DESC LIMIT ${add(count + 1)}`, values)).rows;
    const page = rows.slice(0, count), last = page.at(-1);
    return { items: page.map(row => publicReport(row, user)), nextCursor: rows.length > count ? Buffer.from(JSON.stringify({ time: last.created_at, id: last.id })).toString('base64url') : null, fetchedAt: stamp(), stale: false };
  }
  async function createReport(user, input) {
    if (!requestPattern.test(input?.requestId)) throw fail(400, 'Ogiltigt begäran-ID');
    const title = cleanCommunityText(input.title, 120), body = cleanCommunityText(input.body, 600);
    if (!CATEGORIES.includes(input.category)) throw fail(400, 'Välj en kategori');
    const location = approximatePoint(input.lat, input.lon), observed = Date.parse(input.observedAt);
    if (!Number.isFinite(observed) || observed > now() + 60_000 || observed <= now() - day) throw fail(400, 'Observationen måste vara från det senaste dygnet');
    const fingerprint = digest(JSON.stringify([title, body, input.category, location, observed]));
    const id = await transact(user, async client => {
      const previous = (await client.query('SELECT id,fingerprint FROM community_reports WHERE author_id=$1 AND request_id=$2', [user.id, input.requestId])).rows[0];
      if (previous) { if (previous.fingerprint !== fingerprint) throw fail(409, 'Begäran-ID används redan för ett annat inlägg'); return previous.id; }
      await limit(client, user, 'report', 3, 3_600_000); await limit(client, user, 'report', 10, day);
      const id = randomUUID();
      await client.query('INSERT INTO community_reports(id,author_id,request_id,fingerprint,category,title,body,lat,lon,observed_at,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [id,user.id,input.requestId,fingerprint,input.category,title,body,location.lat,location.lon,new Date(observed).toISOString(),stamp(),new Date(observed + day).toISOString()]);
      await activity(client, user, 'report'); return id;
    });
    return publicReport(await rawReport(id), user);
  }
  async function endReport(user, id, target) {
    const row = await rawReport(id);
    if (!row || row.author_id !== user.id) throw fail(404, 'Rapporten finns inte');
    await query('UPDATE community_reports SET status=$2 WHERE id=$1', [id, target]);
    if (target === 'removed') await removePhoto(id);
    return { ok: true };
  }
  async function comments(user, reportId, params = new URLSearchParams()) {
    const report = await accessibleReport(reportId, user);
    if (new Date(report.expires_at).getTime() <= now() || report.status === 'removed') return { items: [], closed: true, fetchedAt: stamp(), nextCursor: null };
    const count = Math.min(100, Math.max(1, Number(params.get('limit') || 30)));
    if (!Number.isInteger(count)) throw fail(400, 'Ogiltig sidstorlek');
    const values = [reportId], clauses = ['c.report_id=$1'];
    const ids = await blockedIds(user);
    if (ids.length) clauses.push(`c.author_id NOT IN (${ids.map(value => { values.push(value); return `$${values.length}`; }).join(',')})`);
    if (params.get('cursor')) {
      let cursor; try { cursor = JSON.parse(Buffer.from(params.get('cursor'), 'base64url').toString()); } catch { throw fail(400, 'Ogiltig sidmarkör'); }
      if (!idPattern.test(cursor?.id) || !Number.isFinite(Date.parse(cursor?.time))) throw fail(400, 'Ogiltig sidmarkör');
      values.push(new Date(cursor.time).toISOString(), cursor.id); const n = values.length;
      clauses.push(`(c.created_at>$${n-1} OR (c.created_at=$${n-1} AND c.id>$${n}))`);
    }
    values.push(count + 1);
    const rows = (await query(`SELECT c.*,p.alias,p.author_key,p.suspended FROM community_comments c JOIN community_profiles p ON p.user_id=c.author_id WHERE ${clauses.join(' AND ')} ORDER BY c.created_at,c.id LIMIT $${values.length}`, values)).rows;
    const page = rows.slice(0,count), last = page.at(-1);
    return { items: page.map(row => ({ id: row.id, reportId: row.report_id, parentId: row.parent_id, origin: 'community', verification: 'unverified', body: row.removed || row.suspended ? '' : row.body, removed: row.removed || row.suspended, author: { key: row.author_key, alias: row.alias }, createdAt: row.created_at, isOwner: row.author_id === user?.id })), closed: report.status !== 'active', fetchedAt: stamp(), nextCursor: rows.length > count ? Buffer.from(JSON.stringify({ time: last.created_at, id: last.id })).toString('base64url') : null };
  }
  async function addComment(user, id, input) {
    if (!requestPattern.test(input?.requestId)) throw fail(400, 'Ogiltigt begäran-ID');
    const body = cleanCommunityText(input.body, 600), parentId = input.parentId || null;
    if (parentId && !idPattern.test(parentId)) throw fail(400, 'Ogiltigt svar');
    const fingerprint = digest(JSON.stringify([id, body, parentId]));
    const commentId = await transact(user, async client => {
      await client.query('SELECT id FROM community_reports WHERE id=$1 FOR UPDATE', [id]);
      const report = await accessibleReport(id, user, client);
      if (report.status !== 'active' || new Date(report.expires_at).getTime() <= now()) throw fail(409, 'Diskussionen är avslutad');
      const previous = (await client.query('SELECT id,fingerprint FROM community_comments WHERE author_id=$1 AND request_id=$2', [user.id, input.requestId])).rows[0];
      if (previous) { if (previous.fingerprint !== fingerprint) throw fail(409, 'Begäran-ID används redan'); return previous.id; }
      let parent;
      if (parentId) {
        parent = (await client.query('SELECT * FROM community_comments WHERE id=$1 AND report_id=$2', [parentId,id])).rows[0];
        const parentProfile = parent && (await client.query('SELECT suspended FROM community_profiles WHERE user_id=$1', [parent.author_id])).rows[0];
        if (!parent || parent.parent_id || parent.removed || parentProfile?.suspended || await blocked(user, parent.author_id, client)) throw fail(409, 'Det går inte att svara på kommentaren');
      }
      await limit(client, user, 'comment', 10, 60_000);
      const newId = randomUUID();
      await client.query('INSERT INTO community_comments(id,report_id,author_id,parent_id,request_id,fingerprint,body,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [newId,id,user.id,parentId,input.requestId,fingerprint,body,stamp()]);
      await activity(client, user, 'comment');
      for (const recipient of new Set([report.author_id, parent?.author_id].filter(value => value && value !== user.id))) if (!await blocked(user, recipient, client)) await notifications?.replyHook(client,recipient,newId,id);
      return newId;
    });
    return { id: commentId };
  }
  async function removeComment(user, id) {
    const result = await query('UPDATE community_comments SET body=$3,removed=true WHERE id=$1 AND author_id=$2 RETURNING id', [id,user.id,'']);
    if (!result.rows.length) throw fail(404, 'Kommentaren finns inte');
    return { ok: true };
  }
  async function uploadPhoto(user, id, bytes) {
    if (!storage.configured) throw fail(503, 'Bilduppladdning är inte ansluten');
    const sanitized = await sanitizePhoto(bytes), photoHash = digest(sanitized);
    const key = `community/${id}/${randomUUID()}.jpg`;
    // Reserve cleanup before acquiring a transaction connection, avoiding pool exhaustion.
    await query('INSERT INTO media_cleanup(object_key) VALUES($1) ON CONFLICT(object_key) DO NOTHING', [key]);
    return transact(user, async client => {
      await client.query('SELECT id FROM community_reports WHERE id=$1 FOR UPDATE', [id]);
      const row = await rawReport(id, client);
      if (!row || row.author_id !== user.id) throw fail(404, 'Rapporten finns inte');
      if (row.status !== 'active' || new Date(row.expires_at).getTime() <= now()) throw fail(409, 'Rapporten är avslutad');
      if (row.photo_key) {
        if (row.photo_hash === photoHash) return { status: row.photo_status };
        throw fail(409, 'Rapporten har redan en bild');
      }
      await storage.put(key, sanitized);
      await client.query("UPDATE community_reports SET photo_key=$2,photo_hash=$3,photo_status='pending',photo_uploaded_at=$4 WHERE id=$1", [id,key,photoHash,stamp()]);
      return { status: 'pending' };
    });
  }
  async function removePhoto(id) {
    const row = await rawReport(id);
    if (row?.photo_key) {
      await query('INSERT INTO media_cleanup(object_key) VALUES($1) ON CONFLICT(object_key) DO NOTHING', [row.photo_key]);
      await query("UPDATE community_reports SET photo_key=NULL,photo_hash=NULL,photo_status='none' WHERE id=$1", [id]);
    }
  }
  async function photo(id, user, staff = false) {
    const row = staff ? await rawReport(id) : await accessibleReport(id, user);
    if (!row?.photo_key || (!staff && row.photo_status !== 'approved')) throw fail(404, 'Bilden är inte publicerad');
    return storage.get(row.photo_key);
  }
  async function flag(user, input) {
    await profile(user);
    const reason = cleanCommunityText(input?.reason, 600);
    if (!['report','photo','comment','author'].includes(input.targetType) || !idPattern.test(input.targetId)) throw fail(400, 'Ogiltig anmälan');
    if (input.targetType === 'report' || input.targetType === 'photo') {
      const row = await accessibleReport(input.targetId,user); if (input.targetType === 'photo' && row.photo_status !== 'approved') throw fail(404, 'Bilden finns inte');
    } else if (input.targetType === 'comment') {
      const row = (await query('SELECT report_id,author_id,removed FROM community_comments WHERE id=$1', [input.targetId])).rows[0];
      if (!row || row.removed || await blocked(user,row.author_id)) throw fail(404, 'Kommentaren finns inte'); await accessibleReport(row.report_id,user);
    } else if (!(await query('SELECT user_id FROM community_profiles WHERE author_key=$1', [input.targetId])).rows.length) throw fail(404, 'Användaren finns inte');
    await query(`INSERT INTO community_flags(id,reporter_id,target_type,target_id,reason,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(reporter_id,target_type,target_id) DO NOTHING`, [randomUUID(),user.id,input.targetType,input.targetId,reason,stamp()]);
    return { ok: true };
  }
  async function block(user, key, remove = false) {
    await profile(user);
    const author = (await query('SELECT user_id FROM community_profiles WHERE author_key=$1', [key])).rows[0];
    if (!author || author.user_id === user.id) throw fail(400, 'Ogiltig användare');
    if (remove) await query('DELETE FROM community_blocks WHERE user_id=$1 AND blocked_id=$2', [user.id,author.user_id]);
    else await query('INSERT INTO community_blocks(user_id,blocked_id) VALUES($1,$2) ON CONFLICT(user_id,blocked_id) DO NOTHING', [user.id,author.user_id]);
    return { ok: true };
  }
  async function blocks(user) { return { items: (await query('SELECT p.author_key,p.alias FROM community_blocks b JOIN community_profiles p ON p.user_id=b.blocked_id WHERE b.user_id=$1', [user.id])).rows.map(p => ({ authorKey: p.author_key, alias: p.alias })) }; }
  async function audit(client, actor, action, target, reason) { await client.query('INSERT INTO community_audit(id,actor,action,target_id,reason,created_at) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(),actor.id,action,target,reason,stamp()]); }
  async function moderate(actor, input) {
    if (!['reviewer','admin'].includes(actor?.role)) throw fail(403, 'Granskarroll krävs');
    const reason = cleanCommunityText(input?.reason, 600);
    if (!idPattern.test(input.targetId)) throw fail(400, 'Ogiltigt mål');
    const client = await pool.connect();
    try {
      await client.query('BEGIN'); let result;
      if (['approve-photo','reject-photo','remove-report'].includes(input.action)) {
        await client.query('SELECT id FROM community_reports WHERE id=$1 FOR UPDATE',[input.targetId]);
        const row = await rawReport(input.targetId, client);
        if (!row) throw fail(404, 'Rapporten finns inte');
        if (input.action === 'approve-photo' && (row.photo_status !== 'pending' || !row.photo_key || row.status !== 'active' || row.suspended || new Date(row.expires_at).getTime() <= now())) throw fail(409, 'Bilden kan inte publiceras');
        if (input.action !== 'remove-report' && !row.photo_key) throw fail(404, 'Bilden finns inte');
        if (input.action === 'remove-report') await client.query("UPDATE community_reports SET status='removed' WHERE id=$1", [row.id]);
        else await client.query('UPDATE community_reports SET photo_status=$2,photo_reason=$3 WHERE id=$1', [row.id,input.action === 'approve-photo' ? 'approved' : 'rejected',reason]);
      } else if (input.action === 'remove-comment') {
        result = await client.query("UPDATE community_comments SET removed=true,body='' WHERE id=$1 RETURNING id", [input.targetId]);
      } else if (['suspend-author','restore-author'].includes(input.action)) {
        result = await client.query('UPDATE community_profiles SET suspended=$2,suspended_reason=$3 WHERE author_key=$1 RETURNING user_id', [input.targetId,input.action === 'suspend-author',reason]);
      } else if (['dismiss-flag','action-flag'].includes(input.action)) {
        result = await client.query('UPDATE community_flags SET status=$2 WHERE id=$1 RETURNING id', [input.targetId,input.action === 'dismiss-flag' ? 'dismissed' : 'actioned']);
      } else throw fail(400, 'Ogiltig granskningsåtgärd');
      if (result && !result.rows.length) throw fail(404, 'Innehållet finns inte');
      await audit(client,actor,input.action,input.targetId,reason); await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    return { ok: true };
  }
  async function moderationQueue() {
    const photos = (await query("SELECT r.*,p.alias,p.author_key FROM community_reports r JOIN community_profiles p ON p.user_id=r.author_id WHERE r.photo_status='pending' AND r.status='active' AND r.expires_at>$1 ORDER BY r.photo_uploaded_at LIMIT 100", [stamp()])).rows.map(row => ({ ...publicReport(row), photo: { status: 'pending', url: `/api/admin/community/reports/${row.id}/photo` } }));
    const flags = (await query("SELECT id,target_type,target_id,reason,created_at FROM community_flags WHERE status='open' ORDER BY created_at LIMIT 100")).rows;
    const flaggedContent = [];
    for (const flag of flags) {
      let content;
      if (['report','photo'].includes(flag.target_type)) { const row = await rawReport(flag.target_id); content = row ? publicReport(row) : null; }
      if (flag.target_type === 'comment') { const row = (await query('SELECT c.body,c.report_id,c.removed,p.author_key,p.alias FROM community_comments c JOIN community_profiles p ON p.user_id=c.author_id WHERE c.id=$1', [flag.target_id])).rows[0]; content = row ? { body: row.body, reportId: row.report_id, removed: row.removed, author: { key: row.author_key, alias: row.alias } } : null; }
      if (flag.target_type === 'author') { const row = (await query('SELECT author_key,alias,suspended FROM community_profiles WHERE author_key=$1', [flag.target_id])).rows[0]; content = row ? { author: { key: row.author_key, alias: row.alias }, suspended: row.suspended } : null; }
      flaggedContent.push({ id:flag.id,targetType:flag.target_type,targetId:flag.target_id,reason:flag.reason,createdAt:flag.created_at,content });
    }
    return { photos, flags: flaggedContent, audit: (await query('SELECT actor,action,target_id,reason,created_at FROM community_audit ORDER BY created_at DESC LIMIT 50')).rows };
  }
  async function cleanupAccount(client, userId) {
    const rows = (await client.query('SELECT photo_key FROM community_reports WHERE author_id=$1 AND photo_key IS NOT NULL', [userId])).rows;
    for (const row of rows) await client.query('INSERT INTO media_cleanup(object_key) VALUES($1) ON CONFLICT(object_key) DO NOTHING', [row.photo_key]);
    await client.query('DELETE FROM community_profiles WHERE user_id=$1', [userId]);
  }
  let sweeping = false;
  async function sweep() {
    if (!pool || sweeping) return; sweeping = true;
    try {
      const cutoff = new Date(now() - 30 * day).toISOString();
      const rows = (await query('SELECT id,photo_key FROM community_reports WHERE created_at<$1', [cutoff])).rows;
      for (const row of rows) { if (row.photo_key) await query('INSERT INTO media_cleanup(object_key) VALUES($1) ON CONFLICT(object_key) DO NOTHING',[row.photo_key]); await query('DELETE FROM community_reports WHERE id=$1',[row.id]); }
      await query('DELETE FROM community_activity WHERE created_at<$1',[new Date(now() - day).toISOString()]);
      await query('DELETE FROM community_flags WHERE created_at<$1',[cutoff]);
      await query('DELETE FROM community_audit WHERE created_at<$1',[new Date(now() - 90 * day).toISOString()]);
      await query('DELETE FROM notification_outbox WHERE created_at<$1',[cutoff]);
      await query('DELETE FROM account_actions WHERE expires_at<$1',[stamp()]);
      if (storage.configured) {
        const objects = (await query('SELECT object_key,created_at FROM media_cleanup ORDER BY created_at LIMIT 100')).rows;
        for (const object of objects) {
          // A grace period avoids racing an upload which has not committed yet.
          if (new Date(object.created_at).getTime() > now() - 3_600_000) continue;
          const referenced = (await query('SELECT id FROM community_reports WHERE photo_key=$1',[object.object_key])).rows.length;
          // Committed reports are re-enqueued on deletion/retention. Leaving
          // referenced uploads at the front would starve orphan cleanup.
          if (referenced) { await query('DELETE FROM media_cleanup WHERE object_key=$1',[object.object_key]);continue; }
          await storage.remove(object.object_key); await query('DELETE FROM media_cleanup WHERE object_key=$1',[object.object_key]);
        }
      }
    } finally { sweeping = false; }
  }
  async function handle(req,res,url) {
    const send = (code,data) => sendJson(req,res,code,data);
    try {
      if (!pool) throw fail(503, 'Rapportfunktionen kräver en beständig databas');
      const isAdmin = url.pathname.startsWith('/api/admin/community');
      const actor = isAdmin ? authorizeAdmin(req) : null;
      if (isAdmin && !['reviewer','admin'].includes(actor?.role)) throw fail(actor ? 403 : 401,'Granskarroll krävs');
      const user = isAdmin ? null : await accounts.session(req);
      if (!['GET','HEAD'].includes(req.method) && !isAdmin && !user) throw fail(401,'Logga in först');
      const photoMatch = /^\/api\/(admin\/community\/reports|community-reports)\/([a-f0-9-]{36})\/photo$/.exec(url.pathname);
      if (photoMatch && ['GET','HEAD'].includes(req.method)) {
        const bytes = await photo(photoMatch[2],user,isAdmin);
        res.writeHead(200,{ 'Content-Type':'image/jpeg','Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie, Authorization' });
        return res.end(req.method === 'HEAD' ? undefined : bytes);
      }
      if (photoMatch && req.method === 'POST' && !isAdmin) { requireAction(req,false); await eligibility(user); return send(201,await uploadPhoto(user,photoMatch[2],await readBytes(req,PHOTO_LIMIT))); }
      if (url.pathname === '/api/admin/community' && req.method === 'GET') return send(200,await moderationQueue());
      if (url.pathname === '/api/admin/community/actions' && req.method === 'POST') return send(200,await moderate(actor,await readJson(req)));
      if (url.pathname === '/api/community/me' && req.method === 'GET') { if (!user) throw fail(401,'Logga in först'); return send(200,await me(user)); }
      if (url.pathname === '/api/community/eligibility' && req.method === 'POST') return send(200,await acceptRules(user,await readJson(req)));
      if (url.pathname === '/api/community/flags' && req.method === 'POST') return send(201,await flag(user,await readJson(req)));
      if (url.pathname === '/api/community/blocks') {
        if (!user) throw fail(401,'Logga in först');
        if (req.method === 'GET') return send(200,await blocks(user));
        if (['POST','DELETE'].includes(req.method)) return send(200,await block(user,(await readJson(req)).authorKey,req.method === 'DELETE'));
      }
      const commentMatch = /^\/api\/community\/comments\/([a-f0-9-]{36})$/.exec(url.pathname);
      if (commentMatch && req.method === 'DELETE') { await readJson(req); return send(200,await removeComment(user,commentMatch[1])); }
      if (url.pathname === '/api/community-reports') {
        if (['GET','HEAD'].includes(req.method)) return send(200,await list(user,url.searchParams));
        if (req.method === 'POST') return send(201,{ report:await createReport(user,await readJson(req)) });
      }
      const match = /^\/api\/community-reports\/([a-f0-9-]{36})(?:\/(resolve|comments))?$/.exec(url.pathname);
      if (match) {
        if (match[2] === 'comments') {
          if (['GET','HEAD'].includes(req.method)) return send(200,await comments(user,match[1],url.searchParams));
          if (req.method === 'POST') return send(201,await addComment(user,match[1],await readJson(req)));
        } else if (!match[2] && ['GET','HEAD'].includes(req.method)) return send(200,{ report:publicReport(await accessibleReport(match[1],user),user) });
        else if (match[2] === 'resolve' && req.method === 'POST') { await readJson(req); return send(200,await endReport(user,match[1],'resolved')); }
        else if (!match[2] && req.method === 'DELETE') { await readJson(req); return send(200,await endReport(user,match[1],'removed')); }
      }
      throw fail(404,'Funktionen finns inte');
    } catch (error) { return send(error.status || 500,{ error:error.status ? error.message : 'Rapportfunktionen kunde inte svara',code:error.code }); }
  }
  return { handle, profile, me, acceptRules, list, createReport, accessibleReport, publicReport, endReport, comments, addComment, removeComment, uploadPhoto, photo, flag, block, blocks, moderate, moderationQueue, cleanupAccount, sweep, storage, available: Boolean(pool) };
}
