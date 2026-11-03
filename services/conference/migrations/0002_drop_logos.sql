-- Logo SVGs (~190 KB each) exceed D1's 100 KB statement limit, so they stay in
-- Sanity and are served by the content subgraph.
ALTER TABLE conferences DROP COLUMN logo_bright;
ALTER TABLE conferences DROP COLUMN logo_dark;
ALTER TABLE conferences DROP COLUMN logomark_bright;
ALTER TABLE conferences DROP COLUMN logomark_dark;
