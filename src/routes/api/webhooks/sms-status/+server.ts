import { text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { updateDeliveryByProviderId } from '$lib/server/db';
import { verifyTwilioSignature, mapTwilioStatus } from '$lib/server/sms';

// POST /api/webhooks/sms-status — Twilio delivery-status callback.
//
// When sendSms includes a StatusCallback URL, Twilio POSTs status updates
// here (queued → sent → delivered, or failed / undelivered) as a form post.
// This updates the matching `deliveries` row — keyed by provider_message_id,
// the Twilio message SID stored when the message was sent — so the M13
// receipt reflects the real carrier outcome, not just "handed to Twilio".
export const POST: RequestHandler = async ({ platform, request }) => {
	const db = requireDb(platform);

	const form = await request.formData();
	const params: Record<string, string> = {};
	for (const [k, v] of form) {
		if (typeof v === 'string') params[k] = v;
	}

	// Verify the Twilio request signature when an auth token is configured.
	const authToken = platform!.env.TWILIO_AUTH_TOKEN;
	if (authToken) {
		const signature = request.headers.get('X-Twilio-Signature') ?? '';
		const ok =
			signature !== '' &&
			(await verifyTwilioSignature(authToken, request.url, params, signature));
		if (!ok) {
			return text('Invalid Twilio request signature', { status: 403 });
		}
	}

	const sid = params.MessageSid ?? params.SmsSid ?? '';
	const status = params.MessageStatus ?? params.SmsStatus ?? '';
	if (sid === '' || status === '') {
		return text('Expected MessageSid and MessageStatus', { status: 400 });
	}

	const errorCode = params.ErrorCode;
	await updateDeliveryByProviderId(db, sid, mapTwilioStatus(status), {
		error: errorCode ? `Twilio error ${errorCode}` : undefined
	});

	// Twilio only needs a 2xx acknowledgement; no body.
	return new Response(null, { status: 204 });
};
