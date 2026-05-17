-- M24 — message editing.
--
-- A household member can correct a message they sent. The edit replaces the
-- canonical `body` in place; `edited_at` records when, so the app can show an
-- "(edited)" marker. NULL means the message has never been edited.
--
-- Editing affects only the canonical record and the app view — copies already
-- fanned out over SMS/email cannot be recalled, the same accepted tradeoff as
-- M22 soft-deletion. A deleted message cannot be edited (the write path checks
-- `deleted_at IS NULL`).
--
-- No backfill: every existing message is unedited, which is exactly NULL.

ALTER TABLE messages ADD COLUMN edited_at TEXT;
