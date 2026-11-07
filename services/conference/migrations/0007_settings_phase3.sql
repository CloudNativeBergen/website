-- Settings phase 3: ticket setup. Additive and nullable: null means unset in
-- Sanity. All 19 fields are columns on conferences, no child tables:
-- - the scalars are 1:1 with the edition;
-- - the four lists (target milestones, ticket type roles, public free ticket
--   ids, early-access types) are a handful of entries each, always read and
--   written whole, and never queried by element, so each is a JSON TEXT
--   column validated by the subgraph, as social_links already is. A child
--   table would add a join and a second idempotency path for no reader;
-- - the reminder state is three scalars, and its rate-limit lock is a
--   conditional UPDATE on a column, which a child table would not simplify.
-- None is a secret: the Tito API token is a tenant secret and stays out of D1.
ALTER TABLE conferences ADD COLUMN ticketing_provider TEXT;
ALTER TABLE conferences ADD COLUMN checkin_customer_id INTEGER;
ALTER TABLE conferences ADD COLUMN checkin_event_id INTEGER;
ALTER TABLE conferences ADD COLUMN tito_account_slug TEXT;
ALTER TABLE conferences ADD COLUMN tito_event_slug TEXT;
ALTER TABLE conferences ADD COLUMN ticket_capacity INTEGER;
ALTER TABLE conferences ADD COLUMN ticket_targets_enabled INTEGER;
ALTER TABLE conferences ADD COLUMN ticket_sales_start_date TEXT;
ALTER TABLE conferences ADD COLUMN ticket_target_curve TEXT;
ALTER TABLE conferences ADD COLUMN ticket_target_milestones TEXT;
ALTER TABLE conferences ADD COLUMN ticket_type_roles TEXT;
ALTER TABLE conferences ADD COLUMN public_free_ticket_ids TEXT;
ALTER TABLE conferences ADD COLUMN workshop_registration_sponsor_start TEXT;
ALTER TABLE conferences ADD COLUMN workshop_registration_start TEXT;
ALTER TABLE conferences ADD COLUMN workshop_registration_end TEXT;
ALTER TABLE conferences ADD COLUMN workshop_early_access_ticket_types TEXT;
ALTER TABLE conferences ADD COLUMN workshop_reminder_last_sent_at TEXT;
ALTER TABLE conferences ADD COLUMN workshop_reminder_last_sent_count INTEGER;
ALTER TABLE conferences ADD COLUMN workshop_reminder_reserved_at TEXT;
