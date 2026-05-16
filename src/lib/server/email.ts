/// <reference types="@cloudflare/workers-types" />
//
// Outbound email transport adapter. The canonical message logic (fanout.ts)
// calls sendEmail() and never touches the provider directly — the same shape
// as the SMS adapter in sms.ts.
//
// When RESEND_API_KEY and EMAIL_FROM are both present, sendEmail() posts to
// the Resend REST API. When either is missing, it stubs the send (logs the
// line, reports `stubbed`) so the relay works end-to-end without an email
// account. Resend was chosen for its simple REST API; swapping providers
// means changing only this file.

type Env = App.Platform['env'];

export type EmailSendResult =
	| { kind: 'sent'; providerMessageId: string | null }
	| { kind: 'stubbed' }
	| { kind: 'failed'; error: string };

/** True only when both secrets needed for a real send are present. */
export function emailConfigured(env: Env): boolean {
	return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

/**
 * Send one email. Returns a typed result rather than throwing, so the caller
 * can record the outcome on a delivery row.
 */
export async function sendEmail(
	env: Env,
	to: string,
	subject: string,
	body: string
): Promise<EmailSendResult> {
	if (!emailConfigured(env)) {
		console.log(`[email:stub] would send to ${to}: ${subject}`);
		return { kind: 'stubbed' };
	}

	try {
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.RESEND_API_KEY as string}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text: body })
		});
		if (!res.ok) {
			const text = await res.text();
			return { kind: 'failed', error: `Resend ${res.status}: ${text.slice(0, 300)}` };
		}
		const data = (await res.json()) as { id?: string };
		return { kind: 'sent', providerMessageId: data.id ?? null };
	} catch (e) {
		return { kind: 'failed', error: e instanceof Error ? e.message : String(e) };
	}
}
