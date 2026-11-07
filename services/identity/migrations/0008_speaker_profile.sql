-- Global speaker profile (#2093), owned by the person. user_id is never
-- exposed outside the owner's own reads; id is the opaque handle the
-- organizer directory returns. Deleting the user erases the profile.
CREATE TABLE speaker_profile (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  photo_key TEXT,
  links TEXT NOT NULL DEFAULT '[]',
  topics TEXT NOT NULL DEFAULT '[]',
  visibility TEXT NOT NULL DEFAULT 'network' CHECK (visibility IN ('private', 'network', 'public')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX speaker_profile_visibility_idx ON speaker_profile (visibility, id);
