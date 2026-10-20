import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { pressNews } from './press-news.mjs';

// Dedicated public-news service. It never loads account, location or database
// configuration and only returns publisher-provided RSS metadata and images.
export function createNewsServer(readNews = () => pressNews.read()) {
  return http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => {
      res.statusCode = status;
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(body));
    };
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD');
      return send(405, { error: 'Metoden stöds inte' });
    }
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/api/health' || path === '/') {
      res.setHeader('Cache-Control', 'no-store');
      return send(200, { status: 'ok', service: 'tryggpuls-news', version: '1.0.0' });
    }
    if (path !== '/api/press-news') return send(404, { error: 'Nyhetsadressen finns inte' });
    try {
      const result = await readNews();
      const status = result.fetchedAt ? 200 : 503;
      res.setHeader('Cache-Control', status === 200 ? 'public, max-age=60' : 'no-store');
      return send(status, result);
    } catch {
      res.setHeader('Cache-Control', 'no-store');
      return send(503, { items: [], fetchedAt: null, stale: true, status: 'unavailable', error: 'Nyhetskällorna kunde inte hämtas just nu' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createNewsServer();
  server.listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => console.log('TryggPuls public news service ready'));
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => { server.closeAllConnections(); process.exit(0); }, 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
