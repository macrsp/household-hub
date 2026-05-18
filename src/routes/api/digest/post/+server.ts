import { json, error, text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { generateDigest } from '$lib/server/digest';
import { insertMessage, type Message } from '$lib/server/db';
import { fanoutMessage } from '$lib/server/fanout';
import { nowIso } from '$lib/server/time';

// The conversation the digest posts into when no ?slug= is given.
const DEFAULT_SLUG = 'general';

// POST /api/digest/post — generate the household digest and post it into a
// conversation as a message from Claude Code (M63). Built to be called once a
// day by a cron on the operator's host (the dev-channel runner host is a
// natural home), turning the on-demand digest (M61) into a proactive one.
//
// Query: ?slug=<conversation> (defaults to "general").
//
// When DIGEST_POST_SECRET is configured, a matching X-Webhook-Secret header is
// required; absent (local/dev) the check is skipped — the same pattern as the
// inbound-email webhook. With no Workers AI binding, or if the model call
// fails, it returns 503 and posts nothing; a quiet last day posts nothing and
// returns 200 { posted: false }.
export const POST: RequestHandler = async ({ platform, request, url }) => {
	const db = requireDb(platform);

	const expectedSecret = platform?.env.DIGEST_POST_SECRET;
	if (expectedSecret && (request.headers.get('x-webhook-secret') ?? '') !== expectedSecret) {
		return text('Invalid or missing webhook secret', { status: 403 });
	}

	const slug = url.searchParams.get('slug')?.trim() || DEFAULT_SLUG;
	const conversation = await db
		.prepare('SELECT id FROM conversations WHERE slug = ?')
		.bind(slug)
		.first<{ id: string }>();
	if (!conversation) throw error(404, `Unknown conversation: ${slug}`);

	const ai = platform?.env.AI;
	if (!ai) {
		return json({ posted: false, reason: 'ai-unavailable' }, { status: 503 });
	}

	const { available, digest } = await generateDigest(ai, db);
	if (!available) {
		return json({ posted: false, reason: 'ai-unavailable' }, { status: 503 });
	}
	// A quiet window — nothing worth posting.
	if (digest === '') {
		return json({ posted: false, reason: 'quiet' });
	}

	// Post the digest as the Claude Code member, the same author the in-app
	// assistant (M55) uses.
	const message: Message = {
		id: crypto.randomUUID(),
		conversation_id: conversation.id,
		author_person_id: 'person-claude',
		body: `📋 Household digest — the last day\n\n${digest}`,
		source_transport: 'app',
		created_at: nowIso(),
		reply_to_message_id: null
	};
	await insertMessage(db, message);

	// Fan the digest out to participants. The message is already stored; a
	// fanout failure is logged but does not fail this response.
	try {
		await fanoutMessage(db, platform!.env, message.id);
	} catch (e) {
		console.error('[digest] fanout failed for digest message', message.id, e);
	}

	return json({ posted: true, messageId: message.id }, { status: 201 });
};
