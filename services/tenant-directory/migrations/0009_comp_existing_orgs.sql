-- Billing phase 1 (#2129, owner decision 2026-11-08): the existing customer
-- gets its complimentary plan in the same deploy as the plan gates, so the
-- gates never block it. Idempotent: a rerun writes the same values, and an
-- org that is absent (preview, local) matches no row. kkdemo.org is left
-- alone here: 0010 makes it the demo org, which effectivePlan treats as pro
-- (#2150). Gates are tested by unit tests and a free preview test org.
UPDATE organizations
SET plan = 'pro',
    plan_source = 'comp',
    comp_reason = 'existing customer (owner decision 2026-11-08)',
    comp_until = NULL
WHERE id = 'organization-cloud-native-days';
