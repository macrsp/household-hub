-- M36 — message reactions.
--
-- One row per (message, person, emoji): a household member's emoji reaction
-- to a message. The UNIQUE constraint makes a reaction idempotent — a person
-- can hold a given emoji on a given message at most once — and lets the
-- toggle write path detect an existing reaction.
--
-- `emoji` is free text: the accepted set lives in src/lib/reactions.ts (the
-- single source of truth) and is enforced by the route validator, so there is
-- deliberately no CHECK constraint to drift out of sync. `reactions` is a
-- user-asset record class — see migrations/README.md.

CREATE TABLE reactions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(message_id, person_id, emoji)
);
