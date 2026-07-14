CREATE TABLE IF NOT EXISTS application_queues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  search_url TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_application_queues_default
ON application_queues(is_default)
WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS application_queue_items (
  queue_id INTEGER NOT NULL REFERENCES application_queues(id) ON DELETE CASCADE,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(state IN ('ACTIVE', 'REMOVED')),
  added_at TEXT NOT NULL,
  removed_at TEXT,
  removed_by TEXT NOT NULL DEFAULT '',
  removed_reason TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (queue_id, application_id)
);

CREATE INDEX IF NOT EXISTS idx_application_queue_items_active
ON application_queue_items(queue_id, state, application_id);

CREATE INDEX IF NOT EXISTS idx_application_queue_items_application
ON application_queue_items(application_id, state, queue_id);

INSERT INTO application_queues (
  name, description, search_url, is_default, created_at, updated_at
)
SELECT
  '默认队列', '历史岗位和未指定求职方向的采集结果', '', 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (
  SELECT 1 FROM application_queues WHERE is_default = 1
);

INSERT OR IGNORE INTO application_queue_items (
  queue_id, application_id, state, added_at, removed_at,
  removed_by, removed_reason, updated_at
)
SELECT
  (SELECT id FROM application_queues WHERE is_default = 1 LIMIT 1),
  applications.id,
  'ACTIVE',
  applications.created_at,
  NULL,
  '',
  '',
  applications.updated_at
FROM applications;
