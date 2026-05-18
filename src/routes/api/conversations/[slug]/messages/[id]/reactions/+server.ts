import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { toggleReaction } from '$lib/server/db';
import { isReactionEmoji } from '$lib/reactions';

// POST /api/conversations/[slug]/messages/[id]/reactions — toggle one
// person's emoji reaction on a message. Body: { personId, emoji }. If the
// person already holds that emoji on that message it is removed, otherwise
// added — the response `state` says which.
export const POST: RequestHandler = async ({ platform, params, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as
		| { personId?: unknown; emoji?: unknown }
		| null;
	const personId = raw?.personId;
	const emoji = raw?.emoji;

	if (typeof personId !== 'string' || personId === '') {
		throw error(400, 'personId is required');
	}
	// The accepted emoji set is the single declaration in $lib/reactions.
	if (!isReactionEmoji(emoji)) {
		throw error(400, 'emoji must be one of the accepted reaction emoji');
	}

	// The message must exist within this conversation.
	const message = await db
		.prepare(
			`SELECT m.id FROM messages m
			 JOIN conversations c ON c.id = m.conversation_id
			 WHERE m.id = ? AND c.slug = ?`
		)
		.bind(params.id, params.slug)
		.first<{ id: string }>();
	if (!message) throw error(404, `Unknown message: ${params.id}`);

	// The reactor must be a known household member.
	const person = await db
		.prepare('SELECT id FROM people WHERE id = ?')
		.bind(personId)
		.first<{ id: string }>();
	if (!person) throw error(400, `Unknown personId: ${personId}`);

	const state = await toggleReaction(db, params.id, personId, emoji);
	return json({ ok: true, state });
};
