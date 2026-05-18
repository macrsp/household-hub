import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireDb } from '$lib/server/platform';
import { isAdult } from '$lib/server/db';

// GET /api/memory/entities?personId=<id> — list the household memory graph's
// entities (M71). Adult-gated like the rest of /api/memory.
export const GET: RequestHandler = async ({ platform, url }) => {
	const db = requireDb(platform);

	const personId = url.searchParams.get('personId') ?? '';
	if (!(await isAdult(db, personId))) {
		throw error(403, 'Household memory is available to adult members only.');
	}

	const { results } = await db
		.prepare('SELECT id, kind, name, person_id, created_at FROM memory_entities ORDER BY name ASC')
		.all();
	return json(results);
};
