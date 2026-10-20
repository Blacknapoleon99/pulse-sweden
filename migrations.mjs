import { readFile, readdir } from 'node:fs/promises';
export async function migrate(pool) {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // The table lock serializes migrations across processes without driver-specific advisory locks.
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    // pg-mem has no table locks; production PostgreSQL does.
    if (!pool.__memory) await client.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
    const applied = new Set((await client.query('SELECT version FROM schema_migrations')).rows.map(row => row.version));
    for (const version of (await readdir(new URL('./migrations/', import.meta.url))).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      if (applied.has(version)) continue;
      const sql = await readFile(new URL(`./migrations/${version}`, import.meta.url), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [version]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
