-- RunKonf/kontroll#79: the operator who created a tenant through
-- createOrganization or provisionOrganization. Null on older rows.
ALTER TABLE provisioning_requests ADD COLUMN created_by TEXT;
