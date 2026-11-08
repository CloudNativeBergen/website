-- Public "Request an invite" form on konf.app (#2161). Additive only.
-- PII (name, email, message): deleted 12 months after resolved_at, or after
-- created_at while unresolved, by the tenant-directory cron (03:00 UTC).
CREATE TABLE invite_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- Lowercased and trimmed.
  email TEXT NOT NULL,
  conference TEXT NOT NULL,
  size TEXT NOT NULL,
  ticketed INTEGER NOT NULL CHECK (ticketed IN (0, 1)),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'invited', 'declined', 'spam')),
  -- ISO 8601.
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  code_id TEXT REFERENCES signup_codes (id)
);
-- One open request per email: a repeat is dropped silently (same answer).
CREATE UNIQUE INDEX invite_requests_open_email
  ON invite_requests (email) WHERE status = 'new';
