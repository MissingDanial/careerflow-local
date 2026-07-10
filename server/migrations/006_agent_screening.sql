CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT,
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT NOT NULL DEFAULT 'null',
  error_code TEXT,
  error_message TEXT,
  fallback_used INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS screenings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  agent_run_id INTEGER REFERENCES agent_runs(id) ON DELETE SET NULL,
  match_score INTEGER NOT NULL,
  risk_score INTEGER NOT NULL,
  recommendation TEXT NOT NULL,
  hard_conditions_json TEXT NOT NULL DEFAULT '[]',
  matched_points_json TEXT NOT NULL DEFAULT '[]',
  risk_points_json TEXT NOT NULL DEFAULT '[]',
  resume_strategy_json TEXT NOT NULL DEFAULT '[]',
  requires_user_confirmation INTEGER NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL,
  provider TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_application ON agent_runs(application_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_name);
CREATE INDEX IF NOT EXISTS idx_screenings_application ON screenings(application_id);
