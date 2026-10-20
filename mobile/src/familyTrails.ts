import type {FamilyOverview} from './api';
import {positionFresh} from './mobileState.ts';

export type FamilyTrailPoint={latitude:number;longitude:number;at:number};
export type FamilyTrails=Record<string,FamilyTrailPoint[]>;
export const FAMILY_TRAIL_TTL_MS=6*60*60_000;
export function familyTrailSegments(points:FamilyTrailPoint[]){
  const segments:FamilyTrailPoint[][]=[];
  for(const point of points){
    const segment=segments.at(-1),last=segment?.at(-1);
    if(!last||point.at-last.at>120_000)segments.push([point]);else segment!.push(point);
  }
  return segments.filter(segment=>segment.length>1);
}
// Server history survives app restarts. Remove expired points and stopped members locally too.
export function updateFamilyTrails(previous:FamilyTrails,members:FamilyOverview['members'],now=Date.now(),history?:FamilyTrails):FamilyTrails{
  const next:FamilyTrails={};
  for(const member of members){
    if(!member.sharing)continue;
    const points=(history?(history[member.id]||[]):(previous[member.id]||[])).filter(point=>Number.isFinite(point.at)&&Number.isFinite(point.latitude)&&Number.isFinite(point.longitude)&&point.at>now-FAMILY_TRAIL_TTL_MS&&point.at<=now+60_000);
    const at=Date.parse(member.updated_at||'');
    if(positionFresh(member,now)&&(!points.length||at>points[points.length-1].at)){
      points.push({latitude:member.lat!,longitude:member.lon!,at});
    }
    if(points.length)next[member.id]=points.slice(-2161);
  }
  return next;
}
