-- Billing contract and self-serve sign-up (#2129). Additive only.
-- Stripe's cancel_at_period_end, written by the webhook (phase 2).
ALTER TABLE organizations ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0
  CHECK (cancel_at_period_end IN (0, 1));

-- Closed-preview invite codes. Only the SHA-256 of a code is stored: the
-- plain code is returned once, to the operator who created it.
CREATE TABLE signup_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  note TEXT NOT NULL,
  max_uses INTEGER NOT NULL CHECK (max_uses > 0),
  uses INTEGER NOT NULL DEFAULT 0 CHECK (uses >= 0 AND uses <= max_uses),
  -- ISO 8601.
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
