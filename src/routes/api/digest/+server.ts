import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { formatDigestSections, digestSince, type DigestRow } from '$lib/server/digest';

// The Workers AI text model used to write the household digest.
const DIGEST_MODEL = '@cf/meta/llama-3.1-8b-instruct';
// How far back the digest looks, and how many messages it will read.
const DIGEST_HOURS = 24;
const DIGEST_LIMIT = 80;

// GET /api/digest — an AI "what's new" summary of recent activity across every
// active conversation, via Cloudflare Workers AI (M61). Read-only.
//
// Gated like the per-conversation summary (M54): with no Workers AI binding
// (local/CI), or if the model call fails, it returns 503 { available: false }.
// A quiet last day is a non-failure 200 { available: true, digest: '' }.
export const GET: RequestHandler = async ({ platform }) => {
	const db = requireDb(platform);
	const ai = platform?.env.AI;
	if (!ai) {
		return json({ available: false, digest: '' }, { status: 503 });
	}

	// Recent readable messages across all non-archived conversations,
	// oldest-first so each conversation reads in order.
	const since = digestSince(DIGEST_HOURS);
	const { results } = await db
		.prepare(
			`SELECT c.name AS conversation_name, p.display_name AS author_name, m.body
			 FROM messages m
			 JOIN conversations c ON c.id = m.conversation_id
			 JOIN people p ON p.id = m.author_person_id
			 WHERE m.deleted_at IS NULL
			   AND c.archived_at IS NULL
			   AND m.created_at > ?
			 ORDER BY m.created_at ASC
			 LIMIT ${DIGEST_LIMIT}`
		)
		.bind(since)
		.all<DigestRow>();

	// Nothing happened in the window — not a failure, just an empty digest.
	if (results.length === 0) {
		return json({ available: true, digest: '' });
	}

	const transcript = formatDigestSections(results);
	const prompt = [
		`Summarise what happened across these family conversations in the last`,
		`day. Group the summary by conversation, one short paragraph each, and`,
		`call out any plans, decisions, or things someone needs to do. Be`,
		`concise and do not invent anything not in the messages.`,
		``,
		transcript
	].join('\n');

	try {
		const result = (await ai.run(DIGEST_MODEL, {
			messages: [
				{
					role: 'system',
					content: 'You write a brief daily digest of a family’s group chats.'
				},
				{ role: 'user', content: prompt }
			]
		})) as { response?: string };
		const digest = (result.response ?? '').trim();
		if (digest === '') {
			return json({ available: false, digest: '' }, { status: 503 });
		}
		return json({ available: true, digest });
	} catch (e) {
		console.error('[digest] Workers AI call failed', e);
		return json({ available: false, digest: '' }, { status: 503 });
	}
};
