CREATE TABLE IF NOT EXISTS real_action_policies (
  action_type TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  enabled_until TEXT,
  daily_limit INTEGER NOT NULL DEFAULT 1,
  cooldown_seconds INTEGER NOT NULL DEFAULT 300,
  actor TEXT NOT NULL DEFAULT '',
  rationale TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS real_action_authorizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  browser_task_id INTEGER UNIQUE REFERENCES browser_tasks(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  message_hash TEXT NOT NULL,
  target_job_hash TEXT NOT NULL,
  target_page_hash TEXT NOT NULL,
  target_job_id TEXT NOT NULL DEFAULT '',
  target_detail_url TEXT NOT NULL DEFAULT '',
  authorized_by TEXT NOT NULL,
  rationale TEXT NOT NULL,
  quota_day TEXT NOT NULL DEFAULT '',
  queued_at TEXT,
  consumed_at TEXT,
  expires_at TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT 'null',
  error_code TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_real_action_authorizations_application
ON real_action_authorizations(application_id, action_type, status);

CREATE INDEX IF NOT EXISTS idx_real_action_authorizations_quota
ON real_action_authorizations(action_type, quota_day, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_real_action_authorizations_active_action
ON real_action_authorizations(action_type)
WHERE status IN ('ARMED', 'QUEUED');
