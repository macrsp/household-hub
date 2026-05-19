-- M74 — connected Google (Gmail) accounts.
--
-- When an adult household member connects their Gmail through Google's OAuth
-- consent screen, household-hub stores one row here so it can later read that
-- mailbox (M75) to propose household-memory facts. See .agent/household-memory.md.
--
-- The access_token and refresh_token columns hold the OAuth tokens ENCRYPTED
-- AT REST — AES-GCM under the TOKEN_ENCRYPTION_KEY Worker secret (see
-- src/lib/server/google.ts). They are never stored or logged in clear text.
-- This is required by the restricted-scope security assessment and is stated
-- in the published Privacy Policy.
--
-- history_id is Gmail's incremental-sync cursor: the last point M75 synced to.
-- email is UNIQUE — one row per connected mailbox; reconnecting replaces it.

CREATE TABLE google_accounts (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TEXT NOT NULL,
  history_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_google_accounts_person ON google_accounts(person_id);
