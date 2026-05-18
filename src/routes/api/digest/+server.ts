import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { generateDigest } from '$lib/server/digest';

// GET /api/digest — an AI "what's new" summary of recent activity across every
// active conversation, via Cloudflare Workers AI (M61). Read-only.
//
// Gated like the per-conversation summary (M54): with no Workers AI binding
// (local/CI), or if the model call fails, it returns 503 { available: false }.
// A quiet last day is a non-failure 200 { available: true, digest: '' }.
export const GET: RequestHandler = async ({ platform }) => {
	const db = requireDb(platform);
	const ai = platform?.env.AI;
	if (!ai) {
		return json({ available: false, digest: '' }, { status: 503 });
	}

	const { available, digest } = await generateDigest(ai, db);
	if (!available) {
		return json({ available: false, digest: '' }, { status: 503 });
	}
	return json({ available: true, digest });
};
