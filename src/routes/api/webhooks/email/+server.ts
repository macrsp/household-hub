import { json, text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { insertMessage, type Message } from '$lib/server/db';
import { fanoutMessage } from '$lib/server/fanout';
import { notifyPushSubscribers } from '$lib/server/push';
import { conversationSlugFromEmailAddress } from '$lib/server/routing';
import { nowIso } from '$lib/server/time';

// POST /api/webhooks/email — inbound email as a JSON payload:
//   { "from": "...", "to": "...", "body": "..." }   ("text" is accepted for "body")
//
// The inbound half of the email transport adapter: it turns one email into
// one canonical message. Cloudflare Email Routing cannot POST to an HTTP
// endpoint directly, so a small Email Worker forwards the parsed message here
// as JSON — see README "Inbound email setup".
//
// The conversation is named by the address the email was sent TO: the local
// part is the conversation slug (general@…, groceries@…). The sender is
// mapped to a household member by a registered `email` endpoint.
export const POST: RequestHandler = async ({ platform, request }) => {
	const db = requireDb(platform);

	// When EMAIL_WEBHOOK_SECRET is configured, require the bridge Worker's
	// shared-secret header; absent (local/dev) the check is skipped — the same
	// pattern as Twilio signature validation on the SMS webhook.
	const expectedSecret = platform!.env.EMAIL_WEBHOOK_SECRET;
	if (expectedSecret && (request.headers.get('x-webhook-secret') ?? '') !== expectedSecret) {
		return text('Invalid or missing webhook secret', { status: 403 });
	}

	const raw = (await request.json().catch(() => null)) as
		| { from?: unknown; to?: unknown; body?: unknown; text?: unknown }
		| null;
	const from = typeof raw?.from === 'string' ? raw.from.trim().toLowerCase() : '';
	const to = typeof raw?.to === 'string' ? raw.to.trim().toLowerCase() : '';
	const bodySource =
		typeof raw?.body === 'string' ? raw.body : typeof raw?.text === 'string' ? raw.text : '';
	const body = bodySource.trim();
	if (from === '' || body === '') {
		return text('Expected JSON body { from, to, body }', { status: 400 });
	}

	// Map the sender's email address to a known household member.
	const endpoint = await db
		.prepare("SELECT person_id FROM endpoints WHERE type = 'email' AND address = ?")
		.bind(from)
		.first<{ person_id: string }>();
	if (!endpoint) {
		return text(`Unknown sender: ${from} is not a registered household email address`, {
			status: 403
		});
	}
	const personId = endpoint.person_id;

	// Route by the to-address local part to a conversation the sender
	// participates in; otherwise fall back to `general`.
	const slug = to === '' ? null : conversationSlugFromEmailAddress(to);
	let conversationId: string | null = null;
	if (slug) {
		const target = await db
			.prepare(
				`SELECT c.id AS id FROM conversations c
				 JOIN participants p ON p.conversation_id = c.id
				 WHERE c.slug = ? AND p.person_id = ?`
			)
			.bind(slug, personId)
			.first<{ id: string }>();
		if (target) conversationId = target.id;
	}
	if (!conversationId) {
		const general = await db
			.prepare("SELECT id FROM conversations WHERE slug = 'general'")
			.first<{ id: string }>();
		if (!general) {
			return text('The `general` conversation is missing — run the seed.', { status: 500 });
		}
		conversationId = general.id;
	}

	const message: Message = {
		id: crypto.randomUUID(),
		conversation_id: conversationId,
		author_person_id: personId,
		body,
		source_transport: 'email',
		created_at: nowIso()
	};
	await insertMessage(db, message);

	// Fan out to the other participants. The canonical message is already
	// stored; a fanout failure is logged but does not fail this response.
	try {
		await fanoutMessage(db, platform!.env, message.id);
	} catch (e) {
		console.error('[fanout] failed for inbound email message', message.id, e);
	}

	// Notify subscribed devices over Web Push (M38); a no-op if unconfigured.
	try {
		await notifyPushSubscribers(platform!.env, db, message.author_person_id);
	} catch (e) {
		console.error('[push] notify failed for inbound email message', message.id, e);
	}

	return json({ ok: true, messageId: message.id });
};
