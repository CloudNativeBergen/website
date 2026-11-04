-- Organizer membership rules (#1923). Additive: two triggers and one index.
-- Trigger bodies stay on one line: the test loaders split on ";\n".

-- An organization never loses its last owner: refuse a DELETE, or an UPDATE
-- of role or organizationId, that would leave it without one. Roles are
-- comma lists ("owner,admin"). Inserts are never checked, so the
-- insert-only member sync is unaffected. A cascade from a deleted
-- organization passes: the organization row is already gone. The owner
-- test ignores case (explicitly, not via LIKE, which case_sensitive_like
-- flips) and whitespace, tabs and newlines included.
-- INSERT OR REPLACE bypasses these triggers: its implicit delete fires no
-- DELETE trigger because recursive_triggers is off. Only raw SQL can issue
-- it; Better Auth's drizzle adapter never does.
CREATE TRIGGER member_last_owner_delete BEFORE DELETE ON member
WHEN (',' || lower(replace(replace(replace(replace(OLD.role, ' ', ''), char(9), ''), char(10), ''), char(13), '')) || ',') LIKE '%,owner,%'
  AND EXISTS (SELECT 1 FROM organization o WHERE o.id = OLD.organizationId)
  AND NOT EXISTS (SELECT 1 FROM member m WHERE m.organizationId = OLD.organizationId AND m.id <> OLD.id AND (',' || lower(replace(replace(replace(replace(m.role, ' ', ''), char(9), ''), char(10), ''), char(13), '')) || ',') LIKE '%,owner,%')
BEGIN SELECT RAISE(ABORT, 'LAST_OWNER'); END;

CREATE TRIGGER member_last_owner_update BEFORE UPDATE OF role, organizationId ON member
WHEN (',' || lower(replace(replace(replace(replace(OLD.role, ' ', ''), char(9), ''), char(10), ''), char(13), '')) || ',') LIKE '%,owner,%'
  AND (NEW.organizationId <> OLD.organizationId OR (',' || lower(replace(replace(replace(replace(NEW.role, ' ', ''), char(9), ''), char(10), ''), char(13), '')) || ',') NOT LIKE '%,owner,%')
  AND NOT EXISTS (SELECT 1 FROM member m WHERE m.organizationId = OLD.organizationId AND m.id <> OLD.id AND (',' || lower(replace(replace(replace(replace(m.role, ' ', ''), char(9), ''), char(10), ''), char(13), '')) || ',') LIKE '%,owner,%')
BEGIN SELECT RAISE(ABORT, 'LAST_OWNER'); END;

-- One pending invitation per address and organization. Duplicates already
-- present (expected: none) would make the index fail, so all but the newest
-- are cancelled first. Rows are kept; only their status changes.
UPDATE invitation SET status = 'canceled'
WHERE status = 'pending' AND EXISTS (
  SELECT 1 FROM invitation n
  WHERE n.status = 'pending' AND n.organizationId = invitation.organizationId
    AND lower(n.email) = lower(invitation.email)
    AND (n.createdAt > invitation.createdAt OR (n.createdAt = invitation.createdAt AND n.id > invitation.id))
);

CREATE UNIQUE INDEX invitation_pending_org_email_idx
ON invitation (organizationId, lower(email)) WHERE status = 'pending';
