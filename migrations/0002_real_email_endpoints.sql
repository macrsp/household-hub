-- 0002: real household email endpoints.
--
-- v1's seed used placeholder email addresses (the .invalid TLD). seed.sql now
-- seeds the real household addresses for fresh installs; this migration
-- corrects databases already seeded with the placeholders, so the inbound
-- email path (POST /api/webhooks/email) recognises the real senders.
--
-- Idempotent: the INSERT is OR IGNORE, the UPDATEs converge to the same state.

INSERT OR IGNORE INTO endpoints (id, person_id, type, address, verified_at, created_at)
VALUES ('ep-matt-email', 'person-matt', 'email', 'north0401@gmail.com', NULL, '2026-05-16T00:00:00.000Z');

UPDATE endpoints SET address = 'north0401@gmail.com' WHERE id = 'ep-matt-email';
UPDATE endpoints SET address = 'macrsp@gmail.com'    WHERE id = 'ep-two-email';
