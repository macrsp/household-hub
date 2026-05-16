import { text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { insertMessage, type Message } from '$lib/server/db';
import { fanoutMessage } from '$lib/server/fanout';
import { nowIso } from '$lib/server/time';

// Empty TwiML document — the response Twilio expects when an inbound SMS was
// accepted and no automatic reply should be sent.
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

// POST /api/webhooks/sms — inbound SMS, as a Twilio-style URL-encoded form
// post carrying `From` (sender phone number) and `Body` (message text).
//
// This is the inbound half of the SMS transport adapter: it translates a
// carrier text message into one canonical message and hands off to the
// shared fanout helper. It does not emulate group SMS.
//
// TODO: validate Twilio's `X-Twilio-Signature` header against
// TWILIO_AUTH_TOKEN before trusting the body. v1 omits this — the webhook
// URL is the only secret. Production hardening, not a v1 goal.
export const POST: RequestHandler = async ({ platform, request }) => {
	const db = requireDb(platform);

	const form = await request.formData();
	const from = String(form.get('From') ?? '').trim();
	const body = String(form.get('Body') ?? '').trim();
	if (from === '' || body === '') {
		return text('Expected Twilio form fields From and Body', { status: 400 });
	}

	// Map the sender's phone number to a known household member.
	const endpoint = await db
		.prepare("SELECT person_id FROM endpoints WHERE type = 'sms' AND address = ?")
		.bind(from)
		.first<{ person_id: string }>();
	if (!endpoint) {
		// Unknown number — reject clearly and write nothing.
		return text(`Unknown sender: ${from} is not a registered household SMS number`, {
			status: 403
		});
	}

	// v1 routes every inbound SMS to the `general` conversation.
	const conversation = await db
		.prepare("SELECT id FROM conversations WHERE slug = 'general'")
		.first<{ id: string }>();
	if (!conversation) {
		return text('The `general` conversation is missing — run the seed.', { status: 500 });
	}

	const message: Message = {
		id: crypto.randomUUID(),
		conversation_id: conversation.id,
		author_person_id: endpoint.person_id,
		body,
		source_transport: 'sms',
		created_at: nowIso()
	};
	await insertMessage(db, message);

	// Fan out to the other participants. The canonical message is already
	// stored; a fanout failure is logged but does not fail the webhook
	// response (per-delivery outcomes are recorded on `deliveries` rows).
	try {
		await fanoutMessage(db, platform!.env, message.id);
	} catch (e) {
		console.error('[fanout] failed for inbound SMS message', message.id, e);
	}

	return text(EMPTY_TWIML, { headers: { 'content-type': 'text/xml' } });
};
