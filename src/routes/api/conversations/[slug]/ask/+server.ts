import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';

// The Workers AI text model used to answer a question about a conversation.
const ASK_MODEL = '@cf/meta/llama-3.1-8b-instruct';
// How many recent messages to feed the model as context.
const ASK_WINDOW = 60;
// Questions longer than this are rejected.
const MAX_QUESTION = 500;

// POST /api/conversations/[slug]/ask — answer a question about the
// conversation using its recent messages, via Cloudflare Workers AI (M62).
// Body: { question: non-empty string }. Returns { available, answer }.
//
// Read-only — stores nothing, and posts nothing back into the conversation
// (unlike the @claude assistant). Gated like the AI summary (M54): an unknown
// conversation is a 404; an empty or over-long question is a 400; with no
// Workers AI binding, or if the model call fails, it returns 503.
export const POST: RequestHandler = async ({ platform, params, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as { question?: unknown } | null;
	const question = typeof raw?.question === 'string' ? raw.question.trim() : '';
	if (question === '') {
		throw error(400, 'Expected JSON body { question: non-empty string }');
	}
	if (question.length > MAX_QUESTION) {
		throw error(400, `Question too long — keep it under ${MAX_QUESTION} characters`);
	}

	// An unknown conversation is a 404 regardless of whether AI is configured.
	const conversation = await db
		.prepare('SELECT id, name FROM conversations WHERE slug = ?')
		.bind(params.slug)
		.first<{ id: string; name: string }>();
	if (!conversation) throw error(404, `Unknown conversation: ${params.slug}`);

	const ai = platform?.env.AI;
	if (!ai) {
		return json({ available: false, answer: '' }, { status: 503 });
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
			   LIMIT ${ASK_WINDOW}
			 )
			 ORDER BY created_at ASC`
		)
		.bind(conversation.id)
		.all<{ body: string; author_name: string; created_at: string }>();

	if (results.length === 0) {
		return json({ available: true, answer: 'This conversation has no messages yet.' });
	}

	const transcript = results.map((m) => `${m.author_name}: ${m.body}`).join('\n');
	const prompt = [
		`Answer the question using ONLY this family conversation. If the`,
		`answer is not in the messages, say you could not find it. Be concise`,
		`and do not invent anything.`,
		``,
		`Conversation "${conversation.name}":`,
		transcript,
		``,
		`Question: ${question}`
	].join('\n');

	try {
		const result = (await ai.run(ASK_MODEL, {
			messages: [
				{
					role: 'system',
					content: 'You answer questions about a family group chat from its messages.'
				},
				{ role: 'user', content: prompt }
			]
		})) as { response?: string };
		const answer = (result.response ?? '').trim();
		if (answer === '') {
			return json({ available: false, answer: '' }, { status: 503 });
		}
		return json({ available: true, answer });
	} catch (e) {
		console.error('[ask] Workers AI call failed', e);
		return json({ available: false, answer: '' }, { status: 503 });
	}
};
