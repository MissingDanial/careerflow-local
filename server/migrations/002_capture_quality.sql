CREATE TABLE IF NOT EXISTS capture_quality (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES capture_batches(id) ON DELETE CASCADE,
  page_count INTEGER NOT NULL,
  received_jobs INTEGER NOT NULL,
  valid_jobs INTEGER NOT NULL,
  stored_jobs INTEGER NOT NULL,
  described_jobs INTEGER NOT NULL,
  description_coverage REAL NOT NULL,
  required_complete_jobs INTEGER NOT NULL,
  required_field_coverage REAL NOT NULL,
  invalid_jobs INTEGER NOT NULL,
  login_required_pages INTEGER NOT NULL,
  captcha_required_pages INTEGER NOT NULL,
  selector_counts_json TEXT NOT NULL DEFAULT '{}',
  missing_fields_json TEXT NOT NULL DEFAULT '{}',
  search_context_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS browser_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER REFERENCES capture_batches(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  page_url TEXT,
  page_title TEXT,
  message TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_capture_quality_batch ON capture_quality(batch_id);
CREATE INDEX IF NOT EXISTS idx_browser_events_batch ON browser_events(batch_id);
CREATE INDEX IF NOT EXISTS idx_browser_events_type ON browser_events(event_type);
