CREATE TABLE IF NOT EXISTS candidate_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT,
  headline TEXT,
  location TEXT,
  target_json TEXT NOT NULL DEFAULT '{}',
  summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resume_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  file_name TEXT,
  file_path TEXT,
  raw_text TEXT NOT NULL,
  parsed_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_experiences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT,
  organization TEXT,
  role TEXT,
  start_date TEXT,
  end_date TEXT,
  facts_json TEXT NOT NULL DEFAULT '[]',
  skills_json TEXT NOT NULL DEFAULT '[]',
  evidence_text TEXT,
  evidence_source TEXT,
  confidence TEXT NOT NULL,
  allowed_rewrites_json TEXT NOT NULL DEFAULT '[]',
  forbidden_claims_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  proficiency TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(profile_id, name)
);

CREATE TABLE IF NOT EXISTS profile_constraints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL,
  content TEXT NOT NULL,
  severity TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_fact_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  resume_source_id INTEGER REFERENCES resume_sources(id) ON DELETE SET NULL,
  draft_type TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT,
  content_json TEXT NOT NULL DEFAULT '{}',
  evidence_text TEXT,
  confidence TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  resolved_entity_type TEXT,
  resolved_entity_id INTEGER,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resume_sources_profile ON resume_sources(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_experiences_profile ON profile_experiences(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_skills_profile ON profile_skills(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_constraints_profile ON profile_constraints(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_fact_drafts_profile ON profile_fact_drafts(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_fact_drafts_resume_source ON profile_fact_drafts(resume_source_id);
CREATE INDEX IF NOT EXISTS idx_profile_fact_drafts_status ON profile_fact_drafts(status);
