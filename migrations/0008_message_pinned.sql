-- M37 — pinned messages.
--
-- A household member can pin an important message (a gate code, a schedule
-- change, an address) so it stays visible at the top of the conversation.
-- `pinned_at` is a nullable timestamp: NULL means not pinned, an ISO 8601
-- string means it was pinned then. Pinning is a soft, reversible state and
-- touches nothing else about the message.
--
-- No backfill: every existing message is unpinned, which is exactly NULL.

ALTER TABLE messages ADD COLUMN pinned_at TEXT;
