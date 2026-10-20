import type { Bulletin } from './api';

export function articleUrl(item:Bulletin):string|null {
  try {
    const url=new URL(item.url||item.source||'');
    return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;
  } catch {return null;}
}

export function articleIntro(item:Bulletin,maxLength=420):string {
  const text=(item.summary||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  if(text.length<=maxLength)return text;
  const start=text.slice(0,maxLength);
  const boundary=start.lastIndexOf(' ');
  return `${start.slice(0,boundary>maxLength*.7?boundary:maxLength).trimEnd()}…`;
}
