import type { FeedResponse } from './api';

export const NEWS_API_BASE = (
  process.env.EXPO_PUBLIC_NEWS_API_BASE_URL || 'https://tryggpuls-news.onrender.com'
).replace(/\/$/, '');
export const PRESS_NEWS_PATH = '/api/press-news';

// Public news has its own service and never receives the family session token.
// The free preview service can take about a minute to wake after being idle.
export async function readPressNews(signal?:AbortSignal, fetcher:typeof fetch=fetch, timeoutMs=90_000):Promise<FeedResponse> {
  const controller=new AbortController();
  const abort=()=>controller.abort();
  if(signal?.aborted)controller.abort();
  signal?.addEventListener('abort',abort);
  const timer=setTimeout(abort,timeoutMs);
  try {
    const response=await fetcher(`${NEWS_API_BASE}${PRESS_NEWS_PATH}`,{signal:controller.signal,credentials:'omit',headers:{Accept:'application/json'}});
    let data:FeedResponse&{error?:string};
    try { data=await response.json(); }
    catch { throw new Error('Nyhetstjänsten svarar inte just nu. Försök igen strax.'); }
    if(!response.ok)throw new Error(data.error||'Nyheterna kunde inte hämtas just nu.');
    if(!Array.isArray(data.items))throw new Error('Nyhetsflödet kunde inte läsas. Försök igen strax.');
    return data;
  } catch(error) {
    if(controller.signal.aborted&&!signal?.aborted)throw new Error('Nyhetstjänsten tar tid att starta. Försök igen strax.');
    throw error;
  } finally { clearTimeout(timer);signal?.removeEventListener('abort',abort); }
}
