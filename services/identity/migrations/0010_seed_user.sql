-- Demo seed users (#2150). Additive: a user seedDemoUser created. They hold no
-- account or password, and auth.ts refuses any session or account for them,
-- whatever their org's kind later becomes.
ALTER TABLE user ADD COLUMN is_seed INTEGER NOT NULL DEFAULT 0;
