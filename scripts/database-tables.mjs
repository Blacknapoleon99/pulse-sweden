// Explicit allowlist: Supabase platform tables and extensions are never exported.
export const appTables = new Set(`family_users family_groups family_sessions family_invites family_zones family_positions family_position_history family_zone_state family_alerts family_push family_messages family_alarms family_alarm_recipients family_child_items public_zones public_zone_audit bankid_accounts bankid_orders admin_map_items admin_map_item_audit schema_migrations community_profiles community_reports community_comments community_blocks community_flags community_activity community_audit account_actions native_push_devices notification_outbox media_cleanup operation_alerts source_health`.split(' '));
export const quote = value => '"' + value.replaceAll('"', '""') + '"';
export function tlsDatabaseUrl(value) {
  const url = new URL(value);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}
export async function listAppTables(pool) {
  const tables = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row => row.tablename).filter(name => appTables.has(name));
  if (!tables.length) throw new Error('No recognised application tables found. Refusing an empty export.');
  return tables;
}
