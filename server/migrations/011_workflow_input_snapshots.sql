CREATE TABLE IF NOT EXISTS profile_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES candidate_profiles(id) ON DELETE RESTRICT,
  content_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  workflow_name TEXT NOT NULL,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  replay_of_workflow_run_id INTEGER REFERENCES workflow_runs(id) ON DELETE SET NULL,
  output_json TEXT NOT NULL DEFAULT 'null',
  error_json TEXT NOT NULL DEFAULT 'null',
  started_at TEXT NOT NULL,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_input_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_run_id INTEGER NOT NULL UNIQUE REFERENCES workflow_runs(id) ON DELETE CASCADE,
  profile_snapshot_id INTEGER NOT NULL REFERENCES profile_snapshots(id) ON DELETE RESTRICT,
  job_snapshot_id INTEGER NOT NULL REFERENCES job_snapshots(id) ON DELETE RESTRICT,
  application_json TEXT NOT NULL,
  user_rules_json TEXT NOT NULL DEFAULT '{}',
  execution_options_json TEXT NOT NULL DEFAULT '{}',
  render_options_json TEXT NOT NULL DEFAULT '{}',
  prompt_version TEXT NOT NULL,
  agent_version TEXT NOT NULL,
  model_config_json TEXT NOT NULL DEFAULT '{}',
  graph_version TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

ALTER TABLE agent_runs ADD COLUMN workflow_run_id INTEGER REFERENCES workflow_runs(id) ON DELETE SET NULL;
ALTER TABLE agent_runs ADD COLUMN profile_snapshot_id INTEGER REFERENCES profile_snapshots(id) ON DELETE SET NULL;
ALTER TABLE agent_runs ADD COLUMN job_snapshot_id INTEGER REFERENCES job_snapshots(id) ON DELETE SET NULL;
ALTER TABLE agent_runs ADD COLUMN prompt_version TEXT NOT NULL DEFAULT '';
ALTER TABLE agent_runs ADD COLUMN agent_version TEXT NOT NULL DEFAULT '';
ALTER TABLE agent_runs ADD COLUMN model_config_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE agent_runs ADD COLUMN graph_version TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_profile_snapshots_profile ON profile_snapshots(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_snapshots_hash ON profile_snapshots(content_hash);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_application ON workflow_runs(application_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_replay ON workflow_runs(replay_of_workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_input_profile ON workflow_input_snapshots(profile_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_workflow_input_job ON workflow_input_snapshots(job_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_workflow_input_hash ON workflow_input_snapshots(input_hash);
CREATE INDEX IF NOT EXISTS idx_agent_runs_workflow_run ON agent_runs(workflow_run_id);
