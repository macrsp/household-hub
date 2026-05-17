import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { createConversationWithParticipants } from '$lib/server/db';
import { nowIso } from '$lib/server/time';

// GET /api/conversations — all conversation threads. `last_message_at` is the
// timestamp of the newest *readable* message in each thread (a soft-deleted
// message is excluded), or null for an empty thread — the web app compares it
// against a per-device last-viewed time to show unread indicators.
export const GET: RequestHandler = async ({ platform }) => {
	const db = requireDb(platform);
	const { results } = await db
		.prepare(
			`SELECT c.id, c.name, c.slug, c.created_at,
			        (SELECT max(m.created_at) FROM messages m
			           WHERE m.conversation_id = c.id AND m.deleted_at IS NULL) AS last_message_at
			 FROM conversations c
			 ORDER BY c.created_at`
		)
		.all();
	return json(results);
};

// A conversation slug: lowercase, alphanumeric and hyphens, starting with an
// alphanumeric — the local part used in routing (#slug, slug@…).
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

// POST /api/conversations — create a conversation. Body: { name, slug }.
// Every current household member is added as a participant: the household
// model is that everyone takes part in every thread.
export const POST: RequestHandler = async ({ platform, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as { name?: unknown; slug?: unknown } | null;
	const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
	const slug = typeof raw?.slug === 'string' ? raw.slug.trim().toLowerCase() : '';
	if (name === '' || !SLUG_RE.test(slug)) {
		throw error(
			400,
			'Expected { name: non-empty string, slug: lowercase alphanumeric + hyphens }'
		);
	}

	const existing = await db
		.prepare('SELECT id FROM conversations WHERE slug = ?')
		.bind(slug)
		.first();
	if (existing) throw error(409, `A conversation with the slug "${slug}" already exists`);

	const conversation = { id: crypto.randomUUID(), name, slug, created_at: nowIso() };
	const { results: people } = await db.prepare('SELECT id FROM people').all<{ id: string }>();
	await createConversationWithParticipants(
		db,
		conversation,
		people.map((p) => p.id)
	);

	return json(conversation, { status: 201 });
};
