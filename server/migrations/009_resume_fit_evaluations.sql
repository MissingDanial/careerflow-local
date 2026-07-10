CREATE TABLE IF NOT EXISTS resume_fit_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resume_version_id INTEGER NOT NULL REFERENCES resume_versions(id) ON DELETE CASCADE,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  agent_run_id INTEGER REFERENCES agent_runs(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  coverage_score INTEGER NOT NULL,
  fit_level TEXT NOT NULL,
  confidence TEXT NOT NULL,
  requirement_count INTEGER NOT NULL,
  covered_count INTEGER NOT NULL,
  weak_count INTEGER NOT NULL,
  missing_count INTEGER NOT NULL,
  jd_requirements_json TEXT NOT NULL DEFAULT '{}',
  coverage_items_json TEXT NOT NULL DEFAULT '[]',
  blockers_json TEXT NOT NULL DEFAULT '[]',
  recommendations_json TEXT NOT NULL DEFAULT '[]',
  policy_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resume_fit_evaluations_resume_version ON resume_fit_evaluations(resume_version_id);
CREATE INDEX IF NOT EXISTS idx_resume_fit_evaluations_application ON resume_fit_evaluations(application_id);
