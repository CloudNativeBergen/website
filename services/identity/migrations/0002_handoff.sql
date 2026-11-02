-- Login handoff (#1803): the tenant origin a session was handed to (the JWT
-- origin claim), and audit context for handoff rows. Ids only, no emails.
ALTER TABLE session ADD COLUMN origin TEXT;
ALTER TABLE audit_event ADD COLUMN origin TEXT;
ALTER TABLE audit_event ADD COLUMN detail TEXT;
