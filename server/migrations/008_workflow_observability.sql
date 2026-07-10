CREATE TABLE IF NOT EXISTS workflow_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id INTEGER,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT,
  progress_current INTEGER,
  progress_total INTEGER,
  message TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  resolution_status TEXT NOT NULL DEFAULT 'OPEN',
  resolution_note TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_events_application ON workflow_events(application_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_source ON workflow_events(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_resolution ON workflow_events(resolution_status, severity);
