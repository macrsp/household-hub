-- M52 — the #claude dev channel.
--
-- household-hub gets a built-in conversation, `#claude`, where members post
-- requests for changes to the app and Claude Code posts back what it shipped.
-- This migration seeds the two fixed rows that channel needs:
--   - a `person-claude` household member ("Claude Code") — the author of the
--     responses the external runner posts back;
--   - the `conv-claude` conversation (slug `claude`).
-- Every existing member joins it, so anyone can post a request.
--
-- INSERT OR IGNORE keeps this safe to re-apply.

INSERT OR IGNORE INTO people (id, display_name, created_at) VALUES
  ('person-claude', 'Claude Code', '2026-05-18T00:00:00.000Z');

INSERT OR IGNORE INTO conversations (id, name, slug, created_at) VALUES
  ('conv-claude', 'Claude Code', 'claude', '2026-05-18T00:00:00.000Z');

INSERT OR IGNORE INTO participants (conversation_id, person_id, delivery_preference, muted)
  SELECT 'conv-claude', id, 'all', 0 FROM people;
