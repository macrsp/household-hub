import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';

// GET /api/conversations — all conversation threads. v1 seeds exactly one
// (`general`); the route is list-shaped so multiple conversations later need
// no API change.
export const GET: RequestHandler = async ({ platform }) => {
	const db = requireDb(platform);
	const { results } = await db
		.prepare('SELECT id, name, slug, created_at FROM conversations ORDER BY created_at')
		.all();
	return json(results);
};
