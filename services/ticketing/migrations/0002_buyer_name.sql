-- buyer_name is PII, gated like buyer_email (attendee.read_pii) (#2242).
ALTER TABLE ticket_orders ADD COLUMN buyer_name TEXT;
