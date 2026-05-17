import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';

// GET /api/conversations/[slug]/export — the whole conversation as a plain-text
// transcript, served as a file download. Read-only: no write path is touched.
// A soft-deleted message is kept in the transcript as a "[deleted]" line so
// the record stays honest about what happened without exposing the text.
export const GET: RequestHandler = async ({ platform, params }) => {
	const db = requireDb(platform);

	const conversation = await db
		.prepare('SELECT id, name FROM conversations WHERE slug = ?')
		.bind(params.slug)
		.first<{ id: string; name: string }>();
	if (!conversation) throw error(404, `Unknown conversation: ${params.slug}`);

	const { results } = await db
		.prepare(
			`SELECT m.created_at, m.body, m.source_transport, m.deleted_at, m.edited_at,
			        p.display_name AS author
			 FROM messages m
			 JOIN people p ON p.id = m.author_person_id
			 WHERE m.conversation_id = ?
			 ORDER BY m.created_at ASC`
		)
		.bind(conversation.id)
		.all<{
			created_at: string;
			body: string;
			source_transport: string;
			deleted_at: string | null;
			edited_at: string | null;
			author: string;
		}>();

	const lines = results.map((m) => {
		const text = m.deleted_at ? '[deleted]' : m.body + (m.edited_at ? ' (edited)' : '');
		return `[${m.created_at}] ${m.author} (${m.source_transport}): ${text}`;
	});
	const transcript =
		`household-hub — #${params.slug} (${conversation.name})\n` +
		`Exported ${new Date().toISOString()}\n` +
		`${results.length} message${results.length === 1 ? '' : 's'}\n\n` +
		lines.join('\n') +
		'\n';

	return new Response(transcript, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'content-disposition': `attachment; filename="household-hub-${params.slug}.txt"`
		}
	});
};
