import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { softDeleteMessage } from '$lib/server/db';

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
