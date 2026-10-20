import type {PrototypeTabParams} from './navigation';

export const prototypeTabs=[
  ['home','home-outline','Hem'],['map','location-outline','Karta'],
  ['stats','stats-chart-outline','Statistik'],['places','location-outline','Platser'],
  ['info','person-outline','Profil'],
] as const;
export type PrototypeTabName=keyof PrototypeTabParams;
export function isPrototypeTab(name:string):name is PrototypeTabName{return prototypeTabs.some(([id])=>id===name);}
export function prototypeTabAction(name:PrototypeTabName,params?:PrototypeTabParams[PrototypeTabName]){
  return {type:'NAVIGATE' as const,payload:{name:'main',params:{screen:name,merge:true,...(params?{params}:{})},pop:true}};
}
export function prototypeSelectTabAction(name:PrototypeTabName){return {type:'NAVIGATE' as const,payload:{name,merge:true}};}
