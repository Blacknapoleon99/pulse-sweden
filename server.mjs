import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const refreshIntervalMs=65_000;
const upstream='https://polisen.se/api/events';
const legalUpstream='https://rattspraxis.etjanst.domstol.se/api/v1/publiceringar';
const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
const port=Number(process.env.PORT)||3000;
let cache=null,lastAttempt=0,pending=null,permanent=false,lastError=null;
let legalCache=null,legalLastAttempt=0,legalPending=null,legalError=null;

const publicSources=[
  {id:'polisen-events',name:'Polisen händelser',status:'active',scope:'Publika händelsenotiser',refresh:'Var 65:e sekund',detail:'Visas med källans platsnoggrannhet och länk till originalnotisen.'},
  {id:'domstolspraxis',name:'Domstolsverket rättspraxis',status:'active',scope:'Rättsliga uppdateringar',refresh:'Var 65:e sekund',detail:'Ansluten som separat, källänkad rättsuppdatering. Används aldrig för att härleda bostadsplats eller skapa personbaserade områden.'},
  {id:'nusvar',name:'Nusvar',status:'not-connected',scope:'Ej tillåten i publik karta',refresh:'Inte ansluten',detail:'Källan beskriver person-, adress- och rättsdata. Pulse begär, lagrar eller visar inte dessa uppgifter i det publika gränssnittet.'}
];

function headers(contentType,cacheControl='no-store'){
  return {'Content-Type':contentType,'Cache-Control':cacheControl,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Permissions-Policy':'geolocation=(), camera=(), microphone=()'};
}
function json(req,res,status,payload){res.writeHead(status,headers('application/json; charset=utf-8'));res.end(req.method==='HEAD'?undefined:JSON.stringify(payload));}
async function events(){
  if(pending) await pending;
  else if(!permanent && Date.now()-lastAttempt>=refreshIntervalMs){
    lastAttempt=Date.now();
    pending=(async()=>{
      try{
        const response=await fetch(upstream,{headers:{'User-Agent':'PulseSwedenDemo/1.0','Accept':'application/json'},signal:AbortSignal.timeout(15_000)});
        if(response.status===404) permanent=true;
        if(!response.ok) throw Error(`Police feed returned ${response.status}`);
        const data=await response.json();
        if(!Array.isArray(data)) throw Error('Unexpected feed format');
        cache={events:data,fetchedAt:new Date().toISOString()};lastError=null;
      }catch{lastError='Unable to refresh public events feed';}finally{pending=null;}
    })();
    await pending;
  }
  return {...(cache||{events:[],fetchedAt:null}),stale:!!lastError,error:lastError,nextCheckAt:new Date(lastAttempt+refreshIntervalMs).toISOString()};
}
async function legalUpdates(){
  if(legalPending) await legalPending;
  else if(Date.now()-legalLastAttempt>=refreshIntervalMs){
    legalLastAttempt=Date.now();
    legalPending=(async()=>{
      try{
        const response=await fetch(legalUpstream,{headers:{'User-Agent':'PulseSwedenDemo/1.0','Accept':'application/json'},signal:AbortSignal.timeout(15_000)});
        if(!response.ok) throw Error(`Legal feed returned ${response.status}`);
        const data=await response.json();
        if(!Array.isArray(data)) throw Error('Unexpected legal feed format');
        legalCache=data.filter(item=>item&&item.id).slice(0,20).map(item=>({
          id:item.id,date:item.avgorandedatum||item.publiceringstid?.slice(0,10)||null,
          publishedAt:item.publiceringstid||null,court:item.domstol?.domstolNamn||'Domstol',
          caseNumbers:Array.isArray(item.malNummerLista)?item.malNummerLista.slice(0,3):[],
          area:Array.isArray(item.rattsomradeLista)?item.rattsomradeLista.slice(0,2):[],
          type:item.publiceringsform||item.typ||'Rättsfall',summary:String(item.sammanfattning||'').slice(0,600),
          source:`${legalUpstream}/${encodeURIComponent(item.id)}`
        }));
        legalError=null;
      }catch{legalError='Unable to refresh legal updates';}
      finally{legalPending=null;}
    })();
    await legalPending;
  }
  return {updates:legalCache||[],fetchedAt:legalCache?new Date().toISOString():null,stale:!!legalError,error:legalError,nextCheckAt:new Date(legalLastAttempt+refreshIntervalMs).toISOString()};
}

http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,headers('text/plain; charset=utf-8'));return res.end('Method not allowed');}
  if(url.pathname==='/api/health')return json(req,res,200,{status:'ok',service:'pulse-sweden-demo',publicDataOnly:true});
  if(url.pathname==='/api/sources')return json(req,res,200,{sources:publicSources,updatedAt:new Date().toISOString()});
  if(url.pathname==='/api/legal-updates'){
    const result=await legalUpdates();return json(req,res,result.fetchedAt?200:503,result);
  }
  if(url.pathname==='/api/events'){
    const result=await events();return json(req,res,result.fetchedAt?200:503,result);
  }
  const file=files[url.pathname];
  if(!file){res.writeHead(404,headers('text/plain; charset=utf-8'));return res.end('Not found');}
  try{
    const body=await readFile(path.join(root,file));
    const type=url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8';
    res.writeHead(200,headers(type,url.pathname==='/'?'no-store':'public, max-age=300'));
    res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(500,headers('text/plain; charset=utf-8'));res.end('Pulse could not read this page.');}
}).listen(port,'127.0.0.1',()=>console.log(`Pulse demo: http://localhost:${port}`));
