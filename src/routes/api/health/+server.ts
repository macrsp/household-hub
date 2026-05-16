import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET /api/health — liveness check. Returns { ok: true } so a deploy or a
// uptime monitor can confirm the Worker is serving.
export const GET: RequestHandler = () => {
	return json({ ok: true });
};
