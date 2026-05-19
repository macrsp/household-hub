import { json, error, text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { insertMessage, type Message } from '$lib/server/db';
import { fanoutMessage } from '$lib/server/fanout';
import { nowIso } from '$lib/server/time';

// The conversation a changelog entry posts into when no ?slug= is given —
// the #claude dev channel, where change requests and their results live.
const DEFAULT_SLUG = 'claude';

// POST /api/changelog — post a plain-language "what shipped" note into a
// conversation as Claude Code (M77), so the household sees the app describe
// its own growth. Body: { summary: non-empty string }. Query: ?slug= (default
// "claude"). Built to be called after a successful dev-channel build/deploy.
//
// When CHANGELOG_SECRET is configured, a matching X-Webhook-Secret header is
// required; absent (local/dev) the check is skipped — the optional-secret
// pattern of the digest poster and the Gmail sync.
export const POST: RequestHandler = async ({ platform, request, url }) => {
	const db = requireDb(platform);

	const expectedSecret = platform?.env.CHANGELOG_SECRET;
	if (expectedSecret && (request.headers.get('x-webhook-secret') ?? '') !== expectedSecret) {
		return text('Invalid or missing webhook secret', { status: 403 });
	}

	const raw = (await request.json().catch(() => null)) as { summary?: unknown } | null;
	const summary = typeof raw?.summary === 'string' ? raw.summary.trim() : '';
	if (summary === '') {
		throw error(400, 'Expected JSON body { summary: non-empty string }');
	}

	const slug = url.searchParams.get('slug')?.trim() || DEFAULT_SLUG;
	const conversation = await db
		.prepare('SELECT id FROM conversations WHERE slug = ?')
		.bind(slug)
		.first<{ id: string }>();
	if (!conversation) throw error(404, `Unknown conversation: ${slug}`);

	// Posted as the Claude Code member, the same author the dev-channel runner
	// and the in-app assistant use.
	const message: Message = {
		id: crypto.randomUUID(),
		conversation_id: conversation.id,
		author_person_id: 'person-claude',
		body: `📦 Shipped — ${summary}`,
		source_transport: 'app',
		created_at: nowIso(),
		reply_to_message_id: null
	};
	await insertMessage(db, message);

	// Fan the entry out to participants. The message is already stored; a
	// fanout failure is logged but does not fail this response.
	try {
		await fanoutMessage(db, platform!.env, message.id);
	} catch (e) {
		console.error('[changelog] fanout failed for message', message.id, e);
	}

	return json({ posted: true, messageId: message.id }, { status: 201 });
};
