export const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
export function sendJson(req, res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Cookie, Authorization' });
  res.end(req.method === 'HEAD' ? undefined : JSON.stringify(payload));
}
export function requireAction(req, json = true) {
  if (req.headers['x-tryggpuls-action'] !== '1' || (json && req.headers['content-type']?.split(';')[0] !== 'application/json')) throw fail(415, 'Appens begäran och rätt innehållstyp krävs');
  const origin = req.headers.origin;
  let sameOrigin = true;
  try { if (origin) sameOrigin = new URL(origin).host === req.headers.host; } catch { sameOrigin = false; }
  if (!sameOrigin || req.headers['sec-fetch-site'] === 'cross-site') throw fail(403, 'Otillåten källa');
}
export async function readBytes(req, limit) {
  if (Number(req.headers['content-length']) > limit) throw fail(413, 'Filen eller meddelandet är för stort');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw fail(413, 'Filen eller meddelandet är för stort'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
export async function readJson(req) {
  requireAction(req);
  try { return JSON.parse((await readBytes(req, 16_000)).toString('utf8')); }
  catch (error) { if (error.status) throw error; throw fail(400, 'Ogiltig JSON'); }
}
