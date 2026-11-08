-- #2172: the column default becomes 'private' (#2166 changed only the code
-- default). SQLite cannot alter a default, so the table is rebuilt: every row
-- is copied verbatim, so no stored visibility changes. A trigger cannot do
-- this: it cannot tell an omitted visibility from an explicit 'network'.
-- Nothing references speaker_profile, so the drop cascades nowhere.
CREATE TABLE speaker_profile_new (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  photo_key TEXT,
  links TEXT NOT NULL DEFAULT '[]',
  topics TEXT NOT NULL DEFAULT '[]',
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'network', 'public')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO speaker_profile_new (user_id, id, name, bio, photo_key, links, topics, visibility, created_at, updated_at)
  SELECT user_id, id, name, bio, photo_key, links, topics, visibility, created_at, updated_at FROM speaker_profile;
DROP TABLE speaker_profile;
ALTER TABLE speaker_profile_new RENAME TO speaker_profile;
CREATE INDEX speaker_profile_visibility_idx ON speaker_profile (visibility, id);
