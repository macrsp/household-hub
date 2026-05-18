import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { createConversationWithParticipants } from '$lib/server/db';
import { nowIso } from '$lib/server/time';

// GET /api/conversations — all conversation threads, active and archived.
// `last_message_at` is the timestamp of the newest *readable* message in each
// thread (a soft-deleted message is excluded), or null for an empty thread —
// the web app compares it against a per-device last-viewed time to show unread
// indicators. `archived_at` is non-null for an archived thread; the web app
// keeps archived threads out of the tab bar unless they are revealed.
export const GET: RequestHandler = async ({ platform }) => {
	const db = requireDb(platform);
	const { results } = await db
		.prepare(
			`SELECT c.id, c.name, c.slug, c.created_at, c.archived_at,
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

// POST /api/conversations — create a conversation.
// Body: { name, slug, personIds?: string[] }. When `personIds` is given, only
// those household members join the thread; omitted, every member joins (the
// historical default). Every id in `personIds` must be a known person.
export const POST: RequestHandler = async ({ platform, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as
		| { name?: unknown; slug?: unknown; personIds?: unknown }
		| null;
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

	const { results: people } = await db.prepare('SELECT id FROM people').all<{ id: string }>();
	const allIds = people.map((p) => p.id);

	// Resolve the participant set: a given `personIds` subset (validated), or
	// every household member by default.
	let personIds = allIds;
	if (raw?.personIds !== undefined) {
		if (!Array.isArray(raw.personIds) || raw.personIds.some((id) => typeof id !== 'string')) {
			throw error(400, 'personIds must be an array of person id strings');
		}
		const known = new Set(allIds);
		const requested = raw.personIds as string[];
		const unknown = requested.find((id) => !known.has(id));
		if (unknown) throw error(400, `Unknown personId: ${unknown}`);
		personIds = requested;
	}

	const conversation = { id: crypto.randomUUID(), name, slug, created_at: nowIso() };
	await createConversationWithParticipants(db, conversation, personIds);

	return json(conversation, { status: 201 });
};
