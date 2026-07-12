CREATE TABLE IF NOT EXISTS profile_dialog_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  open_questions_json TEXT NOT NULL DEFAULT '[]',
  conflicts_json TEXT NOT NULL DEFAULT '[]',
  model_config_json TEXT NOT NULL DEFAULT '{}',
  last_message_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_dialog_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES profile_dialog_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  content TEXT NOT NULL,
  structured_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  retry_of_message_id INTEGER REFERENCES profile_dialog_messages(id) ON DELETE SET NULL,
  agent_run_id INTEGER REFERENCES agent_runs(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_context_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  source_session_id INTEGER REFERENCES profile_dialog_sessions(id) ON DELETE SET NULL,
  source_message_id INTEGER REFERENCES profile_dialog_messages(id) ON DELETE SET NULL,
  profile_hash TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  structured_json TEXT NOT NULL,
  markdown TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_entity_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  operation TEXT NOT NULL,
  source_draft_id INTEGER REFERENCES profile_fact_drafts(id) ON DELETE SET NULL,
  before_json TEXT NOT NULL DEFAULT 'null',
  after_json TEXT NOT NULL DEFAULT 'null',
  created_at TEXT NOT NULL
);

ALTER TABLE profile_fact_drafts ADD COLUMN operation TEXT NOT NULL DEFAULT 'CREATE';
ALTER TABLE profile_fact_drafts ADD COLUMN target_entity_type TEXT;
ALTER TABLE profile_fact_drafts ADD COLUMN target_entity_id INTEGER;
ALTER TABLE profile_fact_drafts ADD COLUMN source_session_id INTEGER REFERENCES profile_dialog_sessions(id) ON DELETE SET NULL;
ALTER TABLE profile_fact_drafts ADD COLUMN source_message_id INTEGER REFERENCES profile_dialog_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profile_dialog_sessions_profile ON profile_dialog_sessions(profile_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_dialog_messages_session ON profile_dialog_messages(session_id, id);
CREATE INDEX IF NOT EXISTS idx_profile_dialog_messages_status ON profile_dialog_messages(status, id);
CREATE INDEX IF NOT EXISTS idx_profile_context_versions_profile ON profile_context_versions(profile_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_profile_context_versions_hash ON profile_context_versions(content_hash);
CREATE INDEX IF NOT EXISTS idx_profile_entity_revisions_entity ON profile_entity_revisions(entity_type, entity_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_profile_entity_revisions_draft ON profile_entity_revisions(source_draft_id);
CREATE INDEX IF NOT EXISTS idx_profile_fact_drafts_session ON profile_fact_drafts(source_session_id, status);
CREATE INDEX IF NOT EXISTS idx_profile_fact_drafts_message ON profile_fact_drafts(source_message_id);
