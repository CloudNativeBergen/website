-- Local dev fixture (mise run dev:api). Never applied remotely.
-- The jwks row (the dev token's public key) is written by scripts/dev-api.mjs.
INSERT OR IGNORE INTO user (id, name, email, emailVerified, platformOperator) VALUES
  ('user-dev-member', 'Dev Member', 'member@example.test', 1, 0),
  ('user-dev-operator', 'Dev Operator', 'operator@example.test', 1, 1);
INSERT OR IGNORE INTO organization (id, name, slug) VALUES
  ('org-dev-cndn', 'Cloud Native Days (dev)', 'cndn-dev'),
  ('org-dev-kk', 'KontainerKonf (dev)', 'kk-dev');
INSERT OR IGNORE INTO member (id, organizationId, userId, role) VALUES
  ('member-dev-1', 'org-dev-cndn', 'user-dev-member', 'owner'),
  ('member-dev-2', 'org-dev-cndn', 'user-dev-operator', 'admin');
