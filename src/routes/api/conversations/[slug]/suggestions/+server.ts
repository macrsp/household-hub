import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { parseSuggestions } from '$lib/server/reply-suggestions';

// The Workers AI text model used to draft reply suggestions.
const SUGGEST_MODEL = '@cf/meta/llama-3.1-8b-instruct';
// How many recent messages to feed the model for context.
const SUGGEST_WINDOW = 16;

// GET /api/conversations/[slug]/suggestions — a few short replies the reader
// might send next, drafted from the conversation's recent messages via
// Cloudflare Workers AI (M57). Read-only.
//
// Gated like the AI summary (M54): with no Workers AI binding (local/CI), or
// if the model call fails, it returns 503 { available: false } rather than
// erroring — the UI then simply offers no suggestions.
export const GET: RequestHandler = async ({ platform, params }) => {
	const db = requireDb(platform);

	// An unknown conversation is a 404 regardless of whether AI is configured.
	const conversation = await db
		.prepare('SELECT id, name FROM conversations WHERE slug = ?')
		.bind(params.slug)
		.first<{ id: string; name: string }>();
	if (!conversation) throw error(404, `Unknown conversation: ${params.slug}`);

	const ai = platform?.env.AI;
	if (!ai) {
		return json({ available: false, suggestions: [] }, { status: 503 });
	}

	// The most recent readable messages, oldest-first for the model.
	const { results } = await db
		.prepare(
			`SELECT body, author_name, created_at FROM (
			   SELECT m.body, p.display_name AS author_name, m.created_at
			   FROM messages m
			   JOIN people p ON p.id = m.author_person_id
			   WHERE m.conversation_id = ? AND m.deleted_at IS NULL
			   ORDER BY m.created_at DESC
			   LIMIT ${SUGGEST_WINDOW}
			 )
			 ORDER BY created_at ASC`
		)
		.bind(conversation.id)
		.all<{ body: string; author_name: string; created_at: string }>();

	if (results.length === 0) {
		return json({ available: true, suggestions: [] });
	}

	const transcript = results.map((m) => `${m.author_name}: ${m.body}`).join('\n');
	const prompt = [
		`Read this family conversation and suggest 3 short replies the next`,
		`person could send. Keep each reply natural and under 12 words.`,
		`Output ONLY a bulleted list, one reply per line starting with "- ".`,
		`Do not add quotes, names, or any other text.`,
		``,
		`Conversation "${conversation.name}":`,
		transcript
	].join('\n');

	try {
		const result = (await ai.run(SUGGEST_MODEL, {
			messages: [
				{
					role: 'system',
					content: 'You suggest brief, friendly replies for a family group chat.'
				},
				{ role: 'user', content: prompt }
			]
		})) as { response?: string };
		const text = (result.response ?? '').trim();
		const suggestions = parseSuggestions(text);
		if (suggestions.length === 0) {
			return json({ available: false, suggestions: [] }, { status: 503 });
		}
		return json({ available: true, suggestions });
	} catch (e) {
		console.error('[suggestions] Workers AI call failed', e);
		return json({ available: false, suggestions: [] }, { status: 503 });
	}
};
