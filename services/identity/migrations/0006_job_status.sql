CREATE TABLE job_status (
  job TEXT PRIMARY KEY,
  ran_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'drift', 'unknown', 'failed')),
  checked INTEGER,
  affected INTEGER,
  granted INTEGER,
  detail TEXT
);
