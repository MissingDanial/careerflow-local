CREATE TABLE IF NOT EXISTS capture_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  exported_at TEXT,
  received_at TEXT NOT NULL,
  received_jobs INTEGER NOT NULL,
  page_count INTEGER NOT NULL,
  stats_json TEXT NOT NULL DEFAULT '{}',
  pages_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL UNIQUE,
  job_id TEXT,
  title TEXT,
  salary TEXT,
  company_id INTEGER REFERENCES companies(id),
  company_name TEXT,
  location TEXT,
  experience TEXT,
  education TEXT,
  recruiter TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  welfare_json TEXT NOT NULL DEFAULT '[]',
  description TEXT,
  detail_url TEXT,
  source_url TEXT,
  page_title TEXT,
  raw_text TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  captured_at TEXT,
  sync_source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  batch_id INTEGER REFERENCES capture_batches(id) ON DELETE SET NULL,
  source_key TEXT NOT NULL,
  title TEXT,
  company_name TEXT,
  detail_url TEXT,
  description_length INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  captured_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_tags (
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (job_id, tag)
);

CREATE TABLE IF NOT EXISTS job_welfare (
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  welfare TEXT NOT NULL,
  PRIMARY KEY (job_id, welfare)
);

CREATE INDEX IF NOT EXISTS idx_jobs_job_id ON jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_detail_url ON jobs(detail_url);
CREATE INDEX IF NOT EXISTS idx_jobs_last_seen ON jobs(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_job_snapshots_job ON job_snapshots(job_id);
