import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { softDeleteMessage, editMessage } from '$lib/server/db';
import { indexMessage } from '$lib/server/semantic-index';

// DELETE /api/conversations/[slug]/messages/[id] — soft-delete a message.
// Body: { personId: string }. Only the message's own author may delete it.
// The canonical row is kept (deleted_at is stamped), so the conversation
// history, date separators, and the copies already fanned out over SMS/email
// are unaffected — the web app renders a tombstone in the message's place.
export const DELETE: RequestHandler = async ({ platform, params, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as { personId?: unknown } | null;
	const personId = raw?.personId;
	if (typeof personId !== 'string' || personId === '') {
		throw error(400, 'Expected JSON body { personId: string }');
	}

	// The message must exist within this conversation (joined via the slug).
	const message = await db
		.prepare(
			`SELECT m.author_person_id
			 FROM messages m
			 JOIN conversations c ON c.id = m.conversation_id
			 WHERE m.id = ? AND c.slug = ?`
		)
		.bind(params.id, params.slug)
		.first<{ author_person_id: string }>();
	if (!message) throw error(404, `Unknown message: ${params.id}`);

	// Only the author may retract their own message — this gates the write.
	if (message.author_person_id !== personId) {
		throw error(403, 'Only the message author can delete it.');
	}

	// softDeleteMessage is idempotent: a repeat delete flips nothing and
	// returns false. Either way the desired end state (deleted) now holds.
	const changed = await softDeleteMessage(db, params.id, personId);
	return json({ id: params.id, deleted: true, alreadyDeleted: !changed });
};

// PATCH /api/conversations/[slug]/messages/[id] — edit a message's body.
// Body: { personId: string, body: non-empty string }. Only the author may
// edit, and a soft-deleted message cannot be edited (409). The edit replaces
// the canonical body and stamps edited_at; copies already fanned out over
// SMS/email are unaffected — the same app-only scope as M22 soft-deletion.
export const PATCH: RequestHandler = async ({ platform, params, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as
		| { personId?: unknown; body?: unknown }
		| null;
	const personId = raw?.personId;
	const body = typeof raw?.body === 'string' ? raw.body.trim() : '';
	if (typeof personId !== 'string' || personId === '' || body === '') {
		throw error(400, 'Expected JSON body { personId: string, body: non-empty string }');
	}

	// The message must exist within this conversation (joined via the slug).
	const message = await db
		.prepare(
			`SELECT m.author_person_id, m.deleted_at, m.conversation_id
			 FROM messages m
			 JOIN conversations c ON c.id = m.conversation_id
			 WHERE m.id = ? AND c.slug = ?`
		)
		.bind(params.id, params.slug)
		.first<{ author_person_id: string; deleted_at: string | null; conversation_id: string }>();
	if (!message) throw error(404, `Unknown message: ${params.id}`);

	// Only the author may edit their own message — this gates the write.
	if (message.author_person_id !== personId) {
		throw error(403, 'Only the message author can edit it.');
	}
	// A retracted message cannot be edited back into existence.
	if (message.deleted_at !== null) {
		throw error(409, 'A deleted message cannot be edited.');
	}

	await editMessage(db, params.id, personId, body);

	// Re-index the edited body for semantic search (M70) so the vector keeps
	// up with the new text. Best-effort, after the response via waitUntil; a
	// no-op when Workers AI or Vectorize is unconfigured.
	{
		const indexTask = indexMessage(platform!.env, {
			id: params.id,
			conversation_id: message.conversation_id,
			body
		});
		if (platform?.context?.waitUntil) platform.context.waitUntil(indexTask);
		else await indexTask;
	}

	return json({ id: params.id, body, edited: true });
};
