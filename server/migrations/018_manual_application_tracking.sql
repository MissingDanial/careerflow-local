ALTER TABLE applications
ADD COLUMN manual_status TEXT NOT NULL DEFAULT 'NOT_CONTACTED'
CHECK(manual_status IN ('NOT_CONTACTED', 'GREETED', 'APPLIED'));

ALTER TABLE applications
ADD COLUMN manual_status_updated_at TEXT;

ALTER TABLE applications
ADD COLUMN manual_status_note TEXT NOT NULL DEFAULT '';

ALTER TABLE application_queue_items
ADD COLUMN trusted_at TEXT;

ALTER TABLE application_queue_items
ADD COLUMN trusted_by TEXT NOT NULL DEFAULT '';

ALTER TABLE application_queue_items
ADD COLUMN trust_reason TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_applications_manual_status
ON applications(manual_status, manual_status_updated_at);

CREATE INDEX IF NOT EXISTS idx_application_queue_items_trusted
ON application_queue_items(queue_id, state, trusted_at, application_id);
