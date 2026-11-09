-- Event-id idempotency (epic #2215). A platform table: the row is a claim
-- that the event was handled, written once and never read back for content.
CREATE TABLE sent_event (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  org_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
