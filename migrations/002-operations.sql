CREATE TABLE IF NOT EXISTS source_health (
  source_id text PRIMARY KEY, status text NOT NULL, fetched_at timestamptz,
  checked_at timestamptz NOT NULL, failure_since timestamptz
);
ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS delivery_errors integer NOT NULL DEFAULT 0;
