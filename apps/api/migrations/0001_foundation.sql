-- 0001_foundation.sql
-- Phase 01 schema: identity, sessions, audit, budget guard rails, notifications.
-- Customer/store tables arrive in Phase 02 so nothing exists before it is used.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'operator', 'viewer')),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  password_algo TEXT NOT NULL,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disabled_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS system_settings (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (scope, key)
);

-- Owner budget ceiling. scope_id is a sentinel ('global') instead of NULL so the
-- unique constraint actually deduplicates (SQLite treats NULLs as distinct).
CREATE TABLE IF NOT EXISTS budget_limits (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL DEFAULT 'global',
  period TEXT NOT NULL CHECK (period IN ('monthly', 'daily')),
  category TEXT NOT NULL CHECK (category IN ('ai', 'infrastructure', 'total')),
  limit_usd_cents INTEGER NOT NULL CHECK (limit_usd_cents >= 0),
  hard_stop INTEGER NOT NULL DEFAULT 1 CHECK (hard_stop IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (scope_id, period, category)
);

-- Metering table for AI (and later infrastructure) spend. Empty until Phase 03
-- starts calling Gemini; the dashboard reads real sums from it.
CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY,
  store_id TEXT,
  agent_id TEXT,
  provider TEXT NOT NULL,
  model TEXT,
  task_id TEXT,
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count >= 0),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cost_usd_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_usd_cents >= 0),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_occurred ON usage_records (occurred_at);
CREATE INDEX IF NOT EXISTS idx_usage_agent ON usage_records (agent_id, occurred_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('owner', 'system', 'agent', 'webhook')),
  actor_id TEXT,
  store_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'denied')),
  metadata TEXT,
  ip TEXT,
  request_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_store ON audit_logs (store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_expires ON rate_limit_buckets (expires_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  store_id TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  body TEXT,
  source TEXT NOT NULL,
  dedupe_key TEXT UNIQUE,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC);

-- Seed the $5 ceiling. The guard in packages/core clamps anything above this.
INSERT OR IGNORE INTO budget_limits (id, scope_id, period, category, limit_usd_cents, hard_stop, created_at, updated_at)
VALUES
  ('bl_global_monthly_ai', 'global', 'monthly', 'ai', 500, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('bl_global_daily_ai', 'global', 'daily', 'ai', 50, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO system_settings (scope, key, value, updated_at)
VALUES ('global', 'budget.warning_threshold_pct', '80', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO system_settings (scope, key, value, updated_at)
VALUES ('global', 'app.installed_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT OR IGNORE INTO schema_migrations (version, applied_at)
VALUES ('0001_foundation', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
