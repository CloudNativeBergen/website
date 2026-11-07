-- #1957: remember the conference a provisioning key was used for, so a replay
-- naming another conference of the same organization is a CONFLICT, not a
-- no-op. Nullable: rows from before this migration keep the org-only check.
ALTER TABLE provisioning_requests ADD COLUMN conference_id TEXT;
