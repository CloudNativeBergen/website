-- Local dev fixture (mise run dev:api). Never applied remotely.
INSERT OR IGNORE INTO organizations (id, slug, name, status, plan, created_at) VALUES
  ('org-dev-cndn', 'cndn-dev', 'Cloud Native Days (dev)', 'active', 'free', '2026-01-01'),
  ('org-dev-kk', 'kk-dev', 'KontainerKonf (dev)', 'active', 'free', '2026-01-01');
INSERT OR IGNORE INTO conferences (id, org_id, slug, name, lifecycle, api_read, identity_login, d1_write, d1_override) VALUES
  ('conf-dev-cndn-2026', 'org-dev-cndn', '2026', 'Cloud Native Days 2026 (dev)', 'live', 1, 1, 1, 1),
  ('conf-dev-kk-2026', 'org-dev-kk', '2026', 'KontainerKonf 2026 (dev)', 'draft', 0, 0, 0, 0);
INSERT OR IGNORE INTO domains (hostname, org_id, conference_id, kind, verification) VALUES
  ('cndn.konf.localhost', 'org-dev-cndn', 'conf-dev-cndn-2026', 'platform-edition', 'verified'),
  ('kk.konf.localhost', 'org-dev-kk', 'conf-dev-kk-2026', 'platform-edition', 'verified');
