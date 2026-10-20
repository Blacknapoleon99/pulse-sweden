export type LocationSample={timestamp:number;coords:{latitude:number;longitude:number;accuracy:number|null}};
export function locationPayload(sample:LocationSample,sharingSessionId:string,now=Date.now()){
  const {latitude:lat,longitude:lon,accuracy}=sample.coords;
  if(!sharingSessionId||!Number.isFinite(sample.timestamp)||sample.timestamp<now-120_000||sample.timestamp>now+30_000||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<55||lat>70||lon<10||lon>25||accuracy===null||!Number.isFinite(accuracy)||accuracy<0||accuracy>5000)return null;
  return {lat,lon,accuracy,observedAt:sample.timestamp,sharingSessionId};
}
