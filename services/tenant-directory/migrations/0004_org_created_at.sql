-- Organization created date (#1973). SQLite's ADD COLUMN takes no
-- CURRENT_TIMESTAMP default, so provision writes it; rows that predate this
-- migration stay NULL (unknown) rather than carry an invented date.
ALTER TABLE organizations ADD COLUMN created_at TEXT;
