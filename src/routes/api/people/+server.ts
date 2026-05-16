import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';

// GET /api/people — the seeded household members, for the sender dropdown.
export const GET: RequestHandler = async ({ platform }) => {
	const db = requireDb(platform);
	const { results } = await db
		.prepare('SELECT id, display_name, created_at FROM people ORDER BY display_name')
		.all();
	return json(results);
};
