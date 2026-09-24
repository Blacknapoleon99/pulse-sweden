import { createFamilyService } from './family.mjs';

const attempts = new Map();
const chatSentAt = new Map();
function reply(req,res,status,payload,cookie) {
  const headers = { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' };
  if (cookie) headers['Set-Cookie'] = cookie;
  res.writeHead(status,headers);
  res.end(req.method === 'HEAD' ? undefined : JSON.stringify(payload));
}
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json') || req.headers['x-tryggpuls-action'] !== '1') throw Object.assign(new Error('JSON och appens begäran krävs'),{status:415});
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host || req.headers['sec-fetch-site'] === 'cross-site') throw Object.assign(new Error('Otillåten källa'),{status:403});
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 16_000) throw Object.assign(new Error('För stort meddelande'),{status:413}); }
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('Ogiltig JSON'),{status:400}); }
}
export function createFamilyApi(options = {}) {
  const service = createFamilyService(options);
  async function handle(req,res,url,getEvents) {
    try {
      if (!service.available) return reply(req,res,503,{error:'Familjekonton kräver persistent databas på servern',code:'DATABASE_NOT_CONFIGURED'});
      if (url.pathname === '/api/family/config' && req.method === 'GET') return reply(req,res,200,{enabled:true,persistent:Boolean(process.env.DATABASE_URL),preview:process.env.FAMILY_PREVIEW_MODE==='true',pushEnabled:service.pushEnabled,vapidPublic:service.vapidPublic});
      if (['/api/family/register','/api/family/login'].includes(url.pathname)) {
        if (req.method !== 'POST') return reply(req,res,405,{error:'Metoden stöds inte'});
        const key = `${req.socket.remoteAddress}:${url.pathname}`;
        const recent = (attempts.get(key) || []).filter(t => Date.now()-t < 15 * 60_000);
        if (recent.length >= 12) return reply(req,res,429,{error:'För många försök. Försök igen senare.'});
        recent.push(Date.now()); attempts.set(key,recent);
        if (attempts.size > 1000) attempts.clear();
        const data = await body(req);
        const result = url.pathname.endsWith('register') ? await service.register(data) : await service.login(data);
        const native = req.headers['x-tryggpuls-client'] === 'native';
        return reply(req,res,200,{user:result.user,...(native ? {token:result.token} : {})},service.cookie(result.token,process.env.NODE_ENV==='production'));
      }
      const user = await service.session(req);
      if (!user) return reply(req,res,401,{error:'Logga in för att använda familjefunktioner'});
      if (url.pathname === '/api/family/me' && req.method === 'GET') return reply(req,res,200,await service.overview(user));
      if (url.pathname === '/api/family/messages' && req.method === 'GET') return reply(req,res,200,{messages:await service.listMessages(user)});
      if (req.method === 'POST') {
        const data = await body(req);
        if (url.pathname === '/api/family/messages') {
          const last = chatSentAt.get(user.id) || 0;
          if (Date.now() - last < 1000) return reply(req,res,429,{error:'Vänta en sekund innan nästa meddelande'});
          const message = await service.sendMessage(user,data.body);
          chatSentAt.set(user.id,Date.now());
          if (chatSentAt.size > 1000) chatSentAt.clear();
          return reply(req,res,200,message);
        }
        if (url.pathname === '/api/family/logout') { await service.logout(req); return reply(req,res,200,{ok:true},service.cookie('',process.env.NODE_ENV==='production')); }
        if (url.pathname === '/api/family/group') return reply(req,res,200,{id:await service.createGroup(user,data.name)});
        if (url.pathname === '/api/family/invite') return reply(req,res,200,{token:await service.invite(user)});
        if (url.pathname === '/api/family/join') { await service.join(user,data.token); return reply(req,res,200,{ok:true}); }
        if (url.pathname === '/api/family/zones') return reply(req,res,200,{id:await service.addZone(user,data)});
        if (url.pathname === '/api/family/child-items') return reply(req,res,200,{id:await service.addChildItem(user,data)});
        if (url.pathname === '/api/family/police-area-alerts') { await service.setPoliceAreaAlerts(user,data.enabled); return reply(req,res,200,{enabled:data.enabled}); }
        if (url.pathname === '/api/family/location') {
          const events = await getEvents();
          const policeAvailable = Boolean(events.fetchedAt && !events.stale);
          return reply(req,res,200,{ok:true,...await service.reportLocation(user,data,policeAvailable ? events.events : []),policeAvailable});
        }
        if (url.pathname === '/api/family/stop') { await service.stop(user); return reply(req,res,200,{ok:true}); }
        if (url.pathname === '/api/family/leave') { await service.leave(user); return reply(req,res,200,{ok:true}); }
        if (url.pathname === '/api/family/push') { await service.subscribe(user,data.subscription); return reply(req,res,200,{ok:true}); }
      }
      if (req.method === 'DELETE') {
        const data = await body(req);
        if (url.pathname.startsWith('/api/family/zones/')) { await service.removeZone(user,url.pathname.slice('/api/family/zones/'.length)); return reply(req,res,200,{ok:true}); }
        if (url.pathname.startsWith('/api/family/child-items/')) { await service.removeChildItem(user,url.pathname.slice('/api/family/child-items/'.length)); return reply(req,res,200,{ok:true}); }
        if (url.pathname === '/api/family/push') { await service.unsubscribe(user,data.endpoint); return reply(req,res,200,{ok:true}); }
        if (url.pathname === '/api/family/account') { await service.deleteAccount(user); return reply(req,res,200,{ok:true},service.cookie('',process.env.NODE_ENV==='production')); }
      }
      return reply(req,res,404,{error:'Familjefunktionen finns inte'});
    } catch (err) {
      if (!err.status) console.error('[family] Serverfel:',err.message);
      return reply(req,res,err.status || 500,{error:err.status ? err.message : 'Familjefunktionen svarar inte'});
    }
  }
  return {service,handle};
}
