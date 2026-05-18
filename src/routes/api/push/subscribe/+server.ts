import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { upsertPushSubscription, type PushSubscriptionRow } from '$lib/server/db';
import { nowIso } from '$lib/server/time';

// POST /api/push/subscribe — store a browser's Web Push subscription (M38).
// Body: { personId: string, subscription: { endpoint, keys: { p256dh, auth } } }
// — the shape `PushSubscription.toJSON()` produces. Keyed on the endpoint, so
// re-subscribing the same browser updates its row rather than duplicating it.
export const POST: RequestHandler = async ({ platform, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as {
		personId?: unknown;
		subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
	} | null;

	const personId = raw?.personId;
	const endpoint = raw?.subscription?.endpoint;
	const p256dh = raw?.subscription?.keys?.p256dh;
	const auth = raw?.subscription?.keys?.auth;

	if (typeof personId !== 'string' || personId === '') {
		throw error(400, 'personId is required');
	}
	if (
		typeof endpoint !== 'string' ||
		endpoint === '' ||
		typeof p256dh !== 'string' ||
		typeof auth !== 'string'
	) {
		throw error(400, 'A subscription with an endpoint and p256dh/auth keys is required');
	}

	// The subscriber must be a known household member.
	const person = await db
		.prepare('SELECT id FROM people WHERE id = ?')
		.bind(personId)
		.first<{ id: string }>();
	if (!person) throw error(400, `Unknown personId: ${personId}`);

	const row: PushSubscriptionRow = {
		id: crypto.randomUUID(),
		person_id: personId,
		endpoint,
		p256dh,
		auth,
		created_at: nowIso()
	};
	await upsertPushSubscription(db, row);
	return json({ ok: true }, { status: 201 });
};
