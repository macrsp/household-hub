import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';

// The Workers AI text model used to summarise a conversation.
const SUMMARY_MODEL = '@cf/meta/llama-3.1-8b-instruct';
// How many recent messages to feed the model.
const SUMMARY_WINDOW = 40;

// GET /api/conversations/[slug]/summary — an AI "catch me up" summary of the
// conversation's recent messages, via Cloudflare Workers AI (M54). Read-only.
//
// Gated like the SMS/email adapters: with no Workers AI binding (local/CI), or
// if the model call fails, it returns 503 { available: false } rather than
// erroring — the UI then simply reports the summary is unavailable.
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
		return json({ available: false, summary: '' }, { status: 503 });
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
			   LIMIT ${SUMMARY_WINDOW}
			 )
			 ORDER BY created_at ASC`
		)
		.bind(conversation.id)
		.all<{ body: string; author_name: string; created_at: string }>();

	if (results.length === 0) {
		return json({ available: true, summary: 'This conversation has no messages yet.' });
	}

	const transcript = results.map((m) => `${m.author_name}: ${m.body}`).join('\n');
	const prompt = [
		`Summarise this family conversation for someone catching up.`,
		`Be concise — 2 to 4 sentences. Note any plans, decisions, or things`,
		`someone needs to do. Do not invent anything not in the messages.`,
		``,
		`Conversation "${conversation.name}":`,
		transcript
	].join('\n');

	try {
		const result = (await ai.run(SUMMARY_MODEL, {
			messages: [
				{ role: 'system', content: 'You summarise family group chats clearly and briefly.' },
				{ role: 'user', content: prompt }
			]
		})) as { response?: string };
		const summary = (result.response ?? '').trim();
		if (summary === '') {
			return json({ available: false, summary: '' }, { status: 503 });
		}
		return json({ available: true, summary });
	} catch (e) {
		console.error('[summary] Workers AI call failed', e);
		return json({ available: false, summary: '' }, { status: 503 });
	}
};
