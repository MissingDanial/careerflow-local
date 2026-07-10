ALTER TABLE application_events ADD COLUMN idempotency_key TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_application_events_idempotency
ON application_events(application_id, idempotency_key)
WHERE idempotency_key != '';

ALTER TABLE browser_tasks ADD COLUMN expires_at TEXT;
ALTER TABLE browser_tasks ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE browser_tasks ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3;
ALTER TABLE browser_tasks ADD COLUMN last_attempt_at TEXT;
ALTER TABLE browser_tasks ADD COLUMN claim_token TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_browser_tasks_expiry
ON browser_tasks(status, expires_at);
