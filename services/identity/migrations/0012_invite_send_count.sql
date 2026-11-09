-- #2136: invitation emails sent per org per UTC day, for the daily send cap
-- (sends and resends). Additive. Old days are never read again; a row is a
-- few bytes per org per day.
CREATE TABLE invite_send_count (
  org_id TEXT NOT NULL,
  day TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (org_id, day)
);
