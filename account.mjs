import { createHash, randomBytes, scrypt as callbackScrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { fail, readJson, sendJson } from './http-api.mjs';
import { createMailer } from './transactional-email.mjs';
import { communityPublishingAllowed } from './release-config.mjs';
const scrypt = promisify(callbackScrypt);
const digest = value => createHash('sha256').update(value).digest('hex');
export function createAccountApi({ pool, accounts, community, notifications, mailer = createMailer(), now = Date.now, publishingEnabled = communityPublishingAllowed } = {}) {
  const query = (sql, args = []) => pool.query(sql,args);
  async function requestLink(kind, user, email) {
    if (!mailer.configured) throw fail(503,'E-posttjänsten är inte ansluten');
    const target = kind === 'verify' ? user : (await query('SELECT id,email FROM family_users WHERE email=$1',[String(email || '').trim().toLowerCase().slice(0,254)])).rows[0];
    // Identical public response for unknown accounts and rate-limited resends.
    if (!target?.email) return { ok:true };
    const client = await pool.connect(); let token;
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM family_users WHERE id=$1 FOR UPDATE',[target.id]);
      const recent = (await client.query('SELECT token_hash FROM account_actions WHERE user_id=$1 AND kind=$2 AND expires_at>$3',[target.id,kind,new Date(now()+29*60_000).toISOString()])).rows.length;
      if (!recent) {
        token = randomBytes(32).toString('base64url');
        await client.query('UPDATE account_actions SET consumed_at=$3 WHERE user_id=$1 AND kind=$2 AND consumed_at IS NULL',[target.id,kind,new Date(now()).toISOString()]);
        await client.query('INSERT INTO account_actions(token_hash,user_id,kind,expires_at) VALUES($1,$2,$3,$4)',[digest(token),target.id,kind,new Date(now()+30*60_000).toISOString()]);
      }
      await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    if (token) await mailer.accountLink(target.email,kind,token);
    return { ok:true };
  }
  async function consume(kind, body) {
    if (typeof body?.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) throw fail(400,'Länken är ogiltig eller har gått ut');
    if (kind === 'reset' && (typeof body.password !== 'string' || body.password.length<12 || body.password.length>200)) throw fail(400,'Använd 12–200 tecken i lösenordet');
    const salt = kind === 'reset' ? randomBytes(16).toString('hex') : null;
    const passwordHash = salt ? (await scrypt(body.password,salt,64)).toString('hex') : null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const action = (await client.query('SELECT * FROM account_actions WHERE token_hash=$1 FOR UPDATE',[digest(body.token)])).rows[0];
      if (!action || action.kind!==kind || action.consumed_at || new Date(action.expires_at).getTime()<=now()) throw fail(400,'Länken är ogiltig eller har gått ut');
      if (kind==='verify') await client.query('UPDATE family_users SET email_verified_at=$2 WHERE id=$1',[action.user_id,new Date(now()).toISOString()]);
      else {
        // BankID-only accounts never gain password login through a reset flow.
        const user = (await client.query('SELECT email FROM family_users WHERE id=$1',[action.user_id])).rows[0];
        if (!user?.email) throw fail(400,'Kontot använder BankID');
        await client.query('UPDATE family_users SET salt=$2,password_hash=$3 WHERE id=$1',[action.user_id,salt,passwordHash]);
        await client.query('DELETE FROM family_sessions WHERE user_id=$1',[action.user_id]);
        await client.query('DELETE FROM native_push_devices WHERE user_id=$1',[action.user_id]);
      }
      await client.query('UPDATE account_actions SET consumed_at=$2 WHERE token_hash=$1',[digest(body.token),new Date(now()).toISOString()]);
      await client.query('COMMIT'); return { ok:true };
    } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  const requests = new Map();
  function throttle(req) {
    const key = req.socket.remoteAddress;
    const hits = (requests.get(key)||[]).filter(time=>time>now()-15*60_000);
    if (hits.length>=20) throw fail(429,'För många försök. Vänta och försök igen.');
    hits.push(now()); requests.set(key,hits);
    if (requests.size>5000) for (const [id, values] of requests) if (values.at(-1)<now()-15*60_000) requests.delete(id);
  }
  function config() {
    return { publishingEnabled: Boolean(pool && publishingEnabled()), photosEnabled: Boolean(community.storage.configured), emailEnabled:mailer.configured, nativePushEnabled:notifications.configured, rulesVersion:'2026-09-29', minimumContributorAge:16, supportEmail:process.env.SUPPORT_EMAIL || null };
  }
  async function handle(req,res,url) {
    try {
      if (url.pathname==='/api/account/config' && ['GET','HEAD'].includes(req.method)) return sendJson(req,res,200,config());
      if (!pool) throw fail(503,'Kontot kräver en beständig databas');
      const path = url.pathname.slice('/api/account/'.length);
      if (['verification/confirm','password/confirm','password/request'].includes(path) && req.method==='POST') {
        throttle(req); const body=await readJson(req);
        return sendJson(req,res,200,path==='password/request' ? await requestLink('reset',null,body.email) : await consume(path==='verification/confirm'?'verify':'reset',body));
      }
      const user=await accounts.session(req);
      if (!user) throw fail(401,'Logga in först');
      if (path==='me' && req.method==='GET') return sendJson(req,res,200,{user:{id:user.id,name:user.display_name,email:user.email},community:await community.me(user)});
      if (path==='verification/request' && req.method==='POST') { throttle(req); await readJson(req); return sendJson(req,res,200,await requestLink('verify',user)); }
      if (path==='notifications') {
        if (req.method==='POST') return sendJson(req,res,200,await notifications.register(user,await readJson(req)));
        if (req.method==='DELETE') { await notifications.unregister(user,(await readJson(req)).token); return sendJson(req,res,200,{ok:true}); }
      }
      const delivery=/^alarms\/([a-f0-9-]{36})\/delivery$/.exec(path);
      if (delivery && req.method==='GET') return sendJson(req,res,200,{items:await notifications.deliveries(user,delivery[1])});
      if (url.pathname==='/api/account' && req.method==='DELETE') { await readJson(req); await accounts.deleteAccount(user); res.setHeader('Set-Cookie',accounts.cookie('',process.env.NODE_ENV==='production')); return sendJson(req,res,200,{ok:true}); }
      throw fail(404,'Kontofunktionen finns inte');
    } catch(error) { return sendJson(req,res,error.status||500,{error:error.status?error.message:'Kontofunktionen kunde inte svara'}); }
  }
  return {handle,config,requestLink,consume,mailer};
}
