-- household-hub v1 initial schema.
--
-- The app owns the canonical conversation; SMS / email / app are transport
-- adapters. Every inbound message becomes one row in `messages`; fanout then
-- writes one `deliveries` row per recipient endpoint.
--
-- All six tables below are user-asset record classes. See migrations/README.md
-- for the canonical user-asset manifest and the per-class invariant queries.

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE endpoints (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('sms', 'email', 'app')),
  address TEXT NOT NULL,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(type, address)
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE participants (
  conversation_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  delivery_preference TEXT NOT NULL DEFAULT 'all',
  muted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, person_id)
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  author_person_id TEXT NOT NULL,
  body TEXT NOT NULL,
  source_transport TEXT NOT NULL CHECK (source_transport IN ('app', 'sms', 'email', 'system')),
  created_at TEXT NOT NULL
);

CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  endpoint_id TEXT NOT NULL,
  transport TEXT NOT NULL CHECK (transport IN ('sms', 'email', 'app')),
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- The message-list route reads recent messages for one conversation in
-- chronological order; this index serves that query.
CREATE INDEX idx_messages_conversation_created ON messages (conversation_id, created_at);
