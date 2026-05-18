import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';

// GET /api/search?q=<term> — search message bodies across *all* conversations
// (M45). The per-conversation search lives at
// /api/conversations/[slug]/messages?q=… ; this is the household-wide version.
// Soft-deleted messages are excluded. Each result carries the conversation it
// belongs to so the UI can label it and jump there.
export const GET: RequestHandler = async ({ platform, url }) => {
	const db = requireDb(platform);

	const q = url.searchParams.get('q')?.trim();
	if (!q) throw error(400, 'A search term (?q=) is required');

	const { results } = await db
		.prepare(
			`SELECT m.id, m.body, m.source_transport, m.created_at,
			        m.author_person_id, p.display_name AS author_name,
			        c.slug AS conversation_slug, c.name AS conversation_name
			 FROM messages m
			 JOIN people p ON p.id = m.author_person_id
			 JOIN conversations c ON c.id = m.conversation_id
			 WHERE m.deleted_at IS NULL AND m.body LIKE ?
			 ORDER BY m.created_at DESC
			 LIMIT 100`
		)
		.bind(`%${q}%`)
		.all();

	return json(results);
};
