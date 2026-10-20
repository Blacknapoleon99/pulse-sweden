import test from 'node:test';
import assert from 'node:assert/strict';
import { NEWS_API_BASE, readPressNews } from '../mobile/src/pressNewsClient.ts';

test('mobile news uses its dedicated origin and never sends family credentials',async()=>{
  const data={items:[{title:'Nyhet',sourceName:'Aftonbladet',imageUrl:'https://akamai.vgc.no/image.jpg'}],status:'ok'};
  const fake:typeof fetch=async(input,init)=>{
    assert.equal(input,`${NEWS_API_BASE}/api/press-news`);
    assert.deepEqual(init?.headers,{Accept:'application/json'});
    assert.equal(init?.credentials,'omit');
    return new Response(JSON.stringify(data));
  };
  assert.deepEqual(await readPressNews(undefined,fake),data);
});

test('mobile news rejects proxy HTML, failed sources and malformed data instead of showing an empty feed',async()=>{
  await assert.rejects(readPressNews(undefined,async()=>new Response('<html>Starting</html>',{status:503})),/svarar inte/);
  await assert.rejects(readPressNews(undefined,async()=>new Response(JSON.stringify({error:'Källorna är tillfälligt nere'}),{status:503})),/Källorna/);
  await assert.rejects(readPressNews(undefined,async()=>new Response('{}')),/kunde inte läsas/);
});

test('mobile news aborts on backgrounding and bounds a stalled cold start',async()=>{
  const stalled:typeof fetch=async(_url,init)=>new Promise((_resolve,reject)=>{
    const abort=()=>reject(new Error('aborted'));
    if(init?.signal?.aborted)abort();else init?.signal?.addEventListener('abort',abort,{once:true});
  });
  const controller=new AbortController();
  const pending=readPressNews(controller.signal,stalled);
  controller.abort();await assert.rejects(pending,/aborted/);
  await assert.rejects(readPressNews(undefined,stalled,5),/tar tid att starta/);
});
