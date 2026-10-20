ALTER TABLE family_users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
CREATE TABLE IF NOT EXISTS community_profiles (
  user_id text PRIMARY KEY REFERENCES family_users(id) ON DELETE CASCADE,
  author_key text UNIQUE NOT NULL, alias text NOT NULL,
  age_attested_at timestamptz, rules_version text, accepted_at timestamptz,
  suspended boolean NOT NULL DEFAULT false, suspended_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS community_reports (
  id text PRIMARY KEY, author_id text NOT NULL REFERENCES community_profiles(user_id) ON DELETE CASCADE,
  request_id text NOT NULL, fingerprint text NOT NULL,
  category text NOT NULL CHECK(category IN ('traffic','disturbance','hazard','other')),
  title text NOT NULL, body text NOT NULL, lat double precision NOT NULL, lon double precision NOT NULL,
  observed_at timestamptz NOT NULL, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','resolved','removed')),
  photo_key text, photo_status text NOT NULL DEFAULT 'none' CHECK(photo_status IN ('none','pending','approved','rejected')),
  photo_reason text, photo_hash text, photo_uploaded_at timestamptz,
  UNIQUE(author_id,request_id)
);
CREATE INDEX IF NOT EXISTS community_reports_active ON community_reports(status,expires_at,created_at);
CREATE TABLE IF NOT EXISTS community_comments (
  id text PRIMARY KEY, report_id text NOT NULL REFERENCES community_reports(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES community_profiles(user_id) ON DELETE CASCADE,
  parent_id text REFERENCES community_comments(id) ON DELETE CASCADE,
  request_id text NOT NULL, fingerprint text NOT NULL, body text NOT NULL,
  removed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL,
  UNIQUE(author_id,request_id)
);
CREATE INDEX IF NOT EXISTS community_comments_report ON community_comments(report_id,created_at);
CREATE TABLE IF NOT EXISTS community_blocks (
  user_id text NOT NULL REFERENCES community_profiles(user_id) ON DELETE CASCADE,
  blocked_id text NOT NULL REFERENCES community_profiles(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,blocked_id)
);
CREATE TABLE IF NOT EXISTS community_flags (
  id text PRIMARY KEY, reporter_id text NOT NULL REFERENCES community_profiles(user_id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK(target_type IN ('report','comment','photo','author')),
  target_id text NOT NULL, reason text NOT NULL, status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL, UNIQUE(reporter_id,target_type,target_id)
);
CREATE TABLE IF NOT EXISTS community_activity (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES community_profiles(user_id) ON DELETE CASCADE,
  kind text NOT NULL, created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS community_activity_user ON community_activity(user_id,kind,created_at);
CREATE TABLE IF NOT EXISTS community_audit (
  id text PRIMARY KEY, actor text NOT NULL, action text NOT NULL, target_id text NOT NULL,
  reason text NOT NULL, created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS account_actions (
  token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES family_users(id) ON DELETE CASCADE,
  kind text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz
);
CREATE TABLE IF NOT EXISTS native_push_devices (
  token text PRIMARY KEY, user_id text NOT NULL REFERENCES family_users(id) ON DELETE CASCADE,
  alarms boolean NOT NULL DEFAULT false, replies boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notification_outbox (
  id text PRIMARY KEY, recipient_id text NOT NULL REFERENCES family_users(id) ON DELETE CASCADE,
  event_id text NOT NULL, kind text NOT NULL, payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued', attempts integer NOT NULL DEFAULT 0,
  ticket_id text, error_code text, created_at timestamptz NOT NULL, next_attempt_at timestamptz NOT NULL,
  UNIQUE(recipient_id,event_id,kind)
);
CREATE TABLE IF NOT EXISTS media_cleanup (
  object_key text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS operation_alerts (
  alert_key text PRIMARY KEY, last_sent_at timestamptz NOT NULL
);
