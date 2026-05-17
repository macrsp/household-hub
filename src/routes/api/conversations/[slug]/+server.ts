import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { updateConversation } from '$lib/server/db';

// PATCH /api/conversations/[slug] — rename and/or archive a conversation.
// Body: { name?: non-empty string, archived?: boolean }. At least one field
// must be present. Archiving is a soft, reversible state — the conversation,
// its participants, and its messages are all kept.
export const PATCH: RequestHandler = async ({ platform, params, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as
		| { name?: unknown; archived?: unknown }
		| null;
	const fields: { name?: string; archived?: boolean } = {};
	if (raw?.name !== undefined) {
		if (typeof raw.name !== 'string' || raw.name.trim() === '') {
			throw error(400, 'name must be a non-empty string');
		}
		fields.name = raw.name.trim();
	}
	if (raw?.archived !== undefined) {
		if (typeof raw.archived !== 'boolean') {
			throw error(400, 'archived must be a boolean');
		}
		fields.archived = raw.archived;
	}
	if (fields.name === undefined && fields.archived === undefined) {
		throw error(400, 'Expected at least one of { name, archived }');
	}

	const conversation = await db
		.prepare('SELECT id FROM conversations WHERE slug = ?')
		.bind(params.slug)
		.first<{ id: string }>();
	if (!conversation) throw error(404, `Unknown conversation: ${params.slug}`);

	await updateConversation(db, conversation.id, fields);
	return json({ slug: params.slug, ...fields });
};
