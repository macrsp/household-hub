import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';

// GET /api/conversations/[slug]/export — the whole conversation as a file
// download. `?format=json` gives a structured JSON array; anything else (the
// default) gives a plain-text transcript. Read-only: no write path is touched.
// A soft-deleted message keeps its place — its body is omitted/`[deleted]` —
// so the record stays honest about what happened without exposing the text.
export const GET: RequestHandler = async ({ platform, params, url }) => {
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

	const exportedAt = new Date().toISOString();

	if (url.searchParams.get('format') === 'json') {
		const payload = {
			conversation: { slug: params.slug, name: conversation.name },
			exported_at: exportedAt,
			message_count: results.length,
			messages: results.map((m) => ({
				created_at: m.created_at,
				author: m.author,
				source_transport: m.source_transport,
				deleted: m.deleted_at !== null,
				edited: m.edited_at !== null,
				body: m.deleted_at ? null : m.body
			}))
		};
		return new Response(JSON.stringify(payload, null, 2), {
			headers: {
				'content-type': 'application/json; charset=utf-8',
				'content-disposition': `attachment; filename="household-hub-${params.slug}.json"`
			}
		});
	}

	const lines = results.map((m) => {
		const text = m.deleted_at ? '[deleted]' : m.body + (m.edited_at ? ' (edited)' : '');
		return `[${m.created_at}] ${m.author} (${m.source_transport}): ${text}`;
	});
	const transcript =
		`household-hub — #${params.slug} (${conversation.name})\n` +
		`Exported ${exportedAt}\n` +
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
