-- M71 — the household memory graph.
--
-- household-hub gains a small knowledge graph of the household itself: its
-- people, pets, places, organisations, things, and events, and the facts
-- connecting them. See .agent/household-memory.md for the full design.
--
--   memory_entities  — the nodes (a person, a pet, the house, a school).
--   memory_facts     — the edges. Each fact is a triple: a subject entity, a
--                      predicate, and an object that is EITHER a literal
--                      string (object_text) OR another entity
--                      (object_entity_id) — never both, never neither.
--
-- Both tables are user-asset record classes; see migrations/README.md.
--
-- This migration also adds `people.role`. 'adult' marks a household member
-- trusted with the memory graph and (later) the Gmail connection; 'member' is
-- everyone else. The memory feature is adult-only by the operator's decision.
-- The kind/source string sets are NOT enforced here with CHECK constraints:
-- their single source of truth is src/lib/server/memory-kinds.ts, and the
-- typed insert helpers in src/lib/server/db.ts gate every write.

ALTER TABLE people ADD COLUMN role TEXT NOT NULL DEFAULT 'member';

-- The household's two main adults. Adjust to taste for a different household;
-- fresh installs get their roles from seed.sql instead.
UPDATE people SET role = 'adult' WHERE id IN ('person-matt', 'person-two');

CREATE TABLE memory_entities (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  person_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE memory_facts (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object_text TEXT,
  object_entity_id TEXT,
  valid_at TEXT,
  confidence REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'confirmed')),
  source TEXT NOT NULL,
  source_message_id TEXT,
  source_ref TEXT,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  confirmed_by TEXT,
  -- Exactly one of object_text / object_entity_id is set.
  CHECK ((object_text IS NULL) <> (object_entity_id IS NULL))
);

CREATE INDEX idx_memory_facts_subject ON memory_facts(subject_id);
CREATE INDEX idx_memory_facts_predicate ON memory_facts(predicate);
