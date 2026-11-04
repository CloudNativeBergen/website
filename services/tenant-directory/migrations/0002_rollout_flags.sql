-- Per-conference rollout flags (#1925). They replace the site's
-- KONF_API_TENANTS / KONF_IDENTITY_TENANTS / KONF_D1_WRITE_TENANTS lists and
-- the gateway's OVERRIDE_TENANTS. Default off; only an operator with D1
-- access sets them (no GraphQL mutation writes them).
--   api_read        site reads core conference fields from api.konf.app
--   identity_login  site signs in through identity (id.konf.app)
--   d1_write        admin writes moved conference fields to D1 first
--   d1_override     gateway routes the `conference` @override label to D1
ALTER TABLE conferences ADD COLUMN api_read INTEGER NOT NULL DEFAULT 0 CHECK (api_read IN (0, 1));
ALTER TABLE conferences ADD COLUMN identity_login INTEGER NOT NULL DEFAULT 0 CHECK (identity_login IN (0, 1));
ALTER TABLE conferences ADD COLUMN d1_write INTEGER NOT NULL DEFAULT 0 CHECK (d1_write IN (0, 1));
ALTER TABLE conferences ADD COLUMN d1_override INTEGER NOT NULL DEFAULT 0 CHECK (d1_override IN (0, 1));
