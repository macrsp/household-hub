-- household-hub v1 seed data.
--
-- This is deliberately small and hand-editable. To make it yours: change the
-- display names, swap the fake +1555... phone numbers for real ones, and keep
-- one endpoints row per person. Re-running this file is safe — every statement
-- is INSERT OR IGNORE, and the ids are fixed literals (production rows created
-- at runtime use crypto.randomUUID() instead).

-- Two conversations: the catch-all `general` thread and a `groceries` thread.
-- An inbound SMS reaches `groceries` with a "#groceries " body prefix.
INSERT OR IGNORE INTO conversations (id, name, slug, created_at) VALUES
  ('conv-general', 'General', 'general', '2026-05-16T00:00:00.000Z'),
  ('conv-groceries', 'Groceries', 'groceries', '2026-05-16T00:00:00.000Z');

-- Three household members. `role` is 'adult' for the two members trusted with
-- the household memory graph and the Gmail connection (M71+), 'member' for
-- everyone else.
INSERT OR IGNORE INTO people (id, display_name, role, created_at) VALUES
  ('person-matt', 'Matt', 'adult', '2026-05-16T00:00:00.000Z'),
  ('person-two', 'Person Two', 'adult', '2026-05-16T00:00:00.000Z'),
  ('person-three', 'Person Three', 'member', '2026-05-16T00:00:00.000Z');

-- One SMS endpoint per person (fake +1555 01xx numbers — reserved for
-- fiction; swap for real ones), plus real email endpoints for the household
-- members. An inbound email from one of these addresses is attributed to its
-- person; the conversation is the address it was sent to (general@…).
INSERT OR IGNORE INTO endpoints (id, person_id, type, address, verified_at, created_at) VALUES
  ('ep-matt-sms', 'person-matt', 'sms', '+15550000001', NULL, '2026-05-16T00:00:00.000Z'),
  ('ep-two-sms', 'person-two', 'sms', '+15550000002', NULL, '2026-05-16T00:00:00.000Z'),
  ('ep-three-sms', 'person-three', 'sms', '+15550000003', NULL, '2026-05-16T00:00:00.000Z'),
  ('ep-matt-email', 'person-matt', 'email', 'north0401@gmail.com', NULL, '2026-05-16T00:00:00.000Z'),
  ('ep-two-email', 'person-two', 'email', 'macrsp@gmail.com', NULL, '2026-05-16T00:00:00.000Z');

-- All three people participate in both conversations.
INSERT OR IGNORE INTO participants (conversation_id, person_id, delivery_preference, muted) VALUES
  ('conv-general', 'person-matt', 'all', 0),
  ('conv-general', 'person-two', 'all', 0),
  ('conv-general', 'person-three', 'all', 0),
  ('conv-groceries', 'person-matt', 'all', 0),
  ('conv-groceries', 'person-two', 'all', 0),
  ('conv-groceries', 'person-three', 'all', 0);
