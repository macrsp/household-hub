import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { addParticipant, listParticipants } from '$lib/server/db';

// Resolve a conversation row id from its slug, or 404.
async function conversationIdBySlug(db: D1Database, slug: string): Promise<string> {
	const row = await db
		.prepare('SELECT id FROM conversations WHERE slug = ?')
		.bind(slug)
		.first<{ id: string }>();
	if (!row) throw error(404, `Unknown conversation: ${slug}`);
	return row.id;
}

// GET /api/conversations/[slug]/participants — the conversation's members.
export const GET: RequestHandler = async ({ platform, params }) => {
	const db = requireDb(platform);
	const conversationId = await conversationIdBySlug(db, params.slug);
	return json(await listParticipants(db, conversationId));
};

// POST /api/conversations/[slug]/participants — add a member to the
// conversation. Body: { personId: string }. Idempotent.
export const POST: RequestHandler = async ({ platform, params, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as { personId?: unknown } | null;
	const personId = raw?.personId;
	if (typeof personId !== 'string' || personId === '') {
		throw error(400, 'personId is required');
	}

	const conversationId = await conversationIdBySlug(db, params.slug);
	const person = await db
		.prepare('SELECT id FROM people WHERE id = ?')
		.bind(personId)
		.first<{ id: string }>();
	if (!person) throw error(400, `Unknown personId: ${personId}`);

	await addParticipant(db, conversationId, personId);
	return json({ ok: true }, { status: 201 });
};
