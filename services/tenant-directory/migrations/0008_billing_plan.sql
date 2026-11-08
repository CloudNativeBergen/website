-- Billing phase 1 (#2129): plan state on organizations. Additive only.
-- `plan` exists since 0001 without a CHECK; SQLite cannot add one to an
-- existing column without a rebuild, so triggers hold the vocabulary on
-- every write instead. Existing rows keep plan 'free', plan_source 'default'.
ALTER TABLE organizations ADD COLUMN plan_source TEXT NOT NULL DEFAULT 'default'
  CHECK (plan_source IN ('stripe', 'comp', 'default'));
ALTER TABLE organizations ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE organizations ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE organizations ADD COLUMN subscription_status TEXT
  CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'incomplete'));
-- ISO 8601 timestamps.
ALTER TABLE organizations ADD COLUMN current_period_end TEXT;
ALTER TABLE organizations ADD COLUMN comp_until TEXT;
ALTER TABLE organizations ADD COLUMN comp_reason TEXT;

CREATE TRIGGER organizations_plan_insert BEFORE INSERT ON organizations
  WHEN NEW.plan NOT IN ('free', 'basic', 'pro')
  BEGIN SELECT RAISE(ABORT, 'organizations.plan must be free, basic or pro'); END;
CREATE TRIGGER organizations_plan_update BEFORE UPDATE OF plan ON organizations
  WHEN NEW.plan NOT IN ('free', 'basic', 'pro')
  BEGIN SELECT RAISE(ABORT, 'organizations.plan must be free, basic or pro'); END;
