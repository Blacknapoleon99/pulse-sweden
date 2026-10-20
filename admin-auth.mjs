import { createHash, timingSafeEqual } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest();
const roles = new Set(['editor', 'reviewer', 'admin']);

export function authorizeAdmin(req) {
  const supplied = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
  if (!supplied || supplied.length > 4096) return null;
  let grants = [];
  try {
    const parsed = JSON.parse(process.env.ZONE_ADMIN_TOKENS_JSON || '[]');
    if (Array.isArray(parsed)) grants = parsed.filter(value => value && typeof value.id === 'string' && /^[a-z0-9_-]{1,64}$/i.test(value.id) && typeof value.token === 'string' && value.token.length >= 24 && roles.has(value.role));
  } catch { /* Invalid configuration grants no per-staff access. */ }
  let actor = null;
  for (const grant of grants) {
    if (timingSafeEqual(digest(grant.token), digest(supplied))) actor = { id: grant.id, role: grant.role };
  }
  if (actor) return actor;
  const legacy = process.env.ZONE_ADMIN_TOKEN;
  if (legacy && timingSafeEqual(digest(legacy), digest(supplied))) return { id: 'shared-admin-token', role: 'admin' };
  return null;
}

export function adminCapabilities(actor) {
  return { canCreate: actor?.role === 'editor' || actor?.role === 'admin', canReview: actor?.role === 'reviewer' || actor?.role === 'admin', role: actor?.role };
}
