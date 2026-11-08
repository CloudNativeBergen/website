-- Authorization phase 1 (#2106, docs/AUTHORIZATION.md §2.2). Additive: the
-- user an audited action was done TO, so "everything done to or by this
-- person" is one indexed query. Null on rows written before this column.
ALTER TABLE audit_event ADD COLUMN subject_user_id TEXT;
CREATE INDEX audit_event_subject_idx ON audit_event (subject_user_id);
