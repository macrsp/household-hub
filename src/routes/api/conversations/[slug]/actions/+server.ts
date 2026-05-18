import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { parseActions } from '$lib/server/action-items';

// The Workers AI text model used to extract action items.
const ACTIONS_MODEL = '@cf/meta/llama-3.1-8b-instruct';
// How many recent messages to scan for action items.
const ACTIONS_WINDOW = 40;

// GET /api/conversations/[slug]/actions — AI-extracted action items (to-dos
// and commitments) from the conversation's recent messages, via Cloudflare
// Workers AI (M56). Read-only.
//
// Gated like the AI summary (M54): with no Workers AI binding (local/CI), or
// if the model call fails, it returns 503 { available: false } rather than
// erroring — the UI then reports that to-dos are unavailable.
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
		return json({ available: false, actions: [] }, { status: 503 });
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
			   LIMIT ${ACTIONS_WINDOW}
			 )
			 ORDER BY created_at ASC`
		)
		.bind(conversation.id)
		.all<{ body: string; author_name: string; created_at: string }>();

	if (results.length === 0) {
		return json({ available: true, actions: [] });
	}

	const transcript = results.map((m) => `${m.author_name}: ${m.body}`).join('\n');
	const prompt = [
		`Read this family conversation and list the action items — things`,
		`someone has agreed to do, needs to do, or has been asked to do.`,
		`Output ONLY a bulleted list, one item per line starting with "- ".`,
		`If the person responsible is clear, prefix the item with their name`,
		`in square brackets, e.g. "- [Sam] book the dentist".`,
		`Do not invent anything not in the messages. If there are no action`,
		`items, reply with exactly "NONE".`,
		``,
		`Conversation "${conversation.name}":`,
		transcript
	].join('\n');

	try {
		const result = (await ai.run(ACTIONS_MODEL, {
			messages: [
				{
					role: 'system',
					content: 'You extract concrete action items from family group chats.'
				},
				{ role: 'user', content: prompt }
			]
		})) as { response?: string };
		const text = (result.response ?? '').trim();
		if (text === '') {
			return json({ available: false, actions: [] }, { status: 503 });
		}
		// A deliberate "NONE" means the model scanned and found nothing.
		if (/^none\b/i.test(text)) {
			return json({ available: true, actions: [] });
		}
		return json({ available: true, actions: parseActions(text) });
	} catch (e) {
		console.error('[actions] Workers AI call failed', e);
		return json({ available: false, actions: [] }, { status: 503 });
	}
};
