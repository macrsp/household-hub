-- M27 — conversation rename & archive.
--
-- Conversations can be created (M18) but never renamed or tidied away. This
-- adds a nullable `archived_at` timestamp: NULL means the conversation is
-- active and shown in the tab bar; an ISO 8601 string means a member archived
-- it. Archiving is a soft state — the conversation, its participants, and its
-- messages are all kept, and the conversation can be un-archived (set back to
-- NULL). Renaming is a plain update of the existing `name` column and needs no
-- schema change.
--
-- No backfill: every existing conversation is active, which is exactly NULL.

ALTER TABLE conversations ADD COLUMN archived_at TEXT;
