import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { cleanTitle } from '$lib/server/conversation-title';

// The Workers AI text model used to suggest a conversation name.
const TITLE_MODEL = '@cf/meta/llama-3.1-8b-instruct';
// How many recent messages to read for a name.
const TITLE_WINDOW = 30;

// GET /api/conversations/[slug]/title-suggestion — an AI-suggested short name
// for the conversation, drafted from its recent messages via Cloudflare
// Workers AI (M59). Read-only — the caller decides whether to apply it via the
// existing rename path.
//
// Gated like the AI summary (M54): with no Workers AI binding (local/CI), or
// if the model call fails, it returns 503 { available: false }. A conversation
// with no messages yet returns 200 { available: true, title: '' }.
export const GET: RequestHandler = async ({ platform, params }) => {
	const db = requireDb(platform);

	// An unknown conversation is a 404 regardless of whether AI is configured.
	const conversation = await db
		.prepare('SELECT id FROM conversations WHERE slug = ?')
		.bind(params.slug)
		.first<{ id: string }>();
	if (!conversation) throw error(404, `Unknown conversation: ${params.slug}`);

	const ai = platform?.env.AI;
	if (!ai) {
		return json({ available: false, title: '' }, { status: 503 });
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
			   LIMIT ${TITLE_WINDOW}
			 )
			 ORDER BY created_at ASC`
		)
		.bind(conversation.id)
		.all<{ body: string; author_name: string; created_at: string }>();

	// Nothing to name yet — not a failure, just no suggestion.
	if (results.length === 0) {
		return json({ available: true, title: '' });
	}

	const transcript = results.map((m) => `${m.author_name}: ${m.body}`).join('\n');
	const prompt = [
		`Suggest a short, descriptive name for this family conversation —`,
		`2 to 5 words, in Title Case. Reply with ONLY the name: no quotes,`,
		`no punctuation, no explanation.`,
		``,
		`Conversation:`,
		transcript
	].join('\n');

	try {
		const result = (await ai.run(TITLE_MODEL, {
			messages: [
				{
					role: 'system',
					content: 'You name family group chats with a short, friendly title.'
				},
				{ role: 'user', content: prompt }
			]
		})) as { response?: string };
		const title = cleanTitle(result.response ?? '');
		if (title === '') {
			return json({ available: false, title: '' }, { status: 503 });
		}
		return json({ available: true, title });
	} catch (e) {
		console.error('[title-suggestion] Workers AI call failed', e);
		return json({ available: false, title: '' }, { status: 503 });
	}
};
