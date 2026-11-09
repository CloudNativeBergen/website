-- Dedupe per (org_id, id), not id alone (#2222): one org must not be able to
-- claim another org's event id. SQLite cannot change a primary key in place,
-- so this is copy-and-rename: every existing row is kept.
CREATE TABLE sent_event_new (
  id TEXT NOT NULL,
  type TEXT NOT NULL,
  org_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (org_id, id)
);
INSERT INTO sent_event_new (id, type, org_id, created_at)
  SELECT id, type, org_id, created_at FROM sent_event;
DROP TABLE sent_event;
ALTER TABLE sent_event_new RENAME TO sent_event;
