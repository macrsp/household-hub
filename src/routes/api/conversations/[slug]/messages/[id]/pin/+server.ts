import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { setMessagePinned } from '$lib/server/db';

// POST /api/conversations/[slug]/messages/[id]/pin — pin or unpin a message.
// Body: { pinned: boolean }. Pinning is a benign, reversible household action
// (not author-restricted, unlike edit/delete) — any member can pin the gate
// code or a schedule change so it stays at the top of the conversation.
export const POST: RequestHandler = async ({ platform, params, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as { pinned?: unknown } | null;
	if (typeof raw?.pinned !== 'boolean') {
		throw error(400, 'Expected JSON body { pinned: boolean }');
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

	await setMessagePinned(db, params.id, raw.pinned);
	return json({ id: params.id, pinned: raw.pinned });
};
