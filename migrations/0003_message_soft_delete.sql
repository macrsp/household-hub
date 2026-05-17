-- M22 — message soft-deletion.
--
-- Messages are a user-asset record class: a member's authored words. A
-- household member who deletes their own message must not destroy the
-- canonical row — deletion is a soft state, not a DELETE. This adds a nullable
-- `deleted_at` timestamp. NULL means live; an ISO 8601 string means the author
-- retracted it. The row, its author, and its place in the conversation stay
-- intact so date separators and surrounding context are unaffected; read paths
-- blank the body and render a tombstone instead.
--
-- No backfill: every existing message is live, which is exactly NULL.

ALTER TABLE messages ADD COLUMN deleted_at TEXT;
