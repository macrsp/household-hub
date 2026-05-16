import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { insertMessage, type Message } from '$lib/server/db';
import { fanoutMessage } from '$lib/server/fanout';
import { nowIso } from '$lib/server/time';

// Resolve a conversation row id from its URL slug, or 404.
async function conversationIdBySlug(db: D1Database, slug: string): Promise<string> {
	const row = await db
		.prepare('SELECT id FROM conversations WHERE slug = ?')
		.bind(slug)
		.first<{ id: string }>();
	if (!row) throw error(404, `Unknown conversation: ${slug}`);
	return row.id;
}

// GET /api/conversations/[slug]/messages — recent messages, oldest-first,
// each carrying the author's display name (joined from `people`).
export const GET: RequestHandler = async ({ platform, params }) => {
	const db = requireDb(platform);
	const conversationId = await conversationIdBySlug(db, params.slug);
	// Take the most-recent 200, then present them ascending for display.
	const { results } = await db
		.prepare(
			`SELECT id, body, source_transport, created_at, author_person_id, author_name
			 FROM (
			   SELECT m.id, m.body, m.source_transport, m.created_at,
			          m.author_person_id, p.display_name AS author_name
			   FROM messages m
			   JOIN people p ON p.id = m.author_person_id
			   WHERE m.conversation_id = ?
			   ORDER BY m.created_at DESC
			   LIMIT 200
			 )
			 ORDER BY created_at ASC`
		)
		.bind(conversationId)
		.all();
	return json(results);
};

// POST /api/conversations/[slug]/messages — store a message that originated
// in the web app. Body: { authorPersonId: string, body: non-empty string }.
export const POST: RequestHandler = async ({ platform, params, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as
		| { authorPersonId?: unknown; body?: unknown }
		| null;
	const authorPersonId = raw?.authorPersonId;
	const body = typeof raw?.body === 'string' ? raw.body.trim() : '';
	if (typeof authorPersonId !== 'string' || authorPersonId === '' || body === '') {
		throw error(400, 'Expected JSON body { authorPersonId: string, body: non-empty string }');
	}

	const conversationId = await conversationIdBySlug(db, params.slug);

	// The author must be a known person — this gates the messages write path.
	const author = await db
		.prepare('SELECT id FROM people WHERE id = ?')
		.bind(authorPersonId)
		.first<{ id: string }>();
	if (!author) throw error(400, `Unknown authorPersonId: ${authorPersonId}`);

	const message: Message = {
		id: crypto.randomUUID(),
		conversation_id: conversationId,
		author_person_id: authorPersonId,
		body,
		source_transport: 'app',
		created_at: nowIso()
	};
	await insertMessage(db, message);

	// Fan the canonical message out to the other participants. The message is
	// already stored; a fanout failure is logged but does not fail this
	// response, and per-delivery outcomes are recorded on `deliveries` rows.
	try {
		await fanoutMessage(db, platform!.env, message.id);
	} catch (e) {
		console.error('[fanout] failed for message', message.id, e);
	}

	return json(message, { status: 201 });
};
