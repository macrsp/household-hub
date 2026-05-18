import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { insertMessage, loadReactions, type Message } from '$lib/server/db';
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
// each carrying the author's display name and delivery counts. With
// `?before=<ISO timestamp>`, returns the page of messages immediately older
// than that timestamp instead — used for "load older" pagination. With
// `?q=<term>`, returns messages whose body matches the term.
export const GET: RequestHandler = async ({ platform, params, url }) => {
	const db = requireDb(platform);
	const conversationId = await conversationIdBySlug(db, params.slug);

	// Filtering: ?q= searches message bodies; ?before= paginates to older
	// messages. If both are present, search takes precedence.
	const q = url.searchParams.get('q')?.trim();
	const before = url.searchParams.get('before');
	let filterClause = '';
	const binds: string[] = [conversationId];
	if (q) {
		// Search never matches a deleted message — its body is retracted.
		filterClause = 'AND m.deleted_at IS NULL AND m.body LIKE ?';
		binds.push(`%${q}%`);
	} else if (before) {
		filterClause = 'AND m.created_at < ?';
		binds.push(before);
	}

	// Take the most-recent 200 (older than the cursor, if given), then present
	// them ascending for display.
	const { results } = await db
		.prepare(
			`SELECT id, body, source_transport, created_at, deleted_at, edited_at,
			        author_person_id, author_name,
			        delivery_total, delivery_ok, delivery_failed
			 FROM (
			   SELECT m.id,
			          CASE WHEN m.deleted_at IS NOT NULL THEN '' ELSE m.body END AS body,
			          m.source_transport, m.created_at, m.deleted_at, m.edited_at,
			          m.author_person_id, p.display_name AS author_name,
			          (SELECT count(*) FROM deliveries d WHERE d.message_id = m.id) AS delivery_total,
			          (SELECT count(*) FROM deliveries d WHERE d.message_id = m.id
			             AND d.status IN ('sent', 'sent_stubbed', 'delivered')) AS delivery_ok,
			          (SELECT count(*) FROM deliveries d WHERE d.message_id = m.id
			             AND d.status = 'failed') AS delivery_failed
			   FROM messages m
			   JOIN people p ON p.id = m.author_person_id
			   WHERE m.conversation_id = ? ${filterClause}
			   ORDER BY m.created_at DESC
			   LIMIT 200
			 )
			 ORDER BY created_at ASC`
		)
		.bind(...binds)
		.all<Record<string, unknown>>();

	// Attach each message's reaction tallies (M36).
	const reactions = await loadReactions(
		db,
		results.map((r) => r.id as string)
	);
	for (const row of results) {
		row.reactions = reactions.get(row.id as string) ?? [];
	}
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

	// Return the message with its delivery counts — fanout has completed, so
	// the web app can show a receipt immediately on the sender's own message.
	const counts = await db
		.prepare(
			`SELECT count(*) AS delivery_total,
			        count(CASE WHEN status IN ('sent','sent_stubbed','delivered') THEN 1 END) AS delivery_ok,
			        count(CASE WHEN status = 'failed' THEN 1 END) AS delivery_failed
			 FROM deliveries WHERE message_id = ?`
		)
		.bind(message.id)
		.first<{ delivery_total: number; delivery_ok: number; delivery_failed: number }>();

	return json({ ...message, ...counts }, { status: 201 });
};
