-- Settings phase 1 (#2019): group-B scalars from docs/CONFERENCE_FIELDS.md.
-- Additive and nullable: null means unset in Sanity. Dates are YYYY-MM-DD.
-- lifecycleStatus is not here: tenant-directory owns it (#2015).
ALTER TABLE conferences ADD COLUMN cfp_start_date TEXT;
ALTER TABLE conferences ADD COLUMN cfp_end_date TEXT;
ALTER TABLE conferences ADD COLUMN cfp_notify_date TEXT;
ALTER TABLE conferences ADD COLUMN program_date TEXT;
ALTER TABLE conferences ADD COLUMN travel_support_payment_date TEXT;
ALTER TABLE conferences ADD COLUMN early_bird_end_date TEXT;
ALTER TABLE conferences ADD COLUMN registration_close_date TEXT;
ALTER TABLE conferences ADD COLUMN speakers_announced_date TEXT;
ALTER TABLE conferences ADD COLUMN sponsor_deadline_date TEXT;
ALTER TABLE conferences ADD COLUMN recordings_live_date TEXT;
ALTER TABLE conferences ADD COLUMN travel_support_budget REAL;
ALTER TABLE conferences ADD COLUMN registration_enabled INTEGER CHECK (registration_enabled IN (0, 1));
ALTER TABLE conferences ADD COLUMN organizer_name TEXT;
ALTER TABLE conferences ADD COLUMN organizer_address TEXT;
ALTER TABLE conferences ADD COLUMN organizer_org_number TEXT;
ALTER TABLE conferences ADD COLUMN social_hashtag TEXT;
ALTER TABLE conferences ADD COLUMN show_vanity_metrics INTEGER CHECK (show_vanity_metrics IN (0, 1));
ALTER TABLE conferences ADD COLUMN analytics_pirsch_code TEXT;
