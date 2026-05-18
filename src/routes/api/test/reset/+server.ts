import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';

// POST /api/test/reset — wipe D1 and re-insert a fixed seed fixture.
//
// This route exists only for the end-to-end test lane (M31): the Playwright
// suite calls it before each test so every test starts from a known database
// state. It is gated three ways and must never be reachable in production:
//
//   1. A production hostname -> 404. The route looks like it does not exist
//      on the deployed app.
//   2. No `TEST_ROUTES_SECRET` binding -> 404. Production Pages never sets
//      this var, so the route is disabled there by construction; the local
//      E2E server binds it explicitly (see scripts/e2e/start-server.mjs).
//   3. Wrong/absent `x-test-secret` header -> 403.
//
// The fixture mirrors seed.sql — the same fixed-id rows — so tests can refer
// to `person-matt`, `conv-general`, etc. by their literal ids.
const PRODUCTION_HOSTNAMES = ['household-hub.pages.dev', 'household.practicepartner.app'];

interface TestEnv {
	TEST_ROUTES_SECRET?: string;
}

/** Constant-time string compare, so a wrong secret leaks no timing signal. */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

export const POST: RequestHandler = async ({ platform, request }) => {
	// Gate 1: never on the production host.
	let hostname = '';
	try {
		hostname = new URL(request.url).hostname;
	} catch {
		hostname = '';
	}
	if (PRODUCTION_HOSTNAMES.includes(hostname)) throw error(404, 'Not found');

	// Gate 2: disabled unless the test-only binding is present.
	const secret = (platform?.env as TestEnv | undefined)?.TEST_ROUTES_SECRET;
	if (typeof secret !== 'string' || secret === '') throw error(404, 'Not found');

	// Gate 3: the caller must present the matching secret.
	const provided = request.headers.get('x-test-secret') ?? '';
	if (!timingSafeEqual(provided, secret)) throw error(403, 'Forbidden');

	const db = requireDb(platform);
	const t = '2026-05-16T00:00:00.000Z';

	// Wipe every table, then re-insert the fixture in one atomic batch. The
	// schema declares no foreign keys, so delete order does not matter.
	await db.batch([
		db.prepare('DELETE FROM push_subscriptions'),
		db.prepare('DELETE FROM reactions'),
		db.prepare('DELETE FROM sms_consents'),
		db.prepare('DELETE FROM deliveries'),
		db.prepare('DELETE FROM messages'),
		db.prepare('DELETE FROM participants'),
		db.prepare('DELETE FROM endpoints'),
		db.prepare('DELETE FROM conversations'),
		db.prepare('DELETE FROM people'),
		db
			.prepare('INSERT INTO people (id, display_name, created_at) VALUES (?, ?, ?)')
			.bind('person-matt', 'Matt', t),
		db
			.prepare('INSERT INTO people (id, display_name, created_at) VALUES (?, ?, ?)')
			.bind('person-two', 'Person Two', t),
		db
			.prepare('INSERT INTO people (id, display_name, created_at) VALUES (?, ?, ?)')
			.bind('person-three', 'Person Three', t),
		db
			.prepare('INSERT INTO people (id, display_name, created_at) VALUES (?, ?, ?)')
			.bind('person-claude', 'Claude Code', t),
		db
			.prepare(
				'INSERT INTO endpoints (id, person_id, type, address, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.bind('ep-matt-sms', 'person-matt', 'sms', '+15550000001', null, t),
		db
			.prepare(
				'INSERT INTO endpoints (id, person_id, type, address, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.bind('ep-two-sms', 'person-two', 'sms', '+15550000002', null, t),
		db
			.prepare(
				'INSERT INTO endpoints (id, person_id, type, address, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.bind('ep-matt-email', 'person-matt', 'email', 'matt@example.test', null, t),
		db
			.prepare('INSERT INTO conversations (id, name, slug, created_at) VALUES (?, ?, ?, ?)')
			.bind('conv-general', 'General', 'general', t),
		db
			.prepare('INSERT INTO conversations (id, name, slug, created_at) VALUES (?, ?, ?, ?)')
			.bind('conv-groceries', 'Groceries', 'groceries', t),
		db
			.prepare('INSERT INTO conversations (id, name, slug, created_at) VALUES (?, ?, ?, ?)')
			.bind('conv-claude', 'Claude Code', 'claude', t),
		db
			.prepare(
				"INSERT INTO participants (conversation_id, person_id, delivery_preference, muted) VALUES (?, ?, 'all', 0)"
			)
			.bind('conv-general', 'person-matt'),
		db
			.prepare(
				"INSERT INTO participants (conversation_id, person_id, delivery_preference, muted) VALUES (?, ?, 'all', 0)"
			)
			.bind('conv-general', 'person-two'),
		db
			.prepare(
				"INSERT INTO participants (conversation_id, person_id, delivery_preference, muted) VALUES (?, ?, 'all', 0)"
			)
			.bind('conv-general', 'person-three'),
		db
			.prepare(
				"INSERT INTO participants (conversation_id, person_id, delivery_preference, muted) VALUES (?, ?, 'all', 0)"
			)
			.bind('conv-groceries', 'person-matt'),
		db
			.prepare(
				"INSERT INTO participants (conversation_id, person_id, delivery_preference, muted) VALUES (?, ?, 'all', 0)"
			)
			.bind('conv-groceries', 'person-two'),
		db
			.prepare(
				"INSERT INTO participants (conversation_id, person_id, delivery_preference, muted) VALUES (?, ?, 'all', 0)"
			)
			.bind('conv-groceries', 'person-three'),
		db
			.prepare(
				"INSERT INTO participants (conversation_id, person_id, delivery_preference, muted) VALUES (?, ?, 'all', 0)"
			)
			.bind('conv-claude', 'person-matt'),
		db
			.prepare(
				"INSERT INTO participants (conversation_id, person_id, delivery_preference, muted) VALUES (?, ?, 'all', 0)"
			)
			.bind('conv-claude', 'person-two'),
		db
			.prepare(
				"INSERT INTO participants (conversation_id, person_id, delivery_preference, muted) VALUES (?, ?, 'all', 0)"
			)
			.bind('conv-claude', 'person-three'),
		db
			.prepare(
				"INSERT INTO participants (conversation_id, person_id, delivery_preference, muted) VALUES (?, ?, 'all', 0)"
			)
			.bind('conv-claude', 'person-claude')
	]);

	return json({ ok: true });
};
