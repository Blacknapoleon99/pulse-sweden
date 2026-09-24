import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { server } from '../server.mjs';

test('HTTP routing, input validation, health, HEAD and private files', async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const home = await fetch(base);
    assert.equal(home.status, 200);
    const homeHtml = await home.text();
    assert.match(homeHtml, /panel-information/);
    assert.match(homeHtml, /data-tab="nara"/);
    assert.match(homeHtml, /map-layers-panel/);
    assert.match(homeHtml, /route-security-zones-list/);
    const css = await fetch(base + '/vendor/leaflet/leaflet.css');
    assert.equal(css.status, 200);
    assert.match(await css.text(), /\.leaflet-tile/);
    assert.equal((await fetch(base + '/family-client.js')).status, 200);
    assert.equal((await fetch(base + '/route-follow.js')).status, 200);
    assert.match(await (await fetch(base + '/route-follow.js')).text(), /createRouteFollowController/);
    assert.equal((await fetch(base + '/family-sw.js')).status, 200);
    const manifest = await fetch(base + '/manifest.webmanifest');
    assert.equal(manifest.status, 200);
    assert.match(manifest.headers.get('content-type'), /manifest\+json/);
    assert.equal((await manifest.json()).display, 'standalone');
    assert.equal((await fetch(base + '/icon-192.png')).status, 200);
    const mapConfig = await (await fetch(base + '/api/map-config')).json();
    assert.ok(['carto', 'openstreetmap'].includes(mapConfig.provider));
    assert.deepEqual(Object.keys(mapConfig), ['provider']);
    assert.equal((await fetch(base + '/api/map-tiles/20/0/0.png')).status, 400);
    assert.equal((await fetch(base + '/api/map-tiles/2/4/0.png')).status, 400);
    const health = await (await fetch(base + '/api/health')).json();
    assert.equal(health.status, 'ok');
    assert.equal(health.service, 'tryggpuls');
    const sources = await (await fetch(base + '/api/sources')).json();
    assert.ok(sources.sources.some(s => s.id === 'weather'));
    assert.ok(sources.sources.some(s => s.id === 'smhi-fire-risk'));
    assert.ok(sources.sources.some(s => s.id === 'civil-shelters'));
    assert.equal(sources.sources.find(s => s.id === 'trafikverket').status, 'requires_key');
    for (const url of ['/api/route', '/api/route?fromLat=99&fromLon=18&toLat=59&toLon=18', '/api/route?fromLat=59&fromLon=18&toLat=59&toLon=18&mode=flying', '/api/route-refresh', '/api/route-refresh?routeId=not-a-uuid', '/api/geocode?q=a', '/api/reverse-geocode?lat=&lon=18', '/api/shelters?lat=99&lon=18', '/api/fire-risk', '/api/fire-risk?lat=91&lon=18', '/api/fire-risk?lat=59&lon=']) {
      assert.equal((await fetch(base + url)).status, 400, url);
    }
    const missingRoute = await fetch(base + '/api/route-refresh?routeId=00000000-0000-4000-8000-000000000000');
    assert.equal(missingRoute.status, 404);
    assert.equal((await missingRoute.json()).code, 'ROUTE_CACHE_MISS');
    for (const url of ['/api/missing', '/server.mjs', '/feeds.mjs', '/family.mjs', '/family-api.mjs', '/package.json', '/.git/config', '/.env.local']) {
      assert.equal((await fetch(base + url)).status, 404, url);
    }
    assert.equal((await fetch(base + '/api/health', { method: 'POST' })).status, 405);
    const head = await fetch(base + '/api/health', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
