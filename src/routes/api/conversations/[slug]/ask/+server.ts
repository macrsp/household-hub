import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { relevantMessageIds } from '$lib/server/semantic-index';

// The Workers AI text model used to answer a question about a conversation.
const ASK_MODEL = '@cf/meta/llama-3.1-8b-instruct';
// A recent window kept for continuity, plus the semantically relevant messages
// retrieved from anywhere in the conversation's history (M68).
const RECENT_WINDOW = 30;
const RELEVANT_K = 14;
// Questions longer than this are rejected.
const MAX_QUESTION = 500;

interface Row {
	id: string;
	body: string;
	author_name: string;
	created_at: string;
}

// POST /api/conversations/[slug]/ask — answer a question about the
// conversation, via Cloudflare Workers AI (M62). Body: { question: non-empty
// string }. Returns { available, answer }.
//
// The model sees the conversation's recent messages plus, when Vectorize is
// configured, the messages most semantically relevant to the question from
// anywhere in its history (M68) — so it can answer about something discussed
// long ago, not only recently.
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

	// The most recent readable messages — continuity for the model.
	const recent = await db
		.prepare(
			`SELECT id, body, author_name, created_at FROM (
			   SELECT m.id, m.body, p.display_name AS author_name, m.created_at
			   FROM messages m
			   JOIN people p ON p.id = m.author_person_id
			   WHERE m.conversation_id = ? AND m.deleted_at IS NULL
			   ORDER BY m.created_at DESC
			   LIMIT ${RECENT_WINDOW}
			 )
			 ORDER BY created_at ASC`
		)
		.bind(conversation.id)
		.all<Row>();

	// Semantic retrieval (M68): the messages most relevant to the question,
	// from anywhere in the conversation. Best-effort — empty without Vectorize,
	// in which case only the recent window above is used.
	let relevant: Row[] = [];
	const relevantIds = await relevantMessageIds(
		platform!.env,
		conversation.id,
		question,
		RELEVANT_K
	);
	const recentIds = new Set(recent.results.map((r) => r.id));
	const extraIds = relevantIds.filter((id) => !recentIds.has(id));
	if (extraIds.length > 0) {
		const placeholders = extraIds.map(() => '?').join(',');
		const r = await db
			.prepare(
				`SELECT m.id, m.body, p.display_name AS author_name, m.created_at
				 FROM messages m
				 JOIN people p ON p.id = m.author_person_id
				 WHERE m.deleted_at IS NULL AND m.id IN (${placeholders})`
			)
			.bind(...extraIds)
			.all<Row>();
		relevant = r.results;
	}

	// Merge recent + relevant, de-duped, in chronological order for the model.
	const all = [...relevant, ...recent.results].sort((a, b) =>
		a.created_at < b.created_at ? -1 : 1
	);

	if (all.length === 0) {
		return json({ available: true, answer: 'This conversation has no messages yet.' });
	}

	const transcript = all.map((m) => `${m.author_name}: ${m.body}`).join('\n');
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
