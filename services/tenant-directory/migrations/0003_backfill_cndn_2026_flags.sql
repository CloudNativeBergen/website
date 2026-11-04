-- Backfill (#1925): Cloud Native Days Norway 2026 as the Vercel production
-- env lists have it on 2026-11-04 (api read, identity login, D1 dual write).
-- OVERRIDE_TENANTS is {} in api/wrangler.jsonc, so d1_override stays 0.
-- An UPDATE, so an environment without the row (preview) is a no-op.
UPDATE conferences
SET api_read = 1, identity_login = 1, d1_write = 1
WHERE id = 'eb7b16c6-00fa-44a0-adcd-4a480de34242';
