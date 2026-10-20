export type FeedEntry<T=unknown>={data:T|null;error:string|null;loading:boolean;updatedAt:number;failures:number};
type Definition={path:string;interval:number};
export const feedDefinitions:Record<string,Definition>={events:{path:'/api/events',interval:30_000},areas:{path:'/api/police-areas',interval:86_400_000},zones:{path:'/api/public-zones',interval:65_000},mapItems:{path:'/api/public-map-items',interval:65_000},weather:{path:'/api/weather-warnings',interval:65_000},crisis:{path:'/api/crisis-updates',interval:65_000},pressNews:{path:'/api/press-news',interval:300_000},news:{path:'/api/crisis-news',interval:300_000},zoneNews:{path:'/api/security-zone-news',interval:1_800_000},community:{path:'/api/community-reports?limit=100',interval:10_000},config:{path:'/api/account/config',interval:300_000}};
export function createFeedStore(fetcher:(path:string,signal:AbortSignal)=>Promise<unknown>,now=Date.now) {
  let snapshot:Record<string,FeedEntry>=Object.fromEntries(Object.keys(feedDefinitions).map(key=>[key,{data:null,error:null,loading:false,updatedAt:0,failures:0}]));
  const listeners=new Set<()=>void>(),pending=new Map<string,{promise:Promise<void>;controller:AbortController}>();
  const attempts=new Map<string,number>(); let generation=0;
  const emit=()=>listeners.forEach(listener=>listener());
  const update=(key:string,entry:FeedEntry)=>{snapshot={...snapshot,[key]:entry};emit();};
  function refresh(key:string,force=false):Promise<void> {
    if(pending.has(key))return pending.get(key)!.promise;
    const entry=snapshot[key], definition=feedDefinitions[key];if(!entry||!definition)return Promise.resolve();
    const delay=entry.failures?Math.min(300_000,5_000*2**(entry.failures-1)):definition.interval;
    if(!force&&attempts.has(key)&&now()-(attempts.get(key)||0)<delay)return Promise.resolve();
    attempts.set(key,now());const current=generation,controller=new AbortController();
    update(key,{...entry,loading:true});
    const promise=Promise.resolve().then(()=>fetcher(definition.path,controller.signal)).then(data=>{
      if(current!==generation||controller.signal.aborted)return;
      const value=data as {stale?:boolean;error?:string;fetchedAt?:string;status?:string;items?:unknown[];events?:unknown[]};
      if(value.status==='unavailable'||value.status==='requires_setup'||(value.error&&!value.fetchedAt&&!value.items?.length&&!value.events?.length))throw new Error(value.error||'Källan är inte tillgänglig');
      update(key,{data,error:value.stale?value.error||'Källan är fördröjd':null,loading:false,updatedAt:now(),failures:value.stale?entry.failures+1:0});
    }).catch(error=>{if(current===generation&&!controller.signal.aborted)update(key,{...snapshot[key],error:error instanceof Error?error.message:'Källan är inte tillgänglig',loading:false,failures:entry.failures+1});}).finally(()=>{if(pending.get(key)?.controller===controller)pending.delete(key);});
    pending.set(key,{promise,controller});return promise;
  }
  return {getSnapshot:()=>snapshot,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},refresh,
    expireCommunity(){const entry=snapshot.community,data=entry.data as {items?:{expiresAt:string;status:string}[]}|null;if(!data?.items)return;const items=data.items.filter(item=>item.status==='active'&&Date.parse(item.expiresAt)>now());if(items.length!==data.items.length)update('community',{...entry,data:{...data,items}});},
    async refreshMany(keys:string[],force=false){await Promise.allSettled(keys.map(key=>refresh(key,force)));},
    reset(key?:string){generation++;for(const [name,item] of pending){item.controller.abort();update(name,{...snapshot[name],loading:false});}pending.clear();for(const name of key?[key]:Object.keys(snapshot)){attempts.delete(name);update(name,{data:null,error:null,loading:false,updatedAt:0,failures:0});}},
    pause(){generation++;for(const [key,item] of pending){item.controller.abort();update(key,{...snapshot[key],loading:false});}pending.clear();},
    hydrate(key:string,data:unknown){if(snapshot[key]&&!snapshot[key].data)update(key,{data,error:'Uppgifterna är sparade från en tidigare session',loading:false,updatedAt:0,failures:0});}
  };
}
