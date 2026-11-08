-- Ticket sales mirrored from the conference's ticketing provider (#2148).
-- Every table carries org_id and conference_id. Ids are strings; the
-- provider's own ids stay in external_id. Money is integer minor units plus
-- an ISO 4217 currency, never a float.

-- One provider event (EventRef) belongs to exactly one conference: the
-- UNIQUE stops a second tenant claiming an event another one already owns.
CREATE TABLE ticket_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  conference_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  account_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (provider, account_id, external_id)
);
CREATE INDEX ticket_events_tenant ON ticket_events (org_id, conference_id);

CREATE TABLE ticket_types (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  conference_id TEXT NOT NULL,
  event_id TEXT NOT NULL REFERENCES ticket_events (id),
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  capacity INTEGER CHECK (capacity IS NULL OR capacity >= 0),
  UNIQUE (event_id, external_id)
);
CREATE INDEX ticket_types_tenant ON ticket_types (org_id, conference_id);

-- buyer_email is PII (attendee.read_pii). Cancelled is terminal: ingest
-- never moves an order out of it.
CREATE TABLE ticket_orders (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  conference_id TEXT NOT NULL,
  event_id TEXT NOT NULL REFERENCES ticket_events (id),
  external_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled')),
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  buyer_email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (event_id, external_id)
);
CREATE INDEX ticket_orders_tenant ON ticket_orders (org_id, conference_id);

-- One row per ticket type on an order. Replaced whole on every ingest.
CREATE TABLE ticket_order_lines (
  order_id TEXT NOT NULL REFERENCES ticket_orders (id),
  ticket_type_id TEXT NOT NULL REFERENCES ticket_types (id),
  org_id TEXT NOT NULL,
  conference_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  PRIMARY KEY (order_id, ticket_type_id)
);
CREATE INDEX ticket_order_lines_tenant ON ticket_order_lines (org_id, conference_id);
