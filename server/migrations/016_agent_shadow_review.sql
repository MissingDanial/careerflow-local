CREATE TABLE IF NOT EXISTS agent_shadow_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  profile_snapshot_id INTEGER NOT NULL REFERENCES profile_snapshots(id) ON DELETE RESTRICT,
  dataset_hash TEXT NOT NULL,
  model_config_json TEXT NOT NULL DEFAULT '{}',
  options_json TEXT NOT NULL DEFAULT '{}',
  selected_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  model_invocation_count INTEGER NOT NULL DEFAULT 0,
  telemetry_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_shadow_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shadow_run_id INTEGER NOT NULL REFERENCES agent_shadow_runs(id) ON DELETE CASCADE,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  job_snapshot_id INTEGER NOT NULL REFERENCES job_snapshots(id) ON DELETE RESTRICT,
  status TEXT NOT NULL,
  rank INTEGER,
  sample_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  average_match_score REAL,
  screening_score_stddev REAL,
  max_risk_score REAL,
  recommendation TEXT NOT NULL DEFAULT '',
  result_json TEXT NOT NULL DEFAULT '{}',
  telemetry_json TEXT NOT NULL DEFAULT '{}',
  error_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(shadow_run_id, application_id)
);

CREATE TABLE IF NOT EXISTS agent_shadow_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shadow_item_id INTEGER NOT NULL REFERENCES agent_shadow_items(id) ON DELETE CASCADE,
  sample_index INTEGER NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  result_json TEXT NOT NULL DEFAULT '{}',
  telemetry_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(shadow_item_id, sample_index)
);

CREATE TABLE IF NOT EXISTS agent_shadow_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shadow_item_id INTEGER NOT NULL REFERENCES agent_shadow_items(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  corrected_recommendation TEXT NOT NULL DEFAULT '',
  reviewer TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_shadow_runs_status
ON agent_shadow_runs(status, id DESC);

CREATE INDEX IF NOT EXISTS idx_agent_shadow_items_run_rank
ON agent_shadow_items(shadow_run_id, rank, id);

CREATE INDEX IF NOT EXISTS idx_agent_shadow_samples_item
ON agent_shadow_samples(shadow_item_id, sample_index);

CREATE INDEX IF NOT EXISTS idx_agent_shadow_reviews_item
ON agent_shadow_reviews(shadow_item_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_agent_shadow_reviews_label
ON agent_shadow_reviews(label, id DESC);
