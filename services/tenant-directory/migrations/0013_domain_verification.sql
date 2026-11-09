-- Domain verification state moves from Sanity to D1 (#2207, phase 1).
-- Additions only. Nothing reads these columns for routing yet: tenantByHost
-- still keys off `verification`, and the site still reads Sanity (phase 6).
-- Times are epoch ms, like checked_at. status is null on rows written before
-- this migration; the API derives it from `verification` until phase 4.
ALTER TABLE domains ADD COLUMN method TEXT CHECK (method IN ('dns-txt', 'platform'));
ALTER TABLE domains ADD COLUMN token TEXT;
ALTER TABLE domains ADD COLUMN status TEXT CHECK (status IN ('pending', 'verified', 'failing', 'revoked'));
ALTER TABLE domains ADD COLUMN verified_at INTEGER;
ALTER TABLE domains ADD COLUMN last_success_at INTEGER;
ALTER TABLE domains ADD COLUMN first_failure_at INTEGER;
ALTER TABLE domains ADD COLUMN grace_until INTEGER;
ALTER TABLE domains ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE domains ADD COLUMN consecutive_soft_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE domains ADD COLUMN last_error TEXT;
-- The failed DomainCheckOutcome kind (src/lib/domain-verification/types.ts).
ALTER TABLE domains ADD COLUMN last_error_code TEXT CHECK (last_error_code IN ('hard-failure', 'soft-failure', 'unverifiable'));
-- Last accepted recheckDomain call; the 60 s limit is enforced on it in SQL.
ALTER TABLE domains ADD COLUMN last_recheck_at INTEGER;
-- When claimDomain wrote the row; an unverified claim expires after 72 h.
ALTER TABLE domains ADD COLUMN claimed_at INTEGER;
