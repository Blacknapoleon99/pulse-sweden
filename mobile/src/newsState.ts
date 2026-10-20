import type {Bulletin} from './api';
export function newsSource(item:Bulletin){return item.sourceName||(item.url?'Polisen':'Krisinformation');}
export function stableNews(items:Bulletin[]){return [...new Map(items.map(item=>{const id=item.id||item.url||`${item.source||''}:${item.title}:${item.publishedAt||''}`;return [id,{...item,id}] as const;})).values()].sort((a,b)=>(Date.parse(b.publishedAt||'')||0)-(Date.parse(a.publishedAt||'')||0));}
