import { randomUUID } from 'node:crypto';

// Route geometry stays only in bounded process memory so periodic source
// refreshes can reuse it without sending another request to the router.
export function createRouteCache({ maxEntries = 120, ttlMs = 2 * 60 * 60 * 1000, now = Date.now, idFactory = randomUUID } = {}) {
  const entries = new Map();

  function pruneExpired() {
    const currentTime = now();
    for (const [id, entry] of entries) {
      if (entry.expiresAt <= currentTime) entries.delete(id);
    }
  }

  return {
    put(route) {
      pruneExpired();
      const id = idFactory();
      entries.delete(id);
      entries.set(id, { route, expiresAt: now() + ttlMs });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
      return id;
    },
    get(id) {
      const entry = entries.get(id);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        entries.delete(id);
        return null;
      }
      // An actively followed route stays available; an idle route expires.
      entries.delete(id);
      entry.expiresAt = now() + ttlMs;
      entries.set(id, entry);
      return entry.route;
    },
    delete(id) { return entries.delete(id); }
  };
}
