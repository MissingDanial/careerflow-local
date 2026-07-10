CREATE TABLE IF NOT EXISTS resume_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  screening_id INTEGER REFERENCES screenings(id) ON DELETE SET NULL,
  agent_run_id INTEGER REFERENCES agent_runs(id) ON DELETE SET NULL,
  version_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  resume_fields_json TEXT NOT NULL DEFAULT '{}',
  source_mapping_json TEXT NOT NULL DEFAULT '[]',
  diff_summary_json TEXT NOT NULL DEFAULT '[]',
  compression_notes_json TEXT NOT NULL DEFAULT '[]',
  unsupported_claims_json TEXT NOT NULL DEFAULT '[]',
  render_metadata_json TEXT NOT NULL DEFAULT '{}',
  file_path TEXT,
  file_format TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resume_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resume_version_id INTEGER NOT NULL REFERENCES resume_versions(id) ON DELETE CASCADE,
  agent_run_id INTEGER REFERENCES agent_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  truthfulness_passed INTEGER NOT NULL DEFAULT 0,
  format_passed INTEGER NOT NULL DEFAULT 0,
  page_limit_passed INTEGER NOT NULL DEFAULT 0,
  unsupported_claims_json TEXT NOT NULL DEFAULT '[]',
  source_issues_json TEXT NOT NULL DEFAULT '[]',
  exaggeration_risk TEXT NOT NULL,
  job_fit_review TEXT NOT NULL,
  risk_score_adjustment INTEGER NOT NULL DEFAULT 0,
  recommendation TEXT NOT NULL,
  requires_user_confirmation INTEGER NOT NULL DEFAULT 0,
  render_metadata_json TEXT NOT NULL DEFAULT '{}',
  risk_flags_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  recruiter_name TEXT,
  conversation_url TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  resume_version_id INTEGER REFERENCES resume_versions(id) ON DELETE SET NULL,
  agent_run_id INTEGER REFERENCES agent_runs(id) ON DELETE SET NULL,
  direction TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  message_text TEXT NOT NULL,
  provider TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resume_versions_application ON resume_versions(application_id);
CREATE INDEX IF NOT EXISTS idx_resume_versions_screening ON resume_versions(screening_id);
CREATE INDEX IF NOT EXISTS idx_resume_audits_resume_version ON resume_audits(resume_version_id);
CREATE INDEX IF NOT EXISTS idx_conversations_application ON conversations(application_id);
CREATE INDEX IF NOT EXISTS idx_messages_application ON messages(application_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
