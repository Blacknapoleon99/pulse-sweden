import assert from 'node:assert';
import { test } from 'node:test';
import http from 'node:http';

// Låt en instans av servern köras på en slumpmässig port och testa
// kritiska endpoints. Denna fil startar sin egen server och stänger den
// efteråt — den är oberoende av `npm start`.

const PORT = 0; // slumpmässig ledig port

function request(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: PORT, path, method, headers: { Accept: 'application/json' } },
      res => {
        let body = '';
        res.on('data', c => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

let server;

test('starta servern och testa endpoints', async () => {
  // Dynamisk import av server.mjs — vi startar den manuellt eftersom
  // server.mjs inte exporterar någonting (den kör `server.listen()` direkt).
  // Vi använder child_process för att starta servern som en subprocess.
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let started = false;
  let output = '';
  child.stdout.on('data', d => {
    output += d.toString();
    if (output.includes('TryggPuls startad')) started = true;
  });
  child.stderr.on('data', d => (output += d.toString()));

  // Vänta på att servern ska vara igång
  for (let i = 0; i < 50; i++) {
    if (started) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(started, 'Servern startade inte inom 5 s. Output:\n' + output);

  try {
    // GET / -> 200, text/html
    const root = await request('/');
    assert.strictEqual(root.status, 200);
    assert.ok(root.headers['content-type']?.includes('text/html'), root.headers['content-type']);

    // GET /api/health -> 200, status ok
    const health = await request('/api/health');
    assert.strictEqual(health.status, 200);
    const healthJson = JSON.parse(health.body);
    assert.strictEqual(healthJson.status, 'ok');
    assert.strictEqual(healthJson.service, 'tryggpuls');
    assert.strictEqual(healthJson.noMockDataGuarantee, true);

    // GET /api/sources -> 200, sources-array
    const sources = await request('/api/sources');
    assert.strictEqual(sources.status, 200);
    const sourcesJson = JSON.parse(sources.body);
    assert.ok(Array.isArray(sourcesJson.sources) && sourcesJson.sources.length > 0);

    // GET /api/events -> 200 eller 503 (beroende på upström)
    const events = await request('/api/events');
    assert.ok(events.status === 200 || events.status === 503, `förväntat 200/503, fick ${events.status}`);

    // GET /api/okänd -> 404 JSON
    const unknown = await request('/api/unknown');
    assert.strictEqual(unknown.status, 404);
    const unknownJson = JSON.parse(unknown.body);
    assert.ok(unknownJson.error);

    // GET /api/geocode?q=Stockholm -> 200
    const geo = await request('/api/geocode?q=Stockholm');
    assert.strictEqual(geo.status, 200);
    const geoJson = JSON.parse(geo.body);
    assert.ok(Array.isArray(geoJson.results));

    // GET /api/route utan koordinater -> 400
    const badRoute = await request('/api/route');
    assert.strictEqual(badRoute.status, 400);
    const badJson = JSON.parse(badRoute.body);
    assert.ok(badJson.error);

    // HEAD /api/health -> 200, ingen kropps innehåll
    const head = await request('/api/health', 'HEAD');
    assert.strictEqual(head.status, 200);
    assert.strictEqual(head.body, '');
  } finally {
    child.kill('SIGTERM');
    // Vänta på att subprocessen ska avslutas
    await new Promise(r => setTimeout(r, 500));
    if (!child.killed) child.kill('SIGKILL');
  }
}, 20000);
