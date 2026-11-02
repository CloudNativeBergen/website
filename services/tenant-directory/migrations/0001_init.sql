-- Tenant directory (tenancy: false): the registry of Organizations,
-- Conferences and their routing hostnames. D1 is the source of truth.
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  plan TEXT NOT NULL DEFAULT 'free',
  overrides TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE conferences (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  lifecycle TEXT NOT NULL DEFAULT 'draft' CHECK (lifecycle IN ('draft', 'live', 'archived')),
  UNIQUE (org_id, slug)
);

-- hostname is the routing claim: one row per hostname, globally.
CREATE TABLE domains (
  hostname TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  conference_id TEXT NOT NULL REFERENCES conferences(id),
  kind TEXT NOT NULL CHECK (kind IN ('platform-edition', 'platform-alias', 'custom')),
  verification TEXT NOT NULL CHECK (verification IN ('pending', 'verified', 'failed')),
  cf_custom_hostname_id TEXT
);
CREATE INDEX domains_org ON domains (org_id, conference_id);
-- One latest-edition alias per Organization.
CREATE UNIQUE INDEX domains_one_alias ON domains (org_id) WHERE kind = 'platform-alias';

CREATE TABLE provisioning_requests (
  idempotency_key TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id)
);
