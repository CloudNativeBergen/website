-- Drift alert dedupe (#1923 PR 2). One row per org in drift mode: the hash of
-- the last drift set posted to Slack and when. Ids only, never emails.
CREATE TABLE member_drift_alert (
  organizationId TEXT PRIMARY KEY NOT NULL,
  hash TEXT NOT NULL,
  postedAt INTEGER NOT NULL
);
