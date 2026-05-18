-- M38 — Web Push subscriptions.
--
-- One row per browser/device that has granted push permission and subscribed.
-- `endpoint` is the push service URL the browser gave us; `p256dh` and `auth`
-- are its public keys (kept for a future encrypted-payload push — the current
-- "tickle" push carries no payload). `person_id` records who subscribed, so a
-- new message does not push to its own author's devices.
--
-- The UNIQUE(endpoint) constraint makes (re)subscribing idempotent. This is a
-- user-asset record class — see migrations/README.md.

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);
