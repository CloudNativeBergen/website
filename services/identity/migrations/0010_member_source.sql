-- #2101 (authz phase 1b): orgs whose roles identity owns. A row stops the
-- Sanity -> identity grant for the org (drift check only) and makes the site
-- read its organizers from identity. Written only by the operator mutation
-- setMemberSource, which refuses unless the latest member sync was clean for
-- the org. Deleting the row is the rollback.
CREATE TABLE member_source (
  organizationId TEXT PRIMARY KEY NOT NULL
    REFERENCES organization (id) ON DELETE CASCADE,
  switchedAt INTEGER NOT NULL,
  switchedBy TEXT NOT NULL
);
