ALTER TABLE agent_runs ADD COLUMN model_telemetry_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS agent_evaluation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluation_type TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  dataset_hash TEXT NOT NULL,
  model_config_json TEXT NOT NULL DEFAULT '{}',
  sample_count INTEGER NOT NULL DEFAULT 0,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  telemetry_json TEXT NOT NULL DEFAULT '{}',
  report_json_path TEXT,
  report_markdown_path TEXT,
  error_code TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_evaluation_runs_status ON agent_evaluation_runs(status, id DESC);
CREATE INDEX IF NOT EXISTS idx_agent_evaluation_runs_dataset ON agent_evaluation_runs(dataset_hash, mode, id DESC);
