-- #1949: member_drift_alert rows go with their organization. SQLite cannot
-- add a foreign key in place, so the table is rebuilt with the same columns;
-- rows of organizations that no longer exist are dropped on the way.
CREATE TABLE member_drift_alert_new (
  organizationId TEXT PRIMARY KEY NOT NULL
    REFERENCES organization (id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  postedAt INTEGER NOT NULL
);
INSERT INTO member_drift_alert_new (organizationId, hash, postedAt)
  SELECT organizationId, hash, postedAt FROM member_drift_alert
  WHERE organizationId IN (SELECT id FROM organization);
DROP TABLE member_drift_alert;
ALTER TABLE member_drift_alert_new RENAME TO member_drift_alert;
