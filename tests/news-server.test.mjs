import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createNewsServer } from '../news-server.mjs';

test('dedicated service serves news, CORS and health without exposing accounts, files or writes', async () => {
  let calls = 0;
  const data = { items: [{ id: 'article', imageUrl: 'https://static.bonniernews.se/photo.jpg', sourceName: 'Expressen' }], fetchedAt: new Date().toISOString(), status: 'ok' };
  const server = createNewsServer(async () => { calls++; return data; });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(base + '/api/health');
    assert.equal(health.status, 200); assert.equal((await health.json()).service, 'tryggpuls-news'); assert.equal(calls, 0);
    const news = await fetch(base + '/api/press-news');
    assert.equal(news.status, 200); assert.deepEqual(await news.json(), data);
    assert.equal(news.headers.get('access-control-allow-origin'), '*');
    for (const path of ['/api/family/me', '/.env.local', '/news-server.mjs']) assert.equal((await fetch(base + path)).status, 404);
    assert.equal((await fetch(base + '/api/press-news', { method: 'POST' })).status, 405);
    const head = await fetch(base + '/api/press-news', { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('dedicated service distinguishes upstream failure from a healthy empty feed', async () => {
  let unavailable = true;
  const server = createNewsServer(async () => unavailable ? { items: [], fetchedAt: null, status: 'unavailable' } : { items: [], fetchedAt: new Date().toISOString(), status: 'ok' });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/press-news`;
  try {
    assert.equal((await fetch(url)).status, 503);
    unavailable = false; assert.equal((await fetch(url)).status, 200);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
