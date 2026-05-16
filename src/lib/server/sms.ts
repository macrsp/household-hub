/// <reference types="@cloudflare/workers-types" />
//
// Outbound SMS transport adapter. This file is the ONLY place that knows how
// to talk to Twilio; the canonical message logic (fanout.ts) calls sendSms()
// and never touches the provider directly.
//
// When the three Twilio secrets are all present, sendSms() posts to the
// Twilio REST API. When any is missing, it stubs the send (logs the line,
// reports `stubbed`) so the whole relay works without a Twilio account.

type Env = App.Platform['env'];

export type SmsSendResult =
	| { kind: 'sent'; providerMessageId: string | null }
	| { kind: 'stubbed' }
	| { kind: 'failed'; error: string };

/** True only when every Twilio secret needed for a real send is present. */
export function twilioConfigured(env: Env): boolean {
	return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);
}

/**
 * Send one SMS. Returns a typed result rather than throwing, so the caller
 * can record the outcome on a delivery row.
 */
export async function sendSms(env: Env, to: string, body: string): Promise<SmsSendResult> {
	if (!twilioConfigured(env)) {
		console.log(`[sms:stub] would send to ${to}: ${body}`);
		return { kind: 'stubbed' };
	}

	const sid = env.TWILIO_ACCOUNT_SID as string;
	const token = env.TWILIO_AUTH_TOKEN as string;
	const from = env.TWILIO_FROM_NUMBER as string;
	const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
	const form = new URLSearchParams({ To: to, From: from, Body: body });

	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: form
		});
		if (!res.ok) {
			const text = await res.text();
			return { kind: 'failed', error: `Twilio ${res.status}: ${text.slice(0, 300)}` };
		}
		const data = (await res.json()) as { sid?: string };
		return { kind: 'sent', providerMessageId: data.sid ?? null };
	} catch (e) {
		return { kind: 'failed', error: e instanceof Error ? e.message : String(e) };
	}
}

/**
 * Verify Twilio's `X-Twilio-Signature` for an inbound webhook POST.
 *
 * Twilio signs: the full request URL, then each POST parameter's name
 * immediately followed by its value, concatenated in alphabetical order by
 * name; HMAC-SHA1 keyed by the account auth token, base64-encoded. See
 * Twilio's "Validating Requests" security documentation. Returns true only
 * when the recomputed signature matches.
 */
export async function verifyTwilioSignature(
	authToken: string,
	url: string,
	params: Record<string, string>,
	signature: string
): Promise<boolean> {
	let payload = url;
	for (const key of Object.keys(params).sort()) {
		payload += key + params[key];
	}
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		enc.encode(authToken),
		{ name: 'HMAC', hash: 'SHA-1' },
		false,
		['sign']
	);
	const mac = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
	const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
	return constantTimeEqual(expected, signature);
}

/** Compare two strings without short-circuiting on the first differing byte. */
function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}
