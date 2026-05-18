import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { insertSmsConsent, type SmsConsent } from '$lib/server/db';
import { nowIso } from '$lib/server/time';

// POST /api/sms-consent — record one SMS opt-in from the /sms-opt-in form.
// Body: { name: non-empty string, phone: string with 10–15 digits,
//         agreed: true }.
//
// `agreed` must be exactly true: the server enforces the consent checkbox so a
// consent record can never be created without the explicit agreement. The row
// in `sms_consents` is the documented, verifiable consent A2P 10DLC requires.
export const POST: RequestHandler = async ({ platform, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as
		| { name?: unknown; phone?: unknown; agreed?: unknown }
		| null;

	const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
	const phone = typeof raw?.phone === 'string' ? raw.phone.trim() : '';
	const digits = phone.replace(/\D/g, '');

	if (name === '') {
		throw error(400, 'A name is required.');
	}
	if (digits.length < 10 || digits.length > 15) {
		throw error(400, 'A valid mobile phone number is required.');
	}
	if (raw?.agreed !== true) {
		throw error(400, 'Consent (the agreement checkbox) is required.');
	}

	const consent: SmsConsent = {
		id: crypto.randomUUID(),
		name,
		phone,
		consented_at: nowIso()
	};
	await insertSmsConsent(db, consent);

	return json({ ok: true, id: consent.id, consented_at: consent.consented_at }, { status: 201 });
};
