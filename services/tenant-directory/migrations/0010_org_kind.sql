-- Org kind (#2150): `customer` or `demo`. Additive. A demo org is Pro without
-- billing (tenancy's effectivePlan), never billed, mails only its own members
-- and is kept out of indexing and operator totals. Triggers hold the
-- vocabulary, as 0008 does for `plan`, so later values need no table rebuild.
ALTER TABLE organizations ADD COLUMN kind TEXT NOT NULL DEFAULT 'customer';

CREATE TRIGGER organizations_kind_insert BEFORE INSERT ON organizations
  WHEN NEW.kind NOT IN ('customer', 'demo')
  BEGIN SELECT RAISE(ABORT, 'organizations.kind must be customer or demo'); END;
CREATE TRIGGER organizations_kind_update BEFORE UPDATE OF kind ON organizations
  WHEN NEW.kind NOT IN ('customer', 'demo')
  BEGIN SELECT RAISE(ABORT, 'organizations.kind must be customer or demo'); END;

-- KontainerKonf is the demo tenant (owner decision 2026-11-08). Idempotent;
-- matches no row where the org is absent (preview, local).
UPDATE organizations SET kind = 'demo' WHERE id = 'kkdemo.org';
