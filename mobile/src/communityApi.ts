import { API_BASE, familyToken, fetchJson, subscribeFamilySession } from './api';
export type CommunityCategory='theft'|'violence'|'vandalism'|'suspicious'|'disturbance'|'traffic'|'hazard'|'other';
export const COMMUNITY_LABEL='Obekräftad användarrapport';
export type CommunityReport={id:string;origin:'community';verification:'unverified';label:string;category:CommunityCategory;title:string;body:string;location:{lat:number;lon:number;precisionMeters:number};author:{key:string;alias:string};observedAt:string;createdAt:string;expiresAt:string;status:'active'|'resolved'|'expired'|'removed';isOwner:boolean;photo:{status:'none'|'pending'|'approved'|'rejected';url?:string;reason?:string}};
export type CommunityComment={id:string;reportId:string;parentId:string|null;origin:'community';verification:'unverified';body:string;removed:boolean;author:{key:string;alias:string};createdAt:string;isOwner:boolean};
export type CommunityPage={items:CommunityReport[];nextCursor:string|null;fetchedAt:string;stale:boolean};
export type CommentsPage={items:CommunityComment[];nextCursor:string|null;fetchedAt:string;closed:boolean};
export type AccountConfig={publishingEnabled:boolean;photosEnabled:boolean;emailEnabled:boolean;nativePushEnabled:boolean;rulesVersion:string;minimumContributorAge:number;supportEmail:string|null};
export type AccountOverview={user:{id:string;name:string;email:string|null};community:{authorKey:string;alias:string;identityConfirmed:boolean;ageEligible:boolean;rulesAccepted:boolean;suspended:boolean;canContribute:boolean}};
let sessionVersion=0;
subscribeFamilySession(()=>{sessionVersion++;});
export async function appRequest<T>(path:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T> {
  const revision=sessionVersion,token=await familyToken();
  const result=await fetchJson(`${API_BASE}${path}`,{method,signal,headers:{Accept:'application/json',...(token?{Authorization:`Bearer ${token}`}:{ } ),...(method!=='GET'?{'Content-Type':'application/json','X-TryggPuls-Action':'1'}:{})},...(method!=='GET'?{body:JSON.stringify(body||{})}:{})});
  if(revision!==sessionVersion)throw new Error('Kontot ändrades under begäran.');
  return result as T;
}
export async function uploadReportPhoto(reportId:string,uri:string) {
  const token=await familyToken(), revision=sessionVersion;
  const blob=await(await fetch(uri)).blob();
  if(blob.size>5*1024*1024)throw new Error('Välj en bild på högst 5 MB.');
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),30_000);
  try {
    const response=await fetch(`${API_BASE}/api/community-reports/${reportId}/photo`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'image/jpeg','X-TryggPuls-Action':'1'},body:blob,signal:controller.signal});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Bilden kunde inte skickas.');
    if(revision!==sessionVersion)throw new Error('Kontot ändrades under begäran.');return data;
  } finally{clearTimeout(timeout);}
}
export const categoryNames:Record<CommunityCategory,string>={theft:'Stöld / inbrott',violence:'Våld / hot',vandalism:'Skadegörelse',suspicious:'Misstänkt aktivitet',disturbance:'Störning',traffic:'Trafik',hazard:'Fara eller hinder',other:'Övrig observation'};
// Bright, saturated fills that stay distinct from each other and readable against a white outline on the map.
export const categoryStyle:Record<CommunityCategory,{color:string;icon:'bag-handle'|'warning'|'hammer'|'eye'|'volume-high'|'car'|'alert-circle'|'help-circle'}>={
  theft:{color:'#FF6A00',icon:'bag-handle'},violence:{color:'#FF1744',icon:'warning'},vandalism:{color:'#D500F9',icon:'hammer'},suspicious:{color:'#FFD600',icon:'eye'},
  disturbance:{color:'#00E5FF',icon:'volume-high'},traffic:{color:'#2979FF',icon:'car'},hazard:{color:'#76FF03',icon:'alert-circle'},other:{color:'#FFFFFF',icon:'help-circle'}};
