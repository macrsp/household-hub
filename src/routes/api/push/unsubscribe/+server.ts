import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { deletePushSubscriptionByEndpoint } from '$lib/server/db';

// POST /api/push/unsubscribe — drop a browser's Web Push subscription (M38).
// Body: { endpoint: string }. Idempotent: removing an endpoint that is not
// stored is a no-op success.
export const POST: RequestHandler = async ({ platform, request }) => {
	const db = requireDb(platform);

	const raw = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
	const endpoint = raw?.endpoint;
	if (typeof endpoint !== 'string' || endpoint === '') {
		throw error(400, 'endpoint is required');
	}

	await deletePushSubscriptionByEndpoint(db, endpoint);
	return json({ ok: true });
};
