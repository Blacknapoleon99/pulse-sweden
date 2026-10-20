// Synthetic browser QA only: forces a separate temporary in-memory database.
// Never imports .env.local or connects to configured production resources.
import {randomUUID} from 'node:crypto';
process.env.TRYGGPULS_LOAD_ENVFILE='false';process.env.NODE_ENV='development';process.env.DATABASE_URL='';process.env.PORT='3100';process.env.HOST='127.0.0.1';process.env.COMMUNITY_PUBLISHING_ENABLED='true';
for(const key of ['RESEND_API_KEY','EMAIL_FROM','SENTRY_DSN','COMMUNITY_S3_BUCKET','NATIVE_PUSH_ENABLED'])delete process.env[key];
process.env.ZONE_ADMIN_TOKENS_JSON=JSON.stringify([{id:'qa-reviewer',token:'local-synthetic-reviewer-token-123',role:'reviewer'}]);
const {server,initializeFamily,familyService}=await import('../server.mjs');await initializeFamily();
const {createCommunityService,RULES_VERSION}=await import('../community.mjs');
const account=await familyService.register({name:'Syntetisk testanvändare',email:'browser-qa@example.test',password:'synthetic-browser-password-123'});await familyService.query('UPDATE family_users SET email_verified_at=now() WHERE id=$1',[account.user.id]);
const community=createCommunityService({pool:familyService.pool,accounts:familyService});await community.acceptRules(account.user,{atLeast16:true,rulesVersion:RULES_VERSION});
await community.createReport(account.user,{requestId:randomUUID(),title:'Syntetiskt UI-test: hinder på gångväg',body:'Endast ett lokalt test av användarflödet. Detta är ingen verklig händelse.',category:'hazard',lat:59.3293,lon:18.0686,observedAt:new Date().toISOString()});
server.listen(3100,'127.0.0.1',()=>console.log('Isolated synthetic QA: http://127.0.0.1:3100/community'));
