-- Web push subscriptions (kontroll#61). One row per browser endpoint; the
-- endpoint belongs to whoever subscribed it last (see src/data/push-subscriptions.ts).
CREATE TABLE push_subscription (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX push_subscription_user_idx ON push_subscription (user_id);
