CREATE TABLE ingestion_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  owner TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  value TEXT NOT NULL DEFAULT '{"version":1,"pages":{},"pending":null}',
  last_run INTEGER,
  last_success INTEGER,
  last_error TEXT
);
INSERT INTO ingestion_state (id) VALUES (1);

CREATE TABLE catalogue_backups (
  digest TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  html TEXT NOT NULL
);
