-- Set by updateConference (#1881). Null until the first write through the API.
ALTER TABLE conferences ADD COLUMN updated_at TEXT;
