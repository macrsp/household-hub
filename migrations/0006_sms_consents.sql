-- M34 — SMS opt-in consent records.
--
-- A2P 10DLC reviewers require *documented, verifiable* consent: a web opt-in
-- form (or keyword flow), not a verbal narrative. household-hub's /sms-opt-in
-- page is that form; each submission is recorded here as the audit trail of
-- who agreed to receive the household's text messages, and when.
--
-- This is a user-asset record class — losing a consent record would mean the
-- platform could no longer prove a member agreed. See migrations/README.md.

CREATE TABLE sms_consents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  consented_at TEXT NOT NULL
);
