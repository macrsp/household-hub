import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { createConversationWithParticipants } from '$lib/server/db';
import { nowIso } from '$lib/server/time';

// GET /api/conversations — all conversation threads.
export const GET: RequestHandler = async ({ platform }) => {
	const db = requireDb(platform);
	const { results } = await db
		.prepare('SELECT id, name, slug, created_at FROM conversations ORDER BY created_at')
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
