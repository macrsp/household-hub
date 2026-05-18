import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { vapidPublicKey } from '$lib/server/push';

// GET /api/push/public-key — the VAPID public key the browser needs to
// subscribe to Web Push. 404 when push is not configured, which the web app
// reads as "push unavailable" and hides the enable-push control.
export const GET: RequestHandler = async ({ platform }) => {
	const key = vapidPublicKey(platform?.env);
	if (!key) throw error(404, 'Web push is not configured');
	return json({ publicKey: key });
};
