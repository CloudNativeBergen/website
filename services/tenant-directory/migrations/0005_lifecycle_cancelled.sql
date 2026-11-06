-- conferences.lifecycle gains 'cancelled' (#1997): Sanity's lifecycleStatus
-- override (cancelled | archived) moves here losslessly. SQLite cannot alter
-- a CHECK, so the table is rebuilt (create, copy, drop, rename). Dropping a
-- parent that still has domains rows counts as an FK violation even when the
-- rows are back by commit, so domains is parked in a scratch table and
-- restored after. domains_park is NOT dropped first: if a half-applied run
-- ever left it behind, it may be the only copy of every hostname, so a
-- rerun fails on CREATE instead of destroying it. Down path: docs in the PR (#1997), the same rebuild with the
-- old CHECK after UPDATE ... SET lifecycle = 'archived' WHERE lifecycle = 'cancelled'.
PRAGMA defer_foreign_keys = true;
DROP TABLE IF EXISTS conferences_new;
CREATE TABLE domains_park AS SELECT * FROM domains;
DELETE FROM domains;
CREATE TABLE conferences_new (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  lifecycle TEXT NOT NULL DEFAULT 'draft' CHECK (lifecycle IN ('draft', 'live', 'cancelled', 'archived')),
  api_read INTEGER NOT NULL DEFAULT 0 CHECK (api_read IN (0, 1)),
  identity_login INTEGER NOT NULL DEFAULT 0 CHECK (identity_login IN (0, 1)),
  d1_write INTEGER NOT NULL DEFAULT 0 CHECK (d1_write IN (0, 1)),
  d1_override INTEGER NOT NULL DEFAULT 0 CHECK (d1_override IN (0, 1)),
  UNIQUE (org_id, slug)
);
INSERT INTO conferences_new (id, org_id, slug, name, lifecycle, api_read, identity_login, d1_write, d1_override)
  SELECT id, org_id, slug, name, lifecycle, api_read, identity_login, d1_write, d1_override FROM conferences;
DROP TABLE conferences;
ALTER TABLE conferences_new RENAME TO conferences;
INSERT INTO domains SELECT * FROM domains_park;
DROP TABLE domains_park;
