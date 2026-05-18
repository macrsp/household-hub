import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { insertMessage, loadReactions, type Message } from '$lib/server/db';
import { fanoutMessage } from '$lib/server/fanout';
import { notifyPushSubscribers } from '$lib/server/push';
import { mentionsClaude, maybeAssistantReply } from '$lib/server/assistant';
import { indexMessage } from '$lib/server/semantic-index';
import { extractFacts } from '$lib/server/memory-extract';
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
// each carrying the author's display name and delivery counts. Filters:
//   ?q=<term>             — messages whose body matches the term
//   ?before=<ISO>         — the page of messages older than the cursor
//   ?since=<ISO>          — only messages newer than the cursor (M52; the
//                           dev-channel runner polls with this)
export const GET: RequestHandler = async ({ platform, params, url }) => {
	const db = requireDb(platform);
	const conversationId = await conversationIdBySlug(db, params.slug);

	// Filtering: ?q= searches; ?before= paginates older; ?since= fetches newer.
	// The modes are mutually exclusive, checked in that order.
	const q = url.searchParams.get('q')?.trim();
	const before = url.searchParams.get('before');
	const since = url.searchParams.get('since');
	let filterClause = '';
	const binds: string[] = [conversationId];
	if (q) {
		// Search never matches a deleted message — its body is retracted.
		filterClause = 'AND m.deleted_at IS NULL AND m.body LIKE ?';
		binds.push(`%${q}%`);
	} else if (before) {
		filterClause = 'AND m.created_at < ?';
		binds.push(before);
	} else if (since) {
		filterClause = 'AND m.created_at > ?';
		binds.push(since);
	}

	// Take the most-recent 200 (older than the cursor, if given), then present
	// them ascending for display.
	const { results } = await db
		.prepare(
			`SELECT id, body, source_transport, created_at, deleted_at, edited_at, pinned_at,
			        reply_to_message_id, author_person_id, author_name,
			        delivery_total, delivery_ok, delivery_failed
			 FROM (
			   SELECT m.id,
			          CASE WHEN m.deleted_at IS NOT NULL THEN '' ELSE m.body END AS body,
			          m.source_transport, m.created_at, m.deleted_at, m.edited_at, m.pinned_at,
			          m.reply_to_message_id,
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
// in the web app. Body: { authorPersonId: string, body: non-empty string,
// replyToMessageId?: string }.
export const POST: RequestHandler = async ({ platform, params, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as
		| { authorPersonId?: unknown; body?: unknown; replyToMessageId?: unknown }
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

	// An optional reply target must be a message in this same conversation.
	let replyToMessageId: string | null = null;
	if (raw?.replyToMessageId !== undefined && raw.replyToMessageId !== null) {
		if (typeof raw.replyToMessageId !== 'string') {
			throw error(400, 'replyToMessageId must be a string');
		}
		const target = await db
			.prepare('SELECT id FROM messages WHERE id = ? AND conversation_id = ?')
			.bind(raw.replyToMessageId, conversationId)
			.first<{ id: string }>();
		if (!target) throw error(400, 'replyToMessageId does not match a message in this conversation');
		replyToMessageId = raw.replyToMessageId;
	}

	const message: Message = {
		id: crypto.randomUUID(),
		conversation_id: conversationId,
		author_person_id: authorPersonId,
		body,
		source_transport: 'app',
		created_at: nowIso(),
		reply_to_message_id: replyToMessageId
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

	// Notify subscribed devices over Web Push (M38); a no-op if push is
	// unconfigured. The message is already stored — a push failure is logged,
	// not surfaced.
	try {
		await notifyPushSubscribers(platform!.env, db, message.author_person_id);
	} catch (e) {
		console.error('[push] notify failed for message', message.id, e);
	}

	// Index the message for semantic search (M66). Best-effort, after the
	// response via waitUntil so the send is never delayed; a no-op when
	// Workers AI or the Vectorize binding is unconfigured.
	{
		const indexTask = indexMessage(platform!.env, message);
		if (platform?.context?.waitUntil) platform.context.waitUntil(indexTask);
		else await indexTask;
	}

	// Extract durable household facts from the message into the memory graph
	// as proposed facts (M73). Best-effort, after the response via waitUntil;
	// a no-op in the dev channel or when Workers AI is unconfigured.
	{
		const extractTask = extractFacts(
			platform!.env,
			{ id: conversationId, slug: params.slug },
			message
		);
		if (platform?.context?.waitUntil) platform.context.waitUntil(extractTask);
		else await extractTask;
	}

	// If the message @-mentions Claude, generate an assistant reply (M55).
	// Run it after the response via waitUntil so the send is never delayed; a
	// no-op for non-mentions, the dev channel, or when Workers AI is unset.
	if (mentionsClaude(message.body)) {
		const replyTask = maybeAssistantReply(
			platform!.env,
			db,
			{ id: conversationId, slug: params.slug },
			message
		);
		if (platform?.context?.waitUntil) platform.context.waitUntil(replyTask);
		else await replyTask;
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
