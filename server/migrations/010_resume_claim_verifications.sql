CREATE TABLE IF NOT EXISTS resume_claim_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resume_version_id INTEGER NOT NULL REFERENCES resume_versions(id) ON DELETE CASCADE,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  agent_run_id INTEGER REFERENCES agent_runs(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  total_claims INTEGER NOT NULL,
  supported_count INTEGER NOT NULL,
  weak_count INTEGER NOT NULL,
  unsupported_count INTEGER NOT NULL,
  needs_user_confirmation_count INTEGER NOT NULL,
  truthfulness_passed INTEGER NOT NULL DEFAULT 0,
  coverage_ratio REAL NOT NULL DEFAULT 0,
  claims_json TEXT NOT NULL DEFAULT '[]',
  unsupported_claims_json TEXT NOT NULL DEFAULT '[]',
  needs_user_confirmation_json TEXT NOT NULL DEFAULT '[]',
  recommendations_json TEXT NOT NULL DEFAULT '[]',
  policy_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resume_claim_verifications_resume_version ON resume_claim_verifications(resume_version_id);
CREATE INDEX IF NOT EXISTS idx_resume_claim_verifications_application ON resume_claim_verifications(application_id);
