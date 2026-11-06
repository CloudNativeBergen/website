-- Local dev fixture (mise run dev:api). Never applied remotely.
INSERT OR IGNORE INTO conferences (conference_id, org_id, published, title, tagline, city, country, venue_name, start_date, end_date) VALUES
  ('conf-dev-cndn-2026', 'org-dev-cndn', 1, 'Cloud Native Days 2026 (dev)', 'Local fixture', 'Bergen', 'Norway', 'Grieghallen', '2026-10-27', '2026-10-28');
