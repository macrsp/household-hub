-- M42 — message replies.
--
-- A message may be a reply to an earlier message in the same conversation.
-- `reply_to_message_id` is a nullable reference to that message's id (no
-- foreign key — D1/SQLite, soft reference, consistent with the rest of the
-- schema). NULL means a normal, non-reply message. Set once at creation and
-- never changed.

ALTER TABLE messages ADD COLUMN reply_to_message_id TEXT;
