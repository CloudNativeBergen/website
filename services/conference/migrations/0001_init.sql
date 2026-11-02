-- The structured public face of one Conference edition: branding, venue,
-- dates and links. Editorial copy (description, homepage sections) stays in
-- Sanity and is served by services/content. One row per Conference;
-- conference_id is the Sanity _id, the same id tenant-directory uses.
CREATE TABLE conferences (
  conference_id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  -- Anonymous callers see the row only when this is 1 (epic #1772, req. 2).
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  -- Null when Sanity has no title, as in services/content.
  title TEXT,
  tagline TEXT,
  city TEXT,
  country TEXT,
  venue_name TEXT,
  venue_address TEXT,
  start_date TEXT,
  end_date TEXT,
  visibility TEXT NOT NULL DEFAULT 'live' CHECK (visibility IN ('live', 'unlisted')),
  logo_bright TEXT,
  logo_dark TEXT,
  logomark_bright TEXT,
  logomark_dark TEXT,
  background_pattern TEXT,
  primary_color TEXT,
  accent_color TEXT,
  registration_link TEXT,
  -- JSON array of URLs.
  social_links TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX conferences_tenant ON conferences (org_id, conference_id);
